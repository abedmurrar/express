'use strict'

var assert = require('node:assert')
var childProcess = require('node:child_process')
var path = require('node:path')

var example = path.join(__dirname, '..', '..', 'examples', 'testing-without-a-port')

describe('testing-without-a-port', function () {
  it('should pass its own tests, run as documented', function () {
    var run = childProcess.spawnSync(process.execPath, ['--test', path.join(example, 'test.js')], {
      encoding: 'utf8'
    })

    assert.strictEqual(run.status, 0, run.stdout + run.stderr)
    assert.match(run.stdout, /pass 5\n/)
    assert.match(run.stdout, /fail 0\n/)
  })
})
