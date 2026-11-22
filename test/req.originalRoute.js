'use strict'

// Not in Express 5.3.0 (expressjs/express#2501): req.originalRoute is the
// full path pattern of the route that matched, the pattern of every mount it
// is under followed by the route's own, joined the way req.baseUrl joins the
// mount paths. It is built when read, from what the router records while it
// routes (src/router/lib/original-route.ts).

var assert = require('node:assert')
var express = require('../')
var request = require('supertest')

// answers with req.originalRoute, or "undefined"
function send(req, res) {
  res.send(String(req.originalRoute))
}

function router(options) {
  return express.Router(options)
}

describe('req', function () {
  describe('.originalRoute', function () {
    it('should be the route path on an unmounted route', function (done) {
      var app = express()
      app.get('/users/:id', send)
      request(app).get('/users/7').expect(200, '/users/:id', done)
    })

    it('should join the mount path and the route path', function (done) {
      var app = express()
      var api = router()
      api.get('/users/:id', send)
      app.use('/api', api)
      request(app).get('/api/users/7').expect(200, '/api/users/:id', done)
    })

    it('should join routers nested several levels deep', function (done) {
      var app = express()
      var api = router()
      var v1 = router()
      var users = router()
      users.get('/:id', send)
      v1.use('/users', users)
      api.use('/v1', v1)
      app.use('/api', api)
      request(app).get('/api/v1/users/9').expect(200, '/api/v1/users/:id', done)
    })

    it('should drop the trailing slash of a mount path, as req.baseUrl does', function (done) {
      var app = express()
      var api = router()
      var v1 = router()
      v1.get('/items', send)
      api.use('/v1//', v1)
      app.use('/api/', api)
      request(app).get('/api/v1/items').expect(200, '/api/v1/items', done)
    })

    it('should add nothing for a router used without a path', function (done) {
      var app = express()
      var inner = router()
      inner.get('/ping', send)
      app.use(inner)
      request(app).get('/ping').expect(200, '/ping', done)
    })

    it('should keep the parameters and groups of every pattern', function (done) {
      var app = express()
      var tenant = router({ mergeParams: true })
      tenant.get('/files/*path', send)
      app.use('/t/:tenant{/:region}', tenant)
      request(app).get('/t/acme/eu/files/a/b.txt').expect(200, '/t/:tenant{/:region}/files/*path', done)
    })

    it('should keep a route path of "/" after the mount path', function (done) {
      var app = express()
      var api = router()
      api.get('/', send)
      app.use('/api', api)
      request(app).get('/api').expect(200, '/api/', done)
    })

    it('should be "/" for the root route', function (done) {
      var app = express()
      app.get('/', send)
      request(app).get('/').expect(200, '/', done)
    })

    describe('with path arrays', function () {
      it('should use the route path entry that matched', function (done) {
        var app = express()
        app.get(['/a', '/b/:id', '/c'], send)
        request(app).get('/b/1').expect(200, '/b/:id', done)
      })

      it('should use the first entry that matches, as the router does', function (done) {
        var app = express()
        app.get(['/x/:id', '/x/fixed'], send)
        request(app).get('/x/fixed').expect(200, '/x/:id', done)
      })

      it('should use the mount path entry that matched', function (done) {
        var app = express()
        var inner = router()
        inner.get(['/one', '/two/:n'], send)
        app.use(['/p', '/q/:id'], inner)

        request(app)
          .get('/q/1/two/2')
          .expect(200, '/q/:id/two/:n', function (err) {
            if (err) return done(err)
            request(app).get('/p/one').expect(200, '/p/one', done)
          })
      })

      it('should use the entry of a nested array that matched', function (done) {
        var app = express()
        var inner = router()
        inner.get(['/a', ['/n1', ['/n2/:z']]], send)
        app.use([['/m'], '/o'], inner)
        request(app).get('/m/n2/5').expect(200, '/m/n2/:z', done)
      })

      it('should use a string entry next to a RegExp entry', function (done) {
        var app = express()
        app.get([/^\/re$/, '/str/:id'], send)
        request(app).get('/str/1').expect(200, '/str/:id', done)
      })

      it('should be undefined when only an empty nested array matched', function (done) {
        var app = express()
        app.get(['/a', []], send)
        request(app).get('/').expect(200, 'undefined', done)
      })
    })

    describe('with RegExp paths', function () {
      it('should be undefined for a RegExp route', function (done) {
        var app = express()
        app.get(/^\/re\/(\d+)$/, send)
        request(app).get('/re/1').expect(200, 'undefined', done)
      })

      it('should be undefined under a RegExp mount', function (done) {
        var app = express()
        var inner = router()
        inner.get('/x', send)
        app.use(/^\/re/, inner)
        request(app).get('/re/x').expect(200, 'undefined', done)
      })

      it('should be undefined when the RegExp entry of an array matched', function (done) {
        var app = express()
        app.get([/^\/re$/, '/str'], send)
        request(app).get('/re').expect(200, 'undefined', done)
      })
    })

    describe('in middleware', function () {
      it('should be undefined before a route matched', function (done) {
        var app = express()
        var api = router()
        api.use('/users', send)
        app.use('/api', api)
        request(app).get('/api/users/1').expect(200, 'undefined', done)
      })

      it('should be available in router.param() callbacks of the route', function (done) {
        var app = express()
        var api = router()
        api.param('id', function (req, res, next) {
          res.set('X-Param', req.originalRoute)
          next()
        })
        api.get('/users/:id', send)
        app.use('/api', api)
        request(app).get('/api/users/1').expect('X-Param', '/api/users/:id').expect(200, '/api/users/:id', done)
      })

      it('should be readable after the response, for logging', function (done) {
        var app = express()
        var api = router()
        var seen
        app.use(function (req, res, next) {
          res.on('finish', function () {
            seen = req.originalRoute
          })
          next()
        })
        api.get('/users/:id', function (req, res) {
          res.end()
        })
        app.use('/api', api)

        request(app)
          .get('/api/users/1')
          .expect(200, function (err) {
            if (err) return done(err)
            assert.strictEqual(seen, '/api/users/:id')
            done()
          })
      })
    })

    describe('with route handlers', function () {
      it('should be set by router.route()', function (done) {
        var app = express()
        var shop = router()
        shop.route('/items/:id').get(send)
        app.use('/shop', shop)
        request(app).get('/shop/items/3').expect(200, '/shop/items/:id', done)
      })

      it('should be set by app.route()', function (done) {
        var app = express()
        app.route('/items/:id').all(send)
        request(app).post('/items/3').expect(200, '/items/:id', done)
      })

      it('should be set for a HEAD request to a GET route', function (done) {
        var app = express()
        var api = router()
        api.get('/users/:id', function (req, res) {
          res.set('X-Route', req.originalRoute).end()
        })
        app.use('/api', api)
        request(app).head('/api/users/1').expect('X-Route', '/api/users/:id').expect(200, done)
      })

      it('should be the route that is running when an earlier one called next()', function (done) {
        var app = express()
        var api = router()
        api.get('/users/:id', function (req, res, next) {
          res.set('X-First', req.originalRoute)
          next()
        })
        api.get('/users/:name', send)
        app.use('/api', api)
        request(app).get('/api/users/1').expect('X-First', '/api/users/:id').expect(200, '/api/users/:name', done)
      })

      it('should not keep the mount path of a router the request left', function (done) {
        var app = express()
        var api = router()
        api.use(function (req, res, next) {
          next()
        })
        app.use('/api', api)
        app.get('/api/users', send)
        request(app).get('/api/users').expect(200, '/api/users', done)
      })

      it('should not keep the mount path of a router whose route passed', function (done) {
        var app = express()
        var api = router()
        api.get('/x', function (req, res, next) {
          next()
        })
        app.use('/api', api)
        app.get('/api/x', send)
        request(app).get('/api/x').expect(200, '/api/x', done)
      })

      it('should be undefined when req.route is not the route the router matched', function (done) {
        var app = express()
        app.get('/users/:id', function (req, res) {
          req.route = undefined
          send(req, res)
        })
        request(app).get('/users/1').expect(200, 'undefined', done)
      })
    })

    describe('with sub-apps', function () {
      it('should join the sub-app mount path', function (done) {
        var app = express()
        var blog = express()
        blog.get('/post/:slug', send)
        app.use('/blog', blog)
        request(app).get('/blog/post/hi').expect(200, '/blog/post/:slug', done)
      })

      it('should join sub-apps and routers nested in each other', function (done) {
        var app = express()
        var admin = express()
        var blog = express()
        var posts = router()
        posts.get('/:id', send)
        blog.use('/posts', posts)
        admin.use('/blog', blog)
        app.use('/admin', admin)
        request(app).get('/admin/blog/posts/2').expect(200, '/admin/blog/posts/:id', done)
      })

      it('should not keep the mount path of a sub-app the request left', function (done) {
        var app = express()
        var blog = express()
        blog.get('/other', send)
        app.use('/blog', blog)
        app.get('/blog/post', send)
        request(app).get('/blog/post').expect(200, '/blog/post', done)
      })
    })

    describe('with a strict router under a mount', function () {
      it('should end with the mount path for a "" route', function (done) {
        var app = express()
        var dir = router({ strict: true })
        dir.get('', send)
        dir.get('/', send)
        app.use('/dir', dir)

        request(app)
          .get('/dir')
          .expect(200, '/dir', function (err) {
            if (err) return done(err)
            request(app).get('/dir/').expect(200, '/dir/', done)
          })
      })

      it('should use the array entry the router matched', function (done) {
        var app = express()
        var dir = router({ strict: true })
        dir.get(['/y', ''], send)
        dir.get(['/z', '/'], send)
        app.use('/dir', dir)

        request(app)
          .get('/dir')
          .expect(200, '/dir', function (err) {
            if (err) return done(err)
            request(app).get('/dir/').expect(200, '/dir/', done)
          })
      })

      it('should fall back to the path when no entry matches ""', function (done) {
        var app = express()
        var dir = router({ strict: true })
        dir.get(['/y', '/'], send)
        app.use('/dir', dir)
        request(app).get('/dir').expect(200, '/dir/', done)
      })
    })

    describe('in error handlers', function () {
      it('should be the route that failed', function (done) {
        var app = express()
        var api = router()
        api.get('/boom/:id', function () {
          throw new Error('boom')
        })
        app.use('/api', api)
        app.use(function (err, req, res, next) {
          res.status(500).send(err.message + ' ' + req.originalRoute)
        })
        request(app).get('/api/boom/1').expect(500, 'boom /api/boom/:id', done)
      })

      it('should be the route that failed, in an error handler of its router', function (done) {
        var app = express()
        var api = router()
        api.get('/boom/:id', function (req, res, next) {
          next(new Error('boom'))
        })
        api.use(function (err, req, res, next) {
          res.status(500).send(String(req.originalRoute))
        })
        app.use('/api', api)
        request(app).get('/api/boom/1').expect(500, '/api/boom/:id', done)
      })

      it('should be undefined when the error came before any route', function (done) {
        var app = express()
        app.use('/api', function (req, res, next) {
          next(new Error('boom'))
        })
        app.use(function (err, req, res, next) {
          res.status(500).send(String(req.originalRoute))
        })
        request(app).get('/api/x').expect(500, 'undefined', done)
      })
    })

    describe('in 404 handlers', function () {
      it('should be undefined when no route matched', function (done) {
        var app = express()
        var api = router()
        api.get('/users', send)
        app.use('/api', api)
        app.use(function (req, res) {
          res.status(404).send(String(req.originalRoute))
        })
        request(app).get('/api/nope').expect(404, 'undefined', done)
      })

      it('should be the last route that passed the request on, like req.route', function (done) {
        var app = express()
        var api = router()
        api.get('/users/:id', function (req, res, next) {
          next()
        })
        app.use('/api', api)
        app.use(function (req, res) {
          res.status(404).send(req.originalRoute + ' ' + req.route.path)
        })
        request(app).get('/api/users/1').expect(404, '/api/users/:id /users/:id', done)
      })
    })

    it('should not be an enumerable property of the request prototype', function () {
      var descriptor = Object.getOwnPropertyDescriptor(express.request, 'originalRoute')
      assert.strictEqual(typeof descriptor.get, 'function')
      assert.strictEqual(descriptor.enumerable, false)
      assert.strictEqual(Object.keys(express.request).indexOf('originalRoute'), -1)
    })
  })
})
