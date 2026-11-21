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
var { listen, request, close } = require('./support')
var { scenarios, allowed } = require('./scenarios')

function serve(express, scenario) {
  var app = express()
  scenario.setup(app, express)
  return listen(app)
}

describe('differential: responses match Express 5.3.0', function () {
  scenarios.forEach(function (scenario) {
    it(scenario.name, async function () {
      var a = await serve(baseline, scenario)
      var b = await serve(ours, scenario)
      try {
        var expected = await request(a, scenario.req)
        var actual = await request(b, scenario.req)
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
