'use strict'

// Properties of the type-parameter parser behind res.format's keys
// (utils.normalizeType): without quotes it gives exactly what Express 5.3.0
// gives, and quoted values, which may hold ";", "=" and escaped characters,
// come back whole.

var assert = require('node:assert')
var fc = require('fast-check')
var ours = require('../../lib/utils')
var baseline = require('express-baseline/lib/utils')
var { check } = require('./support')

// Characters that matter to the parser, plus a few ordinary ones; no quote.
var unquoted = fc.string({
  unit: fc.constantFrom('a', 'b', 'q', '/', ';', '=', ' ', '.', '0', '5', '\\', '*', '+'),
  maxLength: 40
})

var token = fc.string({ unit: fc.constantFrom('a', 'b', 'x', '-', '1'), minLength: 1, maxLength: 6 })
// The inside of a quoted string: plain characters, ";", "=", spaces and
// quoted-pairs (a backslash and any character, including a quote or another
// backslash).
var quotedText = fc
  .array(fc.oneof(fc.constantFrom('a', ';', '=', ' ', 'q', '0'), fc.constantFrom('\\"', '\\\\', '\\;', '\\a')), {
    maxLength: 8
  })
  .map(function (parts) {
    return '"' + parts.join('') + '"'
  })
var param = fc.record({ key: token, value: fc.oneof(token, quotedText) })

describe('property: accept params', function () {
  it('matches Express 5.3.0 for a type with unquoted parameters', function () {
    check(
      fc.property(token, unquoted, function (type, rest) {
        var str = 'text/' + type + rest
        assert.deepStrictEqual(ours.normalizeType(str), baseline.normalizeType(str))
      })
    )
  })

  it('keeps every quoted value whole, and the quality outside quotes', function () {
    check(
      fc.property(
        fc.uniqueArray(param, { selector: (p) => p.key, maxLength: 5 }),
        fc.option(fc.constantFrom('0', '0.5', '1'), { nil: undefined }),
        fc.constantFrom(';', '; ', ' ;'),
        function (params, q, separator) {
          var parts = params.map(function (p) {
            return p.key + '=' + p.value
          })
          if (q !== undefined) parts.push('q=' + q)
          var str = 'text/plain' + parts.map((p) => separator + p).join('')

          var expected = {}
          params.forEach(function (p) {
            expected[p.key] = p.value
          })
          assert.deepStrictEqual(ours.normalizeType(str), {
            value: 'text/plain',
            quality: q === undefined ? 1 : Number(q),
            params: expected
          })
        }
      )
    )
  })
})
