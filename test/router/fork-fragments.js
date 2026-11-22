'use strict'

// Not from upstream (router 2.2.0 and 2.3.0). A request target has no
// fragment (RFC 9112 section 3.2), but Node passes a "#" through in req.url.
// parseurl then falls back to the legacy url.parse, which reads
// "//user@host/..." as a host, so "//x@evil.example/admin#z" was routed as
// "/admin". The outermost router now drops the fragment from req.url before
// it routes, so the path, the query and req.originalUrl are what they would
// be without it.

const Router = require('../../lib/router')
const utils = require('./support/utils')

const createServer = utils.createServer
const rawrequest = utils.rawrequest

function show(tag) {
  return function (req, res) {
    res.end(
      JSON.stringify({ tag: tag, url: req.url, originalUrl: req.originalUrl, baseUrl: req.baseUrl, params: req.params })
    )
  }
}

function expectJson(server, path, expected, done) {
  rawrequest(server).get(path).expect(200, JSON.stringify(expected), done)
}

describe('Router with a "#" fragment in the request target', function () {
  it('routes the path before the "#" and drops the fragment from req.url', function (done) {
    const router = new Router()
    router.get('/foo', show('foo'))
    expectJson(
      createServer(router),
      '/foo#bar',
      { tag: 'foo', url: '/foo', originalUrl: '/foo', baseUrl: '', params: {} },
      done
    )
  })

  it('does not read "//user@host" before a fragment as a host', function (done) {
    const router = new Router()
    router.get('/admin', show('admin'))
    router.use(show('fallback'))
    expectJson(
      createServer(router),
      '//x@evil.example/admin#z',
      {
        tag: 'fallback',
        url: '//x@evil.example/admin',
        originalUrl: '//x@evil.example/admin',
        baseUrl: '',
        params: {}
      },
      done
    )
  })

  it('keeps a query before the "#"', function (done) {
    const router = new Router()
    router.get('/q', show('q'))
    expectJson(
      createServer(router),
      '/q?a=1#b',
      { tag: 'q', url: '/q?a=1', originalUrl: '/q?a=1', baseUrl: '', params: {} },
      done
    )
  })

  it('drops a "?" that comes after the "#" with the fragment', function (done) {
    const router = new Router()
    router.get('/q', show('q'))
    expectJson(
      createServer(router),
      '/q#b?a=1',
      { tag: 'q', url: '/q', originalUrl: '/q', baseUrl: '', params: {} },
      done
    )
  })

  it('drops an empty fragment', function (done) {
    const router = new Router()
    router.get('/a', show('a'))
    expectJson(createServer(router), '/a#', { tag: 'a', url: '/a', originalUrl: '/a', baseUrl: '', params: {} }, done)
  })

  it('keeps "%23" as a literal "#" inside a path segment', function (done) {
    const router = new Router()
    router.get('/p/:value', show('p'))
    expectJson(
      createServer(router),
      '/p/a%23b',
      { tag: 'p', url: '/p/a%23b', originalUrl: '/p/a%23b', baseUrl: '', params: { value: 'a#b' } },
      done
    )
  })

  it('keeps "%23" in the path and drops a real fragment after it', function (done) {
    const router = new Router()
    router.get('/p/:value', show('p'))
    expectJson(
      createServer(router),
      '/p/a%23b#c',
      { tag: 'p', url: '/p/a%23b', originalUrl: '/p/a%23b', baseUrl: '', params: { value: 'a#b' } },
      done
    )
  })

  it('gives a mounted router the path without the fragment', function (done) {
    const router = new Router()
    const inner = new Router()
    inner.get('/x', show('inner'))
    router.use('/m', inner)
    expectJson(
      createServer(router),
      '/m/x#frag',
      { tag: 'inner', url: '/x', originalUrl: '/m/x', baseUrl: '/m', params: {} },
      done
    )
  })

  it('drops the fragment from an absolute-form target', function (done) {
    const router = new Router()
    router.get('/a', show('a'))
    expectJson(
      createServer(router),
      'http://example.com/a#b',
      { tag: 'a', url: 'http://example.com/a', originalUrl: 'http://example.com/a', baseUrl: '', params: {} },
      done
    )
  })

  it('cleans only the incoming target: a req.url the app rewrites later is left as set', function (done) {
    const router = new Router()
    router.use(function (req, res, next) {
      req.url = '/later#kept'
      next()
    })
    const inner = new Router()
    inner.use(function (req, res) {
      res.end(req.url)
    })
    router.use(inner)
    rawrequest(createServer(router)).get('/start').expect(200, '/later#kept', done)
  })
})
