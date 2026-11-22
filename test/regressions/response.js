'use strict'

// Regression tests for confirmed res.* bugs. See test/regressions/support.js.

var assert = require('node:assert')
var fs = require('node:fs')
var os = require('node:os')
var path = require('node:path')
var { Buffer } = require('node:buffer')
var express = require('../../')
var { bug, request } = require('./support')

function tmpViews(files) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'express-regression-'))
  Object.keys(files).forEach(function (name) {
    fs.writeFileSync(path.join(dir, name), files[name])
  })
  return dir
}

describe('regressions: response', function () {
  it('#7362 res.send(ArrayBuffer) sends its bytes', async function () {
    var app = express()
    app.get('/', function (req, res) {
      res.send(new Uint8Array([1, 2, 3]).buffer)
    })
    var r = await request(app)
    assert.strictEqual(r.status, 200)
    assert.strictEqual(r.headers['content-type'], 'application/octet-stream')
    assert.deepStrictEqual([...r.body], [1, 2, 3])
  })

  it('#7510 res.send(DataView) sends its bytes', async function () {
    var app = express()
    app.get('/', function (req, res) {
      res.send(new DataView(new Uint8Array([0, 1, 2, 3, 0]).buffer))
    })
    var r = await request(app)
    assert.strictEqual(r.status, 200)
    assert.strictEqual(r.headers['content-length'], '5')
    assert.deepStrictEqual([...r.body], [0, 1, 2, 3, 0])
  })

  it('#7538 res.send(Uint16Array) sends its underlying bytes, with and without ETag', async function () {
    var data = new Uint16Array([0x0102, 0x0304])
    var expected = [...Buffer.from(data.buffer)]
    for (var etag of [true, false]) {
      var app = express()
      app.set('etag', etag)
      app.get('/', function (req, res) {
        res.send(data)
      })
      var r = await request(app)
      assert.strictEqual(r.status, 200, 'etag ' + etag)
      assert.deepStrictEqual([...r.body], expected, 'etag ' + etag)
    }
  })

  it('#7506 res.redirect leaves out Content-Length when Transfer-Encoding is set', async function () {
    var app = express()
    app.use(function (req, res) {
      res.set('Transfer-Encoding', 'chunked')
      res.redirect('http://example.com/')
    })
    var r = await request(app)
    assert.strictEqual(r.error, undefined, 'the client rejected the response: ' + r.error)
    assert.strictEqual(r.status, 302)
    assert.strictEqual(r.headers['content-length'], undefined)
    assert.strictEqual(r.headers.location, 'http://example.com/')
  })

  it('#7034 res.set keeps an unknown Content-Type value as given', async function () {
    var app = express()
    app.get('/', function (req, res) {
      res.set('Content-Type', 'not-a-known-type')
      res.end('x')
    })
    var r = await request(app)
    assert.strictEqual(r.headers['content-type'], 'not-a-known-type')
  })

  it('#5150 res.cookie leaves out Expires when expires is 0', async function () {
    var app = express()
    app.get('/', function (req, res) {
      res.cookie('a', 'b', { maxAge: 60000, expires: 0 })
      res.end()
    })
    var r = await request(app)
    var cookie = r.headers['set-cookie'][0]
    assert.match(cookie, /Max-Age=60/)
    assert.doesNotMatch(cookie, /Expires=/)
  })

  bug(
    '#4750 res.sendFile honours a per-call etag: false',
    '`sendFile` ignores a per-call `etag: false`',
    async function () {
      var app = express()
      app.get('/', function (req, res) {
        res.sendFile(path.join(__dirname, 'support.js'), { etag: false })
      })
      var r = await request(app)
      assert.strictEqual(r.status, 200)
      assert.strictEqual(r.headers.etag, undefined)
    }
  )

  bug(
    '#4944 res.sendFile streams files whose size is reported as 0 (/proc)',
    '`/proc` files are sent empty',
    async function () {
      if (!fs.existsSync('/proc/cpuinfo')) this.skip()
      var app = express()
      app.get('/', function (req, res) {
        res.sendFile('/proc/cpuinfo')
      })
      var r = await request(app)
      assert.strictEqual(r.error, undefined, 'the client rejected the response: ' + r.error)
      assert.strictEqual(r.status, 200)
      assert.ok(r.body.length > 0, 'expected the file contents, got an empty body')
    }
  )

  bug(
    '#7560 res.render after a send reports the error instead of throwing it',
    '`res.render` after a send crashes the process',
    async function () {
      var dir = tmpViews({ 'index.tmpl': 'hi' })
      var seen
      var app = express()
      app.engine('tmpl', function (file, opts, cb) {
        cb(null, fs.readFileSync(file, 'utf8'))
      })
      app.set('views', dir)
      app.set('view engine', 'tmpl')
      app.get('/', function (req, res, next) {
        res.send('already sent')
        res.render('index', function (err) {
          seen = err && err.code
        })
      })
      try {
        var r = await request(app)
        await new Promise(function (resolve) {
          setTimeout(resolve, 50)
        })
        assert.strictEqual(r.body.toString(), 'already sent')
        assert.strictEqual(seen, 'ERR_HTTP_HEADERS_SENT')
      } finally {
        fs.rmSync(dir, { recursive: true })
      }
    }
  )

  bug(
    'PR #7541 res.render does not change the options object it is given',
    "`res.render` mutates the caller's options",
    async function () {
      var dir = tmpViews({ 'v.tmpl': 'x' })
      var app = express()
      app.engine('tmpl', function (f, o, cb) {
        cb(null, 'ok')
      })
      app.set('views', dir)
      app.set('view engine', 'tmpl')
      var shared = { title: 't' }
      app.get('/a', function (req, res) {
        res.render('v', shared)
      })
      app.get('/b', function (req, res) {
        res.render('v', Object.freeze({ title: 't' }))
      })
      try {
        await request(app, { path: '/a' })
        var b = await request(app, { path: '/b' })
        assert.deepStrictEqual(Object.keys(shared), ['title'])
        assert.strictEqual(b.status, 200)
      } finally {
        fs.rmSync(dir, { recursive: true })
      }
    }
  )

  bug(
    '#7350 app.render reports a view name ending in "." through the callback',
    'A view name ending in `.` throws synchronously',
    function (done) {
      var app = express()
      app.set('view engine', 'ejs')
      var threw = null
      try {
        app.render('index.', function (err) {
          assert.ok(err instanceof Error)
          done()
        })
      } catch (e) {
        threw = e
      }
      if (threw) done(new Error('threw synchronously: ' + threw.message.split('\n')[0]))
    }
  )

  it('PR #7161 res.jsonp with a callback that sanitises to nothing sends plain JSON', async function () {
    var app = express()
    app.get('/', function (req, res) {
      res.jsonp({ a: 1 })
    })
    var r = await request(app, { path: '/?callback=!!!' })
    assert.match(r.headers['content-type'], /^application\/json/)
    assert.strictEqual(r.body.toString(), '{"a":1}')
  })
})
