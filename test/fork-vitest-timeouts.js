'use strict'

// test/support/vitest-setup.js gives mocha's this.timeout(ms) its meaning on
// Vitest: a describe block's call sets the timeout of the tests and hooks
// registered after it, in that block and the blocks inside it, never below
// vitest.config.js's timeouts. Inside a running test a call can't raise the
// timer Vitest has already started, so one that asks for more throws.

var assert = require('node:assert')
var config = require('../vitest.config.js').test

function currentTimeout() {
  return import('vitest').then(function (vitest) {
    return vitest.TestRunner.getCurrentTest().timeout
  })
}

describe('this.timeout() on Vitest', function () {
  describe('in a describe block', function () {
    this.timeout(config.testTimeout * 3)

    it('sets the timeout of its tests', function () {
      return currentTimeout().then(function (ms) {
        assert.strictEqual(ms, config.testTimeout * 3)
      })
    })

    describe('a nested block', function () {
      it('inherits it', function () {
        return currentTimeout().then(function (ms) {
          assert.strictEqual(ms, config.testTimeout * 3)
        })
      })
    })

    describe('a nested block with its own', function () {
      this.timeout(config.testTimeout * 2)

      it('uses its own', function () {
        return currentTimeout().then(function (ms) {
          assert.strictEqual(ms, config.testTimeout * 2)
        })
      })
    })

    it('leaves a timeout given to it() alone', function () {
      return currentTimeout().then(function (ms) {
        assert.strictEqual(ms, 1234)
      })
    }, 1234)
  })

  describe('asking for less than the configured timeout', function () {
    this.timeout(config.testTimeout / 2)

    it('keeps the configured one', function () {
      return currentTimeout().then(function (ms) {
        assert.strictEqual(ms, config.testTimeout)
      })
    })
  })

  describe('a block that never calls it', function () {
    it('keeps the configured one', function () {
      return currentTimeout().then(function (ms) {
        assert.strictEqual(ms, config.testTimeout)
      })
    })
  })

  describe('inside a running test', function () {
    it('throws when asked for more than the configured timeout', function () {
      var context = this
      assert.throws(function () {
        context.timeout(config.testTimeout + 1)
      }, /cannot raise its timeout: pass it as the third argument of it\(\)/)
    })

    it('accepts a shorter one, as the tests from mocha ask for', function () {
      this.timeout(config.testTimeout / 2)
    })
  })
})
