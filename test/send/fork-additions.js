'use strict'

// Tests this fork adds for the vendored send (kept apart from send's own
// test file so that file can be re-synced from upstream unchanged).

var assert = require('node:assert')
var fs = require('node:fs')
var http = require('node:http')
var path = require('node:path')
var request = require('supertest')
var send = require('../../lib/send')

var FIXTURES = path.join(__dirname, 'fixtures')

describe('send (fork additions)', function () {
  it('answers 404 when a path ending in a separator stats as a file', function (done) {
    // With index files off, a trailing separator goes straight to sendFile.
    // Linux and macOS reject "file/" with ENOTDIR before this point; Windows
    // can stat it as the file. Simulate that answer, and count that the stub
    // really ran.
    var stubbed = 0
    var realStat = fs.stat
    var file = path.join(FIXTURES, 'name.txt')
    fs.stat = function (p, cb) {
      if (p === file + path.sep) { stubbed++; return realStat.call(fs, file, cb) }
      return realStat.apply(fs, arguments)
    }
    var server = http.createServer(function (req, res) {
      send(req, '/name.txt/', { root: FIXTURES, index: false }).pipe(res)
    })
    request(server).get('/').expect(404, function (err) {
      fs.stat = realStat
      if (!err) assert.strictEqual(stubbed, 1, 'the fs.stat stub was not used')
      done(err)
    })
  })

  it('restores fs.stat after the test above', function () {
    assert.strictEqual(typeof fs.stat, 'function')
    assert.notStrictEqual(fs.stat.name, '')
  })
})
