'use strict'

// match() stores its result on the layer (keys, params and path), where router
// 2.3.0 returns it and keeps nothing (pillarjs/router#216). next() reads the
// three as soon as the layer matched, so another request that reaches the same
// layer later, or in the middle of this one's dispatch, can't change them.
// Reading them after an accessor on req had run let that happen (also in
// router 2.2.0). These try every place where code other than the router's runs
// between the match and the handler. The ones of the first block pass on router
// 2.3.0 too, except the last, and the traced RegExp, which runs twice only here.

const assert = require('node:assert')
const dc = require('node:diagnostics_channel')
const Router = require('../../lib/router')

function dispatch(router, req) {
  return new Promise(function (resolve, reject) {
    router(Object.defineProperties({}, Object.getOwnPropertyDescriptors(req)), {}, function (err) {
      err ? reject(err) : resolve()
    })
  })
}

function nothing() {}

// Handle another request with the same router, the first time it's called.
function reenterOnce(router, url) {
  let done = false
  return function () {
    if (done) return
    done = true
    router({ method: 'GET', url }, {}, nothing)
  }
}

// A mounted middleware (a path array, so each request can have other
// parameter names) that records what it and its parameter callbacks see.
function mounted(options) {
  const router = new Router(options)
  const seen = []
  for (const name of ['id', 'other']) {
    router.param(name, function (req, res, next, value) {
      seen.push(name + '=' + value)
      next()
    })
  }
  router.use(['/u/:id', '/long/:other'], function (req, res, next) {
    seen.push(JSON.stringify(req.params) + ' ' + req.baseUrl + ' ' + req.url)
    next()
  })
  return { router, seen }
}

const INNER = ['other=inner', '{"other":"inner"} /long/inner /']
const OUTER = ['id=outer', '{"id":"outer"} /u/outer /x']

describe('a match stays with its request', function () {
  it('while a parameter callback waits and other requests match the layer', async function () {
    const router = new Router()
    const seen = []
    const waiting = []
    router.param('id', function (req, res, next, value) {
      if (value.startsWith('slow')) waiting.push(next)
      else next()
    })
    router.use(['/u/:id', '/v/:id/:b'], function (req, res, next) {
      seen.push(JSON.stringify(req.params) + ' ' + req.baseUrl + ' ' + req.url)
      next()
    })
    router.get('/u/:id/x', function (req, res, next) {
      seen.push('route ' + req.params.id)
      next()
    })

    const slow = [
      dispatch(router, { method: 'GET', url: '/u/slow1/x' }),
      dispatch(router, { method: 'GET', url: '/v/slow-two/b/x' })
    ]
    await dispatch(router, { method: 'GET', url: '/u/fast/x' })
    await dispatch(router, { method: 'GET', url: '/nothing' })
    assert.deepStrictEqual(seen.splice(0), ['{"id":"fast"} /u/fast /x', 'route fast'])
    assert.strictEqual(waiting.length, 2)
    waiting
      .splice(0)
      .reverse()
      .forEach((next) => next())
    // the route layer of the first one has the parameter callback too
    while (waiting.length) waiting.shift()()
    await Promise.all(slow)
    assert.deepStrictEqual(seen, [
      '{"id":"slow-two","b":"b"} /v/slow-two/b /x',
      '{"id":"slow1"} /u/slow1 /x',
      'route slow1'
    ])
  })

  it('in a parameter callback that handles another request with the router', async function () {
    const { router, seen } = mounted()
    const reenter = reenterOnce(router, '/long/inner')
    router.param('id', function (req, res, next) {
      reenter()
      next()
    })
    await dispatch(router, { method: 'GET', url: '/u/outer/x' })
    assert.deepStrictEqual(seen, ['id=outer'].concat(INNER, OUTER.slice(1)))
  })

  it('in a handler that handles another request with the router', async function () {
    const router = new Router()
    const seen = []
    const reenter = reenterOnce(router, '/u/inner')
    router.use('/u/:id', function (req, res, next) {
      reenter()
      seen.push(req.params.id + ' ' + req.baseUrl)
      next()
    })
    await dispatch(router, { method: 'GET', url: '/u/outer' })
    assert.deepStrictEqual(seen, ['inner /u/inner', 'outer /u/outer'])
  })

  for (const traced of [false, true]) {
    it('in a RegExp that handles another request as it runs' + (traced ? ', traced' : ''), async function () {
      const channel = dc.tracingChannel('express.router.request')
      const subscriber = { start: nothing }
      const router = new Router()
      const seen = []
      const reenter = reenterOnce(router, '/u/inner/q')
      let runs = 0
      // the tracing pattern of a path array runs the RegExp a second time
      class Path extends RegExp {
        exec(path) {
          const match = super.exec(path)
          if (++runs === (traced ? 2 : 1)) reenter()
          return match
        }
      }
      router.use([new Path('^/u/(\\w+)'), '/zzz'], function (req, res, next) {
        seen.push(req.params[0] + ' ' + req.baseUrl + ' ' + req.url)
        next()
      })
      if (traced) channel.subscribe(subscriber)
      try {
        await dispatch(router, { method: 'GET', url: '/u/outer/q' })
      } finally {
        channel.unsubscribe(subscriber)
      }
      assert.deepStrictEqual(seen, ['inner /u/inner /q', 'outer /u/outer /q'])
    })
  }

  it('in an accessor for req.method, read after a route matched', async function () {
    const router = new Router()
    const seen = []
    router.get('/u/:id', function (req, res, next) {
      seen.push(req.params.id)
      next()
    })
    let reads = 0
    const reenter = reenterOnce(router, '/u/inner')
    await dispatch(router, {
      get method() {
        // 1: is it OPTIONS, 2 (after the match): does the route handle it
        if (++reads === 2) reenter()
        return 'GET'
      },
      url: '/u/outer'
    })
    assert.deepStrictEqual(seen, ['inner', 'outer'])
  })

  it('in an accessor for req.route', async function () {
    const router = new Router()
    const seen = []
    router.get('/u/:id', function (req, res, next) {
      seen.push(req.params.id)
      next()
    })
    const reenter = reenterOnce(router, '/u/inner')
    await dispatch(router, {
      method: 'GET',
      set route(route) {
        reenter()
      },
      url: '/u/outer'
    })
    assert.deepStrictEqual(seen, ['inner', 'outer'])
  })

  it('in an accessor for req.params (its parameters, names and path)', async function () {
    const { router, seen } = mounted()
    const reenter = reenterOnce(router, '/long/inner')
    let params
    await dispatch(router, {
      method: 'GET',
      get params() {
        return params
      },
      set params(value) {
        params = value
        reenter()
      },
      url: '/u/outer/x'
    })
    assert.deepStrictEqual(seen, INNER.concat(OUTER))
  })

  it('in an accessor of the parent params that mergeParams copies', async function () {
    const { router, seen } = mounted({ mergeParams: true })
    const reenter = reenterOnce(router, '/long/inner')
    const params = {}
    Object.defineProperty(params, 'p', { get: reenter, enumerable: true })
    await dispatch(router, { method: 'GET', params, url: '/u/outer/x' })
    assert.deepStrictEqual(seen, INNER.concat(OUTER))
  })

  it('after a matcher throws, whatever it throws', async function () {
    // a thrown `true` was taken for a match, with the last request's result
    const router = new Router()
    const seen = []
    let thrown
    class Path extends RegExp {
      exec(path) {
        if (path.endsWith('/throw')) throw thrown
        return super.exec(path)
      }
    }
    router.get(new Path('^/u/(\\w+)$'), function (req, res, next) {
      seen.push(req.params[0])
      next()
    })
    router.use(new Path('^/u'), function (err, req, res, next) {
      seen.push('error handler at the path that threw')
      next(err)
    })
    router.get('/u/throw', function (req, res, next) {
      seen.push('reached')
      next()
    })

    const error = new Error('boom')
    for (thrown of [true, 'text', error]) {
      await dispatch(router, { method: 'GET', url: '/u/last' })
      await assert.rejects(dispatch(router, { method: 'GET', url: '/u/throw' }), function (err) {
        assert.strictEqual(err, thrown)
        return true
      })
      assert.deepStrictEqual(seen.splice(0), ['last'])
    }

    // a falsy one is no error, as before
    for (thrown of [false, undefined, null, 0]) {
      await dispatch(router, { method: 'GET', url: '/u/throw' })
      assert.deepStrictEqual(seen.splice(0), ['reached'])
    }
  })

  it('keeps the matched pattern for tracing when a parameter callback rewrites req.url', async function () {
    const channel = dc.tracingChannel('express.router.request')
    const seen = []
    const subscriber = {
      start(context) {
        seen.push(context.handler.name + ' ' + context.route)
      }
    }
    const router = new Router()
    router.param('id', function first(req, res, next) {
      req.url = '/elsewhere'
      next()
    })
    router.param('id', function second(req, res, next) {
      next()
    })
    router.get(['/a/:id', '/b/:id'], function handler(req, res, next) {
      next()
    })
    channel.subscribe(subscriber)
    try {
      await dispatch(router, { method: 'GET', url: '/b/1' })
    } finally {
      channel.unsubscribe(subscriber)
    }
    assert.deepStrictEqual(seen, ['first /b/:id', 'second /b/:id', 'handler /b/:id'])
  })

  it('still leaves the last match on the layer, for code that walks router.stack', async function () {
    const { router } = mounted()
    const layer = router.stack[0]
    assert.deepStrictEqual([layer.keys, layer.params, layer.path], [[], undefined, undefined])
    await dispatch(router, { method: 'GET', url: '/u/outer/x' })
    assert.deepStrictEqual(
      [layer.keys, Object.assign({}, layer.params), layer.path],
      [['id'], { id: 'outer' }, '/u/outer']
    )
    await dispatch(router, { method: 'GET', url: '/nothing' })
    assert.deepStrictEqual([layer.keys, layer.params, layer.path], [['id'], undefined, undefined])
  })
})

describe('decoding a parameter', function () {
  it('only decodes a value with a "%"', async function () {
    const decode = globalThis.decodeURIComponent
    const decoded = []
    const router = new Router()
    router.get('/:a/:b', function (req, res, next) {
      next()
    })
    globalThis.decodeURIComponent = function (value) {
      decoded.push(value)
      return decode(value)
    }
    try {
      await dispatch(router, { method: 'GET', url: '/plain/a%20b' })
    } finally {
      globalThis.decodeURIComponent = decode
    }
    assert.deepStrictEqual(decoded, ['a%20b'])
  })

  // decodeURIComponent only changes "%" escapes, so a value without one is
  // used as it is (pillarjs/router#188)
  for (const [value, decoded] of [
    ['plain', 'plain'],
    ['a+b', 'a+b'],
    ['a%20b', 'a b'],
    ['%', undefined],
    ['%41', 'A'],
    ['a%2Fb', 'a/b'],
    ['%E2%82%AC', '€'],
    ['100%25', '100%'],
    ['%25', '%'],
    ['a%', undefined],
    ['%zz', undefined]
  ]) {
    for (const path of ['/:v', /^\/([^/]+)$/, '/*v']) {
      it(value + ' at ' + path, async function () {
        const router = new Router()
        let seen
        router.get(path, function (req, res, next) {
          seen = String(req.params.v || req.params[0])
          next()
        })
        const result = dispatch(router, { method: 'GET', url: '/' + value })
        if (decoded !== undefined) {
          await result
          assert.strictEqual(seen, decoded)
          return
        }
        await assert.rejects(result, function (err) {
          assert.ok(err instanceof URIError)
          assert.deepStrictEqual([err.status, err.statusCode], [400, 400])
          assert.strictEqual(err.code, 'EXPRESS_ERR_PARAM_DECODE_FAILED')
          assert.strictEqual(err.message, "Failed to decode param '" + value + "'")
          return true
        })
      })
    }
  }
})
