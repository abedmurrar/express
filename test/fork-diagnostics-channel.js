'use strict'

// Not in Express 5.3.0: the `diagnostics_channel` events (ROADMAP.md,
// "Additions on the compatible line"). Every handler the router runs is
// traced through the `express.router.request` TracingChannel, ported from
// router 2.3.0 (pillarjs/router#196, #207, #215, #223; the router's own tests
// are in test/router/tracing.js), and `express()` publishes `{ app }` on
// `express.initialization` (expressjs/express#7041). These tests drive them
// through Express apps, and check that nothing runs or changes without
// subscribers, or with subscribers that throw.

var assert = require('node:assert')
var { AsyncLocalStorage } = require('node:async_hooks')
var { execFileSync } = require('node:child_process')
var dc = require('node:diagnostics_channel')
var path = require('node:path')
var express = require('../')
var request = require('supertest')

var CHANNEL = 'express.router.request'
var PHASES = ['start', 'end', 'asyncStart', 'asyncEnd', 'error']

describe('fork: diagnostics_channel', function () {
  var events
  var handlers

  // Subscribes to every phase, recording what each event carried when it was
  // published (the context is one object that later events change).
  function subscribe() {
    events = []
    handlers = {}
    PHASES.forEach(function (phase) {
      handlers[phase] = function (ctx) {
        events.push({
          phase: phase,
          name: ctx.handler.name,
          layer: ctx.layer.name,
          route: ctx.route,
          baseUrl: ctx.req.baseUrl,
          reqRoute: ctx.req.route && ctx.req.route.path,
          param: ctx.param,
          errorHandler: ctx.errorHandler,
          error: 'error' in ctx ? message(ctx.error) : undefined,
          incomingError: 'incomingError' in ctx ? message(ctx.incomingError) : undefined,
          result: ctx.result,
          ctx: ctx
        })
      }
    })
    dc.tracingChannel(CHANNEL).subscribe(handlers)
  }

  function message(err) {
    return err instanceof Error ? err.message : err
  }

  // "phase name" for each event, for checking the order.
  function sequence() {
    return events.map(function (e) {
      return e.phase + ' ' + e.name
    })
  }

  afterEach(function () {
    if (handlers) dc.tracingChannel(CHANNEL).unsubscribe(handlers)
    handlers = undefined
  })

  describe('express.router.request', function () {
    it('should trace sync middleware and route handlers in order, with req, res and the pattern', async function () {
      var app = express()
      var seen

      app.use(function logger(req, res, next) {
        seen = req
        next()
      })
      app.get('/users/:id', function show(req, res) {
        res.send('user ' + req.params.id)
      })

      subscribe()
      await request(app).get('/users/42').expect(200, 'user 42')

      assert.deepStrictEqual(sequence(), ['start logger', 'start show', 'end show', 'end logger'])
      var logger = events[0]
      var show = events[1]
      assert.strictEqual(logger.ctx.req, seen)
      assert.strictEqual(logger.ctx.req.app, app)
      assert.strictEqual(logger.ctx.res, seen.res)
      assert.strictEqual(logger.route, '/')
      assert.strictEqual(logger.layer, 'logger')
      assert.strictEqual(logger.reqRoute, undefined)
      assert.strictEqual(show.route, '/users/:id')
      assert.strictEqual(show.reqRoute, '/users/:id')
      assert.strictEqual(show.ctx.handler, app.router.stack[1].route.stack[0].handle)
      assert.strictEqual(events[2].result, undefined)
      assert.ok('result' in events[2].ctx)
      assert.strictEqual(logger.ctx.errorHandler, undefined)
      assert.ok(!('error' in show.ctx))
    })

    it('should trace a promise-returning handler through asyncStart and asyncEnd', async function () {
      var app = express()

      app.get('/', async function show(req, res) {
        await null
        res.send('ok')
        return 'done'
      })

      subscribe()
      await request(app).get('/').expect(200, 'ok')

      assert.deepStrictEqual(sequence(), ['start show', 'end show', 'asyncStart show', 'asyncEnd show'])
      assert.strictEqual(events[1].result, undefined)
      assert.strictEqual(events[3].result, 'done')
    })

    it('should keep a store bound on start through an async handler', async function () {
      var app = express()
      var store = new AsyncLocalStorage()
      var channel = dc.tracingChannel(CHANNEL)
      var inside

      function transform(ctx) {
        return ctx.handler.name
      }

      app.get('/', async function show(req, res) {
        await null
        inside = store.getStore()
        res.send('ok')
      })

      channel.start.bindStore(store, transform)
      try {
        subscribe()
        await request(app).get('/').expect(200, 'ok')
      } finally {
        channel.start.unbindStore(store)
      }

      assert.strictEqual(inside, 'show')
    })

    it('should report a thrown error at its origin, then trace the error handler', async function () {
      var app = express()

      app.get('/', function boom() {
        throw new Error('boom')
      })
      app.use(function recover(err, req, res, next) {
        res.status(500).send('recovered ' + err.message)
      })

      subscribe()
      await request(app).get('/').expect(500, 'recovered boom')

      assert.deepStrictEqual(sequence(), ['start boom', 'error boom', 'start recover', 'end recover', 'end boom'])
      assert.strictEqual(events[1].error, 'boom')
      assert.strictEqual(events[2].errorHandler, true)
      assert.strictEqual(events[2].incomingError, 'boom')
      assert.strictEqual(events[2].route, '/')
      assert.strictEqual(events[4].error, 'boom')
    })

    it('should trace app.error() handlers whatever their length, and only for errors', async function () {
      var app = express()

      app.get('/fail', function fail(req, res, next) {
        next(new Error('failed'))
      })
      app.get('/ok', function ok(req, res, next) {
        next()
      })
      app.error(function recover(err, req, res) {
        res.status(500).send(err.message)
      })
      app.use(function notFound(req, res) {
        res.status(404).send('none')
      })

      subscribe()
      await request(app).get('/fail').expect(500, 'failed')
      await request(app).get('/ok').expect(404, 'none')

      assert.deepStrictEqual(sequence(), [
        'start fail',
        'error fail',
        'start recover',
        'end recover',
        'end fail',
        'start ok',
        'start notFound',
        'end notFound',
        'end ok'
      ])
      assert.strictEqual(events[2].errorHandler, true)
      assert.strictEqual(events[2].incomingError, 'failed')
    })

    it('should report an error passed to next() at its origin', async function () {
      var app = express()
      var error = new Error('nope')

      app.use(function fail(req, res, next) {
        next(error)
      })
      app.use(function recover(err, req, res, next) {
        res.status(418).send(err.message)
      })

      subscribe()
      await request(app).get('/').expect(418, 'nope')

      assert.deepStrictEqual(sequence(), ['start fail', 'error fail', 'start recover', 'end recover', 'end fail'])
      assert.strictEqual(events[1].ctx.error, error)
      assert.strictEqual(events[2].ctx.incomingError, error)
      assert.ok(!('error' in events[3].ctx))
    })

    it('should report a rejected promise at its origin, before asyncStart', async function () {
      var app = express()

      app.get('/', async function reject() {
        await null
        throw new Error('async boom')
      })
      app.use(function recover(err, req, res, next) {
        res.status(500).send(err.message)
      })

      subscribe()
      await request(app).get('/').expect(500, 'async boom')

      assert.deepStrictEqual(sequence(), [
        'start reject',
        'end reject',
        'error reject',
        'start recover',
        'end recover',
        'asyncStart reject',
        'asyncEnd reject'
      ])
      assert.strictEqual(events[6].error, 'async boom')
      assert.ok(!('result' in events[6].ctx))
    })

    it('should report an unhandled error once, and Express still answers 500', async function () {
      var app = express()
      var outer = express.Router()
      var inner = express.Router()

      inner.get('/x', function boom(req, res, next) {
        next(new Error('unhandled'))
      })
      outer.use('/inner', inner)
      app.use('/outer', outer)
      app.set('env', 'test')

      subscribe()
      await request(app)
        .get('/outer/inner/x')
        .expect(500, /unhandled/)

      var errors = events.filter(function (e) {
        return e.phase === 'error'
      })
      assert.strictEqual(errors.length, 1)
      assert.strictEqual(errors[0].name, 'boom')
    })

    it('should not treat next("route") and next("router") as errors', async function () {
      var app = express()
      var router = express.Router()

      router.use(function leave(req, res, next) {
        next('router')
      })
      app.use(router)
      app.get(
        '/',
        function skip(req, res, next) {
          next('route')
        },
        function never(req, res) {
          res.send('never')
        }
      )
      app.get('/', function show(req, res) {
        res.send('ok')
      })

      subscribe()
      await request(app).get('/').expect(200, 'ok')

      assert.ok(!events.some((e) => e.phase === 'error'))
      assert.ok(!events.some((e) => e.name === 'never'))
      assert.ok(events.some((e) => e.name === 'show'))
    })

    it('should trace a sub-app: its mount, then its handlers, with the request as the sub-app sees it', async function () {
      var app = express()
      var sub = express()

      sub.use(function subLogger(req, res, next) {
        next()
      })
      sub.get('/x/:id', function subShow(req, res) {
        res.send(req.originalRoute)
      })
      app.use('/sub', sub)

      subscribe()
      await request(app).get('/sub/x/1').expect(200, '/sub/x/:id')

      assert.deepStrictEqual(sequence(), [
        'start mounted_app',
        'start subLogger',
        'start subShow',
        'end subShow',
        'end subLogger',
        'end mounted_app'
      ])
      assert.strictEqual(events[0].route, '/sub')
      assert.strictEqual(events[0].baseUrl, '/sub')
      assert.strictEqual(events[0].ctx.req.app, sub, 'req.app is the sub-app once it handles the request')
      assert.strictEqual(events[1].route, '/')
      assert.strictEqual(events[1].baseUrl, '/sub')
      assert.strictEqual(events[2].route, '/x/:id')
      assert.strictEqual(events[2].baseUrl, '/sub')
      assert.strictEqual(events[2].ctx.req.originalRoute, '/sub/x/:id')
    })

    it('should trace nested routers with their mount patterns', async function () {
      var app = express()
      var api = express.Router({ mergeParams: true })
      var users = express.Router({ mergeParams: true })

      users.get('/:id', function user(req, res) {
        res.json(req.params)
      })
      api.use('/users', users)
      app.use('/api/:version', api)

      subscribe()
      await request(app).get('/api/v2/users/7').expect(200, { version: 'v2', id: '7' })

      assert.deepStrictEqual(sequence(), [
        'start router',
        'start router',
        'start user',
        'end user',
        'end router',
        'end router'
      ])
      assert.deepStrictEqual(
        events.map((e) => e.route),
        ['/api/:version', '/users', '/:id', '/:id', '/users', '/api/:version']
      )
      assert.deepStrictEqual(
        events.filter((e) => e.phase === 'start').map((e) => e.baseUrl),
        ['/api/v2', '/api/v2/users', '/api/v2/users']
      )
    })

    it('should report the pattern that matched for a path array', async function () {
      var app = express()

      app.get(['/a', '/b/:id'], function show(req, res) {
        res.send('ok')
      })

      subscribe()
      await request(app).get('/b/1').expect(200, 'ok')

      assert.strictEqual(events[0].route, '/b/:id')
    })

    it("should report the '' entry of a path array for a strict router's mount path", async function () {
      var app = express()
      var router = express.Router({ strict: true })

      router.get(['', '/x'], function show(req, res) {
        res.send('dir')
      })
      app.use('/dir', router)

      subscribe()
      await request(app).get('/dir').expect(200, 'dir')
      await request(app).get('/dir/x').expect(200, 'dir')

      assert.deepStrictEqual(
        events.filter((e) => e.phase === 'start' && e.name === 'show').map((e) => e.route),
        ['', '/x']
      )
    })

    for (const misuse of ['rejects and then resolves', 'resolves twice']) {
      it('should settle a thenable once when it ' + misuse, async function () {
        var app = express()
        var rejects = misuse === 'rejects and then resolves'

        app.use(function subject(req, res) {
          if (!rejects) res.send('resolved')
          return {
            then: function (resolve, reject) {
              if (rejects) reject(new Error('first'))
              else resolve('first')
              resolve('late')
            }
          }
        })
        app.use(function recover(err, req, res, next) {
          res.status(500).send(err.message)
        })

        subscribe()
        await request(app)
          .get('/')
          .expect(rejects ? 500 : 200, rejects ? 'first' : 'resolved')

        var subject = events.filter((e) => e.name === 'subject')
        assert.deepStrictEqual(
          subject.map((e) => e.phase),
          rejects ? ['start', 'end', 'error', 'asyncStart', 'asyncEnd'] : ['start', 'end', 'asyncStart', 'asyncEnd']
        )
        assert.strictEqual(subject[subject.length - 1].result, rejects ? undefined : 'first')
      })
    }

    it('should trace only the middleware that ran for a 404', async function () {
      var app = express()

      app.use(function logger(req, res, next) {
        next()
      })
      app.get('/x', function show(req, res) {
        res.send('x')
      })

      subscribe()
      await request(app).get('/nope').expect(404)

      assert.deepStrictEqual(sequence(), ['start logger', 'end logger'])
    })

    it('should publish nothing for a 404 from an app with no handlers', async function () {
      var app = express()

      subscribe()
      await request(app).get('/nope').expect(404)

      assert.deepStrictEqual(events, [])
    })

    it('should trace app.param() callbacks with the parameter name', async function () {
      var app = express()

      app.param('id', function loadId(req, res, next, id) {
        req.loaded = 'item ' + id
        next()
      })
      app.get('/items/:id', function show(req, res) {
        res.send(req.loaded)
      })

      subscribe()
      await request(app).get('/items/3').expect(200, 'item 3')

      assert.deepStrictEqual(sequence(), ['start loadId', 'start show', 'end show', 'end loadId'])
      assert.strictEqual(events[0].param, 'id')
      assert.strictEqual(events[0].route, '/items/:id')
      assert.strictEqual(events[0].layer, 'handle')
      assert.strictEqual(events[1].param, undefined)
    })

    it('should run every handler in the same order and answer the same with and without subscribers', async function () {
      var calls = []

      function build() {
        var app = express()
        var sub = express()
        var api = express.Router()

        app.param('id', function loadId(req, res, next) {
          calls.push('param')
          next()
        })
        app.use(function first(req, res, next) {
          calls.push('first')
          next()
        })
        api.get('/:id', async function item(req, res, next) {
          calls.push('item')
          await null
          next(new Error('item failed'))
        })
        api.use(function apiRecover(err, req, res, next) {
          calls.push('apiRecover')
          res.status(503).json({ error: err.message, route: req.originalRoute })
        })
        sub.get('/hello', function hello(req, res) {
          calls.push('hello')
          res.send('hi')
        })
        app.use('/api', api)
        app.use('/sub', sub)
        app.get('/throw', function thrower() {
          calls.push('thrower')
          throw new Error('thrown')
        })
        // Express's final handler would print the stack, whose frames differ
        // when traced (the tracing calls sit between the router and handler)
        app.use(function last(err, req, res, next) {
          calls.push('last')
          res.status(500).send(err.message)
        })
        return app
      }

      async function run(app) {
        calls = []
        var results = []
        for (var url of ['/api/9', '/sub/hello', '/throw', '/missing']) {
          var res = await request(app).get(url)
          results.push([url, res.status, res.headers['content-type'], res.text])
        }
        return { calls: calls, results: results }
      }

      var without = await run(build())
      subscribe()
      var withSubscribers = await run(build())

      assert.deepStrictEqual(withSubscribers, without)
      assert.ok(events.length > 0)
    })
  })

  describe('express.initialization', function () {
    it('should publish { app } for every app, sub-apps included, once it is set up', function () {
      var messages = []

      function onInit(message) {
        messages.push(message)
        // set up before it is published: settings and router are there
        assert.strictEqual(message.app.get('env'), process.env.NODE_ENV || 'development')
        assert.strictEqual(typeof message.app.handle, 'function')
      }

      dc.subscribe('express.initialization', onInit)
      try {
        var app = express()
        var sub = express()
        app.use('/sub', sub)
      } finally {
        dc.unsubscribe('express.initialization', onInit)
      }

      assert.strictEqual(messages.length, 2)
      assert.strictEqual(messages[0].app, app)
      assert.strictEqual(messages[1].app, sub)
      assert.deepStrictEqual(Object.keys(messages[0]), ['app'])
    })
  })

  describe('without subscribers', function () {
    // Every channel and the methods that publish on it. A publish without a
    // hasSubscribers check (or a context built for nobody) calls one of these.
    var channels = PHASES.map(function (phase) {
      return dc.channel('tracing:' + CHANNEL + ':' + phase)
    }).concat(dc.channel('express.initialization'))
    var calls

    beforeEach(function () {
      calls = []
      channels.forEach(function (channel) {
        ;['publish', 'runStores'].forEach(function (method) {
          channel[method] = function () {
            calls.push(channel.name + ' ' + method)
            return Object.getPrototypeOf(channel)[method].apply(channel, arguments)
          }
        })
      })
    })

    afterEach(function () {
      channels.forEach(function (channel) {
        delete channel.publish
        delete channel.runStores
      })
    })

    it('should not publish, run stores or record errors for any kind of handler', async function () {
      var requests = []
      var app = express()
      var sub = express()
      var api = express.Router()

      channels.forEach(function (channel) {
        assert.strictEqual(channel.hasSubscribers, false, channel.name)
      })

      app.use(function collect(req, res, next) {
        requests.push(req)
        next()
      })
      app.param('id', async function loadId(req, res, next) {
        await null
        next()
      })
      api.get(
        ['/a', '/:id'],
        async function item(req, res) {
          await null
          throw new Error('item failed')
        },
        function itemRecover(err, req, res, next) {
          next(err)
        }
      )
      api.use(function apiRecover(err, req, res, next) {
        next(err)
      })
      sub.get('/x', function show(req, res, next) {
        next(new Error('sub failed'))
      })
      app.use('/api', api)
      app.use('/sub', sub)
      app.get('/items/:id', function showItem(req, res) {
        res.send('item ' + req.params.id)
      })
      app.use(function recover(err, req, res, next) {
        res.status(err.status || 500).send(err.message)
      })

      await request(app).get('/items/5').expect(200, 'item 5')
      await request(app).get('/api/1').expect(500, 'item failed')
      await request(app).get('/sub/x').expect(500, 'sub failed')
      // an error from matching (decoding the parameter)
      await request(app).get('/api/%ZZ').expect(400, "Failed to decode param '%ZZ'")
      await request(app).get('/nope').expect(404)

      assert.deepStrictEqual(calls, [])
      requests.forEach(function (req) {
        assert.strictEqual(req[Symbol.for('router.tracing.publishedErrors')], undefined)
      })
    })

    it('should see a publish when something does publish (the spies work)', async function () {
      var app = express()

      app.get('/', function show(req, res) {
        res.send('ok')
      })

      subscribe()
      await request(app).get('/').expect(200, 'ok')
      express()

      assert.deepStrictEqual(calls, [
        'tracing:express.router.request:start runStores',
        'tracing:express.router.request:start publish',
        'tracing:express.router.request:end publish'
      ])
    })
  })

  describe('with subscribers that throw', function () {
    // diagnostics_channel calls each subscriber in a try/catch and rethrows
    // its error on the next tick, as an uncaught exception, so the request
    // goes on unchanged. Run in a child process, which handles those.
    function run(mode) {
      var output = execFileSync(process.execPath, [path.join(__dirname, 'fixtures', 'diagnostics-throwing.js'), mode], {
        encoding: 'utf8'
      })
      return JSON.parse(output)
    }

    it('should answer and call handlers as without subscribers', function () {
      var without = run('none')
      var throwing = run('throwing')

      assert.deepStrictEqual(throwing.calls, without.calls)
      assert.deepStrictEqual(throwing.results, without.results)
      assert.deepStrictEqual(without.uncaught, [])
      // every subscriber and the store transform threw, and each was reported
      assert.ok(throwing.uncaught.length > 0)
      assert.deepStrictEqual(
        Array.from(new Set(throwing.uncaught)).sort(),
        ['asyncEnd', 'asyncStart', 'end', 'error', 'initialization', 'start', 'store'].map(function (n) {
          return 'subscriber ' + n
        })
      )
    })
  })
})
