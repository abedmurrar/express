'use strict'

// Properties of req.query for each "query parser" setting.

var assert = require('node:assert')
var querystring = require('node:querystring')
var fc = require('fast-check')
var qs = require('qs')
var express = require('../../')
var baseline = require('express-baseline')
var { check, timeout, listen, PROPERTY, QUERY_CHARS, URL_CHARS, queryString } = require('./support')
var { parserCalls, shape } = require('../support/query-fast-path')

// Start an app whose only route records req.query.
async function queryApp(parser) {
  var app = express()
  if (parser !== undefined) app.set('query parser', parser)
  var state = { query: null }
  app.get('/', function (req, res) {
    state.query = req.query
    res.end()
  })
  state.client = await listen(app)
  return state
}

async function queryOf(state, str) {
  state.query = null
  var res = await state.client.request({ path: '/?' + str })
  assert.strictEqual(res.status, 200)
  return state.query
}

// Plain nested values that qs.stringify writes and qs.parse reads back
// unchanged: non-empty objects with letter keys, short arrays of strings,
// and any string (qs percent-encodes it as UTF-8). Nesting stays within qs's
// default depth of 5 brackets, counting an array index as one.
var key = fc.stringMatching(/^[a-zA-Z]{1,6}$/)
var text = fc.string({ unit: 'grapheme', maxLength: 12 })
function nestedObject(depth) {
  var values = [text]
  if (depth < 5) values.push(fc.array(text, { minLength: 1, maxLength: 5 }))
  if (depth < 4) values.push(nestedObject(depth + 1))
  return fc.dictionary(key, fc.oneof.apply(fc, values), { minKeys: 1, maxKeys: 4, noNullPrototype: true })
}
var nested = nestedObject(0)

// The extended parser, called directly: this fork's, and Express 5.3.0's.
var extended = express().set('query parser', 'extended').get('query parser fn')
var extendedBaseline = baseline().set('query parser', 'extended').get('query parser fn')
function qsParse(str) {
  return qs.parse(str, { allowPrototypes: true })
}

// Pieces for the extended parser's differential fuzz: every character qs
// reads specially (with the brackets and their escapes in either case),
// "#", unicode (with a lone surrogate), good and malformed escapes,
// escapes that fail only as UTF-8, and prototype names.
var FLAT_PIECES = [
  'a',
  'b',
  'Z',
  '0',
  '7',
  '=',
  '&',
  '&&',
  '+',
  '?',
  '.',
  '#',
  ',',
  ';',
  'é',
  '€',
  '😀',
  '\uD800',
  '%20',
  '%2B',
  '%26',
  '%3D',
  '%2E',
  '%25',
  '%41',
  '%E2%82%AC',
  '%F0%9F%98%80',
  '%C3',
  '%ED%A0%80',
  '%FF',
  '%',
  '%2',
  '%zz',
  '%%',
  '%5',
  '%5A',
  '%255B',
  '__proto__',
  '%5F_proto__',
  'constructor',
  'prototype',
  'toString',
  'hasOwnProperty',
  'valueOf'
]
var NESTING_PIECES = ['[', ']', '[]', '[0]', '[a]', ']=', '%5B', '%5b', '%5D', '%5d', '.x[y]']
var flatPiece = fc.constantFrom.apply(fc, FLAT_PIECES)
var anyPiece = fc.constantFrom.apply(fc, FLAT_PIECES.concat(NESTING_PIECES))
function piecesString(piece, maxLength) {
  return fc.array(piece, { maxLength: maxLength }).map(function (parts) {
    return parts.join('')
  })
}
// strings with none of the characters that make qs nest (the fast path)
var flatQuery = piecesString(flatPiece, 40)
var richQuery = fc.oneof(flatQuery, piecesString(anyPiece, 40), queryString)
// one key repeated around qs's arrayLimit of 20, spelled in different ways
// that decode the same, among pairs with other keys
var repeatedQuery = fc
  .tuple(
    fc.constantFrom(
      ['a', '%61'],
      ['constructor', 'constructo%72'],
      ['toString'],
      ['a b', 'a+b', 'a%20b'],
      ['__proto__', '%5F_proto__'],
      ['', '+']
    ),
    fc.oneof(fc.constantFrom(19, 20, 21, 22), fc.integer({ min: 1, max: 26 })),
    fc.array(fc.tuple(fc.constantFrom('b', 'c', '%62'), piecesString(flatPiece, 3)), { maxLength: 6 }),
    fc.boolean()
  )
  .map(function (t) {
    var pairs = []
    for (var i = 0; i < t[1]; i++) pairs.push(t[0][i % t[0].length] + (i % 5 === 4 ? '' : '=' + i))
    t[2].forEach(function (p) {
      pairs.splice(p[1].length % (pairs.length + 1), 0, p[0] + '=' + p[1])
    })
    if (t[3]) pairs.push('x[y]=1')
    return pairs.join('&')
  })
// about 1,000 parts (qs's parameterLimit), some of them empty, with keys
// just before and just after the limit
var manyPartsQuery = fc
  .tuple(fc.integer({ min: 990, max: 1010 }), fc.integer({ min: 0, max: 20 }), fc.boolean())
  .map(function (t) {
    var parts = []
    for (var i = 0; i < t[0]; i++) {
      // a few repeats of one key, below the array limit, and some empty parts
      parts.push(i < t[1] ? 'r=' + i : i % 50 === 7 ? '' : 'k' + i + '=' + i)
    }
    parts.push('last=1')
    if (t[2]) parts.push('n[e]=1')
    return parts.join('&')
  })

// The same result as qs, compared deeply and strictly, with the same
// prototypes and keys in the same order at every level, and the same as
// Express 5.3.0. Returns how many times qs.parse was called.
function assertLikeQs(str) {
  var calls = parserCalls()
  var actual = extended(str)
  var used = calls.stop()
  var expected = qsParse(str)
  assert.deepStrictEqual(actual, expected)
  assert.deepStrictEqual(shape(actual), shape(expected))
  assert.deepStrictEqual(shape(actual), shape(extendedBaseline(str)))
  return used
}

// How often the extended parser should call qs for `str`: once when it has
// a bracket or a bracket escape, or when a key has more than 20 values (qs
// then gives an object with numeric keys); never otherwise.
function hasOverflow(str) {
  var parsed = qsParse(str)
  return Object.keys(parsed).some(function (k) {
    return typeof parsed[k] === 'object' && !Array.isArray(parsed[k])
  })
}
function expectedCalls(str) {
  return /[[\]]|%5[bd]/i.test(str) || hasOverflow(str) ? 1 : 0
}

describe('property: extended query parser fast path', function () {
  this.timeout(timeout(PROPERTY.numRuns, 10))

  it('equals qs.parse(str, { allowPrototypes: true }) for any string from a rich alphabet, calling qs only when needed', function () {
    check(
      fc.property(richQuery, function (str) {
        assert.strictEqual(assertLikeQs(str), expectedCalls(str))
      })
    )
  })

  it('equals qs around the 20-value array limit', function () {
    check(
      fc.property(repeatedQuery, function (str) {
        assert.strictEqual(assertLikeQs(str), expectedCalls(str))
      })
    )
  })

  it(
    'equals qs around the 1,000-parameter limit',
    function () {
      check(
        fc.property(manyPartsQuery, function (str) {
          assert.strictEqual(assertLikeQs(str), expectedCalls(str))
        })
      )
      // about 20 times the work of the others here: 2 to 4 s, more on a busy machine
    },
    timeout(PROPERTY.numRuns, 100)
  )

  it('skips qs for a flat string unless a key repeats more than 20 times', function () {
    check(
      fc.property(flatQuery, function (str) {
        assert.strictEqual(assertLikeQs(str), expectedCalls(str))
      })
    )
  })

  it('goes to qs once a "[", "]", "%5B" or "%5D" is added anywhere in a flat string', function () {
    check(
      fc.property(flatQuery, fc.constantFrom('[', ']', '%5B', '%5b', '%5D', '%5d'), fc.nat(), function (str, c, at) {
        var i = at % (str.length + 1)
        var nested = str.slice(0, i) + c + str.slice(i)
        assert.strictEqual(assertLikeQs(str), expectedCalls(str))
        assert.strictEqual(assertLikeQs(nested), 1)
      })
    )
  })

  it('goes back to the fast path once every "[", "]", "%5B" and "%5D" is removed', function () {
    check(
      fc.property(piecesString(anyPiece, 40), function (str) {
        var flat = str.replace(/[[\]]|%5[bd]/gi, '')
        while (/[[\]]|%5[bd]/i.test(flat)) flat = flat.replace(/[[\]]|%5[bd]/gi, '')
        assert.strictEqual(assertLikeQs(str), expectedCalls(str))
        assert.strictEqual(assertLikeQs(flat), expectedCalls(flat))
        assert.strictEqual(expectedCalls(flat), hasOverflow(flat) ? 1 : 0)
      })
    )
  })
})

describe('property: req.query', function () {
  this.timeout(timeout(PROPERTY.numRuns, 4))

  it('extended: equals qs.parse(str, { allowPrototypes: true }) for any query string', async function () {
    var state = await queryApp('extended')
    try {
      await check(
        fc.asyncProperty(queryString, async function (str) {
          assert.deepStrictEqual(await queryOf(state, str), qs.parse(str, { allowPrototypes: true }))
        })
      )
    } finally {
      await state.client.close()
    }
  })

  it('simple is the default parser', async function () {
    var state = await queryApp()
    try {
      await check(
        fc.asyncProperty(queryString, async function (str) {
          assert.deepStrictEqual(await queryOf(state, str), querystring.parse(str))
        })
      )
    } finally {
      await state.client.close()
    }
  })

  it('extended: qs.stringify then req.query round-trips nested objects', async function () {
    var state = await queryApp('extended')
    try {
      await check(
        fc.asyncProperty(nested, async function (obj) {
          assert.deepStrictEqual(await queryOf(state, qs.stringify(obj)), obj)
        })
      )
    } finally {
      await state.client.close()
    }
  })

  it('simple: equals querystring.parse(str) for any query string', async function () {
    var state = await queryApp('simple')
    try {
      await check(
        fc.asyncProperty(queryString, async function (str) {
          assert.deepStrictEqual(await queryOf(state, str), querystring.parse(str))
        })
      )
    } finally {
      await state.client.close()
    }
  })

  it('simple: querystring.stringify then req.query round-trips flat objects', async function () {
    var state = await queryApp('simple')
    var flat = fc.dictionary(key, fc.oneof(text, fc.array(text, { minLength: 2, maxLength: 4 })), {
      maxKeys: 5,
      noNullPrototype: true
    })
    try {
      await check(
        fc.asyncProperty(flat, async function (obj) {
          var parsed = await queryOf(state, querystring.stringify(obj))
          assert.deepStrictEqual(Object.assign({}, parsed), obj)
        })
      )
    } finally {
      await state.client.close()
    }
  })

  it('false: req.query is always an empty object with no prototype', async function () {
    var state = await queryApp(false)
    try {
      await check(
        fc.asyncProperty(queryString, async function (str) {
          var query = await queryOf(state, str)
          assert.strictEqual(Object.getPrototypeOf(query), null)
          assert.deepStrictEqual(Object.keys(query), [])
        })
      )
    } finally {
      await state.client.close()
    }
  })

  describe('a custom parser', function () {
    var client
    var seen = []

    before(async function () {
      var app = express()
      app.set('query parser', function (str) {
        seen.push(str)
        return {}
      })
      app.get('*splat', function (req, res) {
        void req.query
        res.end()
      })
      client = await listen(app)
    })

    after(function () {
      return client.close()
    })

    var pathPart = fc.string({ unit: fc.constantFrom('a', 'b', '/', '%2F', '%3F', '.', '-'), maxLength: 10 })

    it('receives exactly the text after the first "?"', async function () {
      await check(
        fc.asyncProperty(pathPart, queryString, async function (p, str) {
          seen.length = 0
          await client.request({ path: '/x/' + p + '?' + str })
          assert.deepStrictEqual(seen, [str])
        })
      )
    })

    // Node's legacy url.parse (used by parseurl once a "#" is present)
    // escapes these characters, so they are left out of the query here.
    var ESCAPED = '"\'<>\\^`{|}'
    var plain = fc.string({
      unit: fc.constantFrom.apply(
        fc,
        QUERY_CHARS.filter(function (ch) {
          return !ESCAPED.includes(ch)
        })
      ),
      maxLength: 30
    })
    var fragment = fc.string({ unit: fc.constantFrom.apply(fc, URL_CHARS), maxLength: 20 })

    it('never receives a "#" fragment', async function () {
      await check(
        fc.asyncProperty(pathPart, plain, fragment, async function (p, str, frag) {
          seen.length = 0
          await client.request({ path: '/x/' + p + '?' + str + '#' + frag })
          assert.deepStrictEqual(seen, [str])
        })
      )
    })
  })
})
