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
      if (p === file + path.sep) {
        stubbed++
        return realStat.call(fs, file, cb)
      }
      return realStat.apply(fs, arguments)
    }
    var server = http.createServer(function (req, res) {
      send(req, '/name.txt/', { root: FIXTURES, index: false }).pipe(res)
    })
    request(server)
      .get('/')
      .expect(404, function (err) {
        fs.stat = realStat
        if (!err) assert.strictEqual(stubbed, 1, 'the fs.stat stub was not used')
        done(err)
      })
  })

  // Windows reports these failures as ENOENT, so without a stub the other
  // cases of onStatError only run on Linux and macOS.
  ;['ENAMETOOLONG', 'ENOTDIR'].forEach(function (code) {
    it('answers 404 when stat fails with ' + code, function (done) {
      var realStat = fs.stat
      var file = path.join(FIXTURES, 'name.txt')
      var stubbed = 0
      fs.stat = function (p, cb) {
        if (p === file) {
          stubbed++
          var err = new Error(code)
          err.code = code
          return process.nextTick(cb, err)
        }
        return realStat.apply(fs, arguments)
      }
      var server = http.createServer(function (req, res) {
        send(req, '/name.txt', { root: FIXTURES }).pipe(res)
      })
      request(server)
        .get('/')
        .expect(404, function (err) {
          fs.stat = realStat
          if (!err) assert.strictEqual(stubbed, 1, 'the fs.stat stub was not used')
          done(err)
        })
    })
  })

  it('restores fs.stat after the test above', function () {
    assert.strictEqual(typeof fs.stat, 'function')
    assert.notStrictEqual(fs.stat.name, '')
  })

  // The tests below pin assertions that mutation testing (Stryker) showed
  // were missing: each one fails on at least one surviving mutant.

  describe('its own error page, with no error listener', function () {
    it('sends the full HTML document and the safety headers', function (done) {
      var server = http.createServer(function (req, res) {
        send(req, '/does-not-exist.txt', { root: FIXTURES }).pipe(res)
      })
      request(server)
        .get('/')
        .expect('Content-Type', 'text/html; charset=UTF-8')
        .expect('Content-Security-Policy', "default-src 'none'")
        .expect('X-Content-Type-Options', 'nosniff')
        .expect(404, htmlDocument('Error', 'Not Found'), done)
    })
  })

  describe('its directory redirect', function () {
    it('sends the full HTML document and the safety headers', function (done) {
      var server = http.createServer(function (req, res) {
        send(req, '/pets', { root: FIXTURES }).pipe(res)
      })
      request(server)
        .get('/')
        .expect('Location', '/pets/')
        .expect('Content-Type', 'text/html; charset=UTF-8')
        .expect('Content-Security-Policy', "default-src 'none'")
        .expect('X-Content-Type-Options', 'nosniff')
        .expect(301, htmlDocument('Redirecting', 'Redirecting to /pets/'), done)
    })
  })

  describe('a fresh conditional GET', function () {
    function serverWithStatus(status) {
      return http.createServer(function (req, res) {
        res.statusCode = status
        res.setHeader('Content-Encoding', 'identity')
        res.setHeader('Content-Length', '4')
        res.setHeader('Content-Range', 'bytes 0-3/4')
        send(req, '/name.txt', { root: FIXTURES }).pipe(res)
      })
    }

    it('answers 304 without content headers when the status is 200', function (done) {
      request(serverWithStatus(200))
        .get('/')
        .set('If-None-Match', '*')
        .expect(304)
        .expect(function (res) {
          assert.strictEqual(res.headers['content-encoding'], undefined)
          assert.strictEqual(res.headers['content-length'], undefined)
          assert.strictEqual(res.headers['content-range'], undefined)
          assert.strictEqual(res.headers['content-type'], undefined)
        })
        .end(done)
    })

    it('answers 304 without content headers when the status is already 304', function (done) {
      request(serverWithStatus(304))
        .get('/')
        .set('If-None-Match', '*')
        .expect(304)
        .expect(function (res) {
          assert.strictEqual(res.headers['content-length'], undefined)
          assert.strictEqual(res.headers['content-type'], undefined)
        })
        .end(done)
    })

    ;[300, 404].forEach(function (status) {
      it('sends the file when the status is ' + status, function (done) {
        request(serverWithStatus(status)).get('/').set('If-None-Match', '*').expect(status, 'tobi', done)
      })
    })
  })

  describe('If-Match', function () {
    function serverWithETag(etag) {
      return http.createServer(function (req, res) {
        res.setHeader('ETag', etag)
        send(req, '/name.txt', { root: FIXTURES }).pipe(res)
      })
    }

    it('matches a strong ETag given in weak form', function (done) {
      request(serverWithETag('"abc"')).get('/').set('If-Match', 'W/"abc"').expect(200, 'tobi', done)
    })

    it('matches a weak ETag given in strong form', function (done) {
      request(serverWithETag('W/"abc"')).get('/').set('If-Match', '"abc"').expect(200, 'tobi', done)
    })

    it('fails when no ETag matches', function (done) {
      request(serverWithETag('"abc"')).get('/').set('If-Match', '"abd"').expect(412, done)
    })
  })
})

function htmlDocument(title, body) {
  return (
    '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>' +
    title +
    '</title>\n</head>\n<body>\n<pre>' +
    body +
    '</pre>\n</body>\n</html>\n'
  )
}
