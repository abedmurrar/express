'use strict'

// Differential harness: every scenario runs on the baseline Express (5.3.0
// from npm, installed as `express-baseline`) and on this repository. Status,
// headers and body bytes must match, except for scenarios listed in
// `allowed`, which must differ (so the list never goes stale).
//
// The method of comparing two implementations response by response comes from
// ultimate-express's test runner (https://github.com/dimdenGD/ultimate-express).

var assert = require('node:assert')
var baseline = require('express-baseline')
var ours = require('../..')
var { scenarios, allowed } = require('./scenarios')
var { serve, sequence, close } = require('./support')

describe('differential: responses match Express 5.3.0', function () {
  scenarios.forEach(function (scenario) {
    it(scenario.name, async function () {
      var a = await serve(baseline, scenario.setup)
      var b = await serve(ours, scenario.setup)
      try {
        var expected = (await sequence(a, [scenario.req]))[0]
        var actual = (await sequence(b, [scenario.req]))[0]
      } finally {
        await close(a)
        await close(b)
      }

      if (Object.prototype.hasOwnProperty.call(allowed, scenario.name)) {
        assert.notDeepStrictEqual(
          actual,
          expected,
          'expected a difference (' + allowed[scenario.name] + '), but the responses match; remove it from `allowed`'
        )
        return
      }

      assert.deepStrictEqual(actual, expected)
    })
  })

  it('has unique scenario names, and every allowed entry exists', function () {
    var names = scenarios.map(function (s) {
      return s.name
    })
    assert.strictEqual(new Set(names).size, names.length)
    Object.keys(allowed).forEach(function (name) {
      assert.ok(names.includes(name), 'unknown scenario in allowed: ' + name)
    })
  })
})
