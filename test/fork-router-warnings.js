'use strict'

// Not in Express 5.3.0: registration-time warnings on the `express:router`
// debug namespace (src/router/lib/warnings.ts), for a path no request can
// match (expressjs/express#2511) and for a route registered twice on the same
// router. They print only with DEBUG=express:router (or express:*), and are
// worked out only then, when the path or route is registered.

var assert = require('node:assert')
var util = require('node:util')
var debug = require('debug')
var express = require('../')
var request = require('supertest')

function noop(req, res) {
  res.end()
}

// Runs fn with the express:router namespace enabled (or not), and returns the
// lines it logged through debug.
function logged(fn, enabled) {
  var previous = debug.disable()
  var log = debug.log
  var lines = []

  debug.log = function () {
    lines.push(util.format.apply(util, arguments))
  }

  if (enabled !== false) debug.enable('express:router')

  try {
    fn()
  } finally {
    debug.disable()
    if (previous) debug.enable(previous)
    debug.log = log
  }

  return lines
}

function only(lines) {
  assert.strictEqual(lines.length, 1, 'expected one line, got: ' + JSON.stringify(lines))
  return lines[0]
}

describe('express:router warnings', function () {
  describe('a path that can never match', function () {
    it('should name a space, and its encoded form', function () {
      var line = only(
        logged(function () {
          express().get('/foo bar', noop)
        })
      )
      assert.match(
        line,
        /express:router route path '\/foo bar' can never match: " " \(U\+0020\) is never sent unencoded/
      )
      assert.match(line, /write "%20"/)
    })

    it('should let the encoded form match', function (done) {
      var app = express()
      app.get('/foo%20bar', function (req, res) {
        res.send('matched')
      })
      request(app).get('/foo%20bar').expect(200, 'matched', done)
    })

    it('should name control characters', function () {
      var line = only(
        logged(function () {
          express().get('/a\tb', noop)
        })
      )
      assert.match(line, /"\\t" \(U\+0009\)/)
      assert.match(line, /write "%09"/)
    })

    it('should name DEL', function () {
      assert.match(
        only(
          logged(function () {
            express().get('/a\u007fb', noop)
          })
        ),
        /U\+007F/
      )
    })

    it('should name non-ASCII characters, with their UTF-8 encoding', function () {
      var lines = logged(function () {
        var app = express()
        app.get('/café', noop)
        app.get('/中', noop)
      })
      assert.strictEqual(lines.length, 2)
      assert.match(lines[0], /U\+00E9\) is never sent unencoded.*write "%C3%A9"/)
      assert.match(lines[1], /U\+4E2D\) is never sent unencoded.*write "%E4%B8%AD"/)
    })

    it('should give no encoded form for a lone surrogate', function () {
      var line = only(
        logged(function () {
          express().get('/\ud800', noop)
        })
      )
      assert.match(line, /U\+D800\) is never sent unencoded: clients percent-encode it and Node rejects it raw$/)
    })

    it('should name an escaped "?"', function () {
      assert.match(
        only(
          logged(function () {
            express().get('/what\\?', noop)
          })
        ),
        /a "\?" starts the query string, so it is never in the path; write "%3F"/
      )
    })

    it('should name a "#"', function () {
      assert.match(
        only(
          logged(function () {
            express().get('/a#b', noop)
          })
        ),
        /a "#" starts the fragment, which is not part of the path; write "%23"/
      )
    })

    it('should name a path that does not start with "/"', function () {
      assert.match(
        only(
          logged(function () {
            express().get('users', noop)
          })
        ),
        /route path 'users' can never match: it does not start with "\/", and every request path does/
      )
    })

    it('should check app.use() and router.use() paths', function () {
      var lines = logged(function () {
        var app = express()
        var router = express.Router()
        router.use('/a b', noop)
        app.use('api', router)
        app.use('/sub app', express())
      })
      assert.strictEqual(lines.length, 3)
      assert.match(lines[0], /use path '\/a b' can never match/)
      assert.match(lines[1], /use path 'api' can never match/)
      assert.match(lines[2], /use path '\/sub app' can never match/)
    })

    it('should check router.route() and app.route() paths', function () {
      var lines = logged(function () {
        express.Router().route('/a b')
        express().route('/c d')
      })
      assert.strictEqual(lines.length, 2)
      assert.match(lines[0], /route path '\/a b'/)
      assert.match(lines[1], /route path '\/c d'/)
    })

    it('should check each string of a path array, nested ones included', function () {
      var lines = logged(function () {
        express().get(['/ok', ['/bad one', ['/fine']], /^\/re gex/, 'two'], noop)
      })
      assert.strictEqual(lines.length, 2)
      assert.match(lines[0], /'\/bad one'/)
      assert.match(lines[1], /'two'/)
    })

    it('should not warn for paths a request can match', function () {
      var lines = logged(function () {
        var app = express()
        app.get('/users/:id', noop)
        app.get('/a%20b', noop)
        app.get('/files/*path', noop)
        app.get('{/:lang}/about', noop)
        app.get('/:šošovica', noop)
        app.get('/opt{ ional}', noop)
        // every printable ASCII character a request path can hold raw, escaped where path-to-regexp reserves it
        app.get('/\\!$&\'\\(\\)\\*\\+,;=\\:@-._~\\{\\}\\[\\]|^`"<>%', noop)
        app.options('\\*', noop)
        app.get('', noop)
        app.use('', noop)
        app.get(/^\/re gex$/, noop)
      })
      assert.deepStrictEqual(lines, [])
    })

    it('should print nothing when express:router is not enabled', function () {
      var lines = logged(function () {
        express().get('/foo bar', noop)
      }, false)
      assert.deepStrictEqual(lines, [])
    })
  })

  describe('a duplicate route', function () {
    it('should name both registrations', function () {
      var line = only(
        logged(function () {
          var app = express()
          app.use(function first(req, res, next) {
            next()
          })
          app.get('/users/:id', function getUser(req, res) {
            res.end()
          })
          app.post('/users/:id', noop)
          app.get('/users/:id', function getUserAgain(req, res) {
            res.end()
          })
        })
      )
      assert.match(
        line,
        /duplicate route GET '\/users\/:id': registered at stack index 1 \(getUser\) and again at stack index 3 \(getUserAgain\); the second runs only when the first calls next\(\)/
      )
    })

    it('should warn for every later duplicate, against the first', function () {
      var lines = logged(function () {
        var router = express.Router()
        router.get('/x', noop)
        router.get('/x', noop)
        router.get('/x', noop)
      })
      assert.strictEqual(lines.length, 2)
      assert.match(lines[0], /stack index 0 \(noop\) and again at stack index 1/)
      assert.match(lines[1], /stack index 0 \(noop\) and again at stack index 2/)
    })

    it('should find routes made with router.route()', function () {
      var line = only(
        logged(function () {
          var router = express.Router()
          router.route('/x').get(noop)
          router.get('/x', noop)
        })
      )
      assert.match(line, /duplicate route GET '\/x'/)
    })

    it('should compare .all() handlers as one method', function () {
      var lines = logged(function () {
        var router = express.Router()
        router.all('/x', noop)
        router.get('/x', noop)
        router.all('/x', noop)
      })
      assert.strictEqual(lines.length, 1)
      assert.match(
        lines[0],
        /duplicate route ALL '\/x': registered at stack index 0 \(noop\) and again at stack index 2 \(noop\)/
      )
    })

    it('should compare identical arrays and RegExps', function () {
      var lines = logged(function () {
        var router = express.Router()
        router.get(['/a', ['/b']], noop)
        router.get(['/a', ['/b']], noop)
        router.get(/^\/r$/i, noop)
        router.get(/^\/r$/i, noop)
      })
      assert.strictEqual(lines.length, 2)
      assert.match(lines[0], /GET \[ '\/a', \[ '\/b' \] \]/)
      assert.match(lines[1], /GET \/\^\\\/r\$\/i/)
    })

    it('should not warn for different paths or methods', function () {
      var lines = logged(function () {
        var router = express.Router()
        router.get('/x', noop)
        router.get('/x/', noop)
        router.get('/X', noop)
        router.post('/x', noop)
        router.all('/x', noop)
        router.get(['/x'], noop)
        router.get(/^\/r$/, noop)
        router.get(/^\/r$/i, noop)
      })
      assert.deepStrictEqual(lines, [])
    })

    it('should not warn for more handlers on the same route', function () {
      var lines = logged(function () {
        var router = express.Router()
        router.route('/x').get(noop).get(noop)
        router.get('/y', noop, noop)
      })
      assert.deepStrictEqual(lines, [])
    })

    it('should not compare routes of different routers', function () {
      var lines = logged(function () {
        var app = express()
        var router = express.Router()
        var sub = express()
        app.get('/x', noop)
        router.get('/x', noop)
        sub.get('/x', noop)
        app.use(router)
        app.use(sub)
      })
      assert.deepStrictEqual(lines, [])
    })

    it('should print nothing, and keep nothing, when express:router is not enabled', function () {
      var router = express.Router()
      var lines = logged(function () {
        router.get('/x', noop)
        router.get('/x', noop)
      }, false)
      assert.deepStrictEqual(lines, [])

      // the routes above were not recorded, so a third is not a duplicate of them
      lines = logged(function () {
        router.get('/x', noop)
      })
      assert.deepStrictEqual(lines, [])
    })
  })
})
