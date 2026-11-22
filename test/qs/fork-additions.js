'use strict'

// Ours, not upstream's: stringify's cycle-detection channels are Maps, not
// WeakMaps, because a `filter` can turn a primitive into an object, and the
// primitive is then a channel key (side-channel kept those in a Map). These
// cases throw "Invalid value used as weak map key" with a WeakMap; each must
// give what npm qs 6.17.1 gives.

var assert = require('node:assert')
var upstream = require('qs')
var ours = require('../../lib/qs')

function outcome(fn) {
  try {
    return fn()
  } catch (err) {
    return err.constructor.name + ': ' + err.message
  }
}

var cases = [
  ['a filter that turns a string into an object', { a: 'x' }, (p, v) => (p === 'a' ? { b: 1 } : v), 'a%5Bb%5D=1'],
  [
    'a filter whose object repeats the string',
    { a: 'x' },
    (p, v) => (p === 'a' ? { b: 'x', c: 'x' } : v),
    'a%5Bb%5D=x&a%5Bc%5D=x'
  ],
  [
    'a filter that keeps expanding the same string',
    { a: 'x' },
    (p, v) => (v === 'x' && p.length < 12 ? { b: 'x' } : v),
    'RangeError: Cyclic object value'
  ],
  [
    'a filter that keeps expanding numbers',
    { a: 1, b: 1 },
    (p, v) => (typeof v === 'number' && p.length < 20 ? { c: v, d: v } : v),
    'RangeError: Cyclic object value'
  ]
]

describe('qs fork additions: stringify filters that turn primitives into objects', function () {
  cases.forEach(function (c) {
    it(c[0], function () {
      var expected = outcome(() => upstream.stringify(c[1], { filter: c[2] }))
      assert.strictEqual(expected, c[3])
      assert.strictEqual(
        outcome(() => ours.stringify(c[1], { filter: c[2] })),
        expected
      )
    })
  })

  it('with a depth, a filter that expands forever throws the same RangeError', function () {
    var filter = (p, v) => (v === 'x' ? { b: 'x' } : v)
    var expected = outcome(() => upstream.stringify({ a: 'x' }, { filter: filter, depth: 10 }))
    assert.strictEqual(expected, 'RangeError: Cyclic object value')
    assert.strictEqual(
      outcome(() => ours.stringify({ a: 'x' }, { filter: filter, depth: 10 })),
      expected
    )
  })
})
