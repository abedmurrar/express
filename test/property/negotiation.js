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

// compileTrust remembers each address's decision for a trust list. For any
// list and any sequence of addresses (including after the map is emptied),
// it must decide exactly what proxy-addr's compiled function decides, and two
// apps with different lists must never share decisions.
describe('property: remembered trust decisions match proxy-addr', function () {
  var proxyaddr = require('proxy-addr')
  var utils = require('../../lib/utils')

  var octet = fc.integer({ min: 0, max: 255 })
  var ipv4 = fc.tuple(octet, octet, octet, octet).map((o) => o.join('.'))
  var hex = fc.integer({ min: 0, max: 0xffff }).map((n) => n.toString(16))
  var ipv6 = fc.array(hex, { minLength: 8, maxLength: 8 }).map((h) => h.join(':'))
  var address = fc.oneof(
    ipv4,
    ipv6,
    ipv4.map((a) => '::ffff:' + a),
    fc.constantFrom('127.0.0.1', '::1', '10.0.0.1', '192.168.1.1', 'fe80::1', 'localhost', '', 'not an ip')
  )
  var subnet = fc.oneof(
    fc.constantFrom('loopback', 'linklocal', 'uniquelocal'),
    ipv4,
    fc.tuple(ipv4, fc.integer({ min: 0, max: 32 })).map(([a, n]) => a + '/' + n),
    fc.tuple(ipv6, fc.integer({ min: 0, max: 128 })).map(([a, n]) => a + '/' + n),
    ipv4.map((a) => '::ffff:' + a + '/120')
  )
  var list = fc.array(subnet, { minLength: 1, maxLength: 4 })

  it('decides like proxy-addr for any list and sequence of addresses', function () {
    check(
      fc.property(list, fc.array(address, { minLength: 1, maxLength: 200 }), function (subnets, addrs) {
        var reference
        try {
          reference = proxyaddr.compile(subnets)
        } catch (err) {
          // an invalid list must fail to compile the same way
          assert.throws(() => utils.compileTrust(subnets.join(', ')), { message: err.message })
          return
        }
        var remembered = utils.compileTrust(subnets.join(', '))
        for (var a of addrs.concat(addrs)) {
          assert.strictEqual(remembered(a, 0), reference(a, 0), a + ' against ' + subnets.join(', '))
        }
      }),
      { numRuns: 100 }
    )
  })

  it('stays correct across many clears (3,000 distinct addresses)', function () {
    var remembered = utils.compileTrust('loopback, 10.0.0.0/8')
    var reference = proxyaddr.compile(['loopback', '10.0.0.0/8'])
    for (var i = 0; i < 3000; i++) {
      var a = '10.' + ((i >> 8) & 255) + '.' + (i & 255) + '.1'
      var b = '11.' + ((i >> 8) & 255) + '.' + (i & 255) + '.1'
      assert.strictEqual(remembered(a, 0), reference(a, 0))
      assert.strictEqual(remembered(b, 0), reference(b, 0))
      assert.strictEqual(remembered('127.0.0.1', 0), true)
    }
  })

  it('never shares decisions between two compiled lists', function () {
    var a = utils.compileTrust('10.0.0.0/8')
    var b = utils.compileTrust('192.168.0.0/16')
    for (var i = 0; i < 3; i++) {
      assert.strictEqual(a('10.1.2.3', 0), true)
      assert.strictEqual(b('10.1.2.3', 0), false)
      assert.strictEqual(b('192.168.1.1', 0), true)
      assert.strictEqual(a('192.168.1.1', 0), false)
    }
  })
})

// Our negotiator remembers each parsed Accept, Accept-Charset,
// Accept-Encoding and Accept-Language header (capped maps, emptied when
// full). For any header and any provided lists, it must answer exactly what
// the npm negotiator 1.1.0 answers (or throw the same error), including when
// one header is asked about several different lists in a row (the case the
// cache serves) and after the maps have been emptied many times.
describe('property: the remembering negotiator matches negotiator 1.1.0', function () {
  this.timeout(120000)

  var Negotiator = require('../../lib/negotiator')
  var Upstream = require('negotiator')

  function outcome(fn) {
    try {
      return { value: fn() }
    } catch (err) {
      return { error: err.constructor.name + ': ' + err.message }
    }
  }

  var MEDIA = [
    'text/html',
    'TEXT/HTML',
    'text/plain',
    'application/json',
    'application/*',
    'text/*',
    '*/*',
    'image/png'
  ]
  var CHARSETS = ['utf-8', 'UTF-8', 'iso-8859-1', 'utf-7', '*']
  var ENCODINGS = ['gzip', 'GZIP', 'deflate', 'br', 'identity', 'compress', '*']
  var LANGUAGES = ['en', 'en-US', 'EN-us', 'en-GB', 'fr', 'fr-CA', 'de', '*']

  var qValue = fc.oneof(
    fc.constantFrom('0', '1', '1.0', '0.5', '.5', '0.001', '0.000', 'abc', '', '2', '-1', '"0.5"'),
    fc.integer({ min: 0, max: 1000 }).map((n) => String(n / 1000))
  )
  var param = fc.oneof(
    fc.constantFrom('level=1', 'level=2', 'charset=utf-8', 'charset=*', 'v=b3', 'LEVEL=1', 'foo="bar;baz"', 'x'),
    fc.tuple(fc.stringMatching(/^[a-z]{1,3}$/), fc.stringMatching(/^[a-z0-9*]{0,3}$/)).map(([k, v]) => k + '=' + v)
  )
  var ows = fc.constantFrom('', ' ', '  ', '\t')
  var junk = fc.oneof(
    fc.constantFrom('', ';', ';;', '=', 'q=1', ';q=0.5', '"', 'text', 'a/b/c', '/', '*', ' , '),
    fc.string({ maxLength: 8 })
  )

  function part(values) {
    return fc
      .oneof(
        {
          weight: 6,
          arbitrary: fc.record({
            value: fc.constantFrom.apply(fc, values),
            params: fc.array(param, { maxLength: 2 }),
            q: fc.option(qValue),
            pre: ows,
            post: ows
          })
        },
        { weight: 1, arbitrary: junk }
      )
      .map(function (p) {
        if (typeof p === 'string') return p
        var s = p.pre + p.value
        p.params.forEach(function (x) {
          s += ';' + x
        })
        if (p.q !== null) s += (p.params.length % 2 ? ' ; q=' : ';q=') + p.q
        return s + p.post
      })
  }

  // undefined (no header), '' or a list of parts, some of them malformed
  function header(values) {
    return fc.oneof(
      { weight: 1, arbitrary: fc.constantFrom(undefined, '') },
      { weight: 8, arbitrary: fc.array(part(values), { minLength: 1, maxLength: 6 }).map((ps) => ps.join(',')) }
    )
  }

  function lists(values) {
    var item = fc.oneof(fc.constantFrom.apply(fc, values), fc.constantFrom('text', '', 'foo/bar;level=1', 'x-y'))
    // undefined asks for the header's own values
    return fc.array(fc.option(fc.array(item, { maxLength: 5 }), { nil: undefined }), { minLength: 2, maxLength: 4 })
  }

  var preferred = fc.option(fc.array(fc.constantFrom.apply(fc, ENCODINGS), { maxLength: 3 }), { nil: undefined })

  var request = fc.record({
    accept: header(MEDIA),
    charset: header(CHARSETS),
    encoding: header(ENCODINGS),
    language: header(LANGUAGES),
    mediaLists: lists(MEDIA),
    charsetLists: lists(CHARSETS),
    encodingLists: lists(ENCODINGS),
    languageLists: lists(LANGUAGES),
    preferred: preferred
  })

  // suffix, when given, is added to every header (an absent one becomes it)
  function headersOf(r, suffix) {
    var h = {}
    var values = {
      accept: r.accept,
      'accept-charset': r.charset,
      'accept-encoding': r.encoding,
      'accept-language': r.language
    }
    Object.keys(values).forEach(function (name) {
      if (values[name] !== undefined || suffix) h[name] = (values[name] || '') + suffix
    })
    return h
  }

  // Every answer for one request, each list asked twice, so the second and
  // later calls (for this list or another) come from the cache.
  function answersFor(Ctor, r, headers) {
    var n = new Ctor({ headers: headers })
    var out = []
    for (var round = 0; round < 2; round++) {
      r.mediaLists.forEach((l) => out.push(outcome(() => [n.mediaTypes(l), n.mediaType(l)])))
      r.charsetLists.forEach((l) => out.push(outcome(() => [n.charsets(l), n.charset(l)])))
      r.encodingLists.forEach((l) =>
        out.push(outcome(() => [n.encodings(l), n.encoding(l), n.encodings(l, { preferred: r.preferred })]))
      )
      r.languageLists.forEach((l) => out.push(outcome(() => [n.languages(l), n.language(l)])))
    }
    return out
  }

  it('the same answers for any headers and provided lists, each header asked about several lists', function () {
    check(
      fc.property(request, function (r) {
        var headers = headersOf(r, '')
        assert.deepStrictEqual(answersFor(Negotiator, r, headers), answersFor(Upstream, r, headers), JSON.stringify(r))
      })
    )
  })

  it('the same answers over runs of 120 to 250 distinct headers, which empty every cache', function () {
    check(
      fc.property(fc.array(request, { minLength: 120, maxLength: 250 }), function (rs) {
        // the index makes every header distinct: an "x-N" part is one more
        // coding, charset or language that nothing provided matches (and,
        // without a "/", no media range at all)
        rs.forEach(function (r, i) {
          var headers = headersOf(r, ', x-' + i)
          assert.deepStrictEqual(
            answersFor(Negotiator, r, headers),
            answersFor(Upstream, r, headers),
            JSON.stringify(r)
          )
          // and a header seen before, so cached and freshly parsed lists mix
          var again = headersOf(rs[0], '')
          assert.deepStrictEqual(answersFor(Negotiator, rs[0], again), answersFor(Upstream, rs[0], again))
        })
      }),
      { numRuns: 10 }
    )
  })
})
