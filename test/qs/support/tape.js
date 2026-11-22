'use strict'

// A small tape-to-Vitest adapter, so qs's own test suite (written for tape 5)
// runs under the fork's Vitest unchanged, with coverage.
//
// - Each top-level `test(name, fn)` becomes a `describe` block. Its function
//   runs when Vitest collects the file, as tape runs it first, and registers
//   its subtests.
// - Each first-level subtest (`t.test(name, fn)`) becomes a Vitest test.
//   Deeper subtests run inside it, after their parent's function returns, in
//   order, as tape runs them. Their names are joined into the failure message.
// - The top-level test's own assertions are checked by one more Vitest test,
//   "(assertions)", after its subtests.
// - Assertions keep tape 5's semantics: `equal` and `notEqual` use
//   `Object.is`, `deepEqual` is strict (`util.isDeepStrictEqual`, which also
//   checks prototypes and array holes, as tape's `deep-equal` does in strict
//   mode), and `throws` takes an error constructor, a validator function, a
//   RegExp (matched against `String(error)`) or a validation object. A failed
//   assertion doesn't stop the test, as in tape; the test fails at its end
//   with every failure listed.
// - A test must call `end()` (once), or have a plan (`plan(n)`) that its
//   assertions meet, or have subtests, as tape requires.
// - `{ skip }` on a test skips it, and on an assertion skips that assertion.
// - `intercept()` and `teardown()` work as in tape; teardowns run when the
//   test and its subtests are done.
//
// QS_TAPE_STATS=1 prints the number of assertions run and skipped per file,
// to compare with a tape run of the same files.

var util = require('node:util')

var stats = { assertions: 0, skipped: 0 }

function Test(name) {
  this.name = name
  this.assertCount = 0
  this.failures = []
  this.subtests = []
  this.teardowns = []
  this.ended = false
  this.planned = undefined
}

function parseArgs(name, opts, fn) {
  if (typeof opts === 'function') {
    return { name: name, opts: {}, fn: opts }
  }
  return { name: name, opts: opts || {}, fn: fn }
}

Test.prototype._assert = function (ok, message, operator, extra, details) {
  if (extra && extra.skip) {
    stats.skipped += 1
    this.assertCount += 1
    return
  }
  stats.assertions += 1
  this.assertCount += 1
  if (!ok) {
    this.failures.push(
      (message || 'should be ' + operator) + ' (' + operator + ')' + (details ? '\n      ' + details : '')
    )
  }
}

function show(value) {
  return util.inspect(value, { depth: 6, breakLength: Infinity })
}

Test.prototype.ok = function (value, msg, extra) {
  this._assert(!!value, msg || 'should be truthy', 'ok', extra, 'got ' + show(value))
}

Test.prototype.notOk = function (value, msg, extra) {
  this._assert(!value, msg || 'should be falsy', 'notOk', extra, 'got ' + show(value))
}

Test.prototype.equal = function (actual, expected, msg, extra) {
  this._assert(
    Object.is(actual, expected),
    msg || 'should be strictly equal',
    'equal',
    extra,
    'expected ' + show(expected) + ', got ' + show(actual)
  )
}

Test.prototype.notEqual = function (actual, expected, msg, extra) {
  this._assert(
    !Object.is(actual, expected),
    msg || 'should not be strictly equal',
    'notEqual',
    extra,
    'both are ' + show(actual)
  )
}

Test.prototype.deepEqual = function (actual, expected, msg, extra) {
  this._assert(
    util.isDeepStrictEqual(actual, expected),
    msg || 'should be deeply equivalent',
    'deepEqual',
    extra,
    'expected ' + show(expected) + ', got ' + show(actual)
  )
}

Test.prototype.match = function (string, regexp, msg, extra) {
  this._assert(
    typeof string === 'string' && regexp.test(string),
    msg || 'The input did not match the regular expression ' + show(regexp),
    'match',
    extra,
    'got ' + show(string)
  )
}

function isErrorConstructor(fn) {
  return fn === Error || (typeof fn.prototype === 'object' && fn.prototype instanceof Error)
}

function matchesObject(error, expected) {
  if (!error || typeof error !== 'object') return false
  var keys = Object.keys(expected)
  if (expected instanceof Error) {
    keys.push('name', 'message')
  } else if (keys.length === 0) {
    throw new TypeError('`throws` validation object must not be empty')
  }
  return keys.every(function (key) {
    if (typeof error[key] === 'string' && expected[key] instanceof RegExp && expected[key].test(error[key])) {
      return true
    }
    return key in error && util.isDeepStrictEqual(error[key], expected[key])
  })
}

Test.prototype['throws'] = function (fn, expected, msg, extra) {
  if (typeof expected === 'string') {
    extra = msg
    msg = expected
    expected = undefined
  }
  var caught
  try {
    fn()
  } catch (err) {
    caught = { error: err }
  }
  var passed = !!caught
  if (caught) {
    if (typeof expected === 'function') {
      if (typeof expected.prototype !== 'undefined' && caught.error instanceof expected) {
        passed = true
      } else if (isErrorConstructor(expected)) {
        passed = false
      } else {
        passed = expected.call({}, caught.error) === true
      }
    } else if (expected instanceof RegExp) {
      passed = expected.test(String(caught.error))
    } else if (expected && typeof expected === 'object') {
      passed = matchesObject(caught.error, expected)
    }
  }
  this._assert(passed, msg || 'should throw', 'throws', extra, caught ? 'threw ' + show(caught.error) : 'did not throw')
}

Test.prototype.doesNotThrow = function (fn, expected, msg, extra) {
  if (typeof expected === 'string') {
    extra = msg
    msg = expected
  }
  var caught
  try {
    fn()
  } catch (err) {
    caught = err
  }
  this._assert(!caught, msg || 'should not throw', 'doesNotThrow', extra, caught ? 'threw ' + show(caught) : undefined)
}

Test.prototype.plan = function (n) {
  this.planned = n
}

Test.prototype.end = function (err) {
  if (err) {
    this.failures.push('end() called with an error: ' + show(err))
  }
  if (this.ended) {
    this.failures.push('.end() already called')
  }
  this.ended = true
}

Test.prototype.teardown = function (fn) {
  this.teardowns.push(fn)
}

Test.prototype.test = function (name, opts, fn) {
  this.subtests.push(parseArgs(name, opts, fn))
}

// tape's intercept(): an enumerable (unless `enumerable` is given) accessor
// that returns `desc.value` and, unless `writable`, throws on assignment.
// Restored by the test's teardown.
Test.prototype.intercept = function (obj, property, desc) {
  var d = desc || {}
  var value = d.value
  var writable = !!d.writable
  var restore = mockProperty(obj, property, {
    nonEnumerable: !!d.enumerable,
    get: function () {
      return value
    },
    set: function (v) {
      if (!writable) {
        throw new TypeError('Cannot assign to read only property `' + String(property) + '`')
      }
      value = v
    }
  })
  this.teardown(restore)
  return restore
}

// The parts of mock-property that qs's tests and intercept() use: delete a
// property, or define a data property or an accessor (configurable, and
// enumerable unless `nonEnumerable`). Returns a function that puts back the
// original property (or removes it if there was none).
function mockProperty(obj, prop, options) {
  var original = Object.getOwnPropertyDescriptor(obj, prop)
  if (options['delete']) {
    delete obj[prop]
  } else if (options.get || options.set) {
    Object.defineProperty(obj, prop, {
      configurable: true,
      enumerable: !options.nonEnumerable,
      get: options.get,
      set: options.set
    })
  } else {
    Object.defineProperty(obj, prop, {
      configurable: true,
      enumerable: !options.nonEnumerable,
      writable: !options.nonWritable,
      value: options.value
    })
  }
  return function restore() {
    if (original) {
      Object.defineProperty(obj, prop, original)
    } else {
      delete obj[prop]
    }
  }
}

// The checks tape makes when a test ends.
function endChecks(t) {
  var problems = t.failures.slice()
  if (typeof t.planned === 'number' && t.assertCount !== t.planned) {
    problems.push('plan != count: planned ' + t.planned + ', ran ' + t.assertCount)
  }
  if (!t.ended && typeof t.planned !== 'number' && t.subtests.length === 0) {
    problems.push('test exited without ending: ' + t.name)
  }
  return problems
}

// Runs a test's function, then its subtests in order, then its teardowns.
// Returns every failure; a subtest's are prefixed with its name.
function runInline(spec) {
  var t = new Test(spec.name)
  var problems = []
  try {
    spec.fn(t)
    problems = endChecks(t)
    t.subtests.forEach(function (sub) {
      if (sub.opts.skip) {
        stats.skipped += 1
        return
      }
      runInline(sub).forEach(function (p) {
        problems.push(sub.name + ' > ' + p)
      })
    })
  } finally {
    for (var j = t.teardowns.length - 1; j >= 0; j--) t.teardowns[j]()
  }
  return problems
}

function fail(problems) {
  if (problems.length) {
    throw new Error(problems.length + ' failed:\n  ' + problems.join('\n  '))
  }
}

function test(name, opts, fn) {
  var spec = parseArgs(name, opts, fn)
  if (spec.opts.skip) {
    describe.skip(spec.name, function () {
      it('(skipped)', function () {})
    })
    return
  }
  describe(spec.name, function () {
    var t = new Test(spec.name)
    spec.fn(t)
    t.subtests.forEach(function (sub) {
      if (sub.opts.skip) {
        it.skip(sub.name, function () {})
        stats.skipped += 1
        return
      }
      it(sub.name, function () {
        fail(runInline(sub))
      })
    })
    it('(assertions)', function () {
      try {
        fail(endChecks(t))
      } finally {
        for (var j = t.teardowns.length - 1; j >= 0; j--) t.teardowns[j]()
      }
    })
  })
}

if (process.env.QS_TAPE_STATS) {
  afterAll(function () {
    console.log('qs tape stats: ' + stats.assertions + ' assertions, ' + stats.skipped + ' skipped')
  })
}

module.exports = test
module.exports.mockProperty = mockProperty
