'use strict'

// A regular file that stats as 0 bytes but has content, as Linux /proc and
// /sys files do (express#4944): send reads its first byte, and streams it to
// EOF with no Content-Length and no ranges. A really empty file is sent as
// before. The fake files here are real fixtures whose fs.stat answer is
// changed to size 0, so these tests run on every platform; the /proc tests
// run where /proc exists.

var assert = require('node:assert')
var fs = require('node:fs')
var http = require('node:http')
var os = require('node:os')
var path = require('node:path')
var request = require('supertest')
var express = require('../../')
var send = require('../../lib/send')

var FIXTURES = path.join(__dirname, 'fixtures')
var NAME = path.join(FIXTURES, 'name.txt') // "tobi"

// Make fs.stat report size 0 for `file`, and count the calls that did.
function statAsZero(file) {
  var realStat = fs.stat
  var stub = {
    calls: 0,
    restore: function () {
      fs.stat = realStat
    }
  }
  fs.stat = function (p, cb) {
    if (p !== file) return realStat.apply(fs, arguments)
    stub.calls++
    return realStat.call(fs, p, function (err, stat) {
      if (stat) stat.size = 0
      cb(err, stat)
    })
  }
  return stub
}

function sendServer(file, options) {
  return http.createServer(function (req, res) {
    send(req, path.basename(file), Object.assign({ root: path.dirname(file) }, options)).pipe(res)
  })
}

describe('send: files that stat as 0 bytes', function () {
  var stub

  afterEach(function () {
    if (stub) stub.restore()
    stub = null
  })

  describe('with content (size unknown)', function () {
    it('streams the file to EOF with no Content-Length', function () {
      stub = statAsZero(NAME)
      return request(sendServer(NAME))
        .get('/')
        .expect(200, 'tobi')
        .then(function (res) {
          assert.strictEqual(stub.calls, 1, 'the fs.stat stub was not used')
          assert.strictEqual(res.headers['content-length'], undefined)
          assert.strictEqual(res.headers['transfer-encoding'], 'chunked')
          assert.strictEqual(res.headers['content-type'], 'text/plain; charset=utf-8')
          assert.ok(res.headers.etag)
          assert.ok(res.headers['last-modified'])
        })
    })

    it('streams past the first chunk', function () {
      var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'express-zero-size-'))
      var file = path.join(dir, 'big.txt')
      var body = 'x'.repeat(300 * 1024)
      fs.writeFileSync(file, body)
      stub = statAsZero(file)
      return request(sendServer(file))
        .get('/')
        .expect(200)
        .then(function (res) {
          assert.strictEqual(res.text.length, body.length)
          assert.strictEqual(res.text, body)
        })
        .finally(function () {
          fs.rmSync(dir, { recursive: true, force: true })
        })
    })

    it('answers HEAD with no body and no Content-Length', function () {
      stub = statAsZero(NAME)
      return request(sendServer(NAME))
        .head('/')
        .expect(200)
        .then(function (res) {
          assert.strictEqual(res.headers['content-length'], undefined)
          assert.strictEqual(res.headers['transfer-encoding'], undefined)
          assert.strictEqual(res.text, undefined)
        })
    })

    it('ignores Range and sends the whole file', function () {
      stub = statAsZero(NAME)
      return request(sendServer(NAME))
        .get('/')
        .set('Range', 'bytes=1-2')
        .expect(200, 'tobi')
        .then(function (res) {
          assert.strictEqual(res.headers['content-range'], undefined)
          assert.strictEqual(res.headers['content-length'], undefined)
        })
    })

    it('ignores a Range that would be unsatisfiable for 0 bytes', function () {
      stub = statAsZero(NAME)
      return request(sendServer(NAME)).get('/').set('Range', 'bytes=0-0').expect(200, 'tobi')
    })

    it('still answers a fresh conditional GET with 304', function () {
      stub = statAsZero(NAME)
      var server = sendServer(NAME)
      return request(server)
        .get('/')
        .expect(200, 'tobi')
        .then(function (res) {
          return request(server).get('/').set('If-None-Match', res.headers.etag).expect(304)
        })
    })

    it('honours the start option', function () {
      stub = statAsZero(NAME)
      return request(sendServer(NAME, { start: 1 }))
        .get('/')
        .expect(200, 'obi')
    })

    it('honours the start and end options', function () {
      stub = statAsZero(NAME)
      return request(sendServer(NAME, { start: 1, end: 2 }))
        .get('/')
        .expect(200, 'ob')
    })

    it('drops a Content-Length set before it', function () {
      stub = statAsZero(NAME)
      var app = express()
      app.get('/', function (req, res) {
        res.sendFile(NAME, { headers: { 'Content-Length': '99' } })
      })
      return request(app)
        .get('/')
        .expect(200, 'tobi')
        .then(function (res) {
          assert.strictEqual(res.headers['content-length'], undefined)
        })
    })

    it('works through res.sendFile and res.download', function () {
      stub = statAsZero(NAME)
      var app = express()
      app.get('/file', function (req, res) {
        res.sendFile(NAME)
      })
      app.get('/download', function (req, res) {
        res.download(NAME, 'tobi.txt')
      })
      return request(app)
        .get('/file')
        .expect(200, 'tobi')
        .then(function () {
          return request(app)
            .get('/download')
            .expect('Content-Disposition', 'attachment; filename=tobi.txt')
            .expect(200)
        })
        .then(function (res) {
          assert.strictEqual(res.text, 'tobi')
          assert.strictEqual(stub.calls, 2)
        })
    })

    it('works through express.static', function () {
      stub = statAsZero(NAME)
      var app = express()
      app.use(express.static(FIXTURES))
      return request(app).get('/name.txt').expect(200, 'tobi')
    })
  })

  describe('really empty', function () {
    var EMPTY = path.join(FIXTURES, 'empty.txt')

    it('is sent with Content-Length 0, as before', function () {
      return request(sendServer(EMPTY)).get('/').expect('Content-Length', '0').expect(200, '')
    })

    it('answers HEAD with Content-Length 0', function () {
      return request(sendServer(EMPTY)).head('/').expect('Content-Length', '0').expect(200)
    })

    it('answers a Range with 416 and bytes */0', function () {
      return request(sendServer(EMPTY))
        .get('/')
        .set('Range', 'bytes=0-0')
        .expect('Content-Range', 'bytes */0')
        .expect(416)
    })

    it('keeps Accept-Ranges and the ETag', function () {
      return request(sendServer(EMPTY))
        .get('/')
        .expect('Accept-Ranges', 'bytes')
        .expect('ETag', /^W\/"0-/)
        .expect(200)
    })
  })

  describe('when the first byte cannot be read', function () {
    it('answers 404 when the file is gone by then', function () {
      var gone = path.join(FIXTURES, 'gone.txt')
      var realStat = fs.stat
      var emptyStat = fs.statSync(path.join(FIXTURES, 'empty.txt'))
      fs.stat = function (p, cb) {
        if (p === gone) return process.nextTick(cb, null, emptyStat)
        return realStat.apply(fs, arguments)
      }
      stub = {
        restore: function () {
          fs.stat = realStat
        }
      }
      return request(sendServer(gone)).get('/').expect(404)
    })

    it('answers 500 and closes the file when the read fails', function () {
      stub = statAsZero(NAME)
      var realRead = fs.read
      var realClose = fs.close
      var closed = 0
      fs.read = function (fd, buffer, offset, length, position, cb) {
        fs.read = realRead
        var err = new Error('EIO: i/o error, read')
        err.code = 'EIO'
        process.nextTick(cb, err, 0, buffer)
      }
      fs.close = function (fd, cb) {
        fs.close = realClose
        closed++
        return realClose.call(fs, fd, cb)
      }
      return Promise.resolve(request(sendServer(NAME)).get('/').expect(500))
        .finally(function () {
          fs.read = realRead
          fs.close = realClose
        })
        .then(function () {
          assert.strictEqual(closed, 1)
        })
    })

    it('restores fs.read and fs.close after the test above', function () {
      assert.notStrictEqual(fs.read.name, '')
      assert.notStrictEqual(fs.close.name, '')
    })
  })

  describe('/proc files', function () {
    before(function () {
      if (!fs.existsSync('/proc/version')) this.skip()
    })

    it('sends /proc/version whole', function () {
      var expected = fs.readFileSync('/proc/version', 'utf8')
      assert.strictEqual(fs.statSync('/proc/version').size, 0)
      var app = express()
      app.get('/', function (req, res) {
        res.sendFile('/proc/version')
      })
      return request(app)
        .get('/')
        .expect(200)
        .then(function (res) {
          assert.strictEqual(res.body.toString(), expected)
          assert.strictEqual(res.headers['content-length'], undefined)
        })
    })

    it('sends /proc/self/status, which is longer than one byte read', function () {
      var app = express()
      app.get('/', function (req, res) {
        res.sendFile('/proc/self/status')
      })
      return request(app)
        .get('/')
        .expect(200)
        .then(function (res) {
          assert.match(res.body.toString(), /^Name:\t/)
          assert.match(res.body.toString(), /\nPid:\t\d+\n/)
        })
    })
  })
})
