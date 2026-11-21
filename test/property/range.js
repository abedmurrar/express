'use strict'

// Properties of req.range and of Range requests served by res.sendFile.

var assert = require('node:assert')
var fs = require('node:fs')
var os = require('node:os')
var path = require('node:path')
var { Buffer } = require('node:buffer')
var fc = require('fast-check')
var express = require('../../')
var { check, timeout, listen, PROPERTY } = require('./support')

var position = fc.oneof(fc.nat({ max: 40 }), fc.nat({ max: 4000 }), fc.constant(9007199254740993))
var spec = fc.oneof(
  { weight: 4, arbitrary: fc.tuple(position, position).map((t) => t[0] + '-' + t[1]) },
  { weight: 2, arbitrary: position.map((a) => a + '-') },
  { weight: 2, arbitrary: position.map((n) => '-' + n) },
  { weight: 1, arbitrary: fc.constantFrom('', '-', 'x-1', '1-x', ' 1 - 2 ', '--1', '1-2-3', '+1-2', '0x1-2', '1.5-2') }
)
var unit = fc.constantFrom('bytes', 'bytes', 'bytes', 'items', ' bytes', 'Bytes', '')
var rangeHeader = fc.oneof(
  { weight: 1, arbitrary: fc.constantFrom(undefined, '', 'bytes', '0-1', 'bytes=') },
  {
    weight: 9,
    arbitrary: fc
      .tuple(unit, fc.array(spec, { minLength: 1, maxLength: 5 }), fc.constantFrom(',', ', '))
      .map((t) => t[0] + '=' + t[1].join(t[2]))
  }
)
var size = fc.oneof(fc.nat({ max: 50 }), fc.nat({ max: 3000 }))

// The bytes a list of ranges covers, as a sorted list of offsets.
function covered(ranges) {
  var set = new Set()
  for (var r of ranges) for (var i = r.start; i <= r.end; i++) set.add(i)
  return Array.from(set).sort((a, b) => a - b)
}

describe('property: ranges', function () {
  this.timeout(timeout(PROPERTY.numRuns, 6))

  var client
  var args
  var result

  before(async function () {
    var app = express()
    app.get('/', function (req, res) {
      result = req.range.apply(req, args)
      res.end()
    })
    client = await listen(app)
  })

  after(function () {
    return client.close()
  })

  async function range(header, n, options) {
    args = [n, options]
    result = null
    await client.request({ headers: header === undefined ? {} : { range: header } })
    return result
  }

  it('req.range(n) gives -2, -1, undefined, or ranges inside [0, n - 1]', async function () {
    await check(
      fc.asyncProperty(rangeHeader, size, async function (header, n) {
        var r = await range(header, n)
        // HTTP drops the spaces around a header value
        var sent = header === undefined ? '' : header.trim()
        if (!sent) return assert.strictEqual(r, undefined)
        if (r === -1 || r === -2) return
        assert.ok(Array.isArray(r) && r.length > 0, String(r))
        assert.strictEqual(r.type, sent.slice(0, sent.indexOf('=')))
        for (var x of r) {
          assert.ok(Number.isSafeInteger(x.start) && Number.isSafeInteger(x.end), JSON.stringify(x))
          assert.ok(x.start >= 0 && x.start <= x.end && x.end <= n - 1, JSON.stringify({ n: n, x: x }))
        }
      })
    )
  })

  it('a single well-formed range matches the model', async function () {
    var one = fc.oneof(
      fc.tuple(fc.nat({ max: 4000 }), fc.nat({ max: 4000 })).map((t) => ({ start: t[0], end: t[1] })),
      fc.nat({ max: 4000 }).map((a) => ({ start: a })),
      fc.nat({ max: 4000 }).map((n) => ({ suffix: n }))
    )
    await check(
      fc.asyncProperty(one, size, async function (s, n) {
        var header =
          'bytes=' + (s.suffix !== undefined ? '-' + s.suffix : s.start + '-' + (s.end === undefined ? '' : s.end))
        var start = s.suffix !== undefined ? n - s.suffix : s.start
        var end = s.suffix !== undefined || s.end === undefined ? n - 1 : Math.min(s.end, n - 1)
        var expected = start < 0 || start > end ? -1 : [{ start: start, end: end }]
        var r = await range(header, n)
        assert.deepStrictEqual(Array.isArray(r) ? r.slice() : r, expected, header + ' size ' + n)
      })
    )
  })

  it('combine: ranges are disjoint, not adjacent, and cover the same bytes', async function () {
    await check(
      fc.asyncProperty(rangeHeader, fc.nat({ max: 300 }), async function (header, n) {
        var plain = await range(header, n)
        var combined = await range(header, n, { combine: true })
        if (!Array.isArray(plain)) return assert.strictEqual(combined, plain)
        assert.strictEqual(combined.type, plain.type)
        var sorted = combined.slice().sort((a, b) => a.start - b.start)
        for (var i = 1; i < sorted.length; i++) {
          assert.ok(sorted[i].start > sorted[i - 1].end + 1, JSON.stringify(combined))
        }
        assert.deepStrictEqual(covered(combined), covered(plain))
      })
    )
  })

  describe('res.sendFile', function () {
    var dir
    var files = {}
    var fileClient
    var seen

    before(async function () {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'express-property-range-'))
      var content = Buffer.alloc(1500)
      for (var i = 0; i < content.length; i++) content[i] = (i * 7919) % 251
      files.big = { path: path.join(dir, 'big.bin'), content: content }
      files.empty = { path: path.join(dir, 'empty.bin'), content: Buffer.alloc(0) }
      for (var f of Object.values(files)) fs.writeFileSync(f.path, f.content)
      var app = express()
      app.get('/:file', function (req, res) {
        var file = files[req.params.file]
        seen = req.range(file.content.length, { combine: true })
        res.sendFile(file.path)
      })
      fileClient = await listen(app)
    })

    after(async function () {
      await fileClient.close()
      fs.rmSync(dir, { recursive: true, force: true })
    })

    it('answers 206 with the bytes req.range(size) describes, 416, or the whole file', async function () {
      await check(
        fc.asyncProperty(rangeHeader, fc.constantFrom('big', 'big', 'big', 'empty'), async function (header, which) {
          var file = files[which]
          var len = file.content.length
          var res = await fileClient.request({
            path: '/' + which,
            headers: header === undefined ? {} : { range: header }
          })
          assert.strictEqual(res.headers['accept-ranges'], 'bytes')
          var isBytes = header !== undefined && /^ *bytes=/.test(header)
          if (isBytes && seen === -1) {
            assert.strictEqual(res.status, 416)
            assert.strictEqual(res.headers['content-range'], 'bytes */' + len)
          } else if (isBytes && Array.isArray(seen) && seen.length === 1) {
            var r = seen[0]
            assert.strictEqual(res.status, 206)
            assert.strictEqual(res.headers['content-range'], 'bytes ' + r.start + '-' + r.end + '/' + len)
            assert.deepStrictEqual(res.body, file.content.subarray(r.start, r.end + 1))
          } else {
            assert.strictEqual(res.status, 200, String(header))
            assert.deepStrictEqual(res.body, file.content)
          }
        })
      )
    })
  })
})
