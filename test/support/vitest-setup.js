'use strict'

// Gives the test suite mocha's API on top of Vitest, so the tests written for
// mocha run unchanged:
//
// - a test or hook function that takes an argument gets mocha's `done`
//   callback: done() passes, done(err) fails, and a second call is an error;
// - functions run with a mocha-like `this`: `this.timeout()` and `this.slow()`
//   do nothing (vitest.config.js sets the timeouts) and `this.skip()` skips;
// - `before` and `after` are `beforeAll` and `afterAll`;
// - mocha's --check-leaks: a test file must not add properties to globalThis.

// mocha shares one `this` between a describe block's hooks and tests, and a
// nested block's context inherits from its parent's. Hooks and tests use the
// context of the block they are defined in.
var currentTest
var rootContext = {
  timeout() {},
  slow() {},
  skip() {
    if (currentTest && typeof currentTest.skip === 'function') currentTest.skip()
    throw new Error('this.skip() is only supported inside tests')
  }
}
var currentContext = rootContext

function withDone(fn) {
  if (typeof fn !== 'function') return fn
  var context = currentContext
  // No declared parameters: Vitest reads the first parameter of test and hook
  // functions to look for fixtures, so its context comes from `arguments`.
  return function () {
    currentTest = arguments[0]
    if (fn.length === 0) return fn.call(context)
    return new Promise(function (resolve, reject) {
      var called = false
      function done(err) {
        if (called) throw new Error('done() called multiple times')
        called = true
        if (err) reject(err instanceof Error ? err : new Error(String(err)))
        else resolve()
      }
      try {
        fn.call(context, done)
      } catch (err) {
        reject(err)
      }
    })
  }
}

// The child context is made when describe() is called, inside the parent's
// callback: Vitest may run a nested block's callback after the parent's
// callback has returned.
function withContext(fn) {
  if (typeof fn !== 'function') return fn
  var context = Object.create(currentContext)
  return function () {
    var saved = currentContext
    currentContext = context
    try {
      return fn.call(context)
    } finally {
      currentContext = saved
    }
  }
}

function wrapDescribe(original) {
  function wrapped(name, fn, options) {
    return original(name, withContext(fn), options)
  }
  wrapped.skip = function (name, fn, options) {
    return original.skip(name, withContext(fn), options)
  }
  wrapped.only = function (name, fn, options) {
    return original.only(name, withContext(fn), options)
  }
  wrapped.todo = original.todo
  return wrapped
}

function wrapTest(original) {
  function wrapped(name, fn, options) {
    return original(name, withDone(fn), options)
  }
  wrapped.skip = function (name, fn, options) {
    return original.skip(name, withDone(fn), options)
  }
  wrapped.only = function (name, fn, options) {
    return original.only(name, withDone(fn), options)
  }
  wrapped.todo = original.todo
  return wrapped
}

function wrapHook(original) {
  return function (fn, timeout) {
    return original(withDone(fn), timeout)
  }
}

globalThis.describe = wrapDescribe(globalThis.describe)
globalThis.it = wrapTest(globalThis.it)
globalThis.test = wrapTest(globalThis.test)
globalThis.before = wrapHook(globalThis.beforeAll)
globalThis.after = wrapHook(globalThis.afterAll)
globalThis.beforeAll = wrapHook(globalThis.beforeAll)
globalThis.afterAll = wrapHook(globalThis.afterAll)
globalThis.beforeEach = wrapHook(globalThis.beforeEach)
globalThis.afterEach = wrapHook(globalThis.afterEach)

// mocha's --check-leaks, per test file
var globalsAtStart = new Set(Object.keys(globalThis))
globalThis.afterAll(function () {
  var leaked = Object.keys(globalThis).filter(function (key) {
    return !globalsAtStart.has(key)
  })
  if (leaked.length) throw new Error('global leak detected: ' + leaked.join(', '))
})
