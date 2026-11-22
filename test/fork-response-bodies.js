'use strict'

// Not from upstream. Edge cases for the fork's fixes to res.send's binary
// bodies, res.set's unknown Content-Type, res.cookie's `expires: 0`,
// res.redirect with Transfer-Encoding, and res.jsonp's sanitised callback.
// The bug tests themselves are in test/regressions/response.js.

var assert = require('node:assert')
var { Buffer } = require('node:buffer')
var vm = require('node:vm')
var express = require('..')
var request = require('supertest')
var utils = require('./support/utils')

// the bytes a view covers, in the host's byte order
function bytesOf(view) {
  return Buffer.from(view.buffer, view.byteOffset, view.byteLength)
}

function detach(arrayBuffer) {
  structuredClone(arrayBuffer, { transfer: [arrayBuffer] })
  assert.strictEqual(arrayBuffer.byteLength, 0)
}

function appSending(body, etag) {
  var app = express()
  if (etag !== undefined) app.set('etag', etag)
  app.use(function (req, res) {
    res.send(typeof body === 'function' ? body() : body)
  })
  return app
}

// supertest buffers application/octet-stream bodies into res.body
function expectBytes(expected) {
  return function (res) {
    assert.deepStrictEqual(Buffer.from(res.body), expected)
  }
}

describe('res.send with binary bodies (fork)', function () {
  var TYPED = [
    'Int8Array',
    'Uint8Array',
    'Uint8ClampedArray',
    'Int16Array',
    'Uint16Array',
    'Int32Array',
    'Uint32Array',
    'Float16Array',
    'Float32Array',
    'Float64Array',
    'BigInt64Array',
    'BigUint64Array'
  ].filter(function (name) {
    // Float16Array is new in Node 24
    return typeof globalThis[name] === 'function'
  })

  // 6 elements, every byte distinct, so a lost or reordered byte shows
  function fill(Ctor) {
    var bytes = new Uint8Array(6 * Ctor.BYTES_PER_ELEMENT)
    for (var i = 0; i < bytes.length; i++) bytes[i] = (i * 37 + 11) & 0xff
    return new Ctor(bytes.buffer)
  }

  TYPED.forEach(function (name) {
    var Ctor = globalThis[name]

    ;[true, false].forEach(function (etag) {
      it('sends the bytes of a whole ' + name + ' with etag ' + etag, function (done) {
        var body = fill(Ctor)
        var app = appSending(body, etag)
        var expected = bytesOf(body)
        var req = request(app)
          .get('/')
          .expect('Content-Type', 'application/octet-stream')
          .expect('Content-Length', String(expected.length))
          .expect(expectBytes(expected))

        if (etag) req.expect('ETag', app.get('etag fn')(expected))
        else req.expect(utils.shouldNotHaveHeader('ETag'))

        req.expect(200, done)
      })

      it('sends only the byteOffset and byteLength window of a ' + name + ' with etag ' + etag, function (done) {
        var body = fill(Ctor).subarray(2, 5)
        assert.ok(body.byteOffset > 0)
        var app = appSending(body, etag)
        var expected = bytesOf(body)
        var req = request(app)
          .get('/')
          .expect('Content-Length', String(3 * Ctor.BYTES_PER_ELEMENT))
          .expect(expectBytes(expected))

        if (etag) req.expect('ETag', app.get('etag fn')(expected))

        req.expect(200, done)
      })
    })
  })

  ;[true, false].forEach(function (etag) {
    it('sends the bytes of a DataView with etag ' + etag, function (done) {
      request(appSending(new DataView(new Uint8Array([1, 2, 3]).buffer), etag))
        .get('/')
        .expect('Content-Length', '3')
        .expect(expectBytes(Buffer.from([1, 2, 3])))
        .expect(200, done)
    })

    it('sends only the window of a DataView with etag ' + etag, function (done) {
      request(appSending(new DataView(new Uint8Array([0xaa, 0, 0xff, 0x80, 0xbb]).buffer, 1, 3), etag))
        .get('/')
        .expect('Content-Length', '3')
        .expect(expectBytes(Buffer.from([0, 0xff, 0x80])))
        .expect(200, done)
    })

    it('sends a large Uint16Array (the Buffer.from path) with etag ' + etag, function (done) {
      var body = new Uint16Array(1001).fill(0x0102)
      request(appSending(body, etag))
        .get('/')
        .expect('Content-Length', '2002')
        .expect(expectBytes(bytesOf(body)))
        .expect(200, done)
    })
  })

  it('sends an empty view as an empty body', function (done) {
    request(appSending(new DataView(new ArrayBuffer(3), 1, 0)))
      .get('/')
      .expect('Content-Length', '0')
      .expect(200, done)
  })

  it('sends a view of a detached buffer as an empty body, as before', function (done) {
    request(
      appSending(function () {
        var view = new Uint16Array(4)
        detach(view.buffer)
        return view
      })
    )
      .get('/')
      .expect('Content-Type', 'application/octet-stream')
      .expect('Content-Length', '0')
      .expect(200, done)
  })

  it('sends a view from another realm', function (done) {
    request(appSending(vm.runInNewContext('new Uint16Array([0x0102, 0x0304]).subarray(1)')))
      .get('/')
      .expect('Content-Length', '2')
      .expect(expectBytes(bytesOf(new Uint16Array([0x0304]))))
      .expect(200, done)
  })

  it('keeps a Content-Type set before the view is sent', function (done) {
    var app = express()
    app.use(function (req, res) {
      res.type('text/plain').send(new Uint16Array(new Uint8Array([104, 101, 121, 33]).buffer))
    })

    request(app).get('/').expect('Content-Type', 'text/plain; charset=utf-8').expect(200, 'hey!', done)
  })

  it('gives HEAD the length and ETag of the bytes, with no body', function (done) {
    var body = new Uint16Array([0xffff, 0x0102, 0x0304, 0xeeee]).subarray(1, 3)
    var app = appSending(body)
    request(app)
      .head('/')
      .expect('Content-Length', '4')
      .expect('ETag', app.get('etag fn')(bytesOf(body)))
      .expect(utils.shouldNotHaveBody())
      .expect(200, done)
  })

  it('answers 304 to an If-None-Match of the bytes ETag', function (done) {
    var body = new Uint16Array([0x0102, 0x0304])
    var app = appSending(body)
    request(app)
      .get('/')
      .set('If-None-Match', app.get('etag fn')(bytesOf(body)))
      .expect(304, done)
  })

  describe('an ArrayBuffer or SharedArrayBuffer', function () {
    function shared(bytes) {
      var sab = new SharedArrayBuffer(bytes.length)
      new Uint8Array(sab).set(bytes)
      return sab
    }

    ;[
      ['ArrayBuffer', (bytes) => new Uint8Array(bytes).buffer],
      ['SharedArrayBuffer', shared],
      ['ArrayBuffer from another realm', (bytes) => vm.runInNewContext('new Uint8Array(b).buffer', { b: bytes })]
    ].forEach(function (kind) {
      ;[true, false].forEach(function (etag) {
        it('sends the bytes of an ' + kind[0] + ' as octet-stream, with etag ' + etag, function (done) {
          var app = appSending(kind[1]([0, 1, 254, 255]), etag)
          var req = request(app)
            .get('/')
            .expect('Content-Type', 'application/octet-stream')
            .expect('Content-Length', '4')
            .expect(expectBytes(Buffer.from([0, 1, 254, 255])))

          if (etag) req.expect('ETag', app.get('etag fn')(Buffer.from([0, 1, 254, 255])))

          req.expect(200, done)
        })
      })
    })

    it('keeps a Content-Type set before it is sent', function (done) {
      var app = express()
      app.use(function (req, res) {
        res.set('Content-Type', 'text/plain').send(shared([104, 101, 121]))
      })

      request(app).get('/').expect('Content-Type', 'text/plain; charset=utf-8').expect(200, 'hey', done)
    })

    it('sends a detached ArrayBuffer as an empty body', function (done) {
      request(
        appSending(function () {
          var ab = new ArrayBuffer(8)
          detach(ab)
          return ab
        })
      )
        .get('/')
        .expect('Content-Type', 'application/octet-stream')
        .expect('Content-Length', '0')
        .expect(200, done)
    })

    it('still sends a plain object as JSON', function (done) {
      request(appSending({ byteLength: 3 }))
        .get('/')
        .expect('Content-Type', 'application/json; charset=utf-8')
        .expect(200, '{"byteLength":3}', done)
    })
  })

  it('still sends a Buffer as it is', function (done) {
    var app = appSending(Buffer.from('hello'))
    request(app)
      .get('/')
      .expect('ETag', app.get('etag fn')(Buffer.from('hello')))
      .expect(expectBytes(Buffer.from('hello')))
      .expect(200, done)
  })
})

describe('res.set with an unknown Content-Type (fork)', function () {
  function appWith(fn) {
    var app = express()
    app.use(fn)
    return app
  }

  it('keeps the value as given for res.end', function (done) {
    request(
      appWith(function (req, res) {
        res.set('Content-Type', 'not-a-known-type').end('x')
      })
    )
      .get('/')
      .expect('Content-Type', 'not-a-known-type')
      .expect(200, 'x', done)
  })

  it('keeps it through the object form', function (done) {
    request(
      appWith(function (req, res) {
        res.set({ 'content-type': 'not-a-known-type' }).end('x')
      })
    )
      .get('/')
      .expect('Content-Type', 'not-a-known-type')
      .expect(200, done)
  })

  it('keeps an empty value as given', function (done) {
    request(
      appWith(function (req, res) {
        res.set('Content-Type', '').end('x')
      })
    )
      .get('/')
      .expect('Content-Type', '')
      .expect(200, done)
  })

  it('sends a string body with the value as given, adding no charset', function (done) {
    request(
      appWith(function (req, res) {
        res.set('Content-Type', 'not-a-known-type').send('hello')
      })
    )
      .get('/')
      .expect('Content-Type', 'not-a-known-type')
      .expect(200, 'hello', done)
  })

  it('sends JSON with the value as given', function (done) {
    request(
      appWith(function (req, res) {
        res.set('Content-Type', 'not-a-known-type').json({ a: 1 })
      })
    )
      .get('/')
      .expect('Content-Type', 'not-a-known-type')
      .expect(200, '{"a":1}', done)
  })

  it('still expands a known shorthand', function (done) {
    request(
      appWith(function (req, res) {
        res.set('Content-Type', 'html').end()
      })
    )
      .get('/')
      .expect('Content-Type', 'text/html; charset=utf-8')
      .expect(200, done)
  })

  it('still rejects an invalid type with a "/" in res.send, as before', function (done) {
    var app = appWith(function (req, res) {
      res.set('Content-Type', 'foo/bar baz').send('x')
    })
    app.use(function (err, req, res, next) {
      res.status(500).end(err.message)
    })

    request(app).get('/').expect(500, 'Invalid type: foo/bar baz', done)
  })
})

describe('res.cookie with expires: 0 (fork)', function () {
  function cookieFor(options, done) {
    var app = express()
    app.use(function (req, res) {
      res.cookie('name', 'tobi', options).end()
    })
    request(app)
      .get('/')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err)
        done(null, res.headers['set-cookie'][0])
      })
  }

  it('sets Max-Age without Expires', function (done) {
    cookieFor({ maxAge: 60000, expires: 0 }, function (err, cookie) {
      if (err) return done(err)
      assert.strictEqual(cookie, 'name=tobi; Max-Age=60; Path=/')
      done()
    })
  })

  it('sets Max-Age=0 without Expires', function (done) {
    cookieFor({ maxAge: 0, expires: 0 }, function (err, cookie) {
      if (err) return done(err)
      assert.strictEqual(cookie, 'name=tobi; Max-Age=0; Path=/')
      done()
    })
  })

  it('does not change the options object', function (done) {
    var options = { maxAge: 60000, expires: 0 }
    cookieFor(options, function (err) {
      if (err) return done(err)
      assert.deepStrictEqual(options, { maxAge: 60000, expires: 0 })
      done()
    })
  })

  it('still adds Expires for an expires of undefined or null', function (done) {
    cookieFor({ maxAge: 60000, expires: undefined }, function (err, a) {
      if (err) return done(err)
      cookieFor({ maxAge: 60000, expires: null }, function (err, b) {
        if (err) return done(err)
        assert.match(a, /^name=tobi; Max-Age=60; Path=\/; Expires=/)
        assert.match(b, /^name=tobi; Max-Age=60; Path=\/; Expires=/)
        done()
      })
    })
  })

  it('still replaces a Date expires with the maxAge one', function (done) {
    var before = Date.now()
    cookieFor({ maxAge: 3600000, expires: new Date(0) }, function (err, cookie) {
      if (err) return done(err)
      var expires = Date.parse(/Expires=([^;]+)/.exec(cookie)[1])
      assert.ok(expires >= before + 3600000 - 1000, cookie)
      done()
    })
  })
})

describe('res.redirect with Transfer-Encoding (fork)', function () {
  function appRedirecting() {
    var app = express()
    app.use(function (req, res) {
      res.set('Transfer-Encoding', 'chunked')
      res.redirect(301, 'http://example.com/')
    })
    return app
  }

  it('sends the body without Content-Length', function (done) {
    request(appRedirecting())
      .get('/')
      .set('Accept', 'text/plain')
      .expect(utils.shouldNotHaveHeader('Content-Length'))
      .expect('Transfer-Encoding', 'chunked')
      .expect('Location', 'http://example.com/')
      .expect(301, 'Moved Permanently. Redirecting to http://example.com/', done)
  })

  it('sends no Content-Length to HEAD', function (done) {
    request(appRedirecting())
      .head('/')
      .expect(utils.shouldNotHaveHeader('Content-Length'))
      .expect('Location', 'http://example.com/')
      .expect(301, done)
  })

  it('still sends Content-Length without Transfer-Encoding', function (done) {
    var app = express()
    app.use(function (req, res) {
      res.redirect('http://example.com/')
    })

    request(app)
      .get('/')
      .set('Accept', 'text/plain')
      .expect('Content-Length', '41')
      .expect(302, 'Found. Redirecting to http://example.com/', done)
  })
})

describe('res.jsonp with a callback that sanitises to nothing (fork)', function () {
  function appJsonp() {
    var app = express()
    app.use(function (req, res) {
      res.jsonp({ count: 1 })
    })
    return app
  }

  it('sends plain JSON', function (done) {
    request(appJsonp())
      .get('/?callback=!!!')
      .expect('Content-Type', 'application/json; charset=utf-8')
      .expect('X-Content-Type-Options', 'nosniff')
      .expect(200, '{"count":1}', done)
  })

  it('sends plain JSON when the first of several callbacks sanitises to nothing', function (done) {
    request(appJsonp())
      .get('/?callback=%3C%3E&callback=ok')
      .expect('Content-Type', 'application/json; charset=utf-8')
      .expect(200, '{"count":1}', done)
  })

  it('still sends JSONP when some characters are left', function (done) {
    request(appJsonp())
      .get('/?callback=!ok!')
      .expect('Content-Type', 'text/javascript; charset=utf-8')
      .expect(200, '/**/ typeof ok === \'function\' && ok({"count":1});', done)
  })
})
