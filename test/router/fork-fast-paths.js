'use strict'

// Not from upstream. The router skips path matching that cannot succeed:
// a route without a handler for the request method is skipped before its
// path regex runs (src/router/index.ts, skippableMethod). Each case here
// runs on this router and on upstream's (router 2.2.0) and expects the same
// handlers to run in the same order with the same request state, and the
// same ending.

const assert = require('node:assert')
const { both, forkRouter } = require('./support/trace')

// Checks one request against upstream and returns the fork's log.
async function same(setup, method, url) {
  const r = await both(setup, method, url)
  assert.deepStrictEqual(r.fork, r.upstream)
  return r.fork
}

// The ids of the handlers that ran, in order.
function ran(log) {
  return log
    .filter(function (e) {
      return e[0] === 'run' || e[0] === 'error' || e[0] === 'param'
    })
    .map(function (e) {
      return e[1]
    })
}

function ending(log) {
  return log[log.length - 1]
}

describe('fork: routing fast paths', function () {
  describe('the method check before the path regex', function () {
    const app = {
      stack: [
        { use: '/', id: 'mw' },
        { param: 'id', id: 'param' },
        { route: '/users/:id', methods: ['get'], id: 'get-user' },
        { route: '/users/:id', methods: ['post'], id: 'post-user' },
        { route: '/any/:id', methods: ['all'], id: 'all' },
        { route: '/chain', methods: ['get', 'post'], id: 'chain' },
        { route: '/head', methods: ['head'], id: 'head-only' },
        { route: '/put', methods: ['put'], id: 'put-only' },
        { error: '/', id: 'err' }
      ]
    }

    it('skips a route without a handler for the method, and reaches the next one', async function () {
      assert.deepStrictEqual(ran(await same(app, 'POST', '/users/1')), ['mw', 'param', 'post-user'])
      assert.deepStrictEqual(ran(await same(app, 'GET', '/users/1')), ['mw', 'param', 'get-user'])
      assert.deepStrictEqual(ran(await same(app, 'DELETE', '/users/1')), ['mw'])
    })

    it('runs middleware for every method', async function () {
      for (const method of ['GET', 'POST', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'BREW', 'get', undefined]) {
        assert.deepStrictEqual(ran(await same(app, method, '/nothing')).slice(0, 1), ['mw'], String(method))
      }
    })

    it('lets HEAD run a GET route', async function () {
      assert.deepStrictEqual(ran(await same(app, 'HEAD', '/users/1')), ['mw', 'param', 'get-user'])
    })

    it('lets HEAD into a matching route that has no GET handler, as upstream does', async function () {
      // the route runs (params, req.route) and finds no handler for HEAD
      const log = await same(app, 'HEAD', '/put')
      assert.deepStrictEqual(ran(log), ['mw'])
      assert.deepStrictEqual(ending(log), ['done', undefined])
      assert.deepStrictEqual(ran(await same(app, 'HEAD', '/head')), ['mw', 'head-only'])
    })

    it('treats a lower-case head like HEAD for the GET fallback', async function () {
      assert.deepStrictEqual(ran(await same(app, 'head', '/users/1')), ['mw', 'param', 'get-user'])
      assert.deepStrictEqual(ran(await same(app, 'Head', '/put')), ['mw'])
    })

    it('builds the OPTIONS Allow list from every route whose path matches', async function () {
      const log = await same(app, 'OPTIONS', '/users/1')
      assert.deepStrictEqual(ending(log), [
        'end',
        {
          Allow: 'GET, HEAD, POST',
          'Content-Length': 15,
          'Content-Type': 'text/plain',
          'X-Content-Type-Options': 'nosniff'
        },
        'GET, HEAD, POST'
      ])
      // no route ran, so neither did the param callback
      assert.deepStrictEqual(ran(log), ['mw'])
    })

    it('answers OPTIONS from a route that handles it', async function () {
      const setup = {
        stack: [
          { route: '/o', methods: ['options'], id: 'options' },
          { route: '/o', methods: ['get'], id: 'get' }
        ]
      }
      assert.deepStrictEqual(ran(await same(setup, 'OPTIONS', '/o')), ['options'])
      assert.deepStrictEqual(ending(await same(setup, 'options', '/o')), ['done', undefined])
    })

    it('matches an all() route for every method', async function () {
      for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'BREW', 'OPTIONS', 'HEAD', 'get', undefined]) {
        assert.ok(ran(await same(app, method, '/any/1')).includes('all'), String(method))
      }
    })

    it('matches every method of a route() chain', async function () {
      assert.deepStrictEqual(ran(await same(app, 'POST', '/chain')), ['mw', 'chain'])
      assert.deepStrictEqual(ran(await same(app, 'PUT', '/chain')), ['mw'])
    })

    it('follows next("route") to the next route for the method', async function () {
      const setup = {
        stack: [
          { route: '/x', methods: ['post'], id: 'first', action: 'route' },
          { route: '/x', methods: ['get'], id: 'get' },
          { route: '/x', methods: ['post'], id: 'second' }
        ]
      }
      assert.deepStrictEqual(ran(await same(setup, 'POST', '/x')), ['first', 'second'])
    })

    it('counts a method added to a route after it was mounted', async function () {
      const log = []
      const router = forkRouter()
      const route = router.route('/late')
      route.get(function (req, res, next) {
        log.push('get')
        next()
      })
      function send(method) {
        return new Promise(function (resolve) {
          router({ method: method, url: '/late', headers: {} }, {}, resolve)
        })
      }
      await send('PUT')
      assert.deepStrictEqual(log, [])
      route.put(function (req, res, next) {
        log.push('put')
        next()
      })
      await send('PUT')
      assert.deepStrictEqual(log, ['put'])
      router.route('/late').all(function (req, res, next) {
        log.push('all')
        next()
      })
      await send('PATCH')
      assert.deepStrictEqual(log, ['put', 'all'])
    })

    it('uses the method a middleware changed it to', async function () {
      const setup = {
        stack: [
          { use: '/', id: 'override', action: 'post' },
          { route: '/users/:id', methods: ['get'], id: 'get' },
          { route: '/users/:id', methods: ['post'], id: 'post' }
        ]
      }
      assert.deepStrictEqual(ran(await same(setup, 'GET', '/users/1')), ['override', 'post'])
    })

    it('still reports a bad escape in a route that cannot handle the method', async function () {
      // matching /users/:id decodes the param, which fails with a 400; the
      // error reaches the error handler even though the route is GET only
      const setup = {
        stack: [
          { route: '/users/:id', methods: ['get'], id: 'get' },
          { error: '/', id: 'err' }
        ]
      }
      const log = await same(setup, 'POST', '/users/%E0')
      assert.deepStrictEqual(ran(log), ['err'])
      assert.deepStrictEqual(ending(log), ['done', { message: "Failed to decode param '%E0'", status: 400 }])
      // a good escape decodes as usual
      assert.deepStrictEqual(ran(await same(setup, 'GET', '/users/%41')), ['get'])
    })

    it('does not match routes while an error is pending', async function () {
      const setup = {
        stack: [
          { use: '/', id: 'fail', action: 'fail' },
          { route: '/x', methods: ['get'], id: 'get' },
          { route: '/x', methods: ['post'], id: 'post' },
          { error: '/', id: 'err' }
        ]
      }
      for (const method of ['GET', 'POST', 'PUT']) {
        assert.deepStrictEqual(ran(await same(setup, method, '/x')), ['fail', 'err'], method)
      }
    })

    it('handles a request without a method', async function () {
      const setup = {
        stack: [
          { route: '/x', methods: ['get'], id: 'get' },
          { route: '/x', methods: ['all'], id: 'all' }
        ]
      }
      assert.deepStrictEqual(ran(await same(setup, undefined, '/x')), ['all'])
    })

    it('skips the routes of a mounted router with mergeParams the same way', async function () {
      const setup = {
        stack: [
          {
            use: '/org/:org',
            router: {
              options: { mergeParams: true },
              stack: [
                { route: '/team/:team', methods: ['get'], id: 'get-team' },
                { route: '/team/:team', methods: ['delete'], id: 'delete-team' }
              ]
            }
          }
        ]
      }
      const log = await same(setup, 'DELETE', '/org/acme/team/blue')
      assert.deepStrictEqual(ran(log), ['delete-team'])
      assert.deepStrictEqual(log[0][2].params, { org: 'acme', team: 'blue' })
    })
  })
})
