'use strict'

// Properties of content negotiation (req.accepts and res.format) against a
// small model of the Accept header: each offered type gets the quality of
// the most specific matching range (exact, then type/*, then */*), and the
// highest quality among those.

var assert = require('node:assert')
var fc = require('fast-check')
var express = require('../../')
var { check, timeout, listen, PROPERTY } = require('./support')

var TYPES = ['text/html', 'text/plain', 'text/csv', 'application/json', 'application/xml', 'image/png', 'image/gif']
var RANGES = TYPES.concat(['text/*', 'application/*', 'image/*', '*/*'])

var quality = fc.oneof(
  fc.constant(undefined),
  fc.constantFrom('0', '1', '0.5', '0.001', '0.999', '1.0', '0.10'),
  fc.integer({ min: 0, max: 1000 }).map(function (n) {
    return String(n / 1000)
  })
)
var range = fc.record({
  type: fc.constantFrom.apply(fc, RANGES),
  upper: fc.boolean(),
  q: quality,
  space: fc.boolean()
})
// undefined means no Accept header at all
var acceptHeader = fc.option(
  fc.record({ ranges: fc.array(range, { maxLength: 6 }), separator: fc.constantFrom(',', ', ', ' ,') }),
  { nil: undefined }
)
var offered = fc.shuffledSubarray(TYPES, { minLength: 1 })

function format(header) {
  if (header === undefined) return undefined
  return header.ranges
    .map(function (r) {
      var t = r.upper ? r.type.toUpperCase() : r.type
      return r.q === undefined ? t : t + (r.space ? '; q=' : ';q=') + r.q
    })
    .join(header.separator)
}

function specificity(range, type) {
  var [rt, rs] = range.toLowerCase().split('/')
  var [tt, ts] = type.split('/')
  if (rt === tt && rs === ts) return 2
  if (rt === tt && rs === '*') return 1
  if (rt === '*' && rs === '*') return 0
  return -1
}

// Quality the model gives `type` under the parsed ranges.
function modelQuality(ranges, type) {
  var best = { s: -1, q: 0 }
  for (var r of ranges) {
    var s = specificity(r.type, type)
    var q = r.q === undefined ? 1 : parseFloat(r.q)
    if (s > best.s || (s === best.s && q > best.q)) best = { s: s, q: q }
  }
  return best.s === -1 ? 0 : best.q
}

// What the model allows as the answer: false when nothing is acceptable,
// otherwise any offered type with the highest quality.
function allowedAnswers(header, types) {
  var ranges = header === undefined ? [] : header.ranges
  if (ranges.length === 0) {
    // no header (or an empty one) accepts anything, and the first type wins
    return [types[0]]
  }
  var qs = types.map(function (t) {
    return modelQuality(ranges, t)
  })
  var max = Math.max.apply(Math, qs)
  if (max <= 0) return [false]
  return types.filter(function (_, i) {
    return qs[i] === max
  })
}

function headers(accept) {
  return accept === undefined ? {} : { accept: accept }
}

describe('property: content negotiation', function () {
  this.timeout(timeout(PROPERTY.numRuns, 4))

  var client
  var types = []
  var result

  before(async function () {
    var app = express()
    app.get('/accepts', function (req, res) {
      result = req.accepts(types)
      res.end()
    })
    app.get('/format', function (req, res) {
      var handlers = {}
      types.forEach(function (t) {
        handlers[t] = function () {
          res.send(t)
        }
      })
      res.format(handlers)
    })
    app.use(function (err, req, res, next) {
      res.status(err.status).send('error')
    })
    client = await listen(app)
  })

  after(function () {
    return client.close()
  })

  it('req.accepts(types) returns a type of the highest quality, or false', async function () {
    await check(
      fc.asyncProperty(acceptHeader, offered, async function (header, offer) {
        types = offer
        result = null
        var accept = format(header)
        await client.request({ path: '/accepts', headers: headers(accept) })
        assert.ok(allowedAnswers(header, offer).includes(result), JSON.stringify({ accept, offer, result }))
      })
    )
  })

  it('res.format answers with a type of the highest quality, or 406', async function () {
    await check(
      fc.asyncProperty(acceptHeader, offered, async function (header, offer) {
        types = offer
        var accept = format(header)
        var res = await client.request({ path: '/format', headers: headers(accept) })
        var allowed = allowedAnswers(header, offer)
        assert.strictEqual(res.headers.vary, 'Accept')
        if (allowed[0] === false) {
          assert.strictEqual(res.status, 406)
          return
        }
        var chosen = res.body.toString()
        assert.strictEqual(res.status, 200)
        assert.ok(allowed.includes(chosen), JSON.stringify({ accept, offer, chosen }))
        assert.strictEqual(res.headers['content-type'].split(';')[0], chosen)
      })
    )
  })

  it('a single exact Accept type is always chosen when offered', async function () {
    await check(
      fc.asyncProperty(offered, fc.nat(), async function (offer, pick) {
        types = offer
        var want = offer[pick % offer.length]
        var res = await client.request({ path: '/format', headers: { accept: want } })
        assert.strictEqual(res.body.toString(), want)
      })
    )
  })
})

// utils.setCharset and utils.mimeContentType remember their results (capped
// maps, emptied when full). For any input, in any order and after any number
// of clears, they must return exactly what the uncached functions return,
// and throw on every call for an invalid type.
describe('property: remembered content types match the uncached functions', function () {
  var contentType = require('content-type')
  var mime = require('mime-types')
  var utils = require('../../lib/utils')

  function uncachedSetCharset(type, charset) {
    if (!type || !charset) return type
    var parsed = contentType.parse(type)
    parsed.parameters.charset = charset
    return contentType.format(parsed)
  }

  function outcome(fn) {
    try {
      return { value: fn() }
    } catch (err) {
      return { error: err.constructor.name + ': ' + err.message }
    }
  }

  var token = fc.stringMatching(/^[a-z0-9!#$&^_.+-]{1,12}$/)
  var mediaType = fc.oneof(
    fc.tuple(token, token).map(([a, b]) => a + '/' + b),
    fc.tuple(token, token, token, token).map(([a, b, k, v]) => a + '/' + b + '; ' + k + '=' + v),
    fc.constantFrom('text/html', 'application/json', 'text/plain; charset=latin1', 'text/html; Charset="UTF-8"'),
    fc.string({ maxLength: 20 })
  )
  var extension = fc.oneof(
    fc.constantFrom('html', 'json', 'txt', 'bin', 'png', 'js', 'css', 'xml', '.html', 'unknown-ext', ''),
    token,
    fc.string({ maxLength: 12 })
  )
  var charset = fc.constantFrom('utf-8', 'UTF-8', 'latin1', 'iso-8859-1', '', undefined)

  it('setCharset: the same result or the same error, over 300 calls in a row', function () {
    check(
      fc.property(fc.array(fc.tuple(mediaType, charset), { minLength: 1, maxLength: 300 }), function (calls) {
        for (var [type, cs] of calls) {
          assert.deepStrictEqual(
            outcome(() => utils.setCharset(type, cs)),
            outcome(() => uncachedSetCharset(type, cs))
          )
        }
      }),
      { numRuns: 100 }
    )
  })

  it('mimeContentType: the same as mime.contentType, over 300 calls in a row', function () {
    check(
      fc.property(fc.array(fc.oneof(extension, mediaType), { minLength: 1, maxLength: 300 }), function (calls) {
        for (var value of calls) {
          assert.deepStrictEqual(
            outcome(() => utils.mimeContentType(value)),
            outcome(() => mime.contentType(value))
          )
        }
      }),
      { numRuns: 100 }
    )
  })

  it('an invalid type throws on every call, and is never remembered', function () {
    for (var i = 0; i < 3; i++) {
      assert.throws(() => utils.setCharset('not a type', 'utf-8'), TypeError)
    }
    assert.strictEqual(utils.setCharset('text/html', 'utf-8'), 'text/html; charset=utf-8')
  })

  it('stays correct across many cache clears (1,000 distinct types)', function () {
    for (var i = 0; i < 1000; i++) {
      var t = 'application/x-t' + i
      assert.strictEqual(utils.setCharset(t, 'utf-8'), t + '; charset=utf-8')
      assert.strictEqual(utils.mimeContentType(t), mime.contentType(t))
      assert.strictEqual(utils.setCharset('text/html', 'utf-8'), 'text/html; charset=utf-8')
    }
  })
})
