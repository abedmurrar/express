'use strict'

// Ported with upstream's proposed fix, pillarjs/router#190 (not in router
// 2.2.0 or 2.3.0). loosen() trimmed every trailing slash, so a path made only
// of slashes ("//", "///") became "", which matches every request: a router
// mounted at "//" answered "/" and "/secret" (expressjs/express#4557). Such a
// path now keeps its slashes, and matches like path-to-regexp's own "//".

const Router = require('../../lib/router')
const utils = require('./support/utils')

const createServer = utils.createServer
const rawrequest = utils.rawrequest

function echo(tag) {
  return function (req, res) {
    res.end(tag + ' ' + req.baseUrl + ' ' + req.url)
  }
}

// An outer router with `mount` mounted at `path`, and a fallback.
function app(path, mount) {
  const router = new Router()
  router.use(path, mount)
  router.use(echo('outer'))
  return createServer(router)
}

function inner() {
  const router = new Router()
  router.get('/', echo('inner root'))
  router.get('/secret', echo('inner secret'))
  return router
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

describe('Router with a mount path made only of slashes', function () {
  it('a router at "//" does not answer "/" or "/secret"', function (done) {
    expectAll(
      app('//', inner()),
      [
        ['/', 'outer  /'],
        ['/secret', 'outer  /secret'],
        ['/other', 'outer  /other']
      ],
      done
    )
  })

  it('a router at "//" answers "//" and paths under "//" + "/"', function (done) {
    // baseUrl keeps upstream's trim of one trailing slash
    expectAll(
      app('//', inner()),
      [
        ['//', 'inner root / /'],
        ['///secret', 'inner secret / /secret'],
        ['//?q=1', 'inner root / /?q=1']
      ],
      done
    )
  })

  it('"//secret" does not reach a router at "//" (no segment break after "//")', function (done) {
    expectAll(app('//', inner()), [['//secret', 'outer  //secret']], done)
  })

  it('a router at "///" answers neither "/" nor "//"', function (done) {
    expectAll(
      app('///', inner()),
      [
        ['/', 'outer  /'],
        ['//', 'outer  //'],
        ['/secret', 'outer  /secret'],
        ['///', 'inner root // /']
      ],
      done
    )
  })

  it('a router at "//x" answers "//x" and below, and nothing else (unchanged)', function (done) {
    expectAll(
      app('//x', inner()),
      [
        ['//x', 'inner root //x /'],
        ['//x/secret', 'inner secret //x /secret'],
        ['/x', 'outer  /x'],
        ['//xy', 'outer  //xy'],
        ['/', 'outer  /']
      ],
      done
    )
  })

  it('a middleware at "//" does not run for "/"', function (done) {
    const router = new Router()
    router.use('//', echo('slashes'))
    router.use(echo('outer'))
    expectAll(
      createServer(router),
      [
        ['/', 'outer  /'],
        ['//', 'slashes / /']
      ],
      done
    )
  })

  it('a "//" in a path array does not match "/"', function (done) {
    expectAll(
      app(['//', '/a'], inner()),
      [
        ['/', 'outer  /'],
        ['/a/secret', 'inner secret /a /secret'],
        ['//', 'inner root / /']
      ],
      done
    )
  })

  it('a route at "//" does not answer "/"', function (done) {
    const router = new Router()
    router.get('//', echo('route'))
    router.use(echo('outer'))
    expectAll(
      createServer(router),
      [
        ['/', 'outer  /'],
        ['//', 'route  //'],
        ['///', 'route  ///']
      ],
      done
    )
  })

  it('trailing slashes after a segment are still trimmed ("/foo//" mounts at "/foo")', function (done) {
    expectAll(
      app('/foo//', inner()),
      [
        ['/foo', 'inner root /foo /'],
        ['/foo/secret', 'inner secret /foo /secret'],
        ['/', 'outer  /']
      ],
      done
    )
  })

  it('"/" and "" still match every path (unchanged)', function (done) {
    const router = new Router()
    router.use('/', function (req, res, next) {
      res.setHeader('x-slash', 'hit')
      next()
    })
    router.use('', echo('empty'))
    expectAll(
      createServer(router),
      [
        ['/', 'empty  /'],
        ['/a/b', 'empty  /a/b']
      ],
      done
    )
  })
})
