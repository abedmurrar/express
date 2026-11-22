'use strict'

// Differential properties for the vendored qs (lib/qs): parse and stringify
// must give what npm qs 6.17.1 gives, value for value (prototypes and array
// holes included), and throw the same error class with the same message.
// Parse runs with the options Express (allowPrototypes) and body-parser's
// extended urlencoded parser (allowPrototypes, arrayLimit, depth,
// parameterLimit, charset, charsetSentinel, interpretNumericEntities,
// strictDepth) set; stringify runs on random values, with shared references
// and cycles.

var assert = require('node:assert')
var { Buffer } = require('node:buffer')
var fc = require('fast-check')
var upstream = require('qs')
var ours = require('../../lib/qs')
var { check, timeout, PROPERTY } = require('./support')

// The outcome of a call: its value, or the error it threw.
function outcome(fn) {
  try {
    return { value: fn() }
  } catch (err) {
    return { error: err.constructor.name + ': ' + err.message }
  }
}

function same(fn) {
  var expected = outcome(function () {
    return fn(upstream)
  })
  var actual = outcome(function () {
    return fn(ours)
  })
  assert.deepStrictEqual(actual, expected)
}

// Query strings built from the pieces qs treats specially: brackets (also
// percent-encoded), dots, delimiters, numeric indices around arrayLimit,
// prototype keys, the charset sentinels, numeric entities, '+', bad escapes
// and lone surrogates, plus random text.
var piece = fc.oneof(
  fc.constantFrom(
    'a',
    'b',
    'c',
    '0',
    '1',
    '2',
    '19',
    '20',
    '21',
    '100',
    '[',
    ']',
    '[]',
    '[0]',
    '[1]',
    '[20]',
    '[a]',
    '[b]',
    '.',
    '=',
    '&',
    ';',
    ',',
    '+',
    '%',
    '%5B',
    '%5D',
    '%5b',
    '%2E',
    '%20',
    '%E9',
    '%FF',
    '%C3%A9',
    '%E2%9C%93',
    '%26%239786%3B',
    '&#9786;',
    '&#128512;',
    '&#1114112;',
    '__proto__',
    'constructor',
    'prototype',
    'toString',
    'hasOwnProperty',
    'valueOf',
    'utf8=%E2%9C%93',
    'utf8=%26%2310003%3B',
    'utf8=x',
    '\uD800',
    'é',
    '☃'
  ),
  fc.string({ maxLength: 4 })
)
var queryString = fc.array(piece, { maxLength: 24 }).map(function (pieces) {
  return pieces.join('')
})

var parseOptions = fc.record(
  {
    allowPrototypes: fc.boolean(),
    arrayLimit: fc.oneof(fc.integer({ min: -1, max: 25 }), fc.constant(100)),
    depth: fc.oneof(fc.integer({ min: 0, max: 8 }), fc.constant(32), fc.constant(false)),
    parameterLimit: fc.oneof(fc.integer({ min: 1, max: 12 }), fc.constant(1000), fc.constant(Infinity)),
    charset: fc.constantFrom('utf-8', 'iso-8859-1'),
    charsetSentinel: fc.boolean(),
    interpretNumericEntities: fc.boolean(),
    strictDepth: fc.boolean()
  },
  { requiredKeys: [] }
)

// Values to stringify: nested objects and arrays (some with a null
// prototype or holes) of strings, numbers, booleans, null, undefined, dates,
// bigints, symbols and Buffers.
var leaf = fc.oneof(
  fc.string({ maxLength: 6 }),
  fc.integer(),
  fc.double(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.date({ noInvalidDate: true }),
  fc.bigInt(),
  fc.constantFrom(Symbol('s'), Symbol.iterator),
  fc.uint8Array({ maxLength: 4 }).map(function (bytes) {
    return Buffer.from(bytes)
  })
)
var stringKey = fc.oneof(fc.constantFrom('a', 'b', 'a.b', 'a[b]', '0', '1', '', ' ', 'é'), fc.string({ maxLength: 3 }))
var tree = fc.letrec(function (tie) {
  return {
    node: fc.oneof({ depthSize: 'small', withCrossShrink: true }, leaf, tie('object'), tie('array')),
    object: fc.tuple(fc.dictionary(stringKey, tie('node'), { maxKeys: 4 }), fc.boolean()).map(function (pair) {
      return pair[1] ? Object.assign(Object.create(null), pair[0]) : pair[0]
    }),
    array: fc.sparseArray(tie('node'), { maxLength: 4 })
  }
}).object

// The objects and arrays inside a value, in depth-first order.
function containers(value, list) {
  if (value && typeof value === 'object' && !Buffer.isBuffer(value) && !(value instanceof Date)) {
    if (list.indexOf(value) !== -1) return list
    list.push(value)
    Object.keys(value).forEach(function (k) {
      containers(value[k], list)
    })
  }
  return list
}

// A value where one container gets a property pointing at another: an
// ancestor (a cycle), itself, or a sibling (a shared reference, which is not
// a cycle).
var linked = fc.tuple(tree, fc.nat(), fc.nat(), stringKey, fc.boolean()).map(function (t) {
  var value = t[0]
  if (t[4]) {
    var list = containers(value, [])
    list[t[1] % list.length][t[3]] = list[t[2] % list.length]
  }
  return value
})

var stringifyOptions = fc.record(
  {
    addQueryPrefix: fc.boolean(),
    allowDots: fc.boolean(),
    allowEmptyArrays: fc.boolean(),
    arrayFormat: fc.constantFrom('brackets', 'comma', 'indices', 'repeat'),
    charset: fc.constantFrom('utf-8', 'iso-8859-1'),
    charsetSentinel: fc.boolean(),
    commaRoundTrip: fc.boolean(),
    depth: fc.integer({ min: 0, max: 6 }),
    encode: fc.boolean(),
    encodeDotInKeys: fc.boolean(),
    encodeValuesOnly: fc.boolean(),
    format: fc.constantFrom('RFC1738', 'RFC3986', 'WHATWG'),
    skipNulls: fc.boolean(),
    strictNullHandling: fc.boolean()
  },
  { requiredKeys: [] }
)

// A filter that turns every string value equal to `from` into an object
// whose properties hold `from` again, up to a depth: the channel then sees
// primitives as keys, which is why stringify's channels are Maps.
var expandingFilter = fc.tuple(fc.constantFrom('', 'a', 'x', '0'), fc.integer({ min: 1, max: 6 })).map(function (t) {
  var from = t[0]
  var maxDepth = t[1]
  return function filter(prefix, value) {
    if (value === from && prefix.split('[').length <= maxDepth) {
      return { k: from, l: [from, 1] }
    }
    return value
  }
})

describe('property: vendored qs matches npm qs 6.17.1', function () {
  this.timeout(timeout(PROPERTY.numRuns, 4))

  it('parse(str, { allowPrototypes: true }) is the same (Express)', function () {
    check(
      fc.property(queryString, function (str) {
        same(function (qs) {
          return qs.parse(str, { allowPrototypes: true })
        })
      })
    )
  })

  it("parse(str, options) is the same for body-parser's options", function () {
    check(
      fc.property(queryString, parseOptions, function (str, options) {
        same(function (qs) {
          return qs.parse(str, Object.assign({}, options))
        })
      })
    )
  })

  it('parse(object, options) is the same', function () {
    check(
      fc.property(linked, parseOptions, function (value, options) {
        same(function (qs) {
          return qs.parse(value, Object.assign({}, options))
        })
      })
    )
  })

  it('stringify(value, options) is the same, with shared references and cycles', function () {
    check(
      fc.property(linked, stringifyOptions, function (value, options) {
        same(function (qs) {
          return qs.stringify(value, Object.assign({}, options))
        })
      })
    )
  })

  it('stringify(value) is the same with a filter that turns primitives into objects', function () {
    check(
      fc.property(linked, expandingFilter, stringifyOptions, function (value, filter, options) {
        same(function (qs) {
          return qs.stringify(value, Object.assign({}, options, { filter: filter }))
        })
      })
    )
  })

  it('a cycle throws the same RangeError', function () {
    check(
      fc.property(tree, stringKey, function (value, k) {
        value[k] = value
        same(function (qs) {
          return qs.stringify({ root: value })
        })
        assert.throws(function () {
          ours.stringify({ root: value })
        }, /^RangeError: Cyclic object value$/)
      })
    )
  })
})
