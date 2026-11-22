'use strict'

var express = require('../')
var assert = require('node:assert')
var crypto = require('node:crypto')
var http = require('node:http')
var http2 = require('node:http2')
var https = require('node:https')
var stream = require('node:stream')
var request = require('supertest')

describe('app.listen()', function () {
  it('should wrap with an HTTP server', function (done) {
    var app = express()

    var server = app.listen(0, function () {
      server.close(done)
    })
  })
  it('should callback on HTTP server errors', function (done) {
    var app1 = express()
    var app2 = express()

    var server1 = app1.listen(0, function (err) {
      assert(!err)
      app2.listen(server1.address().port, function (err) {
        assert(err.code === 'EADDRINUSE')
        server1.close()
        done()
      })
    })
  })
  it('accepts port + hostname + backlog + callback', function (done) {
    const app = express()
    const server = app.listen(0, '127.0.0.1', 5, function () {
      const { address, port } = server.address()
      assert.strictEqual(address, '127.0.0.1')
      assert(Number.isInteger(port) && port > 0)
      // backlog isn’t directly inspectable, but if no error was thrown
      // we know it was accepted.
      server.close(done)
    })
  })
  it('accepts just a callback (no args)', function (done) {
    const app = express()
    // same as app.listen(0, done)
    const server = app.listen()
    server.close(done)
  })

  it('should not invoke callback more than once', function (done) {
    var app = express()
    var count = 0
    var seen = []
    var server = app.listen(0, function () {
      count++
    })

    server.on('error', function (err) {
      seen.push(err.message)
    })
    server.once('listening', function () {
      server.emit('error', new Error('boom'))
      server.emit('listening')
      server.close(function (err) {
        assert.ifError(err)
        assert.strictEqual(count, 1)
        assert.deepStrictEqual(seen, ['boom'])
        done()
      })
    })
  })

  describe('the startup error listener', function () {
    // Node's own http.Server has 'listening' listeners of its own
    var NODE_LISTENING = http.createServer().listenerCount('listening')

    it('should be removed once the server is listening', function (done) {
      var app = express()
      var server = app.listen(0, '127.0.0.1', function () {
        var errors = server.listenerCount('error')
        var listening = server.listenerCount('listening')
        server.close(function (err) {
          assert.ifError(err)
          assert.strictEqual(errors, 0)
          assert.strictEqual(listening, NODE_LISTENING)
          done()
        })
      })
    })

    it('should not be added without a callback', function (done) {
      var app = express()
      var server = app.listen(0, '127.0.0.1')
      assert.strictEqual(server.listenerCount('error'), 0)
      server.on('listening', function () {
        server.close(done)
      })
    })

    it('should leave a later error to the server error listeners', function (done) {
      var app = express()
      var calls = []
      var server = app.listen(0, '127.0.0.1', function (err) {
        calls.push(err)
        server.on('error', function (err) {
          server.close(function () {
            assert.strictEqual(err.message, 'later failure')
            assert.deepStrictEqual(calls, [undefined])
            done()
          })
        })
        server.emit('error', new Error('later failure'))
      })
    })

    it('should not swallow a later error when the app has no error listener', function (done) {
      var app = express()
      var server = app.listen(0, '127.0.0.1', function () {
        var later = new Error('later failure')
        assert.throws(function () {
          server.emit('error', later)
        }, later)
        server.close(done)
      })
    })

    it('should not catch an EADDRINUSE from listening again', function (done) {
      var app = express()
      var server = app.listen(0, '127.0.0.1', function (err) {
        if (err) return done(err)
        server.close(function (err) {
          if (err) return done(err)
          var blocker = app.listen(0, '127.0.0.1', function (err) {
            if (err) return done(err)
            // first in line, so it counts the listeners before any other runs
            server.prependOnceListener('error', function (err) {
              var left = server.listenerCount('error')
              blocker.close(function (closeErr) {
                assert.ifError(closeErr)
                assert.strictEqual(err.code, 'EADDRINUSE')
                assert.strictEqual(left, 0)
                done()
              })
            })
            server.listen(blocker.address().port, '127.0.0.1')
          })
        })
      })
    })

    it('should pass a failed start to the callback and remove both listeners', function (done) {
      var app = express()
      var blocker = app.listen(0, '127.0.0.1', function () {
        var server = app.listen(blocker.address().port, '127.0.0.1', function (err) {
          var errors = server.listenerCount('error')
          var listening = server.listenerCount('listening')
          blocker.close(function () {
            assert.strictEqual(err.code, 'EADDRINUSE')
            assert.strictEqual(errors, 0)
            assert.strictEqual(listening, NODE_LISTENING)
            done()
          })
        })
      })
    })
  })

  it('server.address() gives a { address, port, family } object', function (done) {
    const app = express()
    const server = app.listen(0, () => {
      const addr = server.address()
      assert(addr && typeof addr === 'object')
      assert.strictEqual(typeof addr.address, 'string')
      assert(Number.isInteger(addr.port) && addr.port > 0)
      assert(typeof addr.family === 'string')
      server.close(done)
    })
  })

  describe('req and res prototypes', function () {
    it('should make req and res with the app prototypes, with no swap', function (done) {
      var app = express()
      var setPrototypeOf = Object.setPrototypeOf
      var swaps = 0
      var made

      Object.setPrototypeOf = function (obj, proto) {
        if (proto === app.request || proto === app.response) swaps++
        return setPrototypeOf(obj, proto)
      }

      app.use(function (req, res) {
        Object.setPrototypeOf = setPrototypeOf
        res.json({
          made: made,
          swaps: swaps,
          req: Object.getPrototypeOf(req) === app.request,
          res: Object.getPrototypeOf(res) === app.response,
          reqInstance: req instanceof http.IncomingMessage,
          resInstance: res instanceof http.ServerResponse,
          reqConstructor: req.constructor === http.IncomingMessage,
          resConstructor: res.constructor === http.ServerResponse,
          app: req.app === app && res.app === app
        })
      })

      var server = app.listen(0, function () {
        // runs before the app, so it sees req and res as they were made
        server.prependListener('request', function (req, res) {
          made = Object.getPrototypeOf(req) === app.request && Object.getPrototypeOf(res) === app.response
        })

        request(server)
          .get('/')
          .expect(
            200,
            {
              made: true,
              swaps: 0,
              req: true,
              res: true,
              reqInstance: true,
              resInstance: true,
              reqConstructor: true,
              resConstructor: true,
              app: true
            },
            function (err) {
              Object.setPrototypeOf = setPrototypeOf
              server.close(function () {
                done(err)
              })
            }
          )
      })
    })

    it('should swap to a mounted app and back to the parent', function (done) {
      var app = express()
      var blog = express()
      var seen = []

      function record(name, owner) {
        return function (req, res) {
          seen.push(
            name +
              ' ' +
              (Object.getPrototypeOf(req) === owner.request) +
              ' ' +
              (Object.getPrototypeOf(res) === owner.response) +
              ' ' +
              (req instanceof http.IncomingMessage && res instanceof http.ServerResponse)
          )
        }
      }

      blog.get('/', function (req, res, next) {
        record('blog', blog)(req, res)
        next()
      })
      blog.get('/fail', function (req, res, next) {
        record('blog', blog)(req, res)
        next(new Error('boom'))
      })

      app.use('/blog', blog)

      app.use(function (req, res) {
        record('app', app)(req, res)
        res.send(seen.join(', '))
      })

      app.use(function (err, req, res, next) {
        record('app error', app)(req, res)
        res.status(500).send(err.message + ': ' + seen.join(', '))
      })

      var server = app.listen(0, function () {
        request(server)
          .get('/blog')
          .expect(200, 'blog true true true, app true true true', function (err) {
            if (err) return server.close(() => done(err))
            seen = []
            request(server)
              .get('/blog/fail')
              .expect(500, 'boom: blog true true true, app error true true true', function (err) {
                server.close(function () {
                  done(err)
                })
              })
          })
      })
    })

    it('should see properties added to app.request and app.response after listen()', function (done) {
      var app = express()

      app.use(function (req, res) {
        res.send(req.greeting() + ' ' + res.farewell())
      })

      var server = app.listen(0, function () {
        app.request.greeting = function () {
          return 'hello'
        }
        app.response.farewell = function () {
          return 'bye'
        }

        request(server)
          .get('/')
          .expect(200, 'hello bye', function (err) {
            server.close(function () {
              done(err)
            })
          })
      })
    })

    it('should use app.request and app.response replaced after listen()', function (done) {
      var app = express()
      var replacedRequest = Object.create(express.request, {
        app: { configurable: true, enumerable: true, writable: true, value: app },
        greeting: { value: 'hello' }
      })
      var replacedResponse = Object.create(express.response, {
        app: { configurable: true, enumerable: true, writable: true, value: app },
        farewell: { value: 'bye' }
      })

      app.use(function (req, res) {
        res.json({
          req: Object.getPrototypeOf(req) === replacedRequest,
          res: Object.getPrototypeOf(res) === replacedResponse,
          instances: req instanceof http.IncomingMessage && res instanceof http.ServerResponse,
          values: req.greeting + ' ' + res.farewell
        })
      })

      var server = app.listen(0, function () {
        app.request = replacedRequest
        app.response = replacedResponse

        request(server)
          .get('/')
          .expect(200, { req: true, res: true, instances: true, values: 'hello bye' }, function (err) {
            server.close(function () {
              done(err)
            })
          })
      })
    })

    it('should swap as before when app.request and app.response are not http objects at listen()', function (done) {
      var app = express()
      var request0 = app.request
      var response0 = app.response
      var made

      app.request = {}
      app.response = {}

      app.use(function (req, res) {
        res.json({
          made: made,
          req: Object.getPrototypeOf(req) === app.request,
          res: Object.getPrototypeOf(res) === app.response
        })
      })

      var server = app.listen(0, function () {
        app.request = request0
        app.response = response0

        server.prependListener('request', function (req, res) {
          made =
            Object.getPrototypeOf(req) === http.IncomingMessage.prototype &&
            Object.getPrototypeOf(res) === http.ServerResponse.prototype
        })

        request(server)
          .get('/')
          .expect(200, { made: true, req: true, res: true }, function (err) {
            server.close(function () {
              done(err)
            })
          })
      })
    })

    it('should swap as before when the app.request and app.response chains change after listen()', function (done) {
      var app = express()

      // The "Prototype" section of the overriding guide: stand-ins for
      // http.IncomingMessage and http.ServerResponse that work the same but
      // are other classes. Here they're set on this app's chains only.
      function copy(sources, base, extra) {
        var obj = Object.create(base)
        sources.forEach(function (source) {
          Reflect.ownKeys(source).forEach(function (key) {
            if (key !== 'constructor' && !Object.hasOwn(obj, key)) {
              Object.defineProperty(obj, key, Object.getOwnPropertyDescriptor(source, key))
            }
          })
        })
        return Object.assign(obj, extra)
      }
      var fakeIncoming = copy([http.IncomingMessage.prototype], stream.Readable.prototype, { fake: 'req' })
      var fakeOutgoing = copy(
        [http.ServerResponse.prototype, http.OutgoingMessage.prototype],
        stream.Stream.prototype,
        {
          fake: 'res'
        }
      )

      app.use(function (req, res) {
        res.json({
          fakes: req.fake + ' ' + res.fake,
          req: Object.getPrototypeOf(req) === app.request,
          res: Object.getPrototypeOf(res) === app.response,
          instances: req instanceof http.IncomingMessage || res instanceof http.ServerResponse
        })
      })

      var server = app.listen(0, function () {
        Object.setPrototypeOf(app.request, copy([express.request], fakeIncoming))
        Object.setPrototypeOf(app.response, copy([express.response], fakeOutgoing))

        request(server)
          .get('/')
          .expect(200, { fakes: 'req res', req: true, res: true, instances: false }, function (err) {
            server.close(function () {
              done(err)
            })
          })
      })
    })

    it('should leave upgrade requests to the upgrade listener', function (done) {
      var app = express()

      app.get('/', function (req, res) {
        res.send('plain')
      })

      var server = app.listen(0, '127.0.0.1', function () {
        server.on('upgrade', function (req, socket) {
          assert.ok(req instanceof http.IncomingMessage)
          assert.strictEqual(req.headers.upgrade, 'test')
          socket.end('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n')
        })

        http
          .request({
            port: server.address().port,
            host: '127.0.0.1',
            headers: { connection: 'upgrade', upgrade: 'test' }
          })
          .on('upgrade', function (res, socket) {
            socket.destroy()
            assert.strictEqual(res.statusCode, 101)
            request(server)
              .get('/')
              .expect(200, 'plain', function (err) {
                server.close(function () {
                  done(err)
                })
              })
          })
          .on('error', done)
          .end()
      })
    })
  })

  describe('req and res prototypes on servers it did not make', function () {
    function checks(app) {
      return function (req, res) {
        res.json({
          req: Object.getPrototypeOf(req) === app.request,
          res: Object.getPrototypeOf(res) === app.response,
          reqInstance: req instanceof http.IncomingMessage,
          resInstance: res instanceof http.ServerResponse
        })
      }
    }

    var expected = { req: true, res: true, reqInstance: true, resInstance: true }

    it('should swap for http.createServer(app)', function (done) {
      var app = express()
      var made
      app.use(checks(app))

      var server = http.createServer(app)
      server.prependListener('request', function (req, res) {
        made =
          Object.getPrototypeOf(req) === http.IncomingMessage.prototype &&
          Object.getPrototypeOf(res) === http.ServerResponse.prototype
      })

      server.listen(0, function () {
        request(server)
          .get('/')
          .expect(200, expected, function (err) {
            server.close(function () {
              if (!err) assert.strictEqual(made, true)
              done(err)
            })
          })
      })
    })

    it('should swap for request(app) in supertest', function (done) {
      var app = express()
      app.use(checks(app))

      request(app).get('/').expect(200, expected, done)
    })

    it('should swap for https.createServer(options, app)', function (done) {
      var app = express()
      var made
      app.use(checks(app))

      // TLS with a pre-shared key needs no certificate
      var psk = crypto.randomBytes(32)
      var tls = { ciphers: 'PSK-AES128-GCM-SHA256', maxVersion: 'TLSv1.2' }
      var server = https.createServer(
        Object.assign(
          {
            pskCallback: function () {
              return psk
            }
          },
          tls
        ),
        app
      )
      server.prependListener('request', function (req, res) {
        made =
          Object.getPrototypeOf(req) === http.IncomingMessage.prototype &&
          Object.getPrototypeOf(res) === http.ServerResponse.prototype
      })

      server.listen(0, '127.0.0.1', function () {
        https
          .get(
            Object.assign(
              {
                host: '127.0.0.1',
                port: server.address().port,
                pskCallback: function () {
                  return { psk: psk, identity: 'test' }
                },
                checkServerIdentity: function () {}
              },
              tls
            ),
            function (res) {
              var body = ''
              res.setEncoding('utf8')
              res.on('data', function (chunk) {
                body += chunk
              })
              res.on('end', function () {
                server.close(function () {
                  assert.strictEqual(res.statusCode, 200)
                  assert.deepStrictEqual(JSON.parse(body), expected)
                  assert.strictEqual(made, true)
                  done()
                })
              })
            }
          )
          .on('error', done)
      })
    })

    it('should swap for an http2 compatibility server', function (done) {
      var app = express()
      var seen

      // Express 5.3.0 can't route an http2 compatibility request (its url is
      // lost with the swap), so the app is called with a next callback and
      // the answer goes out on the raw stream.
      var server = http2.createServer(function (req, res) {
        var stream = res.stream
        var made = Object.getPrototypeOf(req) === http2.Http2ServerRequest.prototype
        app(req, res, function () {
          seen = {
            made: made,
            req: Object.getPrototypeOf(req) === app.request,
            res: Object.getPrototypeOf(res) === app.response,
            reqInstance: req instanceof http.IncomingMessage,
            resInstance: res instanceof http.ServerResponse
          }
          stream.respond({ ':status': 200 })
          stream.end()
        })
      })

      server.listen(0, '127.0.0.1', function () {
        var client = http2.connect('http://127.0.0.1:' + server.address().port)
        var stream = client.request({ ':path': '/' })
        stream.resume()
        stream.on('end', function () {
          client.close()
          server.close(function () {
            assert.deepStrictEqual(seen, Object.assign({ made: true }, expected))
            done()
          })
        })
        stream.end()
      })
    })
  })
})
