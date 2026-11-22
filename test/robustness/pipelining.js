'use strict'

// HTTP/1.1 pipelining: several requests written to one socket before any
// answer. Node hands them to the app as they are parsed and queues the
// responses, so the answers must come back in request order, each with its
// own body, even when an earlier handler is slower than a later one or
// fails.

var assert = require('node:assert')
var { Buffer } = require('node:buffer')
var express = require('../..')
var support = require('./support')

var connect = support.connect
var deferred = support.deferred
var rawRequest = support.rawRequest

// Writes all the requests in one write and reads as many responses.
async function pipeline(server, requests) {
  var socket = connect(server)
  var responses = support.reader(socket)
  socket.write(Buffer.concat(requests))
  var out = []
  for (var i = 0; i < requests.length; i++) {
    var response = await responses.next()
    assert.ok(response, 'the connection closed after ' + i + ' responses')
    out.push(response)
  }
  return { responses: out, socket: socket, reader: responses }
}

function summary(responses) {
  return responses.map(function (r) {
    return r.status + ' ' + r.body.toString()
  })
}

describe('robustness: pipelining', function () {
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

  it('answers several requests on one socket in order, on the same connection', async function () {
    var app = express()
    var sockets = new Set()
    app.use(function (req, res, next) {
      sockets.add(req.socket)
      next()
    })
    app.get('/user/:id', function (req, res) {
      res.send('user ' + req.params.id)
    })
    app.post('/echo', express.json(), function (req, res) {
      res.json(req.body)
    })
    app.get('/search', function (req, res) {
      res.json(req.query)
    })
    server = await support.listen(app)

    var body = JSON.stringify({ n: 1 })
    var result = await pipeline(server, [
      rawRequest('GET', '/user/1'),
      rawRequest('POST', '/echo', { 'Content-Type': 'application/json', 'Content-Length': body.length }, body),
      rawRequest('GET', '/search?q=a&page=2'),
      rawRequest('GET', '/user/2'),
      rawRequest('GET', '/nope')
    ])

    assert.deepStrictEqual(summary(result.responses).slice(0, 4), [
      '200 user 1',
      '200 {"n":1}',
      '200 {"q":"a","page":"2"}',
      '200 user 2'
    ])
    assert.strictEqual(result.responses[4].status, 404)
    assert.strictEqual(sockets.size, 1)
  })

  it('keeps the order when the first handler finishes last', async function () {
    var app = express()
    var lastStarted = deferred()
    var order = []
    app.get('/slow', async function (req, res) {
      // answers only once the last request's handler has run
      await lastStarted.promise
      order.push('slow')
      res.send('slow')
    })
    app.get('/fast/:n', function (req, res) {
      order.push('fast ' + req.params.n)
      res.send('fast ' + req.params.n)
      if (req.params.n === '3') lastStarted.resolve()
    })
    server = await support.listen(app)

    var result = await pipeline(server, [
      rawRequest('GET', '/slow'),
      rawRequest('GET', '/fast/1'),
      rawRequest('GET', '/fast/2'),
      rawRequest('GET', '/fast/3')
    ])

    // the handlers did run out of order...
    assert.deepStrictEqual(order, ['fast 1', 'fast 2', 'fast 3', 'slow'])
    // ...but the answers come back in request order
    assert.deepStrictEqual(summary(result.responses), ['200 slow', '200 fast 1', '200 fast 2', '200 fast 3'])
  })

  it('keeps the order and the connection when a handler in the middle fails', async function () {
    var app = express()
    var errors = []
    app.get('/ok/:n', function (req, res) {
      res.send('ok ' + req.params.n)
    })
    app.get('/throw', function () {
      throw new Error('boom')
    })
    app.get('/reject', async function () {
      throw new Error('async boom')
    })
    app.get('/next-error', function (req, res, next) {
      next(Object.assign(new Error('teapot'), { status: 418 }))
    })
    app.use(function (err, req, res, next) {
      errors.push(err.message)
      res.status(err.status || 500).send('error: ' + err.message)
    })
    server = await support.listen(app)

    var result = await pipeline(server, [
      rawRequest('GET', '/ok/1'),
      rawRequest('GET', '/throw'),
      rawRequest('GET', '/ok/2'),
      rawRequest('GET', '/reject'),
      rawRequest('GET', '/next-error'),
      rawRequest('GET', '/ok/3')
    ])

    assert.deepStrictEqual(summary(result.responses), [
      '200 ok 1',
      '500 error: boom',
      '200 ok 2',
      '500 error: async boom',
      '418 error: teapot',
      '200 ok 3'
    ])
    // the rejected promise reaches the error handler a turn later, so only
    // the set of errors is fixed, not their order
    assert.deepStrictEqual(errors.sort(), ['async boom', 'boom', 'teapot'])

    // the connection is still usable
    result.socket.write(rawRequest('GET', '/ok/4'))
    var after = await result.reader.next()
    assert.strictEqual(after.body.toString(), 'ok 4')
  })

  it('keeps the order when the default error handler answers', async function () {
    var app = express()
    app.get('/ok', function (req, res) {
      res.send('ok')
    })
    app.get('/throw', function () {
      throw new Error('boom')
    })
    server = await support.listen(app)

    var result = await pipeline(server, [
      rawRequest('GET', '/throw'),
      rawRequest('GET', '/ok'),
      rawRequest('GET', '/missing'),
      rawRequest('GET', '/ok')
    ])

    assert.deepStrictEqual(
      result.responses.map(function (r) {
        return r.status
      }),
      [500, 200, 404, 200]
    )
    assert.strictEqual(result.responses[1].body.toString(), 'ok')
    assert.strictEqual(result.responses[3].body.toString(), 'ok')
  })

  it('answers the queued requests in order when a slow response is streamed', async function () {
    var app = express()
    var release = deferred()
    app.get('/stream', function (req, res) {
      res.set('Content-Length', '10')
      res.write('part1')
      release.promise.then(function () {
        res.end('part2')
      })
    })
    app.get('/after', function (req, res) {
      res.send('after')
      release.resolve()
    })
    server = await support.listen(app)

    var result = await pipeline(server, [rawRequest('GET', '/stream'), rawRequest('GET', '/after')])

    assert.deepStrictEqual(summary(result.responses), ['200 part1part2', '200 after'])
  })
})
