'use strict'

// Not from upstream (router 2.2.0 and 2.3.0 accept these; the open proposals,
// pillarjs/router#183 and #193, only warn). A router mounted at "/" on itself,
// directly or through other routers mounted at "/", sends every request it
// doesn't answer round forever, until the stack overflows
// (expressjs/express#6809). router.use() now throws a TypeError when the
// mount would close such a cycle. A cycle that passes through a mount at any
// other path consumes part of the path on each pass, so it ends, and it is
// still allowed.

const express = require('../../')
const Router = require('../../lib/router')
const utils = require('./support/utils')

const assert = utils.assert
const createServer = utils.createServer
const rawrequest = utils.rawrequest

function isCycleError(err) {
  return err instanceof TypeError && /on itself/.test(err.message)
}

describe('Router mounted on itself', function () {
  it('router.use(router) throws', function () {
    const router = new Router()
    assert.throws(function () {
      router.use(router)
    }, isCycleError)
  })

  it('router.use("/", router) throws', function () {
    const router = new Router()
    assert.throws(function () {
      router.use('/', router)
    }, isCycleError)
  })

  it('throws before the layer is added, and leaves the router working', function (done) {
    const router = new Router()
    router.get('/', function (req, res) {
      res.end('still here')
    })
    assert.throws(function () {
      router.use(router)
    }, isCycleError)
    assert.strictEqual(router.stack.length, 1)
    router.use(function (req, res) {
      res.end('fallback ' + req.url)
    })
    rawrequest(createServer(router)).get('/missing').expect(200, 'fallback /missing', done)
  })

  it('throws for a cycle through two routers', function () {
    const a = new Router()
    const b = new Router()
    a.use(b)
    assert.throws(function () {
      b.use(a)
    }, isCycleError)
    assert.strictEqual(b.stack.length, 0)
  })

  it('throws for a cycle through three routers, whichever mount closes it', function () {
    const x = new Router()
    const y = new Router()
    const z = new Router()
    x.use(y)
    z.use(x)
    assert.throws(function () {
      y.use(z)
    }, isCycleError)
  })

  it('throws when the router is in a list of handlers', function () {
    const router = new Router()
    const other = new Router()
    other.use(router)
    assert.throws(function () {
      router.use([
        function (req, res, next) {
          next()
        },
        other
      ])
    }, isCycleError)
  })

  it('throws for a cycle through app.use(router)', function () {
    const app = express()
    const a = express.Router()
    const b = express.Router()
    app.use(a)
    a.use(b)
    assert.throws(function () {
      b.use(a)
    }, isCycleError)
  })

  it('throws when app.use(router) closes a cycle through app.router', function () {
    const app = express()
    const router = express.Router()
    router.use(app.router)
    assert.throws(function () {
      app.use(router)
    }, isCycleError)
  })

  it('allows the same router at "/" in more than one place (no cycle)', function (done) {
    const shared = new Router()
    shared.use(function (req, res, next) {
      next()
    })
    shared.get('/s', function (req, res) {
      res.end('shared')
    })
    const a = new Router()
    const b = new Router()
    const top = new Router()
    a.use(shared)
    b.use(shared)
    top.use(a)
    top.use(b)
    // walks top, a, shared, then b, which leads to shared again
    const outer = new Router()
    outer.use(top)
    outer.use(shared)
    rawrequest(createServer(outer)).get('/s').expect(200, 'shared', done)
  })

  it('allows a router to mount itself at a path that consumes a segment', function (done) {
    const tree = new Router()
    tree.get('/', function (req, res) {
      res.end('leaf ' + req.baseUrl)
    })
    tree.use('/:node', tree)
    rawrequest(createServer(tree)).get('/a/b/c').expect(200, 'leaf /a/b/c', done)
  })

  it('allows a cycle that passes through a mount at another path', function (done) {
    const a = new Router()
    const b = new Router()
    const c = new Router()
    a.use(b)
    b.use('/x', c)
    c.use(a)
    a.get('/end', function (req, res) {
      res.end('end ' + req.baseUrl)
    })
    rawrequest(createServer(a)).get('/x/x/end').expect(200, 'end /x/x', done)
  })
})
