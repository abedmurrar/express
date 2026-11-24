'use strict'

// app.listRoutes() and router.listRoutes(): what this fork decides beyond the
// tests ported from router 2.3.0 (test/router/listRoutes.js, pillarjs/router#174)
// and from expressjs/express#7531 (test/app.listRoutes.js). Listing is read
// only: it never creates an app's router (which fixes the app's routing
// settings), and nothing done to what it returns changes the routing, apart
// from what is done to a mounted router or app itself.

var assert = require('node:assert')
var http = require('node:http')
var express = require('../')
var baseline = require('express-baseline')

function noop(req, res, next) {
  next()
}

function send(text) {
  return function (req, res) {
    res.send(text)
  }
}

// `path method,method` for a route, `path >` for a router or an app.
function brief(routes) {
  return routes.map(function (route) {
    return String(route.path) + ' ' + (route.methods === undefined ? '>' : route.methods.join())
  })
}

// Every path of an app or router, as someone reading the list would walk it.
function walk(target, prefix) {
  return target.listRoutes().flatMap(function (route) {
    var path = (prefix || '') + (route.router && route.path === '/' ? '' : String(route.path))
    return route.router ? walk(route.router, path) : [path]
  })
}

// Send requests (`METHOD /path`) one after the other; [status, body, Allow] of each.
async function responses(app, list) {
  var server = http.createServer(app).listen(0, '127.0.0.1')
  await new Promise(function (resolve) {
    server.once('listening', resolve)
  })
  var out = []
  for (var line of list) {
    out.push(
      await new Promise(function (resolve, reject) {
        var parts = line.split(' ')
        http
          .request(
            { host: '127.0.0.1', port: server.address().port, method: parts[0], path: parts[1], agent: false },
            function (res) {
              var body = ''
              res.setEncoding('utf8')
              res.on('data', function (chunk) {
                body += chunk
              })
              res.on('end', function () {
                resolve([res.statusCode, res.statusCode === 404 ? '' : body, res.headers.allow])
              })
            }
          )
          .on('error', reject)
          .end()
      })
    )
  }
  await new Promise(function (resolve) {
    server.close(resolve)
  })
  return out
}

describe('listRoutes() (fork)', function () {
  describe('does not change how an app routes', function () {
    // Each builds an app whose sub-app has no router yet, and returns both.
    var mounts = {
      'the app itself': function () {
        var app = express()
        return { app: app, sub: app, at: '' }
      },
      'app.use(path, subApp)': function () {
        var app = express()
        var sub = express()
        app.use('/sub', sub)
        return { app: app, sub: sub, at: '/sub' }
      },
      'router.use(path, subApp)': function () {
        var app = express()
        var router = express.Router()
        var sub = express()
        router.use('/sub', sub)
        app.use(router)
        return { app: app, sub: sub, at: '/sub' }
      },
      'a sub-app of a sub-app': function () {
        var app = express()
        var middle = express()
        var sub = express()
        middle.use('/sub', sub)
        app.use('/mid', middle)
        return { app: app, sub: sub, at: '/mid/sub' }
      }
    }
    var settings = [
      [],
      ['strict routing'],
      ['case sensitive routing'],
      ['strict routing', 'strict mount routing'],
      ['strict routing', 'case sensitive routing', 'strict mount routing']
    ]
    var listings = {
      'app.listRoutes()': function (built) {
        built.app.listRoutes()
      },
      'every level': function (built) {
        walk(built.app)
      },
      'the sub-app': function (built) {
        assert.deepStrictEqual(built.sub.listRoutes(), [])
      },
      // app.use() has created it, where the app is not its own sub-app
      'app.router': function (built) {
        if (built.app !== built.sub) built.app.router.listRoutes()
      }
    }

    function finish(built, names) {
      names.forEach(function (name) {
        built.sub.enable(name)
      })
      built.sub.get('/', send('root'))
      built.sub.get('/Users', send('users'))
      built.sub.post('/Users', send('posted'))
      var at = built.at
      return ['', '/', '/Users', '/users', '/Users/', '/users/', '/none']
        .flatMap(function (path) {
          return ['GET ' + (at + path || '/'), 'OPTIONS ' + (at + path || '/')]
        })
        .concat('HEAD ' + at + '/Users', 'POST ' + at + '/Users')
    }

    Object.keys(mounts).forEach(function (mount) {
      settings.forEach(function (names) {
        it(mount + ', then set ' + (names.join(', ') || 'nothing'), async function () {
          var plain = mounts[mount]()
          var requests = finish(plain, names)
          var expected = await responses(plain.app, requests)

          for (var how of Object.keys(listings)) {
            var built = mounts[mount]()
            listings[how](built)
            assert.deepStrictEqual(finish(built, names), requests)
            assert.deepStrictEqual(await responses(built.app, requests), expected, how)
            // and when it is listed after it was set up
            listings['every level'](built)
            assert.deepStrictEqual(await responses(built.app, requests), expected, how + ', again')
            assert.deepStrictEqual(walk(built.app), [built.at + '/', built.at + '/Users', built.at + '/Users'])
          }
        })
      })
    })

    it('a sub-app still inherits a setting its parent gets after listing', async function () {
      var app = express()
      var sub = express()
      app.use('/sub', sub)
      walk(app)
      app.enable('case sensitive routing')
      sub.get('/Users', send('users'))
      assert.strictEqual(sub.router.caseSensitive, true)
      assert.deepStrictEqual(
        (await responses(app, ['GET /sub/Users', 'GET /sub/users'])).map(function (r) {
          return r[0]
        }),
        [200, 404]
      )
    })

    it('does not read the router of an app it lists', function () {
      var app = express()
      var sub = express()
      var direct = express()
      var router = express.Router()
      ;[sub, direct].forEach(function (a) {
        Object.defineProperty(a, 'router', {
          get: function () {
            throw new Error('read')
          }
        })
      })
      router.use('/direct', direct)
      app.use('/sub', sub)
      app.use(router)
      assert.deepStrictEqual(brief(app.listRoutes()), ['/sub >', '/ >'])
      assert.deepStrictEqual(brief(router.listRoutes()), ['/direct >'])
    })

    it('does not read a router property of a middleware', function () {
      var router = express.Router()
      function middleware(req, res, next) {
        next()
      }
      Object.defineProperty(middleware, 'router', {
        get: function () {
          throw new Error('read')
        }
      })
      router.use('/x', middleware)
      assert.deepStrictEqual(router.listRoutes(), [])
    })

    it('can be called while a request is handled', async function () {
      var app = express()
      var sub = express()
      app.get('/a', function (req, res) {
        res.json(brief(req.app.listRoutes()))
      })
      app.use('/sub', sub)
      var out = await responses(app, ['GET /a', 'GET /a'])
      assert.deepStrictEqual(JSON.parse(out[0][1]), ['/a GET,HEAD', '/sub >'])
      assert.deepStrictEqual(out[0], out[1])
    })
  })

  describe('gives copies', function () {
    it('changing the list, an entry or its methods changes nothing', async function () {
      var app = express()
      app.get(['/a', '/b'], send('ab'))
      app.route('/c').all(send('c'))
      var before = brief(app.listRoutes())

      var routes = app.listRoutes()
      routes.forEach(function (route) {
        route.path = '/changed'
        route.methods.length = 0
        route.methods.push('DELETE')
        route.router = express.Router()
      })
      routes.length = 0

      assert.deepStrictEqual(brief(app.listRoutes()), before)
      assert.deepStrictEqual(await responses(app, ['GET /a', 'GET /b', 'DELETE /c', 'GET /changed', 'OPTIONS /a']), [
        [200, 'ab', undefined],
        [200, 'ab', undefined],
        [200, 'c', undefined],
        [404, '', undefined],
        [200, 'GET, HEAD', 'GET, HEAD']
      ])
    })

    it('a RegExp path is a copy: the router keeps matching with its own', async function () {
      class Path extends RegExp {}
      var plain = /^\/plain\/(\w+)$/i
      var stateful = /^\/stateful$/g
      var custom = new Path('^/custom$', 'y')
      var app = express()
      var router = express.Router()
      app.get([plain, '/str'], send('plain'))
      app.get(stateful, send('stateful'))
      app.get(custom, send('custom'))
      app.use(/^\/mount/, router)
      router.get('/', send('mount'))
      stateful.lastIndex = 3

      var routes = app.listRoutes()
      assert.deepStrictEqual(brief(routes), [
        '/^\\/plain\\/(\\w+)$/i GET,HEAD',
        '/str GET,HEAD',
        '/^\\/stateful$/g GET,HEAD',
        '/^\\/custom$/y GET,HEAD',
        '/^\\/mount/ >'
      ])
      routes.forEach(function (route) {
        if (typeof route.path === 'string') return
        assert.ok(![plain, stateful, custom].includes(route.path))
        assert.strictEqual(route.path.lastIndex, 0)
        route.path.exec = function () {
          return null
        }
        route.path.compile('never')
      })

      assert.deepStrictEqual(
        (await responses(app, ['GET /PLAIN/x', 'GET /stateful', 'GET /stateful', 'GET /custom', 'GET /mount'])).map(
          function (r) {
            return r[1]
          }
        ),
        ['plain', 'stateful', 'stateful', 'custom', 'mount']
      )
    })
  })

  describe('entries', function () {
    it('have path, methods and router, in that order', function () {
      var app = express()
      app.get('/a', noop)
      app.use('/r', express.Router())
      app.listRoutes().forEach(function (route) {
        assert.deepStrictEqual(Object.keys(route), ['path', 'methods', 'router'])
      })
    })

    it('path arrays give one per path, nested ones flattened', function () {
      var app = express()
      app.get(['/a', ['/b', ['/c', /^\/d$/.source]]], noop)
      app.use(['/e', ['/f']], express.Router())
      app.get([/^\/g$/, '/h/:id'], noop)
      assert.deepStrictEqual(brief(app.listRoutes()), [
        '/a GET,HEAD',
        '/b GET,HEAD',
        '/c GET,HEAD',
        '^\\/d$ GET,HEAD',
        '/e >',
        '/f >',
        '/^\\/g$/ GET,HEAD',
        '/h/:id GET,HEAD'
      ])
    })

    it('an empty array has no path to list, even a nested one, which matches everything', async function () {
      var app = express()
      app.get([], send('none'))
      app.get(['/a', []], send('all'))
      assert.deepStrictEqual(brief(app.listRoutes()), ['/a GET,HEAD'])
      assert.deepStrictEqual(await responses(app, ['GET /']), [[200, 'all', undefined]])
    })

    it('a route given no path is listed as it was registered', function () {
      var app = express()
      app.get('', noop)
      app.route('/empty')
      assert.deepStrictEqual(brief(app.listRoutes()), [' GET,HEAD', '/empty '])
    })

    it('route.all() is "*", app.all() and router.all() as each registers', function () {
      var app = express()
      var router = express.Router()
      app.route('/a').all(noop).get(noop)
      app.all('/b', noop)
      router.all('/c', noop)
      assert.deepStrictEqual(app.listRoutes()[0].methods, ['*', 'GET', 'HEAD'])
      assert.deepStrictEqual(app.listRoutes()[1].methods, http.METHODS)
      assert.deepStrictEqual(router.listRoutes()[0].methods, ['*'])
    })

    it('a mounted router or app is the one that was passed', function () {
      var app = express()
      var router = express.Router()
      var sub = express()
      var direct = express()
      app.use('/router', router)
      app.use('/sub', sub)
      router.use(direct)
      assert.strictEqual(app.listRoutes()[0].router, router)
      assert.strictEqual(app.listRoutes()[1].router, sub)
      assert.strictEqual(router.listRoutes()[0].router, direct)
    })

    it('an app mounted more than once, and cycles, are listed without recursing', function () {
      var app = express()
      var sub = express()
      app.use('/a', sub)
      app.use(['/b', '/c'], sub, noop, sub)
      assert.deepStrictEqual(brief(app.listRoutes()), ['/a >', '/b >', '/c >', '/b >', '/c >'])

      var router = express.Router()
      sub.use('/r', router)
      router.use('/up', app)
      assert.strictEqual(sub.listRoutes()[0].router, router)
      assert.strictEqual(router.listRoutes()[0].router, app)
    })

    it('middleware is not listed, whatever it has short of an app or a router', function () {
      var router = express.Router()
      ;[{}, { handle: noop }, { set: noop }, { stack: {} }, { stack: 'x' }, { listRoutes: noop }].forEach(
        function (props) {
          router.use(
            '/x',
            Object.assign(function (req, res, next) {
              next()
            }, props)
          )
        }
      )
      router.use(function (err, req, res, next) {
        next(err)
      })
      assert.deepStrictEqual(router.listRoutes(), [])
    })

    it('a handler with a stack array is taken for a router, as in router 2.3.0', function () {
      var app = express()
      function handler(req, res, next) {
        next()
      }
      handler.stack = [1, 2]
      app.use('/connect', handler)
      var routes = app.listRoutes()
      assert.deepStrictEqual(brief(routes), ['/connect >'])
      assert.strictEqual(routes[0].router, handler)
      assert.strictEqual(routes[0].router.listRoutes, undefined)
    })

    it('an object app.use() takes for an app is listed', function () {
      var app = express()
      var object = { handle: noop, set: noop, emit: send }
      app.use('/object', object)
      assert.strictEqual(app.listRoutes()[0].router, object)
    })
  })

  describe('error handlers', function () {
    it('are not listed, with a path, a stack or any length', function () {
      var app = express()
      var router = express.Router()
      function handler(err, req, res) {
        res.end(String(err))
      }
      function stacked(err, req, res) {
        res.end(String(err))
      }
      stacked.stack = []
      stacked.set = noop
      app.error(handler)
      app.error('/x', handler, stacked)
      router.error('/y', stacked)
      app.get('/a', noop)
      assert.deepStrictEqual(brief(app.listRoutes()), ['/a GET,HEAD'])
      assert.deepStrictEqual(router.listRoutes(), [])
    })

    it('a refused error router or app leaves no entry', function () {
      var app = express()
      assert.throws(function () {
        app.error('/x', express.Router())
      }, TypeError)
      assert.throws(function () {
        app.error('/x', express())
      }, TypeError)
      assert.deepStrictEqual(app.listRoutes(), [])
    })
  })

  describe('routers and apps of Express 5.3.0', function () {
    it('are listed, without a listRoutes() of their own', function () {
      var app = express()
      var router = express.Router()
      var theirApp = baseline()
      var theirRouter = baseline.Router()
      theirRouter.get('/x', noop)
      app.use('/app', theirApp)
      app.use('/router', theirRouter)
      router.use('/app', theirApp)
      assert.deepStrictEqual(brief(app.listRoutes()), ['/app >', '/router >'])
      assert.strictEqual(app.listRoutes()[0].router, theirApp)
      assert.strictEqual(app.listRoutes()[1].router, theirRouter)
      assert.strictEqual(router.listRoutes()[0].router, theirApp)
      assert.strictEqual(theirApp.listRoutes, undefined)
      assert.strictEqual(theirRouter.listRoutes, undefined)
    })
  })

  describe('app.listRoutes()', function () {
    it('lists the router of an app whose router property was replaced', function () {
      var app = express()
      var router = express.Router()
      router.get('/own', noop)
      Object.defineProperty(app, 'router', { value: router })
      assert.deepStrictEqual(brief(app.listRoutes()), ['/own GET,HEAD'])

      var other = express()
      Object.defineProperty(other, 'router', {
        get: function () {
          return router
        }
      })
      assert.deepStrictEqual(brief(other.listRoutes()), ['/own GET,HEAD'])
    })

    it('starts over when the app is initialised again', function () {
      var app = express()
      app.get('/a', noop)
      app.init()
      assert.deepStrictEqual(app.listRoutes(), [])
      app.get('/b', noop)
      assert.deepStrictEqual(brief(app.listRoutes()), ['/b GET,HEAD'])
    })

    it('is on each app, not on express.application, where one patched on wins', function () {
      assert.ok(!('listRoutes' in express.application))
      function patched() {
        return 'patched'
      }
      express.application.listRoutes = patched
      try {
        assert.strictEqual(express().listRoutes, patched)
      } finally {
        delete express.application.listRoutes
      }
      assert.strictEqual(express().listRoutes.name, 'listRoutes')
      assert.strictEqual(express().listRoutes.length, 0)
    })
  })

  describe('OPTIONS responses and route._methods()', function () {
    it('stay those of Express 5.3.0', async function () {
      function build(e) {
        var app = e()
        app.route('/all').all(function (req, res, next) {
          next()
        })
        app.route('/both').get(noop).all(noop).post(noop)
        // Express 5.3.0's answer shows "_ALL" only if an app does this
        var cleared = app.route('/cleared').all(noop).get(noop)
        cleared.methods._all = false
        app.route('/get').get(noop)
        app.route('/head').head(noop).get(noop)
        app.route('/draft')
        return app
      }
      var requests = ['/all', '/both', '/cleared', '/get', '/head', '/draft'].map(function (path) {
        return 'OPTIONS ' + path
      })
      var ours = await responses(build(express), requests)
      assert.deepStrictEqual(ours, await responses(build(baseline), requests))
      assert.strictEqual(ours[2][2], 'GET, HEAD, _ALL')

      function methods(e) {
        return build(e).router.stack.map(function (layer) {
          return layer.route._methods()
        })
      }
      assert.deepStrictEqual(methods(express), methods(baseline))
      assert.deepStrictEqual(methods(express)[1], ['GET', '_ALL', 'POST', 'HEAD'])
    })
  })
})
