'use strict'

// Built-in stand-ins for the small packages qs's tests require (all by
// Jordan Harband, MIT): each one keeps the package's check or values, so the
// tests skip and loop exactly as they do under the packages.

/* has-symbols: Symbol works and makes symbols */
function hasSymbols() {
  return typeof Symbol === 'function' && typeof Symbol('foo') === 'symbol'
}

/* has-bigints: BigInt works and makes bigints */
function hasBigInts() {
  return typeof BigInt === 'function' && typeof BigInt(42) === 'bigint'
}

/* has-proto: an object literal's `__proto__` sets its prototype */
function hasProto() {
  var test = { __proto__: null, foo: {} }
  return { __proto__: test }.foo === test.foo && !(test instanceof Object)
}

/* has-property-descriptors: Object.defineProperty works on plain objects */
function hasPropertyDescriptors() {
  try {
    Object.defineProperty({}, 'a', { value: 1 })
    return true
  } catch {
    return false
  }
}

/* has-override-mistake: assigning to a property that an object inherits as non-writable fails */
function hasOverrideMistake() {
  var proto = Object.defineProperty({}, 'x', { value: 1, writable: false })
  var obj = Object.create(proto)
  try {
    obj.x = 2
  } catch {
    return true
  }
  return obj.x === 1
}

/* for-each, on an array or an object's own keys */
function forEach(list, fn, thisArg) {
  if (Array.isArray(list)) {
    for (var i = 0; i < list.length; i++) fn.call(thisArg, list[i], i, list)
  } else {
    Object.keys(list).forEach(function (key) {
      fn.call(thisArg, list[key], key, list)
    })
  }
}

// es-value-fixtures 1.7.1: the lists qs's tests use, with the same values in
// the same order.
var coercibleObject = {
  valueOf: function () {
    return 3
  },
  toString: function () {
    return 42
  }
}
var coercibleFnObject = {
  valueOf: function () {
    return function valueOfFn() {}
  },
  toString: function () {
    return 42
  }
}
var valueOfOnlyObject = {
  valueOf: function () {
    return 4
  },
  toString: function () {
    return {}
  }
}
var toStringOnlyObject = {
  valueOf: function () {
    return {}
  },
  toString: function () {
    return 7
  }
}
var objects = [{}, coercibleObject, coercibleFnObject, toStringOnlyObject, valueOfOnlyObject]
var nullPrimitives = [undefined, null]
var nonIntegerNumbers = [-1.3, 0.2, 1.8, 1 / 3]
var zeroes = [0, -0]
var infinities = [Infinity, -Infinity]
var numbers = zeroes.concat([42], infinities, nonIntegerNumbers)
var strings = ['', 'foo', 'a💩c']
var booleans = [true, false]
// intl-fallback-symbol: the symbol Intl.DateTimeFormat stores its legacy-constructed state under
var intlFallbackSymbol = Object.getOwnPropertySymbols(
  Intl.DateTimeFormat.call({ __proto__: Intl.DateTimeFormat.prototype })
).find(function (x) {
  var str = Symbol.prototype.toString.call(x)
  return str === 'Symbol(IntlLegacyConstructedSymbol)' || str === 'Symbol(IntlFallback)'
})
var symbols = [Symbol.iterator, Symbol(), Symbol('foo'), Symbol['for'](), Symbol['for']('registered!')].concat(
  intlFallbackSymbol || []
)
var bigints = [BigInt(42), BigInt(0)]
var nonNullPrimitives = [].concat(booleans, strings, numbers, symbols, bigints)

var values = {
  hasSymbols: hasSymbols(),
  nonStrings: [].concat(nullPrimitives, booleans, numbers, symbols, objects, bigints),
  nullPrimitives: nullPrimitives,
  primitives: [].concat(nullPrimitives, nonNullPrimitives)
}

module.exports = {
  forEach: forEach,
  hasBigInts: hasBigInts,
  hasOverrideMistake: hasOverrideMistake,
  hasPropertyDescriptors: hasPropertyDescriptors,
  hasProto: hasProto,
  hasSymbols: hasSymbols,
  values: values
}
