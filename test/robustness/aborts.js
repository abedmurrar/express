'use strict'

// Clients that go away: in the middle of a request body (through each body
// parser), in the middle of a response (res.sendFile, express.static and a
// streamed body), and before the route handler runs. In every case the
// process must not crash or see an uncaught error, no file descriptor or
// connection may be left open, req.signal must abort, and the server must
// keep answering.

var assert = require('node:assert')
var fs = require('node:fs')
var { Buffer } = require('node:buffer')
var { Readable, pipeline } = require('node:stream')
var express = require('../..')
var support = require('./support')

var aborted = support.aborted
var connect = support.connect
var deferred = support.deferred
var rawRequest = support.rawRequest
var waitFor = support.waitFor

// Large enough that a response can't fit in the socket buffers, so the
// client really leaves in the middle of it.
var BIG = 32 * 1024 * 1024

// An app whose first middleware keeps each request's signal and response, so
// the tests can wait on them.
function tracked() {
  var app = express()
  var seen = []
  app.use(function (req, res, next) {
    var entry = { url: req.originalUrl, signal: req.signal, res: res, closed: deferred() }
    res.on('close', entry.closed.resolve)
    seen.push(entry)
    if (app.onRequest) app.onRequest(entry)
    next()
  })
  app.seen = seen
  return app
}

// Waits until the server holds no connection, then closes it and checks
// that no descriptor is left on a socket of its port or on `file`.
async function settled(server, file) {
  await waitFor(async function () {
    return (await support.connections(server)) === 0
  }, 'the server to drop the connection')
  var sockets = support.socketsOnPort(server.address().port)
  await support.close(server)
  await support.noLeakedFds(file, sockets)
}

// Sends a request on a new connection and resolves with the response.
function get(server, target) {
  var socket = connect(server)
  var responses = support.reader(socket)
  socket.write(rawRequest('GET', target, { Connection: 'close' }))
  return responses.next()
}

describe('robustness: client aborts', function () {
  var uncaught = support.trackUncaught()
  var big
  var server

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

  describe('in the middle of the request body', function () {
    var parsers = {
      json: { parser: express.json, type: 'application/json', start: '{"name":"tob' },
      urlencoded: { parser: express.urlencoded, type: 'application/x-www-form-urlencoded', start: 'name=tob' },
      raw: { parser: express.raw, type: 'application/octet-stream', start: 'raw bytes' },
      text: { parser: express.text, type: 'text/plain', start: 'some text' }
    }

    Object.keys(parsers).forEach(function (name) {
      var parser = parsers[name]

      it('through express.' + name + ': the handler never runs, the error is request.aborted', async function () {
        var app = tracked()
        var errors = []
        var handled = false
        var started = deferred()
        app.onRequest = started.resolve
        app.post('/', parser.parser(), function (req, res) {
          handled = true
          res.send('parsed')
        })
        app.use(function (err, req, res, next) {
          errors.push(err)
          next(err)
        })
        server = await support.listen(app)

        var socket = connect(server)
        socket.write(rawRequest('POST', '/', { 'Content-Type': parser.type, 'Content-Length': 1000 }, parser.start))
        var entry = await started.promise
        socket.destroy()

        await aborted(entry.signal)
        await entry.closed.promise
        await waitFor(function () {
          return errors.length > 0
        }, 'the parser to give up')
        await settled(server)

        assert.strictEqual(handled, false)
        assert.strictEqual(errors.length, 1)
        assert.strictEqual(errors[0].type, 'request.aborted')
        assert.strictEqual(errors[0].status, 400)
      })
    })

    it('keeps answering other clients afterwards', async function () {
      var app = tracked()
      var started = deferred()
      app.onRequest = function (entry) {
        if (entry.url === '/upload') started.resolve(entry)
      }
      app.post('/upload', express.json(), function (req, res) {
        res.send('parsed')
      })
      app.get('/', function (req, res) {
        res.send('still here')
      })
      server = await support.listen(app)

      var socket = connect(server)
      socket.write(rawRequest('POST', '/upload', { 'Content-Type': 'application/json', 'Content-Length': 100 }, '{'))
      var entry = await started.promise
      socket.destroy()
      await entry.closed.promise

      var response = await get(server, '/')
      assert.strictEqual(response.status, 200)
      assert.strictEqual(response.body.toString(), 'still here')
    })

    // Found by this suite. The router calls the final handler at once when
    // a later layer is left that doesn't match (it waits a turn only after
    // the last layer), so the 400 for the aborted body is written to the
    // closed connection before Node emits the response's 'close'. req.signal
    // used to see a finished response there and never abort, although the
    // client left first; it now counts a response as finished only if it
    // finished while the connection was open.
    it('req.signal aborts when the error for an aborted body is written before the response closes', async function () {
      var app = tracked()
      var started = deferred()
      app.onRequest = started.resolve
      app.post('/upload', express.json(), function (req, res) {
        res.send('parsed')
      })
      app.get('/', function (req, res) {
        res.send('home')
      })
      server = await support.listen(app)

      var socket = connect(server)
      socket.write(rawRequest('POST', '/upload', { 'Content-Type': 'application/json', 'Content-Length': 100 }, '{'))
      var entry = await started.promise
      socket.destroy()
      await entry.closed.promise
      await settled(server)

      assert.strictEqual(entry.signal.aborted, true)
    })
  })

  describe('in the middle of the response', function () {
    // Sends a GET, waits for the first bytes of the response and leaves.
    async function leaveEarly(target) {
      var socket = connect(server)
      socket.write(rawRequest('GET', target))
      await new Promise(function (resolve) {
        socket.once('data', resolve)
      })
      socket.destroy()
    }

    it('of res.sendFile: the callback gets ECONNABORTED and the file is closed', async function () {
      var app = tracked()
      var results = []
      var done = deferred()
      app.get('/', function (req, res) {
        res.sendFile(big.path, function (err) {
          results.push(err)
          done.resolve()
        })
      })
      server = await support.listen(app)

      await leaveEarly('/')
      await done.promise
      await aborted(app.seen[0].signal)
      await settled(server, big.path)

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].code, 'ECONNABORTED')
      assert.strictEqual(app.seen[0].res.writableFinished, false)
    })

    it('of res.sendFile without a callback: nothing reaches the error handler', async function () {
      var app = tracked()
      var errors = []
      app.get('/', function (req, res) {
        res.sendFile(big.path)
      })
      app.use(function (err, req, res, next) {
        errors.push(err)
        next(err)
      })
      server = await support.listen(app)

      await leaveEarly('/')
      await aborted(app.seen[0].signal)
      await settled(server, big.path)

      assert.deepStrictEqual(errors, [])
    })

    it('of express.static: the file is closed and nothing reaches the error handler', async function () {
      var app = tracked()
      var errors = []
      app.use('/files', express.static(big.dir))
      app.use(function (err, req, res, next) {
        errors.push(err)
        next(err)
      })
      server = await support.listen(app)

      await leaveEarly('/files/big.bin')
      await aborted(app.seen[0].signal)
      await settled(server, big.path)

      assert.deepStrictEqual(errors, [])
      assert.strictEqual(app.seen[0].res.writableFinished, false)
    })

    it('of a body streamed with stream.pipeline: the stream ends with a premature close', async function () {
      var app = tracked()
      var done = deferred()
      app.get('/', function (req, res) {
        res.type('bin')
        pipeline(fs.createReadStream(big.path), res, done.resolve)
      })
      server = await support.listen(app)

      await leaveEarly('/')
      var err = await done.promise
      await aborted(app.seen[0].signal)
      await settled(server, big.path)

      assert.strictEqual(err.code, 'ERR_STREAM_PREMATURE_CLOSE')
    })

    it('of an endless stream stopped through req.signal', async function () {
      var app = tracked()
      var stream
      app.get('/', function (req, res) {
        var chunk = Buffer.alloc(16 * 1024, 'x')
        stream = new Readable({
          read: function () {
            this.push(chunk)
          }
        })
        req.signal.addEventListener('abort', function () {
          stream.destroy()
        })
        stream.pipe(res)
      })
      server = await support.listen(app)

      await leaveEarly('/')
      await aborted(app.seen[0].signal)
      await settled(server)

      assert.strictEqual(stream.destroyed, true)
    })
  })

  describe('before the handler runs', function () {
    it('lets a late handler write to the closed connection without an error', async function () {
      var app = tracked()
      var gate = deferred()
      var started = deferred()
      var late = deferred()
      var errors = []
      app.onRequest = started.resolve
      app.use(function (req, res, next) {
        gate.promise.then(function () {
          next()
        })
      })
      app.get('/', function (req, res) {
        var seen = { aborted: req.signal.aborted }
        res.set('X-Late', '1')
        res.send('too late')
        seen.ended = res.writableEnded
        late.resolve(seen)
      })
      app.use(function (err, req, res, next) {
        errors.push(err)
        next(err)
      })
      server = await support.listen(app)

      var socket = connect(server)
      socket.write(rawRequest('GET', '/'))
      var entry = await started.promise
      socket.destroy()
      await aborted(entry.signal)
      await entry.closed.promise

      gate.resolve()
      assert.deepStrictEqual(await late.promise, { aborted: true, ended: true })
      await settled(server)
      assert.deepStrictEqual(errors, [])
    })

    it('lets an async handler that awaited the signal finish without an error', async function () {
      var app = tracked()
      var started = deferred()
      var finished = deferred()
      app.onRequest = started.resolve
      app.get('/', async function (req, res) {
        await aborted(req.signal)
        res.json({ late: true })
        finished.resolve(res.writableEnded)
      })
      server = await support.listen(app)

      var socket = connect(server)
      socket.write(rawRequest('GET', '/'))
      await started.promise
      socket.destroy()

      assert.strictEqual(await finished.promise, true)
      await settled(server)
    })

    it('reads an already-aborted signal when first read after the client left', async function () {
      // no tracking middleware here: it would read the signal early
      var app = express()
      var started = deferred()
      var gate = deferred()
      var read = deferred()
      app.get('/', function (req, res) {
        started.resolve(res)
        gate.promise.then(function () {
          read.resolve(req.signal.aborted)
          res.end()
        })
      })
      server = await support.listen(app)

      var socket = connect(server)
      socket.write(rawRequest('GET', '/'))
      var res = await started.promise
      socket.destroy()
      await new Promise(function (resolve) {
        res.once('close', resolve)
      })
      gate.resolve()

      assert.strictEqual(await read.promise, true)
      await settled(server)
    })
  })
})
