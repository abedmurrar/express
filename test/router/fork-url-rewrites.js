'use strict'

// A req.url rewritten inside a mounted layer keeps its slash
// (expressjs/express#4059, router 2.3.0's fix, pillarjs/router#206, whose own
// tests are in router.js). Here: the fix together with what else this copy
// does with the slash the router adds, and the cases upstream doesn't test.

const assert = require('node:assert')
const net = require('node:net')
const Router = require('../../lib/router')
const { originalRoute } = require('../../lib/router/lib/original-route')
const utils = require('./support/utils')

// Send `target` through `router` and resolve with what its callback sees.
function dispatch(router, target, method) {
  const req = { method: method || 'GET', url: target, headers: {} }
  return new Promise(function (resolve) {
    router(req, {}, function (err) {
      resolve({ err: err && err !== 'router' ? err.message : undefined, url: req.url, baseUrl: req.baseUrl, req })
    })
  })
}

// A router with a layer at `path` that sets req.url to `to`, and what the
// layers after it, and the code after the router, see.
async function rewrite(path, to, target, options) {
  const router = new Router(options)
  const seen = []
  router.use(path, function (req, res, next) {
    seen.push(req.url)
    req.url = to
    next()
  })
  router.use(function (req, res, next) {
    seen.push(req.url)
    next()
  })
  const out = await dispatch(router, target)
  assert.strictEqual(out.url, seen[1] === undefined ? seen[0] : seen[1])
  assert.strictEqual(out.baseUrl, undefined)
  return seen
}

describe('req.url rewritten inside a mounted layer', function () {
  const cases = [
    // mount path, request, req.url in the layer, rewritten to, req.url after
    ['/foo', '/foo', '/', '/bar', '/foo/bar'],
    ['/foo', '/foo', '/', '/bar?x=1', '/foo/bar?x=1'],
    ['/foo', '/foo', '/', '/bar/', '/foo/bar/'],
    ['/foo', '/foo', '/', '//bar', '/foo//bar'],
    ['/foo', '/foo?q=1', '/?q=1', '/bar', '/foo/bar'],
    ['/foo', '/foo?q=1', '/?q=1', '/bar?q=1', '/foo/bar?q=1'],
    ['/foo', '/foo?q=/', '/?q=/', '/bar?q=/', '/foo/bar?q=/'],
    // still the root of the mount: the slash is the one the router added
    ['/foo', '/foo', '/', '/', '/foo'],
    ['/foo', '/foo', '/', '/?x=1', '/foo?x=1'],
    ['/foo', '/foo?q=1', '/?q=1', '/', '/foo'],
    ['/foo', '/foo?q=1', '/?q=1', '/?q=2', '/foo?q=2'],
    // no leading slash to take off
    ['/foo', '/foo', '/', '', '/foo'],
    ['/foo', '/foo', '/', '?x=1', '/foo?x=1'],
    ['/foo', '/foo', '/', 'bar', '/foobar'],
    // the request had a slash of its own, which the mount takes ("/foo/"), so
    // the added one is taken off whatever it was rewritten to
    ['/foo', '/foo/', '/', '/bar', '/foo/bar'],
    ['/foo', '/foo/', '/', '/', '/foo/'],
    ['/foo', '/foo/?q=1', '/?q=1', '/?q=2', '/foo/?q=2'],
    ['/foo', '/foo/', '/', 'bar', '/foo/bar'],
    ['/foo', '/foo/', '/', '', '/foo/'],
    ['/foo', '/foo/a', '/a', '/bar', '/foo/bar'],
    // a mount path written with a slash is the same mount
    ['/foo/', '/foo', '/', '/bar', '/foo/bar'],
    ['/foo/', '/foo/', '/', '/bar', '/foo/bar'],
    [['/a', '/foo/'], '/foo', '/', '/bar', '/foo/bar'],
    ['/:id', '/foo', '/', '/bar', '/foo/bar'],
    [/^\/foo/, '/foo', '/', '/bar', '/foo/bar'],
    // a "/" mount takes nothing off
    ['/', '/foo', '/foo', '/bar', '/bar']
  ]

  for (const [path, target, inside, to, after] of cases) {
    for (const options of [undefined, { strict: true }, { strict: true, strictMount: true }]) {
      const name = [path, target, to, JSON.stringify(options)].map(String).join(' ')
      it('keeps the slash of the mount: ' + name, async function () {
        assert.deepStrictEqual(await rewrite(path, to, target, options), [inside, after])
      })
    }
  }

  // a RegExp mount whose match ends with "/"
  for (const [to, after] of [
    ['/', '/foo/'],
    ['/bar', '/foo/bar'],
    ['/?x=1', '/foo/?x=1'],
    ['bar', '/foo/bar'],
    ['', '/foo/']
  ]) {
    it('a mount that takes the slash keeps one: ' + JSON.stringify(to), async function () {
      assert.deepStrictEqual(await rewrite(/^\/foo\//, to, '/foo/', undefined), ['/', after])
    })
  }

  it('leaves an absolute-form target alone, where no slash is added', async function () {
    assert.deepStrictEqual(await rewrite('/foo', 'http://h/bar', 'http://h/foo', undefined), [
      'http://h',
      'http://h/foo/bar'
    ])
    // the mount takes "/foo/": a double slash, as in routers 2.2.0 and 2.3.0
    assert.deepStrictEqual(await rewrite('/foo', 'http://h/bar', 'http://h/foo/', undefined), [
      'http://h',
      'http://h/foo//bar'
    ])
    assert.deepStrictEqual(await rewrite('/foo', 'http://h/bar?x', 'http://h/foo?q', undefined), [
      'http://h?q',
      'http://h/foo/bar?x'
    ])
  })

  it('restores each mount on the way out of nested routers', async function () {
    const inner = new Router()
    const middle = new Router()
    const outer = new Router()
    const seen = []
    function see(req, res, next) {
      seen.push([req.baseUrl, req.url])
      next()
    }
    inner.use(function (req, res, next) {
      seen.push([req.baseUrl, req.url])
      req.url = '/new'
      next()
    })
    inner.use(see)
    middle.use('/b', inner)
    middle.use(see)
    outer.use('/a', middle)
    outer.use(see)

    assert.strictEqual((await dispatch(outer, '/a/b')).url, '/a/b/new')
    assert.deepStrictEqual(seen.splice(0), [
      ['/a/b', '/'],
      ['/a/b', '/new'],
      ['/a', '/b/new'],
      ['', '/a/b/new']
    ])
  })

  it('restores a mount whose "/" router rewrites', async function () {
    const inner = new Router()
    const middle = new Router()
    const outer = new Router()
    inner.use(function (req, res, next) {
      req.url = '/new'
      next()
    })
    middle.use(inner)
    outer.use('/a', middle)
    assert.strictEqual((await dispatch(outer, '/a')).url, '/a/new')
    assert.strictEqual((await dispatch(outer, '/a?x=1')).url, '/a/new')
  })

  it('a later rewrite back to the root takes the added slash off again', async function () {
    const inner = new Router()
    const outer = new Router()
    inner.use(function (req, res, next) {
      req.url = '/new'
      next()
    })
    inner.use(function (req, res, next) {
      req.url = '/'
      next()
    })
    outer.use('/a', inner)
    assert.strictEqual((await dispatch(outer, '/a')).url, '/a')
  })

  it('routes the rewritten url at the next layer of the outer router', async function () {
    const outer = new Router()
    outer.use('/app', function (req, res, next) {
      if (req.url === '/') req.url = '/index.html'
      next()
    })
    const hits = []
    outer.get('/app/index.html', function (req, res, next) {
      hits.push('index')
      next()
    })
    outer.use('/app', function (req, res, next) {
      hits.push(req.baseUrl + ' ' + req.url)
      next()
    })
    outer.get('/appindex.html', function (req, res, next) {
      hits.push('joined')
      next()
    })
    await dispatch(outer, '/app')
    assert.deepStrictEqual(hits, ['index', '/app /index.html'])
  })

  describe('with errors', function () {
    function failing(to, fail) {
      const outer = new Router()
      const seen = []
      outer.use('/foo', function (req, res, next) {
        req.url = to
        return fail(next)
      })
      outer.use('/other', function (err, req, res, next) {
        seen.push('other')
        next(err)
      })
      outer.use(function (err, req, res, next) {
        seen.push(req.url)
        next(err)
      })
      return { outer, seen }
    }

    for (const [how, fail] of [
      ['next(err)', (next) => next(new Error('boom'))],
      [
        'a throw',
        () => {
          throw new Error('boom')
        }
      ],
      ['a rejection', () => Promise.reject(new Error('boom'))]
    ]) {
      it('keeps the slash for error handlers after ' + how, async function () {
        const { outer, seen } = failing('/bar', fail)
        const out = await dispatch(outer, '/foo')
        assert.strictEqual(out.err, 'boom')
        assert.strictEqual(out.url, '/foo/bar')
        assert.deepStrictEqual(seen, ['/foo/bar'])
      })
    }

    it('keeps the slash a mounted error handler rewrites', async function () {
      const outer = new Router()
      outer.use(function (req, res, next) {
        next(new Error('boom'))
      })
      outer.error('/foo', function (err, req, res, next) {
        req.url = '/bar'
        next(err)
      })
      const out = await dispatch(outer, '/foo')
      assert.strictEqual(out.err, 'boom')
      assert.strictEqual(out.url, '/foo/bar')
    })

    it('keeps the slash when the mounted router is left with next("router")', async function () {
      const inner = new Router()
      inner.use(function (req, res, next) {
        req.url = '/bar'
        next('router')
      })
      const outer = new Router()
      outer.use('/foo', inner)
      assert.strictEqual((await dispatch(outer, '/foo')).url, '/foo/bar')
    })
  })

  describe('in a strict router', function () {
    function strict(options, to) {
      const inner = new Router(Object.assign({ strict: true }, options))
      const hits = []
      inner.use(function (req, res, next) {
        req.url = to
        next()
      })
      for (const path of ['', '/', '/new', '/new/']) {
        inner.get(path, function (req, res, next) {
          hits.push(JSON.stringify(path))
          next()
        })
      }
      const outer = new Router()
      outer.use('/dir', inner)
      return { outer, hits }
    }

    for (const options of [{}, { strictMount: true }]) {
      const name = JSON.stringify(options)

      it('routes a rewritten path as it reads and keeps the slash after it ' + name, async function () {
        const { outer, hits } = strict(options, '/new')
        assert.strictEqual((await dispatch(outer, '/dir')).url, '/dir/new')
        assert.strictEqual((await dispatch(outer, '/dir/')).url, '/dir/new')
        assert.strictEqual((await dispatch(outer, '/dir?q=1')).url, '/dir/new')
        assert.deepStrictEqual(hits, ['"/new"', '"/new"', '"/new"'])
      })

      it('still has nothing after the mount when rewritten to the same url ' + name, async function () {
        const { outer, hits } = strict(options, '/')
        assert.strictEqual((await dispatch(outer, '/dir')).url, '/dir')
        assert.deepStrictEqual(hits.splice(0), Object.hasOwn(options, 'strictMount') ? ['""'] : ['""', '"/"'])
        assert.strictEqual((await dispatch(outer, '/dir/')).url, '/dir/')
        assert.deepStrictEqual(hits, ['"/"'])
      })

      it('routes a rewritten query on "/" and takes the added slash off ' + name, async function () {
        const { outer, hits } = strict(options, '/?x=1')
        assert.strictEqual((await dispatch(outer, '/dir')).url, '/dir?x=1')
        assert.deepStrictEqual(hits.splice(0), ['"/"'])
        assert.strictEqual((await dispatch(outer, '/dir/')).url, '/dir/?x=1')
        assert.deepStrictEqual(hits, ['"/"'])
      })
    }

    it('answers the next strict router at the mount from the rewritten path', async function () {
      const first = new Router({ strict: true })
      first.use(function (req, res, next) {
        req.url = '/new'
        next()
      })
      const second = new Router({ strict: true, strictMount: true })
      const hits = []
      for (const path of ['', '/', '/new']) {
        second.get(path, function (req, res, next) {
          hits.push(path)
          next()
        })
      }
      const outer = new Router()
      outer.use('/dir', first, second)
      assert.strictEqual((await dispatch(outer, '/dir')).url, '/dir/new')
      assert.deepStrictEqual(hits, ['/new'])
    })

    it('a router after one that rewrote to another root has the slash added again', async function () {
      const second = new Router({ strict: true, strictMount: true })
      const hits = []
      for (const path of ['', '/']) {
        second.get(path, function (req, res, next) {
          hits.push(path + ' ' + req.url)
          next()
        })
      }
      const outer = new Router()
      outer.use(
        '/dir',
        function (req, res, next) {
          req.url = '/?x=1'
          next()
        },
        second
      )
      assert.strictEqual((await dispatch(outer, '/dir')).url, '/dir?x=1')
      assert.deepStrictEqual(hits, [' /?x=1'])
    })
  })

  it('gives req.originalRoute the mounts the rewritten request goes through', async function () {
    const inner = new Router()
    inner.use(function (req, res, next) {
      req.url = '/items/7'
      next()
    })
    inner.get('/items/:id', function (req, res, next) {
      seen.push(originalRoute(req))
      next()
    })
    const outer = new Router()
    const seen = []
    outer.use('/api', inner)
    outer.use('/api/items', function (req, res, next) {
      seen.push(req.baseUrl + ' ' + req.url)
      next()
    })
    outer.get(['/apiitems/:n', '/api/items/:n'], function (req, res, next) {
      seen.push(originalRoute(req))
      next()
    })
    await dispatch(outer, '/api')
    assert.deepStrictEqual(seen, ['/api/items/:id', '/api/items /7', '/api/items/:n'])
  })

  it('works on a real socket with a raw absolute-form target', async function () {
    const inner = new Router()
    inner.use(function (req, res, next) {
      req.url = 'http://localhost/bar'
      next()
    })
    const outer = new Router()
    outer.use('/foo', inner)
    outer.use(function (req, res) {
      res.end(req.url)
    })
    const server = utils.createServer(outer).listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    const text = await new Promise(function (resolve, reject) {
      let out = ''
      const socket = net.connect(server.address().port, '127.0.0.1')
      socket.setEncoding('utf8')
      socket.on('data', (chunk) => (out += chunk))
      socket.on('end', () => resolve(out))
      socket.on('error', reject)
      socket.write('GET http://localhost/foo HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n')
    })
    server.close()
    assert.match(text, /http:\/\/localhost\/foo\/bar/)
  })
})
