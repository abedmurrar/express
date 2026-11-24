'use strict'

// Memory-leak check: runs scripts/heap-check.js in a child process (it needs
// --expose-gc, and a heap of its own, away from the other test files that
// share this process). For every instruction-count scenario, plus req.signal
// read on every request, the heap after a full GC must not grow from one
// batch of requests to the next. The script explains the tolerance.
//
// CI sends 2,000 requests a batch (about 2 s), which catches anything that
// keeps a request, a response or a closure. The long run (about 40 s) also
// catches a leak of a few dozen bytes a request:
//
//   HEAP_REQUESTS=100000 npx vitest run test/robustness/memory.js
//   node --expose-gc scripts/heap-check.js --requests 100000

var assert = require('node:assert')
var path = require('node:path')
var { execFile } = require('node:child_process')

var SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'heap-check.js')

function run(args) {
  // no coverage for the child: NODE_V8_COVERAGE keeps per-function
  // counters, and every line of lib/ is covered by the other tests anyway
  var env = Object.assign({}, process.env)
  delete env.NODE_V8_COVERAGE
  return new Promise(function (resolve) {
    execFile(
      process.execPath,
      ['--expose-gc', SCRIPT].concat(args),
      { env: env, maxBuffer: 1024 * 1024 },
      function (err, stdout, stderr) {
        var results = stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(function (line) {
            return JSON.parse(line)
          })
        resolve({ code: err ? err.code : 0, results: results, output: stdout + stderr })
      }
    )
  })
}

var SCENARIOS = ['hello', 'json', 'params', 'mw10', 'routes100', 'post-json', 'not-found', 'query', 'format', 'signal']

describe('robustness: memory', function () {
  it('keeps the heap flat over a long run of each scenario', async function () {
    var out = await run(['--requests', process.env.HEAP_REQUESTS || '2000'])
    assert.strictEqual(out.code, 0, out.output)
    assert.deepStrictEqual(
      out.results.map(function (r) {
        return r.scenario + (r.leaked ? ' leaked' : '')
      }),
      SCENARIOS
    )
  }, 60000)

  it('catches a planted leak (every request kept in a module-level array)', async function () {
    var out = await run(['--requests', '300', '--plant-leak'])
    assert.strictEqual(out.code, 1, out.output)
    assert.deepStrictEqual(
      out.results.map(function (r) {
        return r.scenario + (r.leaked ? ' leaked' : '')
      }),
      SCENARIOS.map(function (name) {
        return name + ' leaked'
      })
    )
  }, 60000)
})
