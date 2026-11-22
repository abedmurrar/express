'use strict'

// Keep-alive reuse: one connection carries request after request. Node gives
// each request its own req and res, and nothing Express sets on them may
// carry over to the next request on the same socket: req.params,
// res.locals, req.route, req.originalRoute, req.baseUrl, the app a request
// belongs to, and headers set by middleware. Checked with sub-apps and a
// router mounted, with app.listen() and with http.createServer(app).

var assert = require('node:assert')
var express = require('../..')
var support = require('./support')

var connect = support.connect
var rawRequest = support.rawRequest

// What a handler saw, sent back as JSON.
function report(app) {
  return function (req, res) {
    res.json({
      app: req.app === app ? 'main' : req.app.get('label'),
      mainPrototype: Object.getPrototypeOf(req) === app.request,
      params: req.params,
      locals: res.locals,
      route: req.route ? req.route.path : null,
      originalRoute: req.originalRoute === undefined ? null : req.originalRoute,
      baseUrl: req.baseUrl,
      marked: req.marked === undefined ? null : req.marked
    })
  }
}

// Sets state only on requests that carry X-Mark, so a request without it
// shows whether anything stayed behind.
function marker(name) {
  return function (req, res, next) {
    var mark = req.get('X-Mark')
    if (mark) {
      res.locals[name] = mark
      res.set('X-Marked-' + name, mark)
      req.marked = mark
    }
    next()
  }
}

function build(sockets) {
  var app = express()
  app.use(function (req, res, next) {
    sockets.add(req.socket)
    next()
  })
  app.use(marker('main'))

  var sub = express()
  sub.set('label', 'sub')
  sub.use(marker('sub'))
  sub.get('/item/:id', report(app))

  var router = express.Router({ mergeParams: true })
  router.use(marker('router'))
  router.get('/:page', report(app))

  app.get('/user/:id', report(app))
  app.get('/plain', report(app))
  app.use('/sub', sub)
  app.use('/team/:team', router)
  app.get('/fail', function () {
    throw new Error('boom')
  })
  return app
}

// The state a clean request to `path` must show on `app`.
var CLEAN = {
  '/plain': {
    app: 'main',
    mainPrototype: true,
    params: {},
    locals: {},
    route: '/plain',
    originalRoute: '/plain',
    baseUrl: '',
    marked: null
  }
}

describe('robustness: keep-alive reuse', function () {
  var uncaught = support.trackUncaught()
  var server

  beforeEach(function () {
    uncaught.start()
  })

  afterEach(async function () {
    support.destroySockets()
    if (server && server.listening) await support.close(server)
    server = undefined
    uncaught.stop()
  })

  ;[
    ['app.listen()', false],
    ['http.createServer(app)', true]
  ].forEach(function (variant) {
    it('keeps no request state between requests on one connection, with ' + variant[0], async function () {
      var sockets = new Set()
      var app = build(sockets)
      server = await support.listen(app, variant[1])

      var socket = connect(server)
      var responses = support.reader(socket)
      async function send(path, mark) {
        socket.write(rawRequest('GET', path, mark ? { 'X-Mark': mark } : {}))
        var response = await responses.next()
        assert.ok(response, 'the connection closed before ' + path)
        var markedHeaders = Object.keys(response.headers).filter(function (name) {
          return name.startsWith('x-marked-')
        })
        var body = response.headers['content-type'].startsWith('application/json')
          ? JSON.parse(response.body.toString())
          : response.body.toString()
        return { status: response.status, marked: markedHeaders, body: body }
      }

      var r = await send('/user/1', 'a')
      assert.deepStrictEqual(r.marked, ['x-marked-main'])
      assert.deepStrictEqual(r.body.params, { id: '1' })
      assert.deepStrictEqual(r.body.locals, { main: 'a' })
      assert.strictEqual(r.body.originalRoute, '/user/:id')

      r = await send('/plain')
      assert.deepStrictEqual(r.marked, [])
      assert.deepStrictEqual(r.body, CLEAN['/plain'])

      r = await send('/sub/item/7', 'b')
      assert.deepStrictEqual(r.marked, ['x-marked-main', 'x-marked-sub'])
      assert.deepStrictEqual(r.body, {
        app: 'sub',
        mainPrototype: false,
        params: { id: '7' },
        locals: { main: 'b', sub: 'b' },
        route: '/item/:id',
        originalRoute: '/sub/item/:id',
        baseUrl: '/sub',
        marked: 'b'
      })

      r = await send('/plain')
      assert.deepStrictEqual(r.marked, [])
      assert.deepStrictEqual(r.body, CLEAN['/plain'])

      r = await send('/team/red/home', 'c')
      assert.deepStrictEqual(r.marked, ['x-marked-main', 'x-marked-router'])
      assert.deepStrictEqual(r.body.params, { team: 'red', page: 'home' })
      assert.deepStrictEqual(r.body.locals, { main: 'c', router: 'c' })
      assert.strictEqual(r.body.originalRoute, '/team/:team/:page')
      assert.strictEqual(r.body.baseUrl, '/team/red')

      r = await send('/fail')
      assert.strictEqual(r.status, 500)
      assert.deepStrictEqual(r.marked, [])

      r = await send('/missing')
      assert.strictEqual(r.status, 404)
      assert.deepStrictEqual(r.marked, [])

      r = await send('/plain')
      assert.deepStrictEqual(r.marked, [])
      assert.deepStrictEqual(r.body, CLEAN['/plain'])

      r = await send('/user/2')
      assert.deepStrictEqual(r.body.params, { id: '2' })
      assert.deepStrictEqual(r.body.locals, {})
      assert.strictEqual(r.body.marked, null)

      // every request came on the same connection
      assert.strictEqual(sockets.size, 1)
    })
  })
})
