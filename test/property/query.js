'use strict'

// Properties of req.query for each "query parser" setting.

var assert = require('node:assert')
var querystring = require('node:querystring')
var fc = require('fast-check')
var qs = require('qs')
var express = require('../../')
var { check, timeout, listen, PROPERTY, QUERY_CHARS, URL_CHARS, queryString } = require('./support')

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
