'use strict'

// Large bodies: request bodies at, just under and just over a body parser's
// `limit` (and what happens on the socket after a 413), a large body that is
// allowed through, and ranges of a large file.

var assert = require('node:assert')
var crypto = require('node:crypto')
var { Buffer } = require('node:buffer')
var express = require('../..')
var support = require('./support')

var connect = support.connect
var rawRequest = support.rawRequest

var LIMIT = 1024
var BIG = 32 * 1024 * 1024

// A body of exactly `size` bytes for each parser.
var parsers = {
  json: {
    parser: express.json,
    type: 'application/json',
    body: function (size) {
      return '{"a":"' + 'x'.repeat(size - 8) + '"}'
    }
  },
  urlencoded: {
    parser: express.urlencoded,
    type: 'application/x-www-form-urlencoded',
    body: function (size) {
      return 'a=' + 'x'.repeat(size - 2)
    }
  },
  raw: {
    parser: express.raw,
    type: 'application/octet-stream',
    body: function (size) {
      return 'x'.repeat(size)
    }
  },
  text: {
    parser: express.text,
    type: 'text/plain',
    body: function (size) {
      return 'x'.repeat(size)
    }
  }
}

describe('robustness: large bodies', function () {
  var uncaught = support.trackUncaught()
  var server

  beforeEach(function () {
    uncaught.start()
  })

  afterEach(async function () {
    support.destroySockets()
    if (server && server.listening) await support.close(server)
    server = undefined
    uncaught.stop()
  })

  // An app that answers with the size of what the parser read, or with the
  // error type and status.
  function sizeApp(parser) {
    var app = express()
    app.post('/', parser.parser({ limit: LIMIT }), function (req, res) {
      var body = req.body
      res.send('read ' + (Buffer.isBuffer(body) ? body.length : typeof body === 'string' ? body.length : 'object'))
    })
    app.get('/next', function (req, res) {
      res.send('next request')
    })
    app.use(function (err, req, res, next) {
      res.status(err.status).send(err.type)
    })
    return app
  }

  Object.keys(parsers).forEach(function (name) {
    var parser = parsers[name]

    describe('express.' + name + ' with a ' + LIMIT + '-byte limit', function () {
      ;[
        [LIMIT - 1, 200],
        [LIMIT, 200],
        [LIMIT + 1, 413]
      ].forEach(function (c) {
        var size = c[0]
        var status = c[1]

        it('answers ' + status + ' to ' + size + ' bytes, then the next request on the socket', async function () {
          server = await support.listen(sizeApp(parser))
          var body = parser.body(size)
          assert.strictEqual(Buffer.byteLength(body), size)

          var socket = connect(server)
          var responses = support.reader(socket)
          // the next request follows the body on the same socket: if the
          // server didn't read the body off, it would parse it as a request
          socket.write(
            Buffer.concat([
              rawRequest('POST', '/', { 'Content-Type': parser.type, 'Content-Length': size }, body),
              rawRequest('GET', '/next')
            ])
          )
          var first = await responses.next()
          var second = await responses.next()

          assert.strictEqual(first.status, status)
          if (status === 413) assert.strictEqual(first.body.toString(), 'entity.too.large')
          assert.strictEqual(second.status, 200)
          assert.strictEqual(second.body.toString(), 'next request')
        })
      })

      it('answers 413 to a chunked body over the limit, then the next request on the socket', async function () {
        server = await support.listen(sizeApp(parser))
        var body = Buffer.from(parser.body(LIMIT + 100))
        var half = Math.floor(body.length / 2)
        var chunk = function (bytes) {
          return Buffer.concat([Buffer.from(bytes.length.toString(16) + '\r\n'), bytes, Buffer.from('\r\n')])
        }

        var socket = connect(server)
        var responses = support.reader(socket)
        socket.write(
          Buffer.concat([
            rawRequest('POST', '/', { 'Content-Type': parser.type, 'Transfer-Encoding': 'chunked' }),
            chunk(body.subarray(0, half)),
            chunk(body.subarray(half)),
            Buffer.from('0\r\n\r\n'),
            rawRequest('GET', '/next')
          ])
        )
        var first = await responses.next()
        var second = await responses.next()

        assert.strictEqual(first.status, 413)
        assert.strictEqual(first.body.toString(), 'entity.too.large')
        assert.strictEqual(second.body.toString(), 'next request')
      })
    })
  })

  it('answers 413 to a body far over the limit once it has read the body off', async function () {
    var app = sizeApp(parsers.raw)
    var seen = 0
    server = await support.listen(app)
    server.on('request', function (req) {
      req.on('data', function (chunk) {
        seen += chunk.length
      })
    })
    var size = 8 * 1024 * 1024
    var socket = connect(server)
    var responses = support.reader(socket)
    socket.write(rawRequest('POST', '/', { 'Content-Type': 'application/octet-stream', 'Content-Length': size }))
    socket.write(Buffer.alloc(size, 'y'))
    socket.write(rawRequest('GET', '/next'))

    var first = await responses.next()
    var second = await responses.next()
    assert.strictEqual(first.status, 413)
    assert.strictEqual(second.body.toString(), 'next request')
    assert.strictEqual(seen, size)
  })

  it('reads a large body under the limit intact', async function () {
    var app = express()
    app.post('/', express.raw({ limit: '16mb' }), function (req, res) {
      res.send(req.body.length + ' ' + crypto.createHash('sha256').update(req.body).digest('hex'))
    })
    server = await support.listen(app)

    var body = crypto.randomBytes(8 * 1024 * 1024)
    var socket = connect(server)
    var responses = support.reader(socket)
    socket.write(rawRequest('POST', '/', { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length }))
    socket.write(body)
    var response = await responses.next()

    assert.strictEqual(
      response.body.toString(),
      body.length + ' ' + crypto.createHash('sha256').update(body).digest('hex')
    )
  })

  describe('a ' + BIG / 1024 / 1024 + ' MiB file with Range', function () {
    var big

    before(function () {
      big = support.bigFile('big.bin', BIG)
    })

    after(function () {
      big.remove()
    })

    var ranges = [
      ['the first bytes', 'bytes=0-4', 206, 'START', 'bytes 0-4/' + BIG],
      [
        'the middle',
        'bytes=' + BIG / 2 + '-' + (BIG / 2 + 5),
        206,
        'MIDDLE',
        'bytes ' + BIG / 2 + '-' + (BIG / 2 + 5) + '/' + BIG
      ],
      ['a suffix', 'bytes=-3', 206, 'END', 'bytes ' + (BIG - 3) + '-' + (BIG - 1) + '/' + BIG],
      ['an open end', 'bytes=' + (BIG - 3) + '-', 206, 'END', 'bytes ' + (BIG - 3) + '-' + (BIG - 1) + '/' + BIG],
      ['a range past the end', 'bytes=' + BIG + '-', 416, '', 'bytes */' + BIG]
    ]

    ;[
      [
        'res.sendFile',
        function (app) {
          app.get('/big.bin', function (req, res) {
            res.sendFile(big.path)
          })
        }
      ],
      [
        'express.static',
        function (app) {
          app.use(express.static(big.dir))
        }
      ]
    ].forEach(function (sender) {
      it('sends each range through ' + sender[0] + ', several on one connection', async function () {
        var app = express()
        sender[1](app)
        app.use(function (err, req, res, next) {
          res.status(err.status).end()
        })
        server = await support.listen(app)

        var socket = connect(server)
        var responses = support.reader(socket)
        for (var i = 0; i < ranges.length; i++) {
          var range = ranges[i]
          socket.write(rawRequest('GET', '/big.bin', { Range: range[1] }))
          var response = await responses.next()
          assert.strictEqual(response.status, range[2], range[0])
          assert.strictEqual(response.body.toString(), range[3], range[0])
          assert.strictEqual(response.headers['content-range'], range[4], range[0])
        }
        await support.close(server)
        await support.noLeakedFds(big.path)
      })
    })
  })
})
