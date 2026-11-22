'use strict'

// Authorization bypass: an auth guard registered before a protected handler
// must run first for every request that reaches the handler, however the
// path is spelled. Every project that added a routing fast path to Express
// shipped a bypass of this kind (see research/forks.md), and the roadmap
// plans router speed-ups, so this is their guard.
//
// Each setup is checked twice per path: without credentials the protected
// handler must never run, and with credentials it must never run before the
// guard (it answers BYPASS if it does). The paths that reach the handler with
// credentials are pinned, so a change in what a route matches is noticed too.

var assert = require('node:assert')
var express = require('../../')
var { bug } = require('../regressions/support')
var { serve, request, auth, secret } = require('./support')

var ATTACKS = [
  '/admin/secret',
  '/ADMIN/secret',
  '/Admin/SECRET',
  '/ADMIN/SECRET/',
  '/admin/secret/',
  '/admin/secret//',
  '/admin//secret',
  '//admin/secret',
  '/admin/./secret',
  '/./admin/secret',
  '/admin/x/../secret',
  '/x/../admin/secret',
  '/admin/secret/.',
  '/admin/secret/%2e%2e',
  '/%61dmin/secret',
  '/admin/%73ecret',
  '/admin%2Fsecret',
  '/admin%2fsecret',
  '/ADMIN%2FSECRET',
  '/%2Fadmin/secret',
  '/admin%252Fsecret',
  '/%2e/admin/secret',
  '/admin/%2e/secret',
  '/admin/%2E/secret',
  '/admin/secret%2F',
  '/admin/secret%2f',
  '/admin/secret%3F',
  '/admin/secret%00',
  '/admin/secret%20',
  '/admin/secret%09',
  '/admin%20/secret',
  '/admin/secret.',
  '/admin/secret;',
  '/admin;/secret',
  '/admin\\secret',
  '/admin/secret?x=1',
  '/admin/secret#x',
  'http://localhost/admin/secret',
  'http://evil.example/ADMIN/secret'
]

// The paths that reach the handler under default settings: case is ignored,
// one trailing slash is allowed, and the query, fragment and the
// absolute-form authority are not part of the path.
var REACHES = [
  '/admin/secret',
  '/ADMIN/secret',
  '/Admin/SECRET',
  '/ADMIN/SECRET/',
  '/admin/secret/',
  '/admin/secret?x=1',
  '/admin/secret#x',
  'http://localhost/admin/secret',
  'http://evil.example/ADMIN/secret'
]

var CASE_SENSITIVE_REACHES = [
  '/admin/secret',
  '/admin/secret/',
  '/admin/secret?x=1',
  '/admin/secret#x',
  'http://localhost/admin/secret'
]

var STRICT_REACHES = [
  '/admin/secret',
  '/ADMIN/secret',
  '/Admin/SECRET',
  '/admin/secret?x=1',
  '/admin/secret#x',
  'http://localhost/admin/secret',
  'http://evil.example/ADMIN/secret'
]

var SETUPS = [
  {
    name: 'app.use(path, auth) before app.get',
    build: function () {
      var app = express()
      app.use('/admin', auth)
      app.get('/admin/secret', secret)
      return app
    }
  },
  {
    name: 'app.use(auth) before a router mounted with no path',
    build: function () {
      var app = express()
      var router = express.Router()
      router.get('/admin/secret', secret)
      app.use(auth)
      app.use(router)
      return app
    }
  },
  {
    name: 'router.use(auth) inside a mounted router',
    build: function () {
      var app = express()
      var router = express.Router()
      router.use(auth)
      router.get('/secret', secret)
      app.use('/admin', router)
      return app
    }
  },
  {
    name: 'app.use(path, auth) before a router mounted at the same path',
    build: function () {
      var app = express()
      var router = express.Router()
      router.get('/secret', secret)
      app.use('/admin', auth, router)
      return app
    }
  },
  {
    name: 'auth inside a mounted sub-app',
    build: function () {
      var app = express()
      var sub = express()
      sub.use(auth)
      sub.get('/secret', secret)
      app.use('/admin', sub)
      return app
    }
  },
  {
    name: 'app.use(path, auth) before a mounted sub-app',
    build: function () {
      var app = express()
      var sub = express()
      sub.get('/secret', secret)
      app.use('/admin', auth)
      app.use('/admin', sub)
      return app
    }
  },
  {
    name: 'nested routers with auth in the outer one',
    build: function () {
      var app = express()
      var outer = express.Router()
      var inner = express.Router()
      inner.get('/secret', secret)
      outer.use(auth)
      outer.use('/', inner)
      app.use('/admin', outer)
      return app
    }
  },
  {
    name: 'route-level auth: app.get(path, auth, handler)',
    build: function () {
      var app = express()
      app.get('/admin/secret', auth, secret)
      return app
    },
    reaches: REACHES
  },
  {
    name: 'route-level auth: app.route(path).all(auth).get(handler)',
    build: function () {
      var app = express()
      app.route('/admin/secret').all(auth).get(secret)
      return app
    }
  },
  {
    name: 'a wildcard app.all before the route',
    build: function () {
      var app = express()
      app.all('/admin/{*rest}', auth)
      app.get('/admin/secret', secret)
      return app
    }
  },
  // The router skips a route that has no handler for the method before
  // matching its path, and checks a string path's literal start before its
  // regex (lower-cased unless routing is case sensitive). These guards are
  // spelled so that a wrong skip or a wrong prefix would let a request past.
  {
    name: 'an upper-case guard path: app.use("/ADMIN", auth)',
    build: function () {
      var app = express()
      app.use('/ADMIN', auth)
      app.get('/admin/secret', secret)
      return app
    }
  },
  {
    name: 'an all() guard route next to a route for another method',
    build: function () {
      var app = express()
      app.post('/admin/secret', function (req, res) {
        res.send('post')
      })
      app.all('/Admin/Secret', auth)
      app.get('/admin/secret', secret)
      return app
    }
  },
  {
    name: 'a GET guard with a parameter: app.get("/admin/:page", auth)',
    build: function () {
      var app = express()
      app.get('/admin/:page', auth)
      app.get('/admin/secret', secret)
      return app
    }
  },
  {
    name: 'a GET guard with a wildcard after a literal: app.get("/admin/*rest", auth)',
    build: function () {
      var app = express()
      app.get('/admin/*rest', auth)
      app.get('/admin/secret', secret)
      return app
    }
  },
  {
    name: 'a non-stateful RegExp guard with the i flag',
    build: function () {
      var app = express()
      app.use(/^\/admin/i, auth)
      app.get('/admin/secret', secret)
      return app
    }
  },
  {
    name: 'case sensitive routing',
    build: function () {
      var app = express()
      app.set('case sensitive routing', true)
      app.use('/admin', auth)
      app.get('/admin/secret', secret)
      return app
    },
    reaches: CASE_SENSITIVE_REACHES
  },
  {
    name: 'case sensitive routing in a router',
    build: function () {
      var app = express()
      var router = express.Router({ caseSensitive: true })
      router.use('/admin', auth)
      router.get('/admin/secret', secret)
      app.use(router)
      return app
    },
    reaches: CASE_SENSITIVE_REACHES
  },
  {
    name: 'strict routing',
    build: function () {
      var app = express()
      app.set('strict routing', true)
      app.use('/admin', auth)
      app.get('/admin/secret', secret)
      return app
    },
    reaches: STRICT_REACHES
  },
  {
    name: 'strict routing in a router',
    build: function () {
      var app = express()
      var router = express.Router({ strict: true })
      router.use(auth)
      router.get('/secret', secret)
      app.use('/admin', router)
      return app
    },
    reaches: STRICT_REACHES
  }
]

describe('security: authorization bypass', function () {
  SETUPS.forEach(function (setup) {
    describe(setup.name, function () {
      var send
      before(function () {
        send = serve(setup.build())
      })
      after(function () {
        return send.close()
      })

      ATTACKS.forEach(function (path) {
        it('guards ' + JSON.stringify(path), async function () {
          var denied = await send({ path: path })
          assert.notStrictEqual(denied.body, 'secret', 'handler ran without credentials')
          assert.notStrictEqual(denied.body, 'BYPASS', 'handler ran without the guard')

          var allowed = await send({ path: path, headers: { Authorization: 'letmein' } })
          assert.notStrictEqual(allowed.body, 'BYPASS', 'handler ran before the guard')
          var reaches = (setup.reaches || REACHES).indexOf(path) !== -1
          assert.strictEqual(allowed.status, reaches ? 200 : 404, 'which paths reach the handler changed')
          if (reaches) assert.strictEqual(denied.status, 401)
        })
      })
    })
  })

  describe('path arrays', function () {
    var send
    before(function () {
      var app = express()
      app.use(['/admin', ['/root']], auth)
      app.get(['/root/secret', ['/admin/secret']], secret)
      send = serve(app)
    })
    after(function () {
      return send.close()
    })

    ATTACKS.forEach(function (path) {
      var other = path.replace(/admin/i, 'root')
      it('guards every entry for ' + JSON.stringify(other), async function () {
        var denied = await send({ path: other })
        assert.ok(denied.body !== 'secret' && denied.body !== 'BYPASS', 'handler ran without credentials')
        var allowed = await send({ path: other, headers: { Authorization: 'letmein' } })
        assert.notStrictEqual(allowed.body, 'BYPASS')
        assert.strictEqual(allowed.status, REACHES.indexOf(path) !== -1 ? 200 : 404)
      })
    })
  })

  describe('a stateful RegExp guard (g or y flag)', function () {
    var ROW = 'A RegExp path with the `g` or `y` flag matches only every other request'

    function repeat(app, times) {
      var send = serve(app)
      var results = []
      var chain = Promise.resolve()
      for (var i = 0; i < times; i++) {
        chain = chain.then(function () {
          return send('/admin/secret').then(function (r) {
            results.push(r.status + ' ' + r.body)
          })
        })
      }
      return chain.then(function () {
        return send.close().then(function () {
          return results
        })
      })
    }

    ;['g', 'y', 'gi', 'iy'].forEach(function (flags) {
      bug('app.use(/^\\/admin/' + flags + ', auth) guards every request', ROW, async function () {
        var app = express()
        app.use(new RegExp('^/admin', flags), auth)
        app.get('/admin/secret', secret)
        assert.deepStrictEqual(await repeat(app, 4), Array(4).fill('401 denied'))
      })

      bug('app.all(/^\\/admin\\//' + flags + ', auth) guards every request', ROW, async function () {
        var app = express()
        app.all(new RegExp('^/admin/', flags), auth)
        app.get('/admin/secret', secret)
        assert.deepStrictEqual(await repeat(app, 4), Array(4).fill('401 denied'))
      })

      bug('router.use(/^\\/secret/' + flags + ', auth) guards every request', ROW, async function () {
        var app = express()
        var router = express.Router()
        router.use(new RegExp('^/secret', flags), auth)
        router.get('/secret', secret)
        app.use('/admin', router)
        assert.deepStrictEqual(await repeat(app, 4), Array(4).fill('401 denied'))
      })

      bug('a route at /^\\/admin\\/secret$/' + flags + ' answers every request', ROW, async function () {
        var app = express()
        app.get(new RegExp('^/admin/secret$', flags), auth, secret)
        assert.deepStrictEqual(await repeat(app, 4), Array(4).fill('401 denied'))
      })
    })

    it('a RegExp guard without g or y guards every request', async function () {
      var app = express()
      app.use(/^\/admin/, auth)
      app.get('/admin/secret', secret)
      assert.deepStrictEqual(await repeat(app, 4), Array(4).fill('401 denied'))
    })

    it('pinned: a RegExp guard whose match ends in "/" never runs for deeper paths (dangerous)', async function () {
      // The router only runs a middleware layer when its match ends at a
      // path separator, so a match of "/admin/" for "/admin/secret" is
      // dropped and the request carries on to the route without the guard.
      var app = express()
      app.use(/^\/admin\//, auth)
      app.get('/admin/secret', secret)
      var send = serve(app)
      var deeper = await send('/admin/secret')
      var exact = await send('/admin/')
      await send.close()
      assert.strictEqual(deeper.status + ' ' + deeper.body, '200 BYPASS')
      assert.strictEqual(exact.status + ' ' + exact.body, '401 denied')
    })

    it('pinned: a RegExp guard is matched as written, so without the i flag /ADMIN/secret skips it (documented; dangerous)', async function () {
      var app = express()
      app.use(/^\/admin/, auth)
      app.get('/admin/secret', secret)
      var r = await request(app, '/ADMIN/secret')
      assert.strictEqual(r.status + ' ' + r.body, '200 BYPASS')
    })
  })

  describe('methods', function () {
    it('HEAD runs an app.use guard', async function () {
      var app = express()
      app.use('/admin', auth)
      app.get('/admin/secret', secret)
      var r = await request(app, { method: 'HEAD', path: '/admin/secret' })
      assert.strictEqual(r.status, 401)
    })

    it('HEAD runs a guard registered with app.get, because HEAD falls back to GET', async function () {
      var app = express()
      app.get('/admin/{*rest}', auth)
      app.get('/admin/secret', secret)
      var r = await request(app, { method: 'HEAD', path: '/admin/secret' })
      assert.strictEqual(r.status, 401)
    })

    it('HEAD runs a route-level guard after a passing app.head', async function () {
      var app = express()
      app.head('/admin/secret', function (req, res, next) {
        next()
      })
      app.get('/admin/secret', auth, secret)
      var r = await request(app, { method: 'HEAD', path: '/admin/secret' })
      assert.strictEqual(r.status, 401)
    })

    it('HEAD with credentials runs the guard first', async function () {
      var app = express()
      var ran = []
      app.get(
        '/admin/secret',
        function (req, res, next) {
          ran.push('auth')
          auth(req, res, next)
        },
        function (req, res) {
          ran.push(req.authChecked ? 'secret' : 'BYPASS')
          res.send('secret')
        }
      )
      var r = await request(app, { method: 'HEAD', path: '/admin/secret', headers: { Authorization: 'letmein' } })
      assert.strictEqual(r.status, 200)
      assert.deepStrictEqual(ran, ['auth', 'secret'])
    })

    it('OPTIONS runs an app.use guard', async function () {
      var app = express()
      app.use('/admin', auth)
      app.get('/admin/secret', secret)
      var r = await request(app, { method: 'OPTIONS', path: '/admin/secret' })
      assert.strictEqual(r.status + ' ' + r.body, '401 denied')
    })

    it('the automatic OPTIONS answer lists methods without running a route-level guard or the handler', async function () {
      var app = express()
      var ran = 0
      app.get(
        '/admin/secret',
        function (req, res, next) {
          ran++
          auth(req, res, next)
        },
        secret
      )
      var r = await request(app, { method: 'OPTIONS', path: '/admin/secret' })
      assert.strictEqual(r.status, 200)
      assert.strictEqual(r.headers.allow, 'GET, HEAD')
      assert.strictEqual(r.body, 'GET, HEAD')
      assert.strictEqual(ran, 0)
    })

    it('OPTIONS * does not reach a route', async function () {
      var app = express()
      app.use('/admin', auth)
      app.all('/{*all}', secret)
      var r = await request(app, { method: 'OPTIONS', path: '*' })
      assert.strictEqual(r.status, 404)
    })

    it('a lower-case method is rejected by Node before routing', async function () {
      var app = express()
      app.get('/admin/secret', secret)
      var r = await request(app, { method: 'get', path: '/admin/secret' })
      assert.strictEqual(r.status, 400)
    })

    it('a POST does not reach a GET handler after a GET-only guard', async function () {
      var app = express()
      app.get('/admin/{*rest}', auth)
      app.get('/admin/secret', secret)
      var r = await request(app, { method: 'POST', path: '/admin/secret', body: '' })
      assert.strictEqual(r.status, 404)
    })
  })

  describe("next('route') and next('router')", function () {
    it("next('route') from a failed check skips the rest of that route", async function () {
      var app = express()
      app.get(
        '/admin/secret',
        function (req, res, next) {
          if (req.headers.authorization !== 'letmein') return next('route')
          req.authChecked = true
          next()
        },
        secret
      )
      app.get('/admin/secret', function (req, res) {
        res.status(401).send('denied')
      })
      var send = serve(app)
      var denied = await send('/admin/secret')
      var allowed = await send({ path: '/admin/secret', headers: { Authorization: 'letmein' } })
      await send.close()
      assert.strictEqual(denied.status + ' ' + denied.body, '401 denied')
      assert.strictEqual(allowed.status + ' ' + allowed.body, '200 secret')
    })

    it("next('route') from a failed check also skips a later handler array of that route", async function () {
      var app = express()
      app.get(
        '/admin/secret',
        function (req, res, next) {
          if (req.headers.authorization !== 'letmein') return next('route')
          req.authChecked = true
          next()
        },
        [
          function (req, res, next) {
            next()
          },
          secret
        ]
      )
      app.all('/admin/secret', function (req, res) {
        res.status(401).send('denied')
      })
      var r = await request(app, '/admin/secret')
      assert.strictEqual(r.status + ' ' + r.body, '401 denied')
    })

    it("next('router') from a failed check leaves the router", async function () {
      var app = express()
      var router = express.Router()
      router.use(function (req, res, next) {
        if (req.headers.authorization !== 'letmein') return next('router')
        req.authChecked = true
        next()
      })
      router.get('/secret', secret)
      app.use('/admin', router)
      app.use(function (req, res) {
        res.status(401).send('denied')
      })
      var send = serve(app)
      var denied = await send('/admin/secret')
      var allowed = await send({ path: '/admin/secret', headers: { Authorization: 'letmein' } })
      await send.close()
      assert.strictEqual(denied.status + ' ' + denied.body, '401 denied')
      assert.strictEqual(allowed.status + ' ' + allowed.body, '200 secret')
    })

    it("pinned: next('route') in app.use middleware acts like next() (by design, so it cannot deny)", async function () {
      var app = express()
      app.use(function (req, res, next) {
        req.authChecked = true
        next('route')
      })
      app.get('/admin/secret', secret)
      var r = await request(app, '/admin/secret')
      assert.strictEqual(r.status + ' ' + r.body, '200 secret')
    })
  })

  describe('mount paths and hosts', function () {
    bug(
      'a router mounted at "//" does not shadow a guarded route at "/"',
      'A `//` mount also matches `/`',
      async function () {
        var app = express()
        var open = express.Router()
        open.get('/secret', function (req, res) {
          res.send('open')
        })
        app.use('//', open)
        app.use(auth)
        app.get('/secret', secret)
        var r = await request(app, '/secret')
        assert.strictEqual(r.status + ' ' + r.body, '401 denied')
      }
    )

    bug(
      'a Host header with userinfo cannot pass a host-based guard as another host',
      'Userinfo in the Host header becomes `req.hostname`',
      async function () {
        var app = express()
        app.use(function (req, res, next) {
          if (req.hostname === 'admin.example') return next()
          res.status(403).send('wrong host')
        })
        app.get('/secret', function (req, res) {
          res.send('admin')
        })
        var r = await request(app, { path: '/secret', headers: { Host: 'admin.example:x@public.example' } })
        assert.strictEqual(r.status, 403)
      }
    )

    it('the guard of a sub-app still runs when the sub-app is mounted twice', async function () {
      var app = express()
      var sub = express()
      sub.use(auth)
      sub.get('/secret', secret)
      app.use('/admin', sub)
      app.use('/ADMIN2', sub)
      var send = serve(app)
      var a = await send('/admin/secret')
      var b = await send('/admin2/secret')
      await send.close()
      assert.strictEqual(a.status + ' ' + b.status, '401 401')
    })
  })
})
