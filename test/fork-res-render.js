'use strict'

// Not from upstream. Edge cases for the fork's fixes to rendering: res.render
// after another response was sent, res.render's options object, and view
// names ending in ".". The bug tests themselves are in
// test/regressions/response.js.

var assert = require('node:assert')
var fs = require('node:fs')
var os = require('node:os')
var path = require('node:path')
var express = require('..')
var request = require('supertest')
var recordCalls = require('./support/calls')
var tmpl = require('./support/tmpl')

var FIXTURES = path.join(__dirname, 'fixtures')

// a views directory with the given files, removed after the file's tests
var dirs = []
function viewsWith(files) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'express-fork-render-'))
  Object.keys(files).forEach(function (name) {
    fs.writeFileSync(path.join(dir, name), files[name])
  })
  dirs.push(dir)
  return dir
}

after(function () {
  dirs.forEach(function (dir) {
    fs.rmSync(dir, { recursive: true })
  })
})

function createApp() {
  var app = express()
  app.engine('tmpl', tmpl)
  app.set('views', FIXTURES)
  return app
}

describe('res.render after a response was sent (fork)', function () {
  it('passes the send error to the error handler, once', async function () {
    var app = createApp()
    var errors = recordCalls()
    app.use(function (req, res) {
      res.end('already sent')
      res.render('user.tmpl', { user: { name: 'tobi' } })
    })
    app.use(function (err, req, res, next) {
      errors.record(err.code)
    })

    await request(app).get('/').expect(200, 'already sent')
    await errors.settled()
    assert.deepStrictEqual(errors.calls, ['ERR_HTTP_HEADERS_SENT'])
  })

  it('passes it on with a synchronous engine too', async function () {
    var app = createApp()
    var errors = recordCalls()
    app.engine('sync', function (file, options, callback) {
      callback(null, 'sync')
    })
    app.use(function (req, res) {
      res.end('already sent')
      res.render(path.join(viewsWith({ 'name.sync': '' }), 'name.sync'))
    })
    app.use(function (err, req, res, next) {
      errors.record(err.code)
    })

    await request(app).get('/').expect(200, 'already sent')
    await errors.settled()
    assert.deepStrictEqual(errors.calls, ['ERR_HTTP_HEADERS_SENT'])
  })

  it('still gives a custom callback the HTML, with no error', async function () {
    var app = createApp()
    var results = recordCalls()
    app.use(function (req, res) {
      res.end('already sent')
      res.render('user.tmpl', { user: { name: 'tobi' } }, function (err, html) {
        results.record([err, html])
      })
    })

    await request(app).get('/').expect(200, 'already sent')
    await results.settled()
    assert.deepStrictEqual(results.calls, [[null, '<p>tobi</p>']])
  })

  it('still sends the rendered view when nothing was sent', function (done) {
    var app = createApp()
    app.use(function (req, res) {
      res.render('user.tmpl', { user: { name: 'tobi' } })
    })

    request(app).get('/').expect('Content-Type', 'text/html; charset=utf-8').expect(200, '<p>tobi</p>', done)
  })
})

describe('res.render options object (fork)', function () {
  it('leaves a shared options object as it was across requests', function (done) {
    var app = createApp()
    var options = { user: { name: 'tobi' } }
    app.use(function (req, res) {
      res.locals.secret = req.query.s
      res.render('user.tmpl', options)
    })

    request(app)
      .get('/?s=one')
      .expect(200, '<p>tobi</p>', function (err) {
        if (err) return done(err)
        assert.deepStrictEqual(Object.keys(options), ['user'])
        assert.strictEqual(Object.hasOwn(options, '_locals'), false)
        done()
      })
  })

  it('renders with a frozen options object', function (done) {
    var app = createApp()
    app.use(function (req, res) {
      res.render('user.tmpl', Object.freeze({ user: { name: 'tobi' } }))
    })

    request(app).get('/').expect(200, '<p>tobi</p>', done)
  })

  it('keeps the precedence: options, then res.locals, then app.locals', function (done) {
    var app = express()
    var seen
    app.engine('echo', function (file, options, callback) {
      seen = { a: options.a, b: options.b, c: options.c, locals: { ...options._locals } }
      callback(null, 'ok')
    })
    app.locals.a = 'app'
    app.locals.b = 'app'
    app.locals.c = 'app'
    app.use(function (req, res) {
      res.locals.b = 'res'
      res.locals.c = 'res'
      res.render(path.join(viewsWith({ 'x.echo': '' }), 'x.echo'), { c: 'opts', _locals: { ignored: true } })
    })

    request(app)
      .get('/')
      .expect(200, 'ok', function (err) {
        if (err) return done(err)
        assert.deepStrictEqual(seen, { a: 'app', b: 'res', c: 'opts', locals: { b: 'res', c: 'res' } })
        done()
      })
  })

  it('still renders when given a callback in place of the options', function (done) {
    var app = createApp()
    app.locals.user = { name: 'loki' }
    app.use(function (req, res, next) {
      res.render('user.tmpl', function (err, html) {
        if (err) return next(err)
        res.send(html)
      })
    })

    request(app).get('/').expect(200, '<p>loki</p>', done)
  })
})

describe('a view name ending in "." (fork)', function () {
  it('gives app.render the lookup error through the callback, from a nested path too', function (done) {
    var app = createApp()
    app.set('view engine', 'tmpl')
    app.render('nested/user.', function (err) {
      assert.ok(err instanceof Error)
      assert.strictEqual(err.message, 'Failed to lookup view "nested/user." in views directory "' + FIXTURES + '"')
      done()
    })
  })

  it('gives res.render the lookup error, not a require("") error', function (done) {
    var app = createApp()
    app.set('view engine', 'tmpl')
    app.use(function (req, res) {
      res.render('user.')
    })
    app.use(function (err, req, res, next) {
      res.status(500).end(err.code + ' ' + err.message)
    })

    request(app)
      .get('/')
      .expect(
        500,
        'EXPRESS_ERR_VIEW_NOT_FOUND Failed to lookup view "user." in views directory "' + FIXTURES + '"',
        done
      )
  })

  it('looks up the name with the default engine extension added', function (done) {
    var dir = viewsWith({ 'page..tmpl': 'double dot' })
    var app = createApp()
    app.set('views', dir)
    app.set('view engine', 'tmpl')
    app.render('page.', function (err, html) {
      if (err) return done(err)
      assert.strictEqual(html, 'double dot')
      done()
    })
  })

  it('still uses an engine registered for "."', function (done) {
    var dir = viewsWith({ 'page.': 'dot engine' })
    var app = express()
    app.set('views', dir)
    app.set('view engine', 'tmpl')
    app.engine('.', function (file, options, callback) {
      callback(null, fs.readFileSync(file, 'utf8'))
    })
    app.render('page.', function (err, html) {
      if (err) return done(err)
      assert.strictEqual(html, 'dot engine')
      done()
    })
  })

  it('throws the usual error without a "view engine", like a name with no extension', function () {
    var app = createApp()
    assert.throws(function () {
      app.render('user.', function () {})
    }, /^Error: No default engine was specified and no extension was provided\.$/)
  })
})
