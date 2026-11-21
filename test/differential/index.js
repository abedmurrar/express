'use strict'

// Differential harness: every scenario runs on the baseline Express (5.3.0
// from npm, installed as `express-baseline`) and on this repository. Status,
// headers and body bytes must match, except for scenarios listed in
// `allowed`, which must differ (so the list never goes stale). Each scenario
// runs twice: on http.createServer(app) and on app.listen(), which takes a
// different path in this fork (no per-request prototype swap).
//
// The method of comparing two implementations response by response comes from
// ultimate-express's test runner (https://github.com/dimdenGD/ultimate-express).

var assert = require('node:assert')
var baseline = require('express-baseline')
var ours = require('../..')
var { scenarios, allowed } = require('./scenarios')
var { serve, sequence, close, useFixedClock } = require('./support')

describe('differential: responses match Express 5.3.0', function () {
  useFixedClock()

  var modes = [
    { prefix: '', listen: false },
    { prefix: 'app.listen(): ', listen: true }
  ]

  modes.forEach(function (mode) {
    scenarios.forEach(function (scenario) {
      it(mode.prefix + scenario.name, async function () {
        var a = await serve(baseline, scenario.setup, mode.listen)
        var b = await serve(ours, scenario.setup, mode.listen)
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
