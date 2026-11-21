'use strict'

// Runs the generated scenarios (./generated.js) on Express 5.3.0 and on this
// repository, and requires byte-identical status, headers and body, like the
// hand-written scenarios in ./index.js.
//
// Two servers (one per side) stay up for the whole run, and each scenario
// swaps in a freshly built app, so a few thousand scenarios take seconds.

var assert = require('node:assert')
var http = require('node:http')
var baseline = require('express-baseline')
var ours = require('../..')
var { scenarios, groups } = require('./generated')
var { sequence, close, normaliseCookieExpires } = require('./support')

function listen() {
  var side = { app: null }
  side.server = http.createServer(function (req, res) {
    side.app(req, res)
  })
  return new Promise(function (resolve) {
    side.server.listen(0, '127.0.0.1', function () {
      resolve(side)
    })
  })
}

// The error page and the error log (outside the test env) print the stack
// trace, whose file paths and line numbers always differ between the two
// copies. ./support.js strips it from the body, but a HEAD response has no
// body, only a Content-Length that counts it. So while a scenario runs,
// errors carry no stack frames: their "stack" is just "Name: message", and
// the error page and its length are compared exactly on every method.
//
// What the app logs with console.error is compared too. A logged message is
// cut to its first line, because some messages go on to list file paths
// (a failed require prints its "Require stack"). Express logs from a
// setImmediate scheduled just before the error page is sent, so the capture
// stays on for one more turn of the event loop after the response.
async function respond(side, express, scenario) {
  var logged = []
  var log = console.error
  var limit = Error.stackTraceLimit
  console.error = function (message) {
    logged.push(String(message).split('\n')[0])
  }
  Error.stackTraceLimit = 0
  try {
    side.app = express()
    scenario.setup(side.app, express)
    var response = (await sequence(side.server, [scenario.req], normaliseCookieExpires))[0]
    await new Promise(setImmediate)
  } finally {
    console.error = log
    Error.stackTraceLimit = limit
  }
  response.logged = logged
  return response
}

describe('differential: generated scenarios match Express 5.3.0', function () {
  var a
  var b

  before(async function () {
    a = await listen()
    b = await listen()
  })

  after(async function () {
    await close(a.server)
    await close(b.server)
  })

  scenarios.forEach(function (scenario) {
    it(scenario.name, async function () {
      var expected = await respond(a, baseline, scenario)
      var actual = await respond(b, ours, scenario)
      assert.deepStrictEqual(actual, expected)
    })
  })

  it('generates 1,000+ scenarios with unique names', function () {
    var names = scenarios.map(function (s) {
      return s.name
    })
    assert.ok(names.length >= 1000, 'only ' + names.length + ' scenarios')
    assert.strictEqual(new Set(names).size, names.length)
  })

  it('covers every pair of values in every group', function () {
    groups.forEach(function (g) {
      var sizes = g.factors.map(function (f) {
        return f.length
      })
      for (var i = 0; i < sizes.length; i++) {
        for (var j = i + 1; j < sizes.length; j++) {
          var seen = new Set(
            g.rows.map(function (row) {
              return row[i] * sizes[j] + row[j]
            })
          )
          assert.strictEqual(seen.size, sizes[i] * sizes[j], g.name + ': factors ' + i + ' and ' + j)
        }
      }
    })
  })
})
