'use strict'

// Helpers for the extended query parser's fast-path tests.

var path = require('node:path')

// The qs module that lib/utils.js loaded (the npm package, or a vendored
// copy), so a test can count the calls the extended parser makes to it.
function qsOfUtils() {
  var utils = require.cache[require.resolve('../../lib/utils.js')]
  var child = utils.children.find(function (m) {
    return path.basename(path.dirname(m.filename)) === 'qs' || /[\\/]qs[\\/]lib[\\/]index\.js$/.test(m.filename)
  })
  if (!child) throw new Error('lib/utils.js has not loaded qs')
  return child.exports
}

// Count calls to qs.parse until stop() is called, which returns the count.
function parserCalls() {
  var qs = qsOfUtils()
  var parse = qs.parse
  var count = 0
  qs.parse = function () {
    count++
    return parse.apply(this, arguments)
  }
  return {
    stop: function () {
      qs.parse = parse
      return count
    }
  }
}

// A value's structure, for comparing beyond assert.deepStrictEqual (which
// ignores key order): at every level, the prototype and the keys in order.
function shape(value) {
  if (value === null || typeof value !== 'object') return value
  var proto = Object.getPrototypeOf(value)
  return {
    prototype:
      proto === Object.prototype ? 'Object.prototype' : proto === Array.prototype ? 'Array.prototype' : String(proto),
    keys: Object.keys(value),
    values: Object.keys(value).map(function (k) {
      return shape(value[k])
    })
  }
}

module.exports = { parserCalls: parserCalls, shape: shape }
