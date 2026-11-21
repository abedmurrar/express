'use strict'

// Properties of res.cookie and res.clearCookie: what the server sets, a
// client sends back, and cookie-parser reads as the same value.

var assert = require('node:assert')
var fc = require('fast-check')
var cookieParser = require('cookie-parser')
var express = require('../../')
var { check, timeout, listen, PROPERTY } = require('./support')

var SECRET = 'property secret'

// Cookie names are HTTP tokens. `__proto__` is included: res.cookie writes
// it correctly, but the cookie package (0.7.2) under cookie-parser drops it
// when parsing, so the round-trip properties below use `parsedName`.
var anyName = fc.oneof(fc.stringMatching(/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,10}$/), fc.constant('__proto__'))
var name = anyName.filter(function (n) {
  return n !== '__proto__'
})
// cookie-parser turns values starting with "j:" into JSON and moves values
// starting with "s:" into req.signedCookies, by design. Those prefixes are
// how res.cookie writes objects and signed values, so a plain string that
// starts with one is not a plain string to cookie-parser.
var text = fc.string({ unit: 'binary', maxLength: 30 }).filter(function (s) {
  return !s.startsWith('j:') && !s.startsWith('s:')
})
var jsonObject = fc.oneof(
  fc.dictionary(fc.string(), fc.jsonValue({ maxDepth: 3 }), { maxKeys: 5 }),
  fc.array(fc.jsonValue({ maxDepth: 3 }), { maxLength: 5 })
)

function cookiesWith(values, names) {
  return fc.uniqueArray(fc.tuple(names || name, values), {
    minLength: 1,
    maxLength: 5,
    selector: function (t) {
      return t[0]
    }
  })
}

// Copy JSON-compatible data into plain objects, which is what JSON.parse in
// cookie-parser returns.
function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

function setCookies(res) {
  var header = res.headers['set-cookie']
  return header === undefined ? [] : header
}

describe('property: cookies', function () {
  this.timeout(timeout(PROPERTY.numRuns, 6))

  var client
  var plan
  var seen

  before(async function () {
    var app = express()
    app.use(cookieParser(SECRET))
    app.get('/set', function (req, res) {
      plan(res)
      res.end()
    })
    app.get('/get', function (req, res) {
      // spread, not Object.assign, so a cookie named "__proto__" stays a key
      seen = { cookies: { ...req.cookies }, signed: { ...req.signedCookies } }
      res.end()
    })
    client = await listen(app)
  })

  after(function () {
    return client.close()
  })

  // Run `fn(res)` on the server, then send every cookie it set back.
  async function roundTrip(fn, edit) {
    plan = fn
    var res = await client.request({ path: '/set' })
    var pairs = setCookies(res).map(function (c) {
      return c.split(';')[0]
    })
    if (edit) pairs = pairs.map(edit)
    seen = null
    await client.request({ path: '/get', headers: { cookie: pairs.join('; ') } })
    return { setCookie: setCookies(res), seen: seen }
  }

  it('Set-Cookie starts with name=encodeURIComponent(value), for any name and string', async function () {
    await check(
      fc.asyncProperty(cookiesWith(fc.string({ unit: 'binary', maxLength: 30 }), anyName), async function (list) {
        var r = await roundTrip(function (res) {
          list.forEach(function (c) {
            res.cookie(c[0], c[1])
          })
        })
        assert.deepStrictEqual(
          r.setCookie.map(function (c) {
            return c.split('; ')[0]
          }),
          list.map(function (c) {
            return c[0] + '=' + encodeURIComponent(c[1])
          })
        )
      })
    )
  })

  it('string values come back unchanged through cookie-parser', async function () {
    await check(
      fc.asyncProperty(cookiesWith(text), async function (list) {
        var r = await roundTrip(function (res) {
          list.forEach(function (c) {
            res.cookie(c[0], c[1])
          })
        })
        assert.strictEqual(r.setCookie.length, list.length)
        assert.deepStrictEqual(r.seen.cookies, Object.fromEntries(list))
      })
    )
  })

  it('object and array values come back as equal JSON', async function () {
    await check(
      fc.asyncProperty(cookiesWith(jsonObject), async function (list) {
        var r = await roundTrip(function (res) {
          list.forEach(function (c) {
            res.cookie(c[0], c[1])
          })
        })
        assert.deepStrictEqual(r.seen.cookies, plain(Object.fromEntries(list)))
      })
    )
  })

  it('signed values come back in req.signedCookies only', async function () {
    await check(
      fc.asyncProperty(cookiesWith(fc.oneof(text, jsonObject)), async function (list) {
        var r = await roundTrip(function (res) {
          list.forEach(function (c) {
            res.cookie(c[0], c[1], { signed: true })
          })
        })
        assert.deepStrictEqual(r.seen.cookies, {})
        assert.deepStrictEqual(r.seen.signed, plain(Object.fromEntries(list)))
      })
    )
  })

  it('a signed value with any changed signature character reads as false', async function () {
    var base64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    await check(
      fc.asyncProperty(name, text, fc.nat(), fc.integer({ min: 1, max: 63 }), async function (n, v, at, shift) {
        var r = await roundTrip(
          function (res) {
            res.cookie(n, v, { signed: true })
          },
          function (pair) {
            var eq = pair.indexOf('=')
            var value = decodeURIComponent(pair.slice(eq + 1))
            var dot = value.lastIndexOf('.')
            var i = dot + 1 + (at % (value.length - dot - 1))
            var swapped = base64[(base64.indexOf(value[i]) + shift) % 64]
            return pair.slice(0, eq + 1) + encodeURIComponent(value.slice(0, i) + swapped + value.slice(i + 1))
          }
        )
        assert.deepStrictEqual(r.seen.signed, { [n]: false })
      })
    )
  })

  it('maxAge gives Max-Age in whole seconds and a matching Expires', async function () {
    await check(
      fc.asyncProperty(name, fc.integer({ min: -1e9, max: 1e11 }), async function (n, maxAge) {
        var before = Date.now()
        var r = await roundTrip(function (res) {
          res.cookie(n, 'v', { maxAge: maxAge })
        })
        var after = Date.now()
        var attrs = r.setCookie[0].split('; ')
        assert.ok(attrs.includes('Max-Age=' + Math.floor(maxAge / 1000)), r.setCookie[0])
        var expires = Date.parse(
          attrs
            .find(function (a) {
              return a.startsWith('Expires=')
            })
            .slice(8)
        )
        // Expires has whole-second precision
        assert.ok(expires >= Math.floor((before + maxAge) / 1000) * 1000 && expires <= after + maxAge, r.setCookie[0])
      })
    )
  })

  it('clearCookie always expires the cookie in the past, at the given path', async function () {
    var path = fc.option(fc.stringMatching(/^\/[a-z0-9/._-]{0,10}$/), { nil: undefined })
    var maxAge = fc.option(fc.integer({ min: 0, max: 1e9 }), { nil: undefined })
    await check(
      fc.asyncProperty(name, path, maxAge, async function (n, p, age) {
        var options = {}
        if (p !== undefined) options.path = p
        if (age !== undefined) options.maxAge = age
        var r = await roundTrip(function (res) {
          res.clearCookie(n, options)
        })
        assert.deepStrictEqual(r.setCookie, [
          n + '=; Path=' + (p === undefined ? '/' : p) + '; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
        ])
      })
    )
  })
})
