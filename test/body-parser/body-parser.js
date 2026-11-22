'use strict'

const assert = require('node:assert')

const bodyParser = require('../../lib/body-parser')

describe('bodyParser()', function () {
  it('should throw an error', function () {
    assert.throws(bodyParser, /bodyParser\(\) generic has been split/)
  })
})
