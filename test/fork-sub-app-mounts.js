'use strict'

// Not from upstream. Edge cases for two fork fixes to mounted sub-apps:
// router.use(subApp) gives the caller its req/res prototypes back, as
// app.use(subApp) does (#7427), and a sub-app with "strict routing" mounted
// at a path routes "/blog" to its "" route (#3798). The bug tests themselves are
// in test/regressions/request-and-routing.js.

var assert = require('node:assert')
var http = require('node:http')
var express = require('..')
var request = require('supertest')

// Responds with which app req and res belong to, by the name setting.
function report(req, res) {
  res.json({
    req: req.app.get('name'),
    res: res.app.get('name'),
    protos: [Object.getPrototypeOf(req) === req.app.request, Object.getPrototypeOf(res) === res.app.response]
  })
}

function named(name) {
  var app = express()
  app.set('name', name)
  return app
}

// A sub-app that passes every request on.
function passing(name) {
  var sub = named(name)
  sub.use(function (req, res, next) {
    next()
  })
  return sub
}

describe('router.use(subApp)', function () {
  it("gives the parent app's prototypes back after the sub-app calls next()", function (done) {
    var app = named('parent')
    var router = express.Router()
    router.use('/blog', passing('blog'))
    app.use(router)
    app.use(report)
    request(app)
      .get('/blog/post')
      .expect(200, { req: 'parent', res: 'parent', protos: [true, true] }, done)
  })

  it('reads the parent\'s "trust proxy" again', function (done) {
    var app = named('parent')
    app.set('trust proxy', true)
    var router = express.Router()
    router.use(passing('blog'))
    app.use(router)
    app.use(function (req, res) {
      res.send(req.ip)
    })
    request(app).get('/').set('X-Forwarded-For', '203.0.113.9').expect(200, '203.0.113.9', done)
  })

  it('gives them back after next(err), for the parent error handler', function (done) {
    var app = named('parent')
    var router = express.Router()
    var blog = named('blog')
    blog.use(function (req, res, next) {
      next(new Error('boom'))
    })
    router.use('/blog', blog)
    app.use(router)
    app.use(function (err, req, res, next) {
      res.status(500).send(err.message + ' ' + req.app.get('name') + ' ' + res.app.get('name'))
    })
    request(app).get('/blog').expect(500, 'boom parent parent', done)
  })

  it('keeps the parent request and response methods', function (done) {
    var app = named('parent')
    app.request.who = function () {
      return 'parent helper'
    }
    var router = express.Router()
    router.use(passing('blog'))
    app.use(router)
    app.use(function (req, res) {
      res.send(req.who())
    })
    request(app).get('/').expect(200, 'parent helper', done)
  })

  it('restores req.url, req.baseUrl and req.originalUrl as before', function (done) {
    var app = named('parent')
    var router = express.Router()
    router.use('/blog', passing('blog'))
    app.use('/site', router)
    app.use(function (req, res) {
      res.json([req.url, req.baseUrl, req.originalUrl])
    })
    request(app).get('/site/blog/post?x=1').expect(200, ['/site/blog/post?x=1', '', '/site/blog/post?x=1'], done)
  })

  it('gives each level its own app back through nested sub-apps', function (done) {
    var app = named('parent')
    var outer = express.Router()
    var blog = named('blog')
    var inner = express.Router()
    inner.use('/post', passing('post'))
    blog.use(inner)
    blog.use(function (req, res, next) {
      res.set('X-Blog-Sees', req.app.get('name') + ' ' + res.app.get('name'))
      next()
    })
    outer.use('/blog', blog)
    app.use(outer)
    app.use(report)
    request(app)
      .get('/blog/post')
      .expect('X-Blog-Sees', 'blog blog')
      .expect(200, { req: 'parent', res: 'parent', protos: [true, true] }, done)
  })

  it('sets the sub-app prototypes inside the sub-app', function (done) {
    var app = named('parent')
    var router = express.Router()
    var blog = named('blog')
    blog.get('/', report)
    router.use('/blog', blog)
    app.use(router)
    request(app)
      .get('/blog')
      .expect(200, { req: 'blog', res: 'blog', protos: [true, true] }, done)
  })

  it('works for a sub-app called as plain middleware', function (done) {
    var app = named('parent')
    var blog = passing('blog')
    app.use(function (req, res, next) {
      blog(req, res, next)
    })
    app.use(report)
    request(app)
      .get('/')
      .expect(200, { req: 'parent', res: 'parent', protos: [true, true] }, done)
  })

  it('keeps the sub-app prototypes for a caller that is not an Express app, as 5.3.0 does', function (done) {
    var blog = passing('blog')
    var router = express.Router()
    router.use(blog)
    router.use(function (req, res) {
      res.send('still ' + req.app.get('name'))
    })
    var server = http.createServer(function (req, res) {
      router(req, res, function (err) {
        res.statusCode = err ? 500 : 404
        res.end()
      })
    })
    request(server).get('/').expect(200, 'still blog', done)
  })

  it('leaves app.use(subApp) as it was', function (done) {
    var app = named('parent')
    var blog = named('blog')
    blog.use(function (req, res, next) {
      res.set('X-Inside', req.app.get('name'))
      next()
    })
    app.use('/blog', blog)
    app.use(report)
    request(app)
      .get('/blog')
      .expect('X-Inside', 'blog')
      .expect(200, { req: 'parent', res: 'parent', protos: [true, true] }, done)
  })

  it('does not restore when the app is the top-level handler', function (done) {
    var app = named('top')
    var seen
    app.use(function (req, res, next) {
      seen = Object.getPrototypeOf(req) === app.request
      next()
    })
    var server = http.createServer(app)
    request(server)
      .get('/')
      .expect(404, function (err) {
        if (err) return done(err)
        assert.strictEqual(seen, true)
        done()
      })
  })
})

describe('sub-app with "strict routing" mounted at a path', function () {
  function blogApp() {
    var blog = express()
    blog.enable('strict routing')
    blog.get('', function (req, res) {
      res.send('empty ' + req.baseUrl + ' ' + req.url)
    })
    blog.get('/', function (req, res) {
      res.send('slash ' + req.baseUrl + ' ' + req.url)
    })
    return blog
  }

  it('routes "/blog" to get("") and "/blog/" to get("/")', function (done) {
    var app = express()
    app.use('/blog', blogApp())
    request(app)
      .get('/blog')
      .expect(200, 'empty /blog /', function (err) {
        if (err) return done(err)
        request(app).get('/blog/').expect(200, 'slash /blog /', done)
      })
  })

  it('does the same through router.use()', function (done) {
    var app = express()
    var router = express.Router()
    router.use('/blog', blogApp())
    app.use(router)
    request(app)
      .get('/blog?x=1')
      .expect(200, 'empty /blog /?x=1', function (err) {
        if (err) return done(err)
        request(app).get('/blog/?x=1').expect(200, 'slash /blog /?x=1', done)
      })
  })
})
