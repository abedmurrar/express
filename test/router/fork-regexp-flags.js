'use strict'

// Not from upstream. A RegExp path with the g or y flag keeps state in
// lastIndex between exec calls, so router 2.2.0 matched it on only every other
// request (an auth guard like router.use(/^\/admin/g, auth) was skipped on
// the second request, the fourth, and so on). Our layer starts every match at
// index 0 (src/router/lib/layer.ts, regexpMatcher).

const Router = require('../../lib/router')
const utils = require('./support/utils')

const assert = utils.assert
const createServer = utils.createServer
const request = utils.request

function hits(router, path, times, cb) {
  const server = createServer(router)
  const out = []
  ;(function next(i) {
    if (i === times) return cb(null, out)
    request(server)
      .get(path)
      .end(function (err, res) {
        if (err) return cb(err)
        out.push(res.status + ' ' + res.text)
        next(i + 1)
      })
  })(0)
}

describe('Router with a stateful RegExp path (g or y flag)', function () {
  ;['g', 'y', 'gi', 'iy', 'gy'].forEach(function (flags) {
    it('matches on every request with the ' + flags + ' flag(s)', function (done) {
      const router = new Router()
      router.get(new RegExp('^/item/(\\d+)$', flags), function (req, res) {
        res.end('item ' + req.params[0])
      })
      hits(router, '/item/42', 4, function (err, out) {
        if (err) return done(err)
        assert.deepStrictEqual(out, Array(4).fill('200 item 42'))
        done()
      })
    })
  })

  it('gives the same named params on every request', function (done) {
    const router = new Router()
    router.get(/^\/u\/(?<user>[^/]+)\/(?<tab>[^/]+)$/g, function (req, res) {
      res.end(req.params.user + ':' + req.params.tab)
    })
    hits(router, '/u/tobi/posts', 3, function (err, out) {
      if (err) return done(err)
      assert.deepStrictEqual(out, Array(3).fill('200 tobi:posts'))
      done()
    })
  })

  it('matches inside a path array on every request', function (done) {
    const router = new Router()
    router.get(['/plain', /^\/re$/g], function (req, res) {
      res.end('ok')
    })
    hits(router, '/re', 4, function (err, out) {
      if (err) return done(err)
      assert.deepStrictEqual(out, Array(4).fill('200 ok'))
      done()
    })
  })

  it('matches through router.route(regexp) on every request', function (done) {
    const router = new Router()
    router.route(/^\/r$/y).get(function (req, res) {
      res.end('route')
    })
    hits(router, '/r', 4, function (err, out) {
      if (err) return done(err)
      assert.deepStrictEqual(out, Array(4).fill('200 route'))
      done()
    })
  })

  it('ignores a lastIndex the app left on the RegExp', function (done) {
    const re = /^\/admin/g
    re.lastIndex = 3
    const router = new Router()
    router.use(re, function (req, res) {
      res.statusCode = 401
      res.end('denied')
    })
    hits(router, '/admin/secret', 2, function (err, out) {
      if (err) return done(err)
      assert.deepStrictEqual(out, Array(2).fill('401 denied'))
      done()
    })
  })

  it('keeps the y flag anchored at the start', function (done) {
    const router = new Router()
    router.use(/admin/y, function (req, res) {
      res.end('guarded')
    })
    router.use(function (req, res) {
      res.statusCode = 404
      res.end('not guarded')
    })
    hits(router, '/x/admin', 3, function (err, out) {
      if (err) return done(err)
      // '/x/admin' doesn't start with 'admin', so y never matches it
      assert.deepStrictEqual(out, Array(3).fill('404 not guarded'))
      done()
    })
  })

  it('still matches a RegExp without g or y as before', function (done) {
    const router = new Router()
    router.get(/^\/plain\/(\w+)$/i, function (req, res) {
      res.end(req.params[0])
    })
    hits(router, '/PLAIN/abc', 3, function (err, out) {
      if (err) return done(err)
      assert.deepStrictEqual(out, Array(3).fill('200 abc'))
      done()
    })
  })
})
