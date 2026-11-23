'use strict'

// Not from upstream. The explicit error-handler API (expressjs/express#2896,
// pillarjs/router#59): app.error() and router.error() register functions that
// run only for an error, whatever their length, while app.use() with a
// function of length 4 keeps working as before.

var assert = require('node:assert')
var express = require('..')
var request = require('supertest')

function fail(req, res, next) {
  next(new Error('boom'))
}

function ok(req, res) {
  res.send('ok')
}

// An error handler written as usual, which answers with the error message.
function answer(err, req, res, next) {
  res.status(500).send('handled: ' + err.message)
}

// Handlers whose length is not 4, as wrappers, bind, default and rest
// parameters, compilers and minifiers make them. Each answers like `answer`.
var shapes = {
  'a wrapper (length 0)': function () {
    return function wrapped() {
      return answer.apply(this, arguments)
    }
  },
  'an arrow with rest parameters (length 0)': function () {
    return (...args) => answer(...args)
  },
  'a rest parameter after err (length 1)': function () {
    return function (err, ...rest) {
      rest[1].status(500).send('handled: ' + err.message)
    }
  },
  'a default parameter (length 3)': function () {
    return function (err, req, res, next = undefined) {
      res.status(500).send('handled: ' + err.message)
    }
  },
  'three parameters, no next (length 3)': function () {
    return function (err, req, res) {
      res.status(500).send('handled: ' + err.message)
    }
  },
  'a bound function with one argument bound (length 3)': function () {
    return function (prefix, err, req, res, next) {
      res.status(500).send(prefix + err.message)
    }.bind(null, 'handled: ')
  },
  'an async function (length 3)': function () {
    return async function (err, req, res) {
      await null
      res.status(500).send('handled: ' + err.message)
    }
  }
}

describe('app.error()', function () {
  Object.keys(shapes).forEach(function (shape) {
    describe('with ' + shape, function () {
      it('runs for an error', function (done) {
        var app = express()
        app.get('/', fail)
        app.error(shapes[shape]())
        request(app).get('/').expect(500, 'handled: boom', done)
      })

      it('never runs without an error', function (done) {
        var app = express()
        var calls = 0
        var handler = shapes[shape]()
        app.error(function () {
          calls++
          return handler.apply(this, arguments)
        })
        app.get('/', ok)
        request(app)
          .get('/')
          .expect(200, 'ok', function (err) {
            if (err) return done(err)
            assert.strictEqual(calls, 0)
            done()
          })
      })
    })
  })

  it('fixes what app.use() does with a handler whose length is not 4', function (done) {
    // With app.use(), the default parameter makes it a request handler: it
    // runs without an error, and the error passes it by.
    var handler = shapes['a default parameter (length 3)']()
    var app = express()
    app.use(function (req, res, next) {
      if (req.query.fail) return next(new Error('boom'))
      next()
    })
    app.use(handler)
    app.get('/', ok)

    request(app)
      .get('/?fail=1')
      .expect(500, /Error: boom/, function (err) {
        if (err) return done(err)
        var fixed = express()
        fixed.get('/', fail)
        fixed.error(handler)
        request(fixed).get('/').expect(500, 'handled: boom', done)
      })
  })

  it('calls the handler with (err, req, res, next), and this undefined', function (done) {
    var app = express()
    app.get('/', fail)
    app.error(function () {
      'use strict'
      var args = arguments
      arguments[2].json({
        length: args.length,
        err: args[0].message,
        req: args[1] === args[2].req,
        next: typeof args[3],
        self: this === undefined
      })
    })
    request(app).get('/').expect(200, { length: 4, err: 'boom', req: true, next: 'function', self: true }, done)
  })

  it('handles an error thrown by a handler', function (done) {
    var app = express()
    app.get('/', function () {
      throw new Error('thrown')
    })
    app.error(function (err, req, res) {
      res.send(err.message)
    })
    request(app).get('/').expect(200, 'thrown', done)
  })

  it('handles a rejected promise', function (done) {
    var app = express()
    app.get('/', async function () {
      throw new Error('rejected')
    })
    app.error(function (err, req, res) {
      res.send(err.message)
    })
    request(app).get('/').expect(200, 'rejected', done)
  })

  it('handles an error from a parser before the routes', function (done) {
    var app = express()
    app.use(express.json())
    app.post('/', ok)
    app.error(function (err, req, res) {
      res.status(err.status).send(err.type)
    })
    request(app)
      .post('/')
      .set('Content-Type', 'application/json')
      .send('{"broken"')
      .expect(400, 'entity.parse.failed', done)
  })

  it('takes several handlers and nested arrays, in order', function (done) {
    var app = express()
    var seen = []
    function step(name) {
      return function (err, req, res, next) {
        seen.push(name)
        next(err)
      }
    }
    app.get('/', fail)
    app.error(step('a'), [step('b'), [step('c')]], function (err, req, res) {
      res.send(seen.join(','))
    })
    request(app).get('/').expect(200, 'a,b,c', done)
  })

  it('returns the app, for chaining', function () {
    var app = express()
    assert.strictEqual(app.error(answer), app)
  })

  describe('with a path', function () {
    it('runs for an error under the path, with the path trimmed as use() trims it', function (done) {
      var app = express()
      app.get('/api/users', fail)
      app.error('/api', function (err, req, res) {
        res.send([req.baseUrl, req.url, req.originalUrl, err.message].join(' '))
      })
      request(app).get('/api/users').expect(200, '/api /users /api/users boom', done)
    })

    it('does not run for an error elsewhere', function (done) {
      var app = express()
      app.get('/web', fail)
      app.error('/api', answer)
      request(app)
        .get('/web')
        .expect(500, /Error: boom/, done)
    })

    it('takes path parameters, arrays and RegExps, as use() does', function (done) {
      var app = express()
      app.get('/users/:id/edit', fail)
      app.get('/a/x', fail)
      app.get('/b/x', fail)
      app.get('/re/x', fail)
      app.error('/users/:id', function (err, req, res) {
        res.send('user ' + req.params.id)
      })
      app.error(['/a', '/b'], function (err, req, res) {
        res.send('array ' + req.baseUrl)
      })
      app.error(/^\/re/, function (err, req, res) {
        res.send('regexp ' + req.baseUrl)
      })
      request(app)
        .get('/users/7/edit')
        .expect(200, 'user 7', function (err) {
          if (err) return done(err)
          request(app)
            .get('/b/x')
            .expect(200, 'array /b', function (err) {
              if (err) return done(err)
              request(app).get('/re/x').expect(200, 'regexp /re', done)
            })
        })
    })
  })

  describe('next()', function () {
    it('next(err) goes to the next error handler, registered either way', function (done) {
      var app = express()
      app.get('/', fail)
      app.error(function (err, req, res, next) {
        err.message += ' first'
        next(err)
      })
      app.use(function (err, req, res, next) {
        err.message += ' second'
        next(err)
      })
      app.error(function (err, req, res) {
        res.send(err.message + ' third')
      })
      request(app).get('/').expect(200, 'boom first second third', done)
    })

    it('next() leaves error handling, and the request handlers after it run', function (done) {
      var app = express()
      app.use(fail)
      app.error(function (err, req, res, next) {
        req.recovered = err.message
        next()
      })
      app.error(answer)
      app.get('/', function (req, res) {
        res.send('recovered from ' + req.recovered)
      })
      request(app).get('/').expect(200, 'recovered from boom', done)
    })

    it('an error thrown in it goes to the next error handler', function (done) {
      var app = express()
      app.get('/', fail)
      app.error(function () {
        throw new Error('again')
      })
      app.error(function (err, req, res) {
        res.send(err.message)
      })
      request(app).get('/').expect(200, 'again', done)
    })

    it('a promise rejected without a reason gives EXPRESS_ERR_REJECTED_PROMISE', function (done) {
      var app = express()
      app.get('/', fail)
      app.error(function () {
        return Promise.reject()
      })
      app.error(function (err, req, res) {
        res.send(err.code)
      })
      request(app).get('/').expect(200, 'EXPRESS_ERR_REJECTED_PROMISE', done)
    })
  })

  describe('order', function () {
    it('runs in stack order with use(): an error skips the error handlers before it', function (done) {
      var app = express()
      var seen = []
      app.error(function (err, req, res, next) {
        seen.push('before')
        next(err)
      })
      app.use(fail)
      app.error(function (err, req, res) {
        seen.push('after')
        res.send(seen.join(','))
      })
      request(app).get('/').expect(200, 'after', done)
    })

    it('skips the request handlers between the error and the next error handler', function (done) {
      var app = express()
      var seen = []
      app.use(fail)
      app.use(function (req, res, next) {
        seen.push('skipped')
        next()
      })
      app.get('/', function (req, res) {
        seen.push('skipped')
        res.send('route')
      })
      app.error(function (err, req, res) {
        res.send('handled ' + seen.length)
      })
      request(app).get('/').expect(200, 'handled 0', done)
    })
  })

  describe('handlers of length 4', function () {
    it('still work with app.use(), unchanged', function (done) {
      var app = express()
      var calls = 0
      app.use(function (err, req, res, next) {
        calls++
        next(err)
      })
      app.get('/', fail)
      app.use(answer)
      request(app)
        .get('/')
        .expect(500, 'handled: boom', function (err) {
          if (err) return done(err)
          assert.strictEqual(calls, 0)
          done()
        })
    })

    it('run once with app.error()', function (done) {
      var app = express()
      var calls = 0
      app.get('/', fail)
      app.error(function (err, req, res, next) {
        calls++
        next(err)
      })
      app.error(answer)
      request(app)
        .get('/')
        .expect(500, 'handled: boom', function (err) {
          if (err) return done(err)
          assert.strictEqual(calls, 1)
          done()
        })
    })

    it('inline in a route, still work', function (done) {
      var app = express()
      app.get('/', fail, answer)
      request(app).get('/').expect(500, 'handled: boom', done)
    })
  })

  describe('in sub-apps and routers', function () {
    it("a sub-app's error() handles its own errors", function (done) {
      var app = express()
      var sub = express()
      sub.get('/x', fail)
      sub.error(function (err, req, res) {
        res.send('sub ' + req.baseUrl)
      })
      app.use('/sub', sub)
      app.error(answer)
      request(app).get('/sub/x').expect(200, 'sub /sub', done)
    })

    it("an error a sub-app doesn't handle goes to the parent's error()", function (done) {
      var app = express()
      var sub = express()
      sub.get('/x', fail)
      app.use('/sub', sub)
      app.error(function (err, req, res) {
        res.send('parent ' + req.app.get('name') + ' ' + err.message)
      })
      app.set('name', 'app')
      request(app).get('/sub/x').expect(200, 'parent app boom', done)
    })

    it('a nested router passes errors out through each router.error()', function (done) {
      var app = express()
      var outer = express.Router()
      var inner = express.Router()
      inner.get('/x', fail)
      inner.error(function (err, req, res, next) {
        err.message += ' inner:' + req.baseUrl
        next(err)
      })
      outer.use('/inner', inner)
      outer.error(function (err, req, res, next) {
        err.message += ' outer:' + req.baseUrl
        next(err)
      })
      app.use('/outer', outer)
      app.error(function (err, req, res) {
        res.send(err.message)
      })
      request(app).get('/outer/inner/x').expect(200, 'boom inner:/outer/inner outer:/outer', done)
    })

    it("router.error() doesn't run for an error from outside the router", function (done) {
      var app = express()
      var router = express.Router()
      router.error(function (err, req, res) {
        res.send('router')
      })
      app.use(fail)
      app.use(router)
      app.error(function (err, req, res) {
        res.send('app')
      })
      request(app).get('/').expect(200, 'app', done)
    })

    it('router.error() returns the router', function () {
      var router = express.Router()
      assert.strictEqual(router.error(answer), router)
    })
  })

  describe('arguments', function () {
    it('throws EXPRESS_ERR_HANDLER_REQUIRED without a handler', function () {
      assert.throws(() => express().error(), { name: 'TypeError', code: 'EXPRESS_ERR_HANDLER_REQUIRED' })
      assert.throws(() => express().error('/x'), { code: 'EXPRESS_ERR_HANDLER_REQUIRED' })
      assert.throws(() => express().error([]), { code: 'EXPRESS_ERR_HANDLER_REQUIRED' })
      assert.throws(() => express.Router().error(), {
        message: 'argument handler is required',
        code: 'EXPRESS_ERR_HANDLER_REQUIRED'
      })
    })

    it('throws EXPRESS_ERR_HANDLER_NOT_FUNCTION for a handler that is not a function, as use() does', function () {
      assert.throws(() => express().error('/x', 42), {
        name: 'TypeError',
        message: 'argument handler must be a function',
        code: 'EXPRESS_ERR_HANDLER_NOT_FUNCTION'
      })
      assert.throws(() => express.Router().error(answer, [{}]), { code: 'EXPRESS_ERR_HANDLER_NOT_FUNCTION' })
    })

    it('throws EXPRESS_ERR_ERROR_HANDLER_IS_ROUTER for a router or an app, and adds none of the handlers', function () {
      var app = express()
      var router = express.Router()
      var expected = {
        name: 'TypeError',
        message: 'argument handler must be an error handler, not a router or an app',
        code: 'EXPRESS_ERR_ERROR_HANDLER_IS_ROUTER'
      }
      app.use(ok)
      var before = app.router.stack.length
      assert.throws(() => app.error(answer, express.Router()), expected)
      assert.throws(() => app.error('/sub', express()), expected)
      assert.strictEqual(app.router.stack.length, before)
      assert.throws(() => router.error(express.Router()), expected)
      assert.strictEqual(router.stack.length, 0)
    })
  })

  describe('the layers', function () {
    it('are marked errorOnly, and other layers read false from the prototype', function () {
      var app = express()
      app.use(ok)
      app.use(answer)
      app.error(answer)
      app.get('/x', ok, answer)
      var stack = app.router.stack
      assert.deepStrictEqual(
        stack.map((layer) => layer.errorOnly),
        [false, false, true, false]
      )
      assert.deepStrictEqual(
        stack[3].route.stack.map((layer) => layer.errorOnly),
        [false, false]
      )
      assert.ok(!Object.hasOwn(stack[0], 'errorOnly'))
      assert.ok(Object.hasOwn(stack[2], 'errorOnly'))
    })

    it('keep the handler as layer.handle and its name as layer.name', function () {
      var app = express()
      app.error(answer)
      var layer = app.router.stack[0]
      assert.strictEqual(layer.handle, answer)
      assert.strictEqual(layer.name, 'answer')
    })
  })

  describe('an app that defines app.error itself', function () {
    it('keeps its own app.error, and error handlers of length 4 still work', function (done) {
      var app = express()
      var logged = []
      app.error = function (message) {
        logged.push(message)
      }
      app.error('starting')
      app.get('/', fail)
      app.use(answer)
      request(app)
        .get('/')
        .expect(500, 'handled: boom', function (err) {
          if (err) return done(err)
          assert.deepStrictEqual(logged, ['starting'])
          done()
        })
    })

    it('is an own method of each app, not of express.application, whose own properties stay those of 5.3.0', function () {
      var app = express()
      assert.ok(Object.hasOwn(app, 'error'))
      assert.strictEqual(app.error.name, 'error')
      assert.ok(!Object.hasOwn(express.application, 'error'))
      assert.strictEqual(express().error, app.error)
    })

    it('gets an error method patched onto express.application instead of its own', function () {
      var patched = function () {
        return 'patched'
      }
      express.application.error = patched
      try {
        assert.strictEqual(express().error(), 'patched')
      } finally {
        delete express.application.error
      }
      assert.notStrictEqual(express().error, patched)
    })
  })
})
