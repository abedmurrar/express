'use strict'

// Tests for branches no other test reached, found by counting each side of
// `&&`, `||`, `??`, `?:` and an `if` without an `else` (@vitest/coverage-v8,
// and istanbul as a cross-check). Each one pins behaviour Express 5.3.0 has
// too, and runs on both, except the router tracing, which 5.3.0 doesn't have.

var assert = require('node:assert')
var { execFileSync } = require('node:child_process')
var http = require('node:http')
var path = require('node:path')
var zlib = require('node:zlib')
var request = require('supertest')
var Layer = require('../lib/router/lib/layer')

;['../', 'express-baseline'].forEach(function (name) {
  var express = require(name)

  describe('strict branches: ' + (name === '../' ? 'express' : 'Express 5.3.0'), function () {
    describe('body parsers and a req.body that is already there', function () {
      function createApp() {
        var app = express()
        app.use(function (req, res, next) {
          req.body = 'set before'
          next()
        })
        app.use(express.json())
        app.use(express.urlencoded())
        app.post('/', function (req, res) {
          res.json({ body: req.body })
        })
        return app
      }

      it('keep it when the request has no body', function (done) {
        request(createApp()).post('/').expect(200, { body: 'set before' }, done)
      })

      it('keep it when no parser matches the type', function (done) {
        request(createApp())
          .post('/')
          .set('Content-Type', 'text/plain')
          .send('hi')
          .expect(200, { body: 'set before' }, done)
      })

      it('replace it when a parser matches', function (done) {
        request(createApp())
          .post('/')
          .send({ a: 1 })
          .expect(200, { body: { a: 1 } }, done)
      })

      it('let a later parser read what an earlier one skipped', function (done) {
        request(createApp())
          .post('/')
          .type('form')
          .send('a=1')
          .expect(200, { body: { a: '1' } }, done)
      })

      it('leave it as it is when it was read by an earlier parser', function (done) {
        var app = express()
        app.use(express.json(), express.json(), express.raw({ type: '*/*' }))
        app.post('/', function (req, res) {
          res.json({ body: req.body })
        })
        request(app)
          .post('/')
          .send({ a: 1 })
          .expect(200, { body: { a: 1 } }, done)
      })

      it('keep an own undefined body, and one the request inherits', function (done) {
        var app = express()
        Object.defineProperty(app.request, 'body', { value: 'inherited', configurable: true, writable: true })
        app.use(express.json())
        app.post('/', function (req, res) {
          res.json({ body: req.body, own: Object.hasOwn(req, 'body') })
        })
        request(app).post('/').expect(200, { body: 'inherited', own: false }, done)
      })
    })

    it('a decompression stream that fails after the body was read does not crash the process', function (done) {
      var app = express()
      var stream
      app.post(
        '/',
        function (req, res, next) {
          req.pipe = function (destination) {
            stream = destination
            return http.IncomingMessage.prototype.pipe.apply(this, arguments)
          }
          next()
        },
        express.json(),
        function (req, res) {
          assert.ok(stream instanceof zlib.Gunzip)
          // throws when the stream has no 'error' listener
          stream.emit('error', new Error('late failure'))
          res.json(req.body)
        }
      )
      request(app)
        .post('/')
        .set('Content-Encoding', 'gzip')
        .set('Content-Type', 'application/json')
        .serialize(function (body) {
          return body
        })
        .send(zlib.gzipSync('{"a":1}'))
        .expect(200, { a: 1 }, done)
    })

    it('a zstd body gets a 415 on a Node.js without zstd (before 22.15)', function () {
      // Whether Node has zstd is read once, when Express loads.
      var script = [
        "delete require('node:zlib').createZstdDecompress",
        'const express = require(' + JSON.stringify(name === '../' ? path.join(__dirname, '..') : name) + ')',
        "const req = Object.assign(new (require('node:stream').Readable)({ read() {} }), {",
        "  headers: { 'content-type': 'application/json', 'content-encoding': 'zstd', 'content-length': '2' }",
        '})',
        'express.json()(req, {}, (err) => console.log(JSON.stringify([err.status, err.type, err.message])))'
      ].join('\n')
      var out = execFileSync(process.execPath, ['-e', script], {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8'
      })
      assert.deepStrictEqual(JSON.parse(out), [415, 'encoding.unsupported', 'unsupported content encoding "zstd"'])
    })

    it('a RegExp group that took no part in the match is not a param', function (done) {
      var app = express()
      app.get(/^\/a(?:\/(?<id>\d+))?(\/b)?$/, function (req, res) {
        res.json([Object.keys(req.params), req.params])
      })
      request(app)
        .get('/a')
        .expect(200, [[], {}], function (err) {
          if (err) return done(err)
          request(app)
            .get('/a/b')
            .expect(200, [['0'], { 0: '/b' }], function (err) {
              if (err) return done(err)
              request(app)
                .get('/a/7')
                .expect(200, [['id'], { id: '7' }], done)
            })
        })
    })

    it('an error that is not a URIError, thrown while decoding a param, is passed on as it is', function () {
      var router = new express.Router()
      router.get('/:id', function () {
        throw new Error('not reached')
      })
      var thrown = new TypeError('broken decodeURIComponent')
      var decode = globalThis.decodeURIComponent
      var passed
      globalThis.decodeURIComponent = function () {
        throw thrown
      }
      try {
        router({ method: 'GET', url: '/%41' }, {}, function (err) {
          passed = err
        })
      } finally {
        globalThis.decodeURIComponent = decode
      }
      assert.strictEqual(passed, thrown)
      assert.strictEqual(thrown.message, 'broken decodeURIComponent')
      assert.deepStrictEqual(Object.keys(thrown), [])
    })
  })
})

describe('strict branches: router tracing', function () {
  // The router never calls an error handler without an error, so nothing was
  // reported for the request before the handler reports its own.
  it('an error handler called without an error can still report one', function () {
    var { requestChannel } = require('../lib/router/lib/tracing')
    var failure = new Error('reported')
    var published = []
    var passed = []
    function onError(ctx) {
      published.push(ctx.error)
    }
    requestChannel.error.subscribe(onError)
    try {
      var layer = new Layer('/', {}, function (err, req, res, next) {
        assert.strictEqual(err, undefined)
        next(failure)
      })
      layer.traceError(undefined, {}, {}, function (err) {
        passed.push(err)
      })
    } finally {
      requestChannel.error.unsubscribe(onError)
    }
    assert.deepStrictEqual(passed, [failure])
    assert.deepStrictEqual(published, [failure])
  })
})
