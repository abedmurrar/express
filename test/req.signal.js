'use strict'

// req.signal (not in Express 5.3.0; ROADMAP.md, "Additions on the compatible
// line"): an AbortSignal that aborts when the client goes away before the
// response has finished. Not from upstream.

var assert = require('node:assert')
var http = require('node:http')
var net = require('node:net')
var { once } = require('node:events')
var timers = require('node:timers/promises')
var express = require('..')

var nodeSignal = Object.getOwnPropertyDescriptor(http.IncomingMessage.prototype, 'signal')

// Starts the app (with app.listen(), or on http.createServer() with `plain`)
// and resolves with the server once it listens.
function listen(app, plain) {
  var server = plain ? http.createServer(app) : app.listen(0, '127.0.0.1')
  if (plain) server.listen(0, '127.0.0.1')
  return once(server, 'listening').then(function () {
    return server
  })
}

function close(server) {
  server.closeAllConnections()
  return new Promise(function (resolve) {
    server.close(resolve)
  })
}

// Raw connections the current test opened, destroyed after it.
var sockets = []

// Opens a raw connection, writes `data` to it and reads (and drops) what
// comes back.
function connect(server, data) {
  var socket = net.connect(server.address().port, '127.0.0.1')
  socket.on('error', function () {})
  socket.resume()
  socket.write(data)
  sockets.push(socket)
  return socket
}

// Sends a request and resolves with the response body.
function get(server, path, agent) {
  return new Promise(function (resolve, reject) {
    http
      .get({ host: '127.0.0.1', port: server.address().port, path: path, agent: agent }, function (res) {
        var body = ''
        res.setEncoding('utf8')
        res.on('data', function (chunk) {
          body += chunk
        })
        res.on('end', function () {
          resolve(body)
        })
      })
      .on('error', reject)
  })
}

// A promise and the function that resolves it.
function deferred() {
  var resolve
  var promise = new Promise(function (r) {
    resolve = r
  })
  return { promise: promise, resolve: resolve }
}

// Waits for the next turns of the event loop, so 'close' events have fired.
function settle() {
  return timers.setTimeout(20)
}

function closeListeners(req, res) {
  return [req.listenerCount('close'), res.listenerCount('close')]
}

describe('req.signal', function () {
  var server

  afterEach(function () {
    sockets.splice(0).forEach(function (socket) {
      socket.destroy()
    })
    if (server) return close(server)
  })

  it('is an AbortSignal, the same on every read, not aborted while the request runs', async function () {
    var app = express()
    var seen
    app.get('/', function (req, res) {
      seen = {
        isSignal: req.signal instanceof AbortSignal,
        same: req.signal === req.signal,
        aborted: req.signal.aborted
      }
      res.send('ok')
    })
    server = await listen(app)

    assert.strictEqual(await get(server, '/'), 'ok')
    assert.deepStrictEqual(seen, { isSignal: true, same: true, aborted: false })
  })

  it('is not enumerable, so the prototype keys stay those of Express 5.3.0', function () {
    assert.strictEqual(Object.keys(express.request).indexOf('signal'), -1)
    assert.strictEqual(Object.getOwnPropertyDescriptor(express.request, 'signal').enumerable, false)
  })

  it('adds no listener and no state until it is read', async function () {
    var app = express()
    var counts = {}
    app.get('/', function (req, res) {
      var symbols = function () {
        return Object.getOwnPropertySymbols(req).length
      }
      var sockets = req.socket.eventNames().map(function (name) {
        return req.socket.listenerCount(name)
      })
      counts.before = closeListeners(req, res).concat(symbols())
      void req.signal
      counts.after = closeListeners(req, res).concat(symbols())
      counts.socket = req.socket.eventNames().map(function (name) {
        return req.socket.listenerCount(name)
      })
      counts.socketBefore = sockets
      res.send('ok')
    })
    server = await listen(app)

    await get(server, '/')
    // one 'close' listener on the request and one on the response, one symbol
    assert.deepStrictEqual(counts.after, [counts.before[0] + 1, counts.before[1] + 1, counts.before[2] + 1])
    assert.deepStrictEqual(counts.socket, counts.socketBefore)
  })

  it('aborts with an AbortError DOMException when the client goes away before the response', async function () {
    var app = express()
    var reading = deferred()
    var aborted = deferred()
    app.get('/', function (req) {
      req.signal.addEventListener('abort', function () {
        aborted.resolve({ reason: req.signal.reason, finished: req.res.writableFinished })
      })
      reading.resolve()
    })
    server = await listen(app)

    var socket = connect(server, 'GET / HTTP/1.1\r\nHost: localhost\r\n\r\n')
    await reading.promise
    socket.destroy()
    var result = await aborted.promise

    assert.ok(result.reason instanceof DOMException)
    assert.strictEqual(result.reason.name, 'AbortError')
    assert.strictEqual(result.reason.message, 'This operation was aborted')
    assert.strictEqual(result.finished, false)
  })

  it('cancels a timer passed the signal', async function () {
    var app = express()
    var outcome = deferred()
    app.get('/', function (req, res) {
      timers.setTimeout(5000, 'late', { signal: req.signal }).then(
        function () {
          outcome.resolve('timer fired')
          res.send('late')
        },
        function (err) {
          outcome.resolve(err.name)
        }
      )
    })
    server = await listen(app)

    var socket = connect(server, 'GET / HTTP/1.1\r\nHost: localhost\r\n\r\n')
    await settle()
    socket.destroy()

    assert.strictEqual(await outcome.promise, 'AbortError')
  })

  it('aborts when the response is destroyed before it finished', async function () {
    var app = express()
    var aborted = deferred()
    app.get('/', function (req, res) {
      req.signal.onabort = function () {
        aborted.resolve(req.signal.reason.name)
      }
      res.destroy()
    })
    server = await listen(app)

    connect(server, 'GET / HTTP/1.1\r\nHost: localhost\r\n\r\n')
    assert.strictEqual(await aborted.promise, 'AbortError')
  })

  describe('after the response finished', function () {
    function finishing(app, results) {
      app.get('/', function (req, res) {
        var signal = req.signal
        var before = closeListeners(req, res).map(function (n) {
          return n - 1
        })
        res.once('close', function () {
          // the other 'close' listeners have run by the next turn
          setImmediate(function () {
            results.push({ aborted: signal.aborted, before: before, after: closeListeners(req, res) })
          })
        })
        res.send('ok')
      })
    }

    it('does not abort, and leaves no listener (keep-alive)', async function () {
      var app = express()
      var results = []
      finishing(app, results)
      server = await listen(app)

      var agent = new http.Agent({ keepAlive: true, maxSockets: 1 })
      await get(server, '/', agent)
      await settle()
      agent.destroy()
      await settle()

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].aborted, false)
      // the counts as before the read, less the test's own 'close' listener
      assert.deepStrictEqual(results[0].after, results[0].before)
    })

    it('does not abort when the connection then closes (Connection: close)', async function () {
      var app = express()
      var results = []
      finishing(app, results)
      server = await listen(app)

      var socket = connect(server, 'GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n')
      await once(socket, 'close')
      await settle()

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].aborted, false)
      assert.deepStrictEqual(results[0].after, results[0].before)
    })

    it('does not abort when the connection is destroyed right after the finish', async function () {
      var app = express()
      var seen = deferred()
      app.get('/', function (req, res) {
        var signal = req.signal
        res.on('finish', function () {
          req.socket.destroy()
        })
        res.once('close', function () {
          setImmediate(function () {
            seen.resolve({ aborted: signal.aborted, destroyed: req.socket.destroyed })
          })
        })
        res.send('ok')
      })
      server = await listen(app)

      connect(server, 'GET / HTTP/1.1\r\nHost: localhost\r\n\r\n')
      assert.deepStrictEqual(await seen.promise, { aborted: false, destroyed: true })
    })

    it('read after the finish, is not aborted and adds no listener', async function () {
      var app = express()
      var seen = deferred()
      app.get('/', function (req, res) {
        res.on('finish', function () {
          var before = closeListeners(req, res)
          var signal = req.signal
          seen.resolve({ aborted: signal.aborted, before: before, after: closeListeners(req, res) })
        })
        res.send('ok')
      })
      server = await listen(app)

      await get(server, '/')
      var result = await seen.promise
      assert.strictEqual(result.aborted, false)
      assert.deepStrictEqual(result.after, result.before)
    })
  })

  it('read after the client went away, is already aborted', async function () {
    var app = express()
    var seen = deferred()
    app.get('/', function (req, res) {
      req.socket.on('close', function () {
        var before = closeListeners(req, res)
        seen.resolve({
          aborted: req.signal.aborted,
          reason: req.signal.reason.name,
          before: before,
          after: closeListeners(req, res)
        })
      })
    })
    server = await listen(app)

    var socket = connect(server, 'GET / HTTP/1.1\r\nHost: localhost\r\n\r\n')
    await settle()
    socket.destroy()

    var result = await seen.promise
    assert.strictEqual(result.aborted, true)
    assert.strictEqual(result.reason, 'AbortError')
    assert.deepStrictEqual(result.after, result.before)
  })

  it('does not abort when a request body has been read, and aborts if the client then goes away', async function () {
    var app = express()
    var bodyRead = deferred()
    var aborted = deferred()
    app.post('/', express.text(), function (req) {
      var signal = req.signal
      signal.onabort = function () {
        aborted.resolve(req.body)
      }
      // the request's own 'close' comes once its body is read
      req.on('close', function () {
        bodyRead.resolve(signal.aborted)
      })
    })
    server = await listen(app)

    var socket = connect(
      server,
      'POST / HTTP/1.1\r\nHost: localhost\r\nContent-Type: text/plain\r\nContent-Length: 5\r\n\r\nhello'
    )
    assert.strictEqual(await bodyRead.promise, false)
    await settle()
    socket.destroy()
    assert.strictEqual(await aborted.promise, 'hello')
  })

  it('aborts for a pipelined request whose response is still queued', async function () {
    var app = express()
    var started = 0
    var both = deferred()
    var aborted = deferred()
    app.get('/:n', function (req) {
      if (req.params.n === 'b') {
        req.signal.onabort = function () {
          aborted.resolve(req.signal.reason.name)
        }
      }
      if (++started === 2) both.resolve()
    })
    server = await listen(app)

    var socket = connect(server, 'GET /a HTTP/1.1\r\nHost: localhost\r\n\r\nGET /b HTTP/1.1\r\nHost: localhost\r\n\r\n')
    await both.promise
    socket.destroy()
    assert.strictEqual(await aborted.promise, 'AbortError')
  })

  describe('in a mounted app', function () {
    it('is the same signal in the parent and the sub-app, whichever reads it first', async function () {
      var app = express()
      var blog = express()
      var signals = []
      app.use(function (req, res, next) {
        if (req.url === '/blog/parent-first') signals.push(req.signal)
        next()
      })
      blog.use(function (req, res, next) {
        signals.push(req.signal)
        assert.strictEqual(Object.getPrototypeOf(req), blog.request)
        next()
      })
      app.use('/blog', blog)
      app.use(function (req, res) {
        signals.push(req.signal)
        assert.strictEqual(Object.getPrototypeOf(req), app.request)
        res.send(String(signals.length))
      })
      server = await listen(app, true)

      assert.strictEqual(await get(server, '/blog/parent-first'), '3')
      assert.strictEqual(signals[0], signals[1])
      assert.strictEqual(signals[1], signals[2])
      signals.length = 0

      assert.strictEqual(await get(server, '/blog/sub-first'), '2')
      assert.strictEqual(signals[0], signals[1])
      assert.strictEqual(signals[0].aborted, false)
    })

    it('aborts once when read in the sub-app and the client goes away', async function () {
      var app = express()
      var blog = express()
      var reading = deferred()
      var aborts = 0
      blog.get('/', function (req) {
        req.signal.addEventListener('abort', function () {
          aborts++
        })
        req.signal.addEventListener('abort', function () {
          setImmediate(reading.resolve)
        })
        reading.resolve()
      })
      app.use('/blog', blog)
      server = await listen(app)

      var socket = connect(server, 'GET /blog HTTP/1.1\r\nHost: localhost\r\n\r\n')
      await reading.promise
      reading = deferred()
      socket.destroy()
      await reading.promise
      await settle()
      assert.strictEqual(aborts, 1)
    })
  })

  it('can be assigned, which sets an own property as on Node 22 with Express 5.3.0', async function () {
    var app = express()
    var mine = new AbortController().signal
    var seen
    app.use(function (req, res, next) {
      // a polyfill middleware, in strict mode code
      req.signal = mine
      next()
    })
    app.get('/', function (req, res) {
      seen = { same: req.signal === mine, own: Object.getOwnPropertyDescriptor(req, 'signal') }
      res.send('ok')
    })
    server = await listen(app)

    await get(server, '/')
    assert.strictEqual(seen.same, true)
    assert.deepStrictEqual(seen.own, { value: mine, writable: true, enumerable: true, configurable: true })
  })

  it("before an app handles the request, reads Node's own signal (none on Node 22)", async function () {
    var app = express()
    var seen = deferred()
    app.get('/', function (req, res) {
      res.send('not upgraded')
    })
    server = await listen(app)
    server.on('upgrade', function (req, socket) {
      seen.resolve({
        proto: Object.getPrototypeOf(req) === app.request,
        signal: nodeSignal ? req.signal instanceof AbortSignal : req.signal
      })
      socket.on('error', function () {})
      socket.destroy()
    })

    connect(server, 'GET / HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n')
    var result = await seen.promise
    // app.listen() made req with the app's prototype, so the getter runs
    assert.strictEqual(result.proto, true)
    assert.strictEqual(result.signal, nodeSignal ? true : undefined)
  })

  it('leaves no listener on the socket or the responses after many requests', async function () {
    var app = express()
    var perRequest = []
    var sockets = new Set()
    app.get('/:read', function (req, res) {
      sockets.add(req.socket)
      if (req.params.read === 'yes') void req.signal
      res.on('finish', function () {
        setImmediate(function () {
          perRequest.push(closeListeners(req, res))
        })
      })
      res.send('ok')
    })
    server = await listen(app)

    var agent = new http.Agent({ keepAlive: true, maxSockets: 1 })
    await get(server, '/no', agent)
    var socket = sockets.values().next().value
    var baseline = socket.eventNames().map(function (name) {
      return [name, socket.listenerCount(name)]
    })
    for (var i = 0; i < 200; i++) await get(server, '/yes', agent)
    await settle()

    assert.strictEqual(sockets.size, 1)
    assert.deepStrictEqual(
      socket.eventNames().map(function (name) {
        return [name, socket.listenerCount(name)]
      }),
      baseline
    )
    assert.strictEqual(perRequest.length, 201)
    perRequest.forEach(function (counts) {
      assert.deepStrictEqual(counts, perRequest[0])
    })
    agent.destroy()
  })
})
