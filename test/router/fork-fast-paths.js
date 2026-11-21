'use strict'

// Not from upstream. The router skips path matching that cannot succeed:
// a route without a handler for the request method is skipped before its
// path regex runs (src/router/index.ts, skippableMethod), and a string path
// with a literal start is checked with that start before its regex
// (src/router/lib/layer.ts, literalPrefix). Each case here runs on this
// router and on upstream's (router 2.2.0) and expects the same handlers to
// run in the same order with the same request state, and the same ending.

const assert = require('node:assert')
const { pathToRegexp } = require('path-to-regexp')
const { both, run, forkRouter, ForkLayer, UpstreamLayer } = require('./support/trace')

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

  describe('the literal-prefix check before the path regex', function () {
    function prefixOf(path, options) {
      return ForkLayer(path, options || { sensitive: false, strict: false, end: true }, function () {}).prefix
    }

    it('takes the literal start of a string path', function () {
      assert.strictEqual(prefixOf('/users/:id'), '/users/')
      assert.strictEqual(prefixOf('/Users/:id'), '/users/')
      assert.strictEqual(prefixOf('/Users/:id', { sensitive: true }), '/Users/')
      assert.strictEqual(prefixOf('/a\\:b/:c'), '/a:b/')
      assert.strictEqual(prefixOf('/files{/:name}'), '/files')
      assert.strictEqual(prefixOf('/assets/*path'), '/assets/')
      assert.strictEqual(prefixOf('/a%2Fb'), '/a%2fb')
      // trailing slashes are dropped unless strict, as the regex drops them
      assert.strictEqual(prefixOf('/dir/'), '/dir')
      assert.strictEqual(prefixOf('/dir/', { strict: true }), '/dir/')
      // cut before the first non-ASCII character
      assert.strictEqual(prefixOf('/café/:x'), '/caf')
    })

    it('has no prefix for paths without a literal start', function () {
      for (const p of [':id', '{/:x}', '*splat', '', '///', /^\/a/, ['/a', '/b'], 'é/x']) {
        assert.strictEqual(prefixOf(p), undefined, String(p))
      }
    })

    // The regex is built with the `i` flag and no `u`, so it pairs an ASCII
    // character only with its other ASCII case. Every UTF-16 code unit is
    // tried against every printable ASCII character a route can start with:
    // wherever the regex matches, the layer must match too. (Where the regex
    // doesn't, the layer can't: it runs the same regex after the prefix.)
    it('agrees with the regex on case for every character', function () {
      this.timeout(60000)
      for (let p = 0x20; p < 0x7f; p++) {
        const literal = String.fromCharCode(p)
        if ('{}()[]+?!:*'.includes(literal)) continue
        for (const sensitive of [false, true]) {
          const options = { sensitive: sensitive, strict: false, end: false }
          const route = '/' + (literal === '\\' ? '\\\\' : literal) + 'z'
          const fork = ForkLayer(route, options, function () {})
          const upstream = UpstreamLayer(route, options, function () {})
          const regexp = pathToRegexp(route, { sensitive: sensitive, end: false }).regexp
          assert.strictEqual(fork.prefix, '/' + (sensitive ? literal : literal.toLowerCase()) + 'z')
          let matched = 0
          for (let c = 0; c <= 0xffff; c++) {
            const path = '/' + String.fromCharCode(c) + 'z'
            const expected = regexp.test(path)
            if ((expected || c < 0x80) && (fork.match(path) !== expected || upstream.match(path) !== expected)) {
              assert.fail('route ' + route + ', path char U+' + c.toString(16) + ', sensitive ' + sensitive)
            }
            if (expected) matched++
          }
          // a letter matches its two cases unless sensitive, anything else itself
          const cases = !sensitive && literal.toLowerCase() !== literal.toUpperCase() ? 2 : 1
          assert.strictEqual(matched, cases, route)
        }
      }
    })

    it('treats the Kelvin sign, long s and dotted or dotless i as the regex does', async function () {
      const setup = {
        stack: [
          { route: '/k/:x', methods: ['get'], id: 'k' },
          { route: '/s/:x', methods: ['get'], id: 's' },
          { route: '/i/:x', methods: ['get'], id: 'i' },
          { route: '/café/:x', methods: ['get'], id: 'cafe' }
        ]
      }
      for (const url of ['/K/1', '/ſ/1', '/İ/1', '/ı/1', '/K/1', '/S/1', '/I/1']) {
        await same(setup, 'GET', url)
      }
      assert.deepStrictEqual(ran(await same(setup, 'GET', '/CAFÉ/1')), ['cafe'])
      assert.deepStrictEqual(ran(await same(setup, 'GET', '/CAFE/1')), [])
    })

    it('ignores case unless the router is case sensitive', async function () {
      const routes = [{ route: '/Users/:id', methods: ['get'], id: 'users' }]
      assert.deepStrictEqual(ran(await same({ stack: routes }, 'GET', '/USERS/1')), ['users'])
      assert.deepStrictEqual(ran(await same({ stack: routes }, 'GET', '/users/1')), ['users'])
      const sensitive = { options: { caseSensitive: true }, stack: routes }
      assert.deepStrictEqual(ran(await same(sensitive, 'GET', '/USERS/1')), [])
      assert.deepStrictEqual(ran(await same(sensitive, 'GET', '/Users/1')), ['users'])
    })

    it('matches percent-escapes in a literal raw, with the hex digits in any case', async function () {
      const setup = {
        stack: [
          { route: '/a%2Fb', methods: ['get'], id: 'escaped' },
          { route: '/x y', methods: ['get'], id: 'space' }
        ]
      }
      assert.deepStrictEqual(ran(await same(setup, 'GET', '/a%2Fb')), ['escaped'])
      assert.deepStrictEqual(ran(await same(setup, 'GET', '/a%2fb')), ['escaped'])
      assert.deepStrictEqual(ran(await same(setup, 'GET', '/a/b')), [])
      // the URL parser escapes a raw space, so a literal space never matches
      assert.deepStrictEqual(ran(await same(setup, 'GET', '/x%20y')), [])
      assert.deepStrictEqual(ran(await same(setup, 'GET', '/x y')), [])
    })

    it('keeps strict routing and the optional trailing slash', async function () {
      const routes = [
        { route: '/dir/', methods: ['get'], id: 'slash' },
        { route: '/dir', methods: ['get'], id: 'bare' }
      ]
      const loose = { stack: routes }
      const strict = { options: { strict: true }, stack: routes }
      assert.deepStrictEqual(ran(await same(loose, 'GET', '/dir')), ['slash', 'bare'])
      assert.deepStrictEqual(ran(await same(loose, 'GET', '/dir/')), ['slash', 'bare'])
      assert.deepStrictEqual(ran(await same(strict, 'GET', '/dir')), ['bare'])
      assert.deepStrictEqual(ran(await same(strict, 'GET', '/dir/')), ['slash'])
      assert.deepStrictEqual(ran(await same(strict, 'GET', '/dir//')), [])
    })

    it('matches middleware on whole segments only', async function () {
      const setup = { stack: [{ use: '/api', id: 'api' }] }
      for (const url of ['/api', '/api/', '/API/x', '/api/x/y', '/api?x=1']) {
        assert.deepStrictEqual(ran(await same(setup, 'GET', url)), ['api'], url)
      }
      for (const url of ['/apix', '/ap', '/', '/x/api', '/%61pi']) {
        assert.deepStrictEqual(ran(await same(setup, 'GET', url)), [], url)
      }
    })

    it('keeps the order of layers, the first match first', async function () {
      const setup = {
        stack: [
          { route: '/a/:x', methods: ['get'], id: 'param' },
          { route: '/a/b', methods: ['get'], id: 'literal' },
          { route: '/:y/b', methods: ['get'], id: 'leading-param' },
          { route: /^\/a/, methods: ['get'], id: 'regexp' },
          { route: ['/z', '/a/b'], methods: ['get'], id: 'array' },
          { route: '*rest', methods: ['get'], id: 'splat' }
        ]
      }
      assert.deepStrictEqual(ran(await same(setup, 'GET', '/a/b')), [
        'param',
        'literal',
        'leading-param',
        'regexp',
        'array',
        'splat'
      ])
      assert.deepStrictEqual(ran(await same(setup, 'GET', '/b/b')), ['leading-param', 'splat'])
    })

    it('mounts routers at a literal path with mergeParams', async function () {
      const setup = {
        stack: [
          {
            use: '/Org/:org',
            router: {
              options: { mergeParams: true },
              stack: [{ route: '/Team/:team', methods: ['get'], id: 'team' }]
            }
          }
        ]
      }
      const log = await same(setup, 'GET', '/ORG/a/TEAM/b')
      assert.deepStrictEqual(ran(log), ['team'])
      assert.deepStrictEqual(log[0][2], {
        method: 'GET',
        url: '/TEAM/b',
        baseUrl: '/ORG/a',
        params: { org: 'a', team: 'b' },
        route: '/Team/:team'
      })
      assert.deepStrictEqual(ran(await same(setup, 'GET', '/Orgx/a/Team/b')), [])
    })

    it('leaves an absolute-form URL to the pathname', async function () {
      const setup = { stack: [{ route: '/p', methods: ['get'], id: 'p' }] }
      assert.deepStrictEqual(ran(await same(setup, 'GET', 'http://example.com/p?x=1')), ['p'])
      assert.deepStrictEqual(ran(await same(setup, 'GET', 'http://example.com/q')), [])
    })

    it('runs the regex as before for a path that has the prefix', async function () {
      const log = await run(
        forkRouter,
        { stack: [{ route: '/users/:id', methods: ['get'], id: 'u' }] },
        'GET',
        '/users/'
      )
      assert.deepStrictEqual(ran(log), [])
    })
  })
})
