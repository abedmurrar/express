'use strict'

// Differential harness: every scenario runs on the baseline Express (5.3.0
// from npm, installed as `express-baseline`) and on this repository. Status,
// headers and body bytes must match, except for scenarios listed in
// `allowed`, which must differ (so the list never goes stale). A key that
// starts with a mode's prefix ("app.listen(): ") applies to that mode only. Each scenario
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

        // an `allowed` key with the mode's prefix applies to that mode only
        var key = Object.hasOwn(allowed, mode.prefix + scenario.name) ? mode.prefix + scenario.name : scenario.name
        if (Object.hasOwn(allowed, key)) {
          assert.notDeepStrictEqual(
            actual,
            expected,
            'expected a difference (' + allowed[key] + '), but the responses match; remove it from `allowed`'
          )
          return
        }

        assert.deepStrictEqual(actual, expected)
      })
    })
  })

  // The baseline's dependencies are pinned in package.json `overrides`, so
  // every npm version compares against the same Express 5.3.0. Without the
  // pins, npm 10 (Node 22) installed router 2.3.0, which differs from the
  // router 2.2.0 that 5.3.0 shipped with. src/router is based on 2.3.0 now; the
  // pin stays, so `allowed` lists what that changed.
  it('runs Express 5.3.0 with its pinned dependencies', function () {
    var path = require('node:path')
    var root = path.join(__dirname, '..', '..')
    var pins = require(path.join(root, 'package.json')).overrides['express-baseline']
    var base = path.dirname(require.resolve('express-baseline/package.json'))
    assert.strictEqual(require(path.join(base, 'package.json')).version, '5.3.0')
    Object.keys(pins).forEach(function (name) {
      if (name === '.') return
      // the folder Node would load it from, starting at the baseline (some
      // packages don't export ./package.json, so no require.resolve)
      var fs = require('node:fs')
      var dir = base
      while (!fs.existsSync(path.join(dir, 'node_modules', name, 'package.json'))) dir = path.dirname(dir)
      var installed = require(path.join(dir, 'node_modules', name, 'package.json')).version
      assert.strictEqual(installed, pins[name], name + ' under express-baseline')
    })
  })

  it('has unique scenario names, and every allowed entry exists', function () {
    var names = scenarios.map(function (s) {
      return s.name
    })
    assert.strictEqual(new Set(names).size, names.length)
    Object.keys(allowed).forEach(function (name) {
      var unprefixed = modes.reduce(function (n, mode) {
        return mode.prefix && n.startsWith(mode.prefix) ? n.slice(mode.prefix.length) : n
      }, name)
      assert.ok(names.includes(unprefixed), 'unknown scenario in allowed: ' + name)
    })
  })
})
