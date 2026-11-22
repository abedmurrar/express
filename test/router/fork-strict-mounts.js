'use strict'

// Not from upstream (router 2.2.0 and 2.3.0 behave as before). A mount path
// that takes the whole pathname leaves req.url empty, and the router puts a
// "/" there, so a strict router mounted at "/dir" saw "/" for both "/dir" and
// "/dir/", and its get('') could never match (expressjs/express#3798). A
// strict router now tries each route on "" first for that added "/", so
// get('') answers "/dir" only. req.url is still "/" (it is never empty), a
// route for "/" still answers both (expressjs/express#2281 plans an opt-in
// for that), middleware matches as before, and routers that are not strict
// route as before.

const Router = require('../../lib/router')
const utils = require('./support/utils')

const createServer = utils.createServer
const rawrequest = utils.rawrequest

function echo(tag) {
  return function (req, res) {
    res.end(tag + ' ' + req.baseUrl + ' ' + req.url)
  }
}

// A strict router with a route for "" and then one for "/".
function strictRouter(options) {
  const router = new Router(Object.assign({ strict: true }, options))
  router.get('', echo('empty'))
  router.get('/', echo('slash'))
  return router
}

// An outer router with `mount` mounted at `path`, and a fallback.
function app(path, mount) {
  const router = new Router()
  router.use(path, mount)
  router.use(echo('outer'))
  return createServer(router)
}

function expectAll(server, cases, done) {
  ;(function next(i) {
    if (i === cases.length) return done()
    rawrequest(server)
      .get(cases[i][0])
      .expect(200, cases[i][1], function (err) {
        if (err) return done(err)
        next(i + 1)
      })
  })(0)
}

describe('Strict router mounted at a path', function () {
  it('routes "/dir" to get("") and "/dir/" to get("/")', function (done) {
    expectAll(
      app('/dir', strictRouter()),
      [
        ['/dir', 'empty /dir /'],
        ['/dir/', 'slash /dir /'],
        ['/dir?x=1', 'empty /dir /?x=1'],
        ['/dir/?x=1', 'slash /dir /?x=1'],
        ['/dir//', 'outer  /dir//']
      ],
      done
    )
  })

  it('a get("") alone answers "/dir" and not "/dir/"', function (done) {
    const router = new Router({ strict: true })
    router.get('', echo('empty'))
    expectAll(
      app('/dir', router),
      [
        ['/dir', 'empty /dir /'],
        ['/dir/', 'outer  /dir/']
      ],
      done
    )
  })

  it('a get("/") still answers "/dir" and "/dir/" (#2281 is a planned opt-in)', function (done) {
    const router = new Router({ strict: true })
    router.get('/', echo('slash'))
    router.get('', echo('empty'))
    expectAll(
      app('/dir', router),
      [
        ['/dir', 'slash /dir /'],
        ['/dir/', 'slash /dir /']
      ],
      done
    )
  })

  it('matches middleware as before', function (done) {
    const router = new Router({ strict: true })
    router.use(function (req, res, next) {
      res.setHeader('X-Mw', req.url)
      next()
    })
    router.use('/x', echo('x'))
    router.use(/^$/, echo('middleware for ""'))
    router.get('', function (req, res) {
      res.end('empty ' + res.getHeader('X-Mw'))
    })
    expectAll(
      app('/dir', router),
      [
        ['/dir', 'empty /'],
        ['/dir/x', 'x /dir/x /']
      ],
      done
    )
  })

  it('a mount path with a trailing slash routes the same', function (done) {
    expectAll(
      app('/dir/', strictRouter()),
      [
        ['/dir', 'empty /dir /'],
        ['/dir/', 'slash /dir /'],
        ['/dir/?x=1', 'slash /dir /?x=1']
      ],
      done
    )
  })

  it('routes a path array mount and a RegExp mount the same', function (done) {
    expectAll(
      app(['/a', '/b'], strictRouter()),
      [
        ['/a', 'empty /a /'],
        ['/b/', 'slash /b /']
      ],
      function (err) {
        if (err) return done(err)
        expectAll(
          app(/^\/re/, strictRouter()),
          [
            ['/re', 'empty /re /'],
            ['/re/', 'slash /re /']
          ],
          done
        )
      }
    )
  })

  it('works through nested routers, strict or not', function (done) {
    const outer = new Router()
    const middle = new Router({ strict: true })
    middle.use('/b', strictRouter())
    middle.get('', echo('middle empty'))
    outer.use('/a', middle)
    outer.use(echo('outer'))
    expectAll(
      createServer(outer),
      [
        ['/a/b', 'empty /a/b /'],
        ['/a/b/', 'slash /a/b /'],
        ['/a', 'middle empty /a /'],
        ['/a/', 'outer  /a/']
      ],
      done
    )
  })

  it('reaches a strict router mounted at "/" below the mount', function (done) {
    const middle = new Router()
    middle.use(strictRouter())
    expectAll(
      app('/dir', middle),
      [
        ['/dir', 'empty /dir /'],
        ['/dir/', 'slash /dir /']
      ],
      done
    )
  })

  it('keeps params from a parameterised mount', function (done) {
    const router = new Router({ strict: true, mergeParams: true })
    router.get('', function (req, res) {
      res.end('empty ' + req.params.id)
    })
    router.get('/', function (req, res) {
      res.end('slash ' + req.params.id)
    })
    expectAll(
      app('/:id', router),
      [
        ['/42', 'empty 42'],
        ['/42/', 'slash 42']
      ],
      done
    )
  })

  it('sets req.url, req.baseUrl and req.originalUrl as before', function (done) {
    const router = new Router({ strict: true })
    router.get('', function (req, res) {
      res.end([req.url, req.baseUrl, req.originalUrl].join(' '))
    })
    expectAll(app('/dir', router), [['/dir?q=1', '/?q=1 /dir /dir?q=1']], done)
  })

  it('routes a rewritten req.url as it reads', function (done) {
    const router = new Router({ strict: true })
    router.use(function (req, res, next) {
      req.url = '/?rewritten'
      next()
    })
    router.get('', echo('empty'))
    router.get('/', echo('slash'))
    expectAll(app('/dir', router), [['/dir', 'slash /dir /?rewritten']], done)
  })

  it('forgets the added slash once the mount is done', function (done) {
    const outer = new Router()
    const first = new Router({ strict: true })
    first.get('/x', echo('x'))
    outer.use('/dir', first)
    outer.use(function (req, res, next) {
      req.url = '/'
      next()
    })
    outer.use(strictRouter())
    expectAll(createServer(outer), [['/dir', 'slash  /']], done)
  })

  it('keeps the added slash through a mount below it that strips a "/"', function (done) {
    const middle = new Router()
    middle.use(/^\//, function (req, res, next) {
      next()
    })
    const last = new Router({ strict: true })
    last.get('', echo('empty'))
    middle.use(last)
    expectAll(app('/dir', middle), [['/dir', 'empty /dir /']], done)
  })

  it('passes errors to error handlers in the strict router and after it', function (done) {
    const outer = new Router()
    const router = new Router({ strict: true })
    router.get('', function (req, res, next) {
      next(new Error('boom'))
    })
    router.use(function (err, req, res, next) {
      next(new Error(err.message + ' inner ' + req.url))
    })
    outer.use('/dir', router)
    outer.use(function (err, req, res, next) {
      res.end(err.message + ' outer ' + req.url)
    })
    expectAll(createServer(outer), [['/dir', 'boom inner / outer /dir']], done)
  })

  it('does not change routers that are not strict', function (done) {
    const router = new Router()
    router.get(/^$/, echo('only ""'))
    router.get('/', echo('slash'))
    router.get('', echo('empty'))
    expectAll(
      app('/dir', router),
      [
        ['/dir', 'slash /dir /'],
        ['/dir/', 'slash /dir /']
      ],
      done
    )
  })
})
