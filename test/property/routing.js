'use strict'

// Properties of route matching: parameters decode back to what the client
// encoded, and a table of literal routes behaves like a simple model.

var assert = require('node:assert')
var fc = require('fast-check')
var express = require('../../')
var { check, timeout, listen, PROPERTY } = require('./support')

// Any non-empty string of whole code points (encodeURIComponent rejects lone
// surrogates, which a client could not send as UTF-8 anyway).
var value = fc.string({ unit: 'binary', minLength: 1, maxLength: 12 })
var enc = encodeURIComponent

// Start an app with one route and record what the handler sees.
async function recorder(build) {
  var app = express()
  var state = { seen: null }
  build(app, function (req, res) {
    state.seen = { params: { ...req.params }, baseUrl: req.baseUrl, url: req.url, path: req.path }
    res.end()
  })
  state.client = await listen(app)
  state.get = async function (path) {
    state.seen = null
    var res = await state.client.request({ path: path })
    return { status: res.status, seen: state.seen }
  }
  return state
}

describe('property: route matching', function () {
  this.timeout(timeout(PROPERTY.numRuns, 5))

  it('named parameters decode back to the encoded values', async function () {
    var state = await recorder(function (app, handler) {
      app.get('/:first/:second', handler)
    })
    try {
      await check(
        fc.asyncProperty(value, value, async function (a, b) {
          var r = await state.get('/' + enc(a) + '/' + enc(b))
          assert.strictEqual(r.status, 200)
          assert.deepStrictEqual(r.seen.params, { first: a, second: b })
        })
      )
    } finally {
      await state.client.close()
    }
  })

  it('a splat decodes to the list of encoded segments', async function () {
    var state = await recorder(function (app, handler) {
      app.get('/files/*rest', handler)
    })
    try {
      await check(
        fc.asyncProperty(fc.array(value, { minLength: 1, maxLength: 5 }), async function (segments) {
          var r = await state.get('/files/' + segments.map(enc).join('/'))
          assert.strictEqual(r.status, 200)
          assert.deepStrictEqual(r.seen.params, { rest: segments })
        })
      )
    } finally {
      await state.client.close()
    }
  })

  it('an optional segment is undefined when absent and decoded when present', async function () {
    var state = await recorder(function (app, handler) {
      app.get('/opt{/:b}', handler)
    })
    try {
      await check(
        fc.asyncProperty(fc.option(value, { nil: undefined }), async function (b) {
          var r = await state.get(b === undefined ? '/opt' : '/opt/' + enc(b))
          assert.strictEqual(r.status, 200)
          assert.strictEqual(r.seen.params.b, b)
        })
      )
    } finally {
      await state.client.close()
    }
  })

  it('a mounted router sees baseUrl + url === originalUrl', async function () {
    var segment = fc.stringMatching(/^[a-cA-C0-9._-]{1,4}$/)
    var mount = fc.array(segment, { minLength: 1, maxLength: 3 })
    var rest = fc.array(value, { minLength: 1, maxLength: 3 })
    var query = fc.option(fc.stringMatching(/^[a-z=&]{0,8}$/), { nil: undefined })
    await check(
      fc.asyncProperty(mount, rest, query, fc.boolean(), async function (m, r, q, upper) {
        var app = express()
        var router = express.Router()
        var seen
        router.use(function (req, res) {
          seen = { baseUrl: req.baseUrl, url: req.url, originalUrl: req.originalUrl }
          res.end()
        })
        var mountPath = '/' + m.join('/')
        app.use(mountPath, router)
        var client = await listen(app)
        try {
          // routing ignores case by default, and baseUrl keeps the request's own case
          var sentMount = upper ? mountPath.toUpperCase() : mountPath
          var url = sentMount + '/' + r.map(enc).join('/') + (q === undefined ? '' : '?' + q)
          var res = await client.request({ path: url })
          assert.strictEqual(res.status, 200)
          assert.strictEqual(seen.originalUrl, url)
          assert.strictEqual(seen.baseUrl, sentMount)
          assert.strictEqual(seen.baseUrl + seen.url, url)
        } finally {
          await client.close()
        }
      })
    )
  })

  describe('a table of literal routes', function () {
    // Segments use only characters that path-to-regexp treats literally.
    var segment = fc.stringMatching(/^[abAB0._-]{1,3}$/)
    var routePath = fc.array(segment, { minLength: 1, maxLength: 3 }).map(function (s) {
      return '/' + s.join('/')
    })

    // Derive a request from a route (or not): change the case, add a
    // trailing slash, percent-encode a character, or add a query string.
    function requestFor(routes) {
      var base = fc.oneof(fc.constantFrom.apply(fc, routes), routePath)
      return fc
        .record({
          base: base,
          caseFlip: fc.boolean(),
          slash: fc.boolean(),
          encodeAt: fc.option(fc.nat(), { nil: undefined }),
          query: fc.option(fc.constantFrom('', 'x=1', 'a/b', '/a'), { nil: undefined })
        })
        .map(function (o) {
          var p = o.caseFlip ? flipCase(o.base) : o.base
          if (o.encodeAt !== undefined) {
            var i = 1 + (o.encodeAt % (p.length - 1))
            if (p[i] !== '/') p = p.slice(0, i) + '%' + p.charCodeAt(i).toString(16).toUpperCase() + p.slice(i + 1)
          }
          if (o.slash) p += '/'
          return { path: p, url: o.query === undefined ? p : p + '?' + o.query }
        })
    }

    function flipCase(s) {
      return s.replace(/[a-zA-Z]/g, function (ch) {
        return ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase()
      })
    }

    // The model: the first route whose path equals the raw request path wins.
    // Case is ignored unless "case sensitive routing" is on, and one trailing
    // slash is allowed unless "strict routing" is on. Percent-escapes are not
    // decoded for matching.
    function model(routes, path, caseSensitive, strict) {
      var candidates = [path]
      if (!strict && path.length > 1 && path.endsWith('/')) candidates.push(path.slice(0, -1))
      for (var i = 0; i < routes.length; i++) {
        for (var c of candidates) {
          if (caseSensitive ? c === routes[i] : c.toLowerCase() === routes[i].toLowerCase()) return i
        }
      }
      return -1
    }

    var table = fc.array(routePath, { minLength: 1, maxLength: 6 }).chain(function (routes) {
      return fc.record({
        routes: fc.constant(routes),
        caseSensitive: fc.boolean(),
        strict: fc.boolean(),
        requests: fc.array(requestFor(routes), { minLength: 1, maxLength: 4 })
      })
    })

    it('the first matching route answers, as the model says', async function () {
      await check(
        fc.asyncProperty(table, async function (t) {
          var app = express()
          app.set('case sensitive routing', t.caseSensitive)
          app.set('strict routing', t.strict)
          t.routes.forEach(function (p, i) {
            app.get(p, function (req, res) {
              res.send(String(i))
            })
          })
          var client = await listen(app)
          try {
            for (var r of t.requests) {
              var res = await client.request({ path: r.url })
              var expected = model(t.routes, r.path, t.caseSensitive, t.strict)
              if (expected === -1) {
                assert.strictEqual(res.status, 404, r.url)
              } else {
                assert.strictEqual(res.status, 200, r.url)
                assert.strictEqual(res.body.toString(), String(expected), r.url)
              }
            }
          } finally {
            await client.close()
          }
        })
      )
    })
  })
})
