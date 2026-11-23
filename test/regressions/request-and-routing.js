'use strict'

// Regression tests for confirmed req.*, app and routing bugs, plus tests that
// pin today's behaviour where the roadmap keeps it on this line. See
// test/regressions/support.js.

var assert = require('node:assert')
var path = require('node:path')
var express = require('../../')
var { bug, request } = require('./support')

describe('regressions: request, app and routing', function () {
  it('#7532 req.subdomains is empty for an IPv6 host', async function () {
    var app = express()
    app.get('/', function (req, res) {
      res.json(req.subdomains)
    })
    var r = await request(app, { headers: { Host: '[::ffff:127.0.0.1]:3000' } })
    assert.deepStrictEqual(JSON.parse(r.body), [])
  })

  it('PR #7331 req.subdomains ignores a trailing root dot', async function () {
    var app = express()
    app.get('/', function (req, res) {
      res.json(req.subdomains)
    })
    var r = await request(app, { headers: { Host: 'tobi.ferrets.example.com.' } })
    assert.deepStrictEqual(JSON.parse(r.body), ['ferrets', 'tobi'])
  })

  it('#4594 an engine registered as "HTML" renders "user.html"', function (done) {
    var app = express()
    app.set('views', path.join(__dirname, '..', 'fixtures'))
    app.engine('HTML', function (file, options, cb) {
      cb(null, 'rendered ' + path.basename(file))
    })
    var threw = null
    try {
      app.render('user.html', function (err, str) {
        if (err) return done(err)
        assert.strictEqual(str, 'rendered user.html')
        done()
      })
    } catch (e) {
      threw = e
    }
    // 5.3.0 misses the engine and throws from require('html')
    if (threw) done(new Error('threw synchronously: ' + threw.message.split('\n')[0]))
  })

  it('PR #7317 req.hostname ignores userinfo in the Host header', async function () {
    var app = express()
    app.get('/', function (req, res) {
      res.json(req.hostname)
    })
    var r = await request(app, { headers: { Host: 'evil.example:x@good.example' } })
    assert.strictEqual(JSON.parse(r.body), 'good.example')
  })

  it('PR #7330 a trusted X-Forwarded-Proto of HTTPS counts as secure', async function () {
    var app = express()
    app.set('trust proxy', true)
    app.get('/', function (req, res) {
      res.json([req.protocol, req.secure])
    })
    var r = await request(app, { headers: { 'X-Forwarded-Proto': 'HTTPS' } })
    assert.deepStrictEqual(JSON.parse(r.body), ['https', true])
  })

  it('PR #7501 app.listen removes its startup error listener', function (done) {
    var app = express()
    var server = app.listen(0, '127.0.0.1', function () {
      var count = server.listenerCount('error')
      server.close()
      assert.strictEqual(count, 0)
      done()
    })
  })

  it('#4557 a router mounted at "//" does not answer "/"', async function () {
    var app = express()
    var admin = express.Router()
    admin.get('/secret', function (req, res) {
      res.send('admin router')
    })
    app.use('//', admin)
    app.get('/secret', function (req, res) {
      res.send('main app')
    })
    var r = await request(app, { path: '/secret' })
    assert.strictEqual(r.body.toString(), 'main app')
  })

  bug(
    '#4059 a req.url rewritten inside a mounted router keeps its slash',
    'A `req.url` rewrite in a mounted router loses a slash',
    async function () {
      var app = express()
      var router = express.Router()
      router.use(function (req, res, next) {
        req.url = '/index.html'
        next()
      })
      app.use('/app', router)
      app.use(function (req, res) {
        res.send(req.url)
      })
      var r = await request(app, { path: '/app' })
      assert.strictEqual(r.body.toString(), '/app/index.html')
    }
  )

  it('#6809 mounting a router on itself is rejected with a clear error', function () {
    var r = express.Router()
    assert.throws(
      function () {
        r.use(r)
      },
      function (err) {
        return err instanceof TypeError && /itself/.test(err.message)
      }
    )
  })

  it('#3798 a strict router mounted at a path routes "/dir" to its "" route', async function () {
    var app = express()
    var router = express.Router({ strict: true })
    router.get('', function (req, res) {
      res.send('no slash')
    })
    router.get('/', function (req, res) {
      res.send('slash')
    })
    app.use('/dir', router)
    var bare = await request(app, { path: '/dir' })
    var slash = await request(app, { path: '/dir/' })
    assert.deepStrictEqual([bare.body.toString(), slash.body.toString()], ['no slash', 'slash'])
  })

  it('#7427 router.use(subApp) gives the parent app its prototypes back', async function () {
    var app = express()
    app.set('trust proxy', true)
    var sub = express()
    var router = express.Router()
    router.use('/sub', sub)
    app.use(router)
    app.use(function (req, res) {
      res.json([req.app === app, res.app === app, req.ip])
    })
    var r = await request(app, { path: '/sub/x', headers: { 'X-Forwarded-For': '203.0.113.9' } })
    assert.deepStrictEqual(JSON.parse(r.body), [true, true, '203.0.113.9'])
  })

  // Found by the property tests (test/property/query.js). With a "#" in the
  // request target, parseurl falls back to Node's legacy url.parse, which
  // reads a leading "//" as the start of a host. Express 5.3.0 does the same.
  it('a "#" fragment in the request target does not change the routed path', async function () {
    var app = express()
    app.get('/admin', function (req, res) {
      res.send('admin')
    })
    app.get('*splat', function (req, res) {
      res.send('splat ' + req.path)
    })
    var plain = await request(app, { path: '//x@evil.example/admin' })
    var withFragment = await request(app, { path: '//x@evil.example/admin#z' })
    assert.strictEqual(withFragment.body.toString(), plain.body.toString())
    var empty = await request(app, { path: '//?q#a@b' })
    assert.strictEqual(empty.body.toString(), 'splat //')
  })

  describe('behaviour this line keeps (pinned)', function () {
    it('#2526 a route-level error handler does not run for errors from earlier layers (by design)', async function () {
      var app = express()
      app.all('/{*splat}', function (req, res, next) {
        next(new Error('fabricated'))
      })
      app.get(
        '/',
        function (err, req, res, next) {
          next()
        },
        function (req, res) {
          res.sendStatus(204)
        }
      )
      app.use(function (err, req, res, next) {
        res.status(500).send('app error handler')
      })
      var r = await request(app)
      assert.strictEqual(r.status, 500)
      assert.strictEqual(r.body.toString(), 'app error handler')
    })

    it('#4298 req.params is restored when an error leaves the route (by design)', async function () {
      var app = express()
      var seen = 'unset'
      app.get('/u/:id', function (req, res) {
        res.on('finish', function () {
          seen = req.params && req.params.id
        })
        res.format({
          'application/json': function () {
            res.json({})
          }
        })
      })
      app.use(function (err, req, res, next) {
        res.status(err.status || 500).end()
      })
      var r = await request(app, { path: '/u/42', headers: { Accept: 'text/csv' } })
      await new Promise(function (resolve) {
        setTimeout(resolve, 20)
      })
      assert.strictEqual(r.status, 406)
      assert.strictEqual(seen, undefined)
    })

    it('#5626 an OPTIONS handler can set a header and send JSON', async function () {
      var app = express()
      var router = express.Router()
      router.options('/', function (req, res) {
        res.status(200).setHeader('Access-Control-Allow-Methods', 'GET')
        res.json({ schema: 1 })
      })
      app.use(router)
      var r = await request(app, { method: 'OPTIONS' })
      assert.strictEqual(r.status, 200)
      assert.strictEqual(r.headers['access-control-allow-methods'], 'GET')
      assert.deepStrictEqual(JSON.parse(r.body), { schema: 1 })
    })

    it('#2281 strict routing is not applied to the mount path unless the router opts in', async function () {
      var app = express()
      app.set('strict routing', true)
      var r = express.Router({ strict: true })
      r.get('/', function (req, res) {
        res.send('hi')
      })
      app.use('/strict/', r)
      assert.strictEqual((await request(app, { path: '/strict' })).status, 200)
      assert.strictEqual((await request(app, { path: '/strict/' })).status, 200)
    })

    it('#2281 a strict router with strictMount answers "/" only with the slash', async function () {
      var app = express()
      var r = express.Router({ strict: true, strictMount: true })
      r.get('/', function (req, res) {
        res.send('hi')
      })
      app.use('/strict/', r)
      assert.strictEqual((await request(app, { path: '/strict' })).status, 404)
      assert.strictEqual((await request(app, { path: '/strict/' })).status, 200)
    })

    // Why the async view lookup (upstream PR #2653) is on 6.x: a missing view
    // is reported to the callback before app.render returns, so the common
    // `if (err) throw err` in a render callback reaches the route's caller and
    // the error handler. An async lookup would report it from an fs callback,
    // where the same throw ends the process.
    it('PR #2653 a missing view reaches the render callback before app.render returns (6.x changes this)', async function () {
      var app = express()
      app.set('views', path.join(__dirname, '..', 'fixtures'))
      app.engine('tmpl', function (file, options, cb) {
        cb(null, 'unused')
      })
      var order = []
      try {
        app.render('missing.tmpl', function (err) {
          order.push('callback')
          throw err
        })
      } catch (e) {
        order.push('caught: ' + e.message.split(' in views')[0])
      }
      assert.deepStrictEqual(order, ['callback', 'caught: Failed to lookup view "missing.tmpl"'])

      app.get('/', function (req, res) {
        res.render('missing.tmpl', function (err, html) {
          if (err) throw err
          res.send(html)
        })
      })
      app.use(function (err, req, res, next) {
        res.status(500).send('handled')
      })
      var r = await request(app)
      assert.strictEqual(r.status, 500)
      assert.strictEqual(r.body.toString(), 'handled')
    })

    it('#5878 query parsers keep the first 1000 parameters without an error (6.x changes this)', async function () {
      var many = Array.from({ length: 1200 }, function (_, i) {
        return 'k' + i + '=' + i
      }).join('&')
      for (var parser of ['simple', 'extended']) {
        var app = express()
        app.set('query parser', parser)
        app.get('/', function (req, res) {
          res.json(Object.keys(req.query).length)
        })
        var r = await request(app, { path: '/?' + many })
        assert.strictEqual(r.status, 200, parser)
        assert.strictEqual(JSON.parse(r.body), 1000, parser)
      }
    })

    it('PR #7151 the extended parser turns more than 20 repeated keys into an object (6.x changes this)', async function () {
      var app = express()
      app.set('query parser', 'extended')
      app.get('/', function (req, res) {
        res.json([Array.isArray(req.query.ids), Object.keys(req.query.ids).length])
      })
      var r = await request(app, {
        path:
          '/?' +
          Array.from({ length: 21 }, function (_, i) {
            return 'ids=' + i
          }).join('&')
      })
      assert.deepStrictEqual(JSON.parse(r.body), [false, 21])
    })
  })
})
