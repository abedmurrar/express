'use strict'

// Not from upstream. After a response was sent, a second res.send(),
// res.json(), res.redirect() and the like fails with Node's
// ERR_HTTP_HEADERS_SENT, whose message only says "Cannot set headers after
// they are sent to the client". The fork adds the name of the Express method
// that was called (expressjs/express#7560), and keeps everything else as on
// Express 5.3.0: the same error object and class, the same code and stack
// frames, thrown or forwarded from the same place. Each case runs on the fork
// and on Express 5.3.0.

var assert = require('node:assert')
var { Buffer } = require('node:buffer')
var path = require('node:path')
var express = require('..')
var baseline = require('express-baseline')
var request = require('supertest')
var tmpl = require('./support/tmpl')

var NODE_MESSAGE = 'Cannot set headers after they are sent to the client'

function named(method) {
  return NODE_MESSAGE + ': ' + method + ' was called after the response headers were sent'
}

// Sends a response, then calls `second(res)` and resolves with what it threw
// (synchronously), on the given Express.
function secondCall(lib, second) {
  var app = lib()
  var thrown
  app.get('/', function (req, res) {
    res.send('first')
    try {
      second(res, req)
    } catch (err) {
      thrown = err
    }
  })
  return request(app)
    .get('/')
    .expect(200, 'first')
    .then(function () {
      return thrown
    })
}

// What the fork and Express 5.3.0 threw, side by side.
function both(second) {
  return Promise.all([secondCall(express, second), secondCall(baseline, second)])
}

// The error's stack frames, without the first line (the message) and
// without file paths and positions, which differ between the two copies.
function frames(err) {
  return err.stack
    .split('\n')
    .slice(1)
    .map(function (line) {
      return line.trim().replace(/ \(.*\)$/, '')
    })
}

var CASES = [
  ['res.send()', 'res.send()', (res) => res.send('second')],
  ['res.send() with an object', 'res.send()', (res) => res.send({ second: true })],
  ['res.send() with a Buffer', 'res.send()', (res) => res.send(Buffer.from('second'))],
  ['res.json()', 'res.json()', (res) => res.json({ second: true })],
  ['res.jsonp()', 'res.jsonp()', (res) => res.jsonp({ second: true })],
  ['res.sendStatus()', 'res.sendStatus()', (res) => res.sendStatus(404)],
  ['res.redirect()', 'res.redirect()', (res) => res.redirect('/next')],
  ['res.redirect() with a status', 'res.redirect()', (res) => res.redirect(301, '/next')],
  ['res.set()', 'res.set()', (res) => res.set('X-Second', 'yes')],
  ['res.set() with an object', 'res.set()', (res) => res.set({ 'X-Second': 'yes' })],
  ['res.header()', 'res.set()', (res) => res.header('X-Second', 'yes')],
  ['res.append()', 'res.append()', (res) => res.append('X-Second', 'yes')],
  ['res.cookie()', 'res.cookie()', (res) => res.cookie('name', 'tobi')],
  ['res.clearCookie()', 'res.clearCookie()', (res) => res.clearCookie('name')],
  ['res.location()', 'res.location()', (res) => res.location('/next')],
  ['res.type()', 'res.type()', (res) => res.type('json')],
  ['res.contentType()', 'res.type()', (res) => res.contentType('json')],
  ['res.attachment()', 'res.attachment()', (res) => res.attachment('report.pdf')],
  ['res.links()', 'res.links()', (res) => res.links({ next: '/page/2' })],
  ['res.vary()', 'res.vary()', (res) => res.vary('Accept')],
  ['res.format()', 'res.format()', (res) => res.format({ text: function () {} })]
]

describe('the error for a second response (fork)', function () {
  CASES.forEach(function (c) {
    it(c[0] + ' names ' + c[1] + ', with the same error otherwise', function () {
      return both(c[2]).then(function (errors) {
        var ours = errors[0]
        var theirs = errors[1]

        assert.strictEqual(theirs.message, NODE_MESSAGE)
        assert.strictEqual(ours.message, named(c[1]))
        assert.strictEqual(ours.code, 'ERR_HTTP_HEADERS_SENT')
        assert.strictEqual(ours.code, theirs.code)
        assert.strictEqual(ours.name, theirs.name)
        assert.strictEqual(Object.getPrototypeOf(ours), Object.getPrototypeOf(theirs))
        assert.ok(ours instanceof Error)
        assert.deepStrictEqual(Object.keys(ours), Object.keys(theirs))
        assert.deepStrictEqual(Object.getOwnPropertyNames(ours), Object.getOwnPropertyNames(theirs))
        // the stack's first line has the new message, however it is
        // formatted (Node adds the code; a prepareStackTrace hook may not)
        assert.strictEqual(ours.stack.split('\n')[0], theirs.stack.split('\n')[0].replace(NODE_MESSAGE, named(c[1])))
        assert.ok(ours.stack.split('\n')[0].endsWith(named(c[1])))
        assert.strictEqual(String(ours), String(theirs).replace(NODE_MESSAGE, named(c[1])))
        // thrown by Node's setHeader, as in Express 5.3.0
        assert.strictEqual(frames(ours)[0], frames(theirs)[0])
        assert.match(frames(ours)[0], /setHeader/)
      })
    })
  })

  it('names the method the handler called inside res.format(), not res.format()', function () {
    var app = express()
    var thrown
    app.get('/', function (req, res) {
      res.format({
        text: function () {
          res.send('first')
          try {
            res.json({ second: true })
          } catch (err) {
            thrown = err
          }
        }
      })
    })
    return request(app)
      .get('/')
      .set('Accept', 'text/plain')
      .expect(200, 'first')
      .then(function () {
        assert.strictEqual(thrown.message, named('res.json()'))
      })
  })

  it('names the method once when the same error passes through it again', function () {
    // res.json() calls res.send(), which calls res.set(): each one names
    // itself on the way out, and the message keeps only the outermost name
    return secondCall(express, (res) => res.json('x')).then(function (err) {
      assert.strictEqual(err.message.split(': ').length, 2)
      assert.strictEqual(err.message.indexOf('res.send()'), -1)
      assert.strictEqual(err.message.indexOf('res.set()'), -1)
    })
  })

  it('reaches the error handler from a route, with the same code', function () {
    var app = express()
    var seen
    app.get('/', function (req, res) {
      res.send('first')
      res.json({ second: true })
    })
    app.use(function (err, req, res, next) {
      seen = { code: err.code, message: err.message, sent: res.headersSent }
      next()
    })
    return request(app)
      .get('/')
      .expect(200, 'first')
      .then(function () {
        assert.deepStrictEqual(seen, { code: 'ERR_HTTP_HEADERS_SENT', message: named('res.json()'), sent: true })
      })
  })

  it('reaches the error handler from a rejected async handler', function () {
    var app = express()
    var seen
    app.get('/', async function (req, res) {
      res.send('first')
      await null
      res.redirect('/next')
    })
    app.use(function (err, req, res, next) {
      seen = err.message
      next()
    })
    return request(app)
      .get('/')
      .expect(200, 'first')
      .then(function () {
        assert.strictEqual(seen, named('res.redirect()'))
      })
  })

  describe('res.render()', function () {
    function renderApp(lib, handler, errors) {
      var app = lib()
      app.engine('tmpl', tmpl)
      app.set('views', path.join(__dirname, 'fixtures'))
      app.get('/', handler)
      app.use(function (err, req, res, next) {
        errors.push({ code: err.code, message: err.message })
      })
      return app
    }

    it('without a callback, names res.render() in the error it passes on', function (done) {
      var errors = []
      var app = renderApp(
        express,
        function (req, res) {
          res.end('first')
          res.render('user.tmpl', { user: { name: 'tobi' } })
        },
        errors
      )
      request(app)
        .get('/')
        .expect(200, 'first', function (err) {
          if (err) return done(err)
          setTimeout(function () {
            assert.deepStrictEqual(errors, [{ code: 'ERR_HTTP_HEADERS_SENT', message: named('res.render()') }])
            done()
          }, 20)
        })
    })

    it("with a callback that sends, names the callback's res.send()", function (done) {
      var errors = []
      var app = renderApp(
        express,
        function (req, res, next) {
          res.end('first')
          res.render('user.tmpl', { user: { name: 'tobi' } }, function (err, html) {
            try {
              res.send(html)
            } catch (sendErr) {
              next(sendErr)
            }
          })
        },
        errors
      )
      request(app)
        .get('/')
        .expect(200, 'first', function (err) {
          if (err) return done(err)
          setTimeout(function () {
            assert.deepStrictEqual(errors, [{ code: 'ERR_HTTP_HEADERS_SENT', message: named('res.send()') }])
            done()
          }, 20)
        })
    })
  })

  describe('leaves other errors alone', function () {
    it('an invalid header value', function () {
      var app = express()
      var thrown
      app.get('/', function (req, res) {
        try {
          res.set('X-Bad', 'a\nb')
        } catch (err) {
          thrown = err
        }
        res.send('ok')
      })
      return request(app)
        .get('/')
        .expect(200, 'ok')
        .then(function () {
          assert.strictEqual(thrown.code, 'ERR_INVALID_CHAR')
          assert.strictEqual(thrown.message, 'Invalid character in header content ["X-Bad"]')
        })
    })

    it('an error from a toJSON method, and thrown values that are not Errors', function () {
      var app = express()
      var thrown = []
      app.get('/', function (req, res) {
        ;[new TypeError('no JSON for you'), 'a string', null].forEach(function (value) {
          try {
            res.json({
              toJSON: function () {
                throw value
              }
            })
          } catch (err) {
            thrown.push(err)
          }
        })
        res.send('ok')
      })
      return request(app)
        .get('/')
        .expect(200, 'ok')
        .then(function () {
          assert.strictEqual(thrown[0].message, 'no JSON for you')
          assert.strictEqual(thrown[1], 'a string')
          assert.strictEqual(thrown[2], null)
          assert.strictEqual(thrown.length, 3)
        })
    })

    it('a first response is not affected', function () {
      var app = express()
      app.get('/', function (req, res) {
        res.status(201).json({ first: true })
      })
      return request(app).get('/').expect(201, { first: true })
    })
  })
})
