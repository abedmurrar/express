'use strict'

// Slow clients: a request body that arrives one byte at a time, and a client
// that reads a large response slowly, which must hold the server back
// (backpressure) rather than make it read the whole file into memory.

var assert = require('node:assert')
var { Buffer } = require('node:buffer')
var express = require('../..')
var support = require('./support')

var connect = support.connect
var deferred = support.deferred
var rawRequest = support.rawRequest
var waitFor = support.waitFor

var BIG = 32 * 1024 * 1024

// Most a server may hold in memory for a response it can't send yet. Node
// stops reading the file once the socket's buffer is past its high-water
// mark (16 KiB) and the file stream holds one 64 KiB chunk, so a server that
// respects backpressure stays far below this; one that doesn't buffers what
// the kernel won't take, tens of megabytes here.
var MAX_BUFFERED = 1024 * 1024

// Counts the body bytes the server has read, and lets the client wait until
// the server has read a given number of them.
function bodyCounter() {
  var seen = 0
  var chunks = 0
  var waiting = []
  return {
    middleware: function (req, res, next) {
      req.on('data', function (chunk) {
        chunks++
        seen += chunk.length
        waiting = waiting.filter(function (w) {
          if (seen < w.bytes) return true
          w.resolve()
          return false
        })
      })
      next()
    },
    seen: function (bytes) {
      if (seen >= bytes) return Promise.resolve()
      return new Promise(function (resolve) {
        waiting.push({ bytes: bytes, resolve: resolve })
      })
    },
    chunks: function () {
      return chunks
    }
  }
}

// Sends the body one byte at a time, each only once the server has read the
// one before, so every byte reaches the app as a chunk of its own. `frame`
// wraps each byte (for chunked encoding).
async function writeSlowly(socket, counter, body, frame) {
  for (var i = 0; i < body.length; i++) {
    var byte = body.subarray(i, i + 1)
    socket.write(frame ? frame(byte) : byte)
    await counter.seen(i + 1)
  }
}

describe('robustness: slow clients', function () {
  var uncaught = support.trackUncaught()
  var server
  var big

  before(function () {
    big = support.bigFile('big.bin', BIG)
  })

  after(function () {
    big.remove()
  })

  beforeEach(function () {
    uncaught.start()
  })

  afterEach(async function () {
    support.destroySockets()
    if (server && server.listening) await support.close(server)
    server = undefined
    uncaught.stop()
  })

  describe('a body sent one byte at a time', function () {
    var cases = {
      json: {
        parser: express.json,
        type: 'application/json',
        body: JSON.stringify({ name: 'tobi', tags: ['a', 'b', 'ü'], nested: { n: 1 } }),
        expected: { name: 'tobi', tags: ['a', 'b', 'ü'], nested: { n: 1 } }
      },
      urlencoded: {
        parser: express.urlencoded,
        type: 'application/x-www-form-urlencoded',
        body: 'name=tobi&tag=a&tag=b&city=K%C3%B6ln',
        expected: { name: 'tobi', tag: ['a', 'b'], city: 'Köln' }
      },
      text: {
        parser: express.text,
        type: 'text/plain; charset=utf-8',
        body: 'one byte at a time, even inside ü and €',
        expected: 'one byte at a time, even inside ü and €'
      }
    }

    Object.keys(cases).forEach(function (name) {
      var c = cases[name]

      it('is parsed whole by express.' + name + ', with multi-byte characters split across chunks', async function () {
        var app = express()
        var counter = bodyCounter()
        app.post('/', counter.middleware, c.parser(), function (req, res) {
          res.json(req.body)
        })
        server = await support.listen(app)

        var body = Buffer.from(c.body)
        var socket = connect(server)
        var responses = support.reader(socket)
        socket.write(rawRequest('POST', '/', { 'Content-Type': c.type, 'Content-Length': body.length }))
        await writeSlowly(socket, counter, body)
        var response = await responses.next()

        assert.strictEqual(response.status, 200)
        assert.deepStrictEqual(JSON.parse(response.body.toString()), c.expected)
        assert.strictEqual(counter.chunks(), body.length)
      })
    })

    it('in chunked encoding, with each chunk one byte', async function () {
      var app = express()
      var counter = bodyCounter()
      app.post('/', counter.middleware, express.json(), function (req, res) {
        res.json(req.body)
      })
      server = await support.listen(app)

      var json = Buffer.from('{"chunked":true}')
      var socket = connect(server)
      var responses = support.reader(socket)
      socket.write(rawRequest('POST', '/', { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' }))
      await writeSlowly(socket, counter, json, function (byte) {
        return Buffer.concat([Buffer.from('1\r\n'), byte, Buffer.from('\r\n')])
      })
      socket.write('0\r\n\r\n')
      var response = await responses.next()

      assert.strictEqual(response.status, 200)
      assert.deepStrictEqual(JSON.parse(response.body.toString()), { chunked: true })
      assert.strictEqual(counter.chunks(), json.length)
    })
  })

  describe('a slow reader of a large file', function () {
    // Starts the response, stops reading once the first bytes arrive, waits
    // until the server is held back (its socket buffer is full and the
    // amount it has taken on stops changing), checks how much it holds, then
    // reads the rest and checks the whole body arrived.
    async function readSlowly(app, target) {
      var responded = deferred()
      app.onResponse = responded.resolve
      server = await support.listen(app)

      var socket = connect(server)
      var received = 0
      var paused = deferred()
      socket.once('data', function () {
        socket.pause()
        paused.resolve()
      })
      socket.on('data', function (chunk) {
        received += chunk.length
      })
      socket.write(rawRequest('GET', target, { Connection: 'close' }))
      await paused.promise
      var res = await responded.promise

      var last = -1
      var steady = 0
      await waitFor(function () {
        var taken = res.socket ? res.socket.bytesWritten : 0
        steady = taken === last ? steady + 1 : 0
        last = taken
        // held back, or (where the system's socket buffers are huge) the
        // whole file went to the kernel and nothing is left to hold
        return (res.writableNeedDrain || res.writableFinished) && steady >= 10
      }, 'the server to be held back by the paused client')
      var buffered = res.writableLength

      var ended = new Promise(function (resolve) {
        socket.on('end', resolve)
      })
      socket.resume()
      await ended

      return { buffered: buffered, received: received }
    }

    function tracking(app) {
      app.use(function (req, res, next) {
        app.onResponse(res)
        next()
      })
      return app
    }

    it('through res.sendFile holds back instead of buffering the file', async function () {
      var app = tracking(express())
      app.get('/', function (req, res) {
        res.sendFile(big.path)
      })

      var result = await readSlowly(app, '/')
      assert.ok(result.buffered < MAX_BUFFERED, 'the server buffered ' + result.buffered + ' bytes')
      assert.ok(result.received > BIG, 'received ' + result.received + ' bytes')
      await support.noLeakedFds(big.path)
    })

    it('through express.static holds back instead of buffering the file', async function () {
      var app = tracking(express())
      app.use(express.static(big.dir))

      var result = await readSlowly(app, '/big.bin')
      assert.ok(result.buffered < MAX_BUFFERED, 'the server buffered ' + result.buffered + ' bytes')
      assert.ok(result.received > BIG, 'received ' + result.received + ' bytes')
      await support.noLeakedFds(big.path)
    })
  })
})
