'use strict'

// Properties of the ETag that res.send generates, for each "etag" setting.

var assert = require('node:assert')
var crypto = require('node:crypto')
var { Buffer } = require('node:buffer')
var fc = require('fast-check')
var express = require('../../')
var { check, timeout, listen, PROPERTY } = require('./support')

var body = fc.oneof(
  fc.string({ unit: 'binary', maxLength: 200 }),
  fc.uint8Array({ maxLength: 200 }).map((a) => Buffer.from(a))
)

function bytes(b) {
  return Buffer.isBuffer(b) ? b : Buffer.from(b, 'utf8')
}

// Reference: the length in hex and the first 27 characters of the base64
// SHA-1 of the body, quoted, with W/ for weak tags.
function reference(b, weak) {
  var buf = bytes(b)
  var hash = crypto.createHash('sha1').update(buf).digest('base64').substring(0, 27)
  return (weak ? 'W/' : '') + '"' + buf.length.toString(16) + '-' + hash + '"'
}

describe('property: ETag', function () {
  this.timeout(timeout(PROPERTY.numRuns, 8))

  var clients = {}
  var bodies = {}

  before(async function () {
    for (var setting of ['weak', 'strong', false]) {
      var app = express()
      app.set('etag', setting)
      app.get('/:slot', function (req, res) {
        res.send(bodies[req.params.slot])
      })
      clients[setting] = await listen(app)
    }
  })

  after(async function () {
    for (var c of Object.values(clients)) await c.close()
  })

  function get(setting, slot, headers) {
    return clients[setting].request({ path: '/' + slot, headers: headers })
  }

  for (var mode of ['weak', 'strong']) {
    describe(mode + ' (etag: ' + JSON.stringify(mode) + ')', function () {
      var setting = mode
      var weak = mode === 'weak'

      it('equals the reference: length and SHA-1 of the body bytes', async function () {
        await check(
          fc.asyncProperty(body, async function (b) {
            bodies.a = b
            var res = await get(setting, 'a')
            assert.strictEqual(res.headers.etag, reference(b, weak))
          })
        )
      })

      it('is equal for equal bodies and different for different bodies', async function () {
        // a string and the Buffer of its UTF-8 bytes are the same body
        var pair = fc.oneof(
          fc.tuple(body, body),
          body.map((b) => [b, b]),
          fc.string({ unit: 'binary', maxLength: 50 }).map((s) => [s, Buffer.from(s, 'utf8')])
        )
        await check(
          fc.asyncProperty(pair, async function ([x, y]) {
            bodies.x = x
            bodies.y = y
            var a = (await get(setting, 'x')).headers.etag
            var b = (await get(setting, 'y')).headers.etag
            assert.strictEqual(a === b, bytes(x).equals(bytes(y)), JSON.stringify([a, b]))
          })
        )
      })

      it('If-None-Match with the ETag gives 304 with no body; another ETag gives 200', async function () {
        await check(
          fc.asyncProperty(body, body, fc.constantFrom('GET', 'HEAD'), async function (b, other, method) {
            bodies.c = b
            var tag = (await get(setting, 'c')).headers.etag
            var match = await clients[setting].request({
              method: method,
              path: '/c',
              headers: { 'if-none-match': tag }
            })
            assert.strictEqual(match.status, 304)
            assert.strictEqual(match.body.length, 0)
            var otherTag = reference(other, weak)
            var miss = await clients[setting].request({
              method: method,
              path: '/c',
              headers: { 'if-none-match': otherTag }
            })
            var same = bytes(b).equals(bytes(other))
            assert.strictEqual(miss.status, same ? 304 : 200)
            if (!same && method === 'GET') assert.deepStrictEqual(miss.body, bytes(b))
          })
        )
      })
    })
  }

  it('etag: false never sends an ETag and never answers 304', async function () {
    await check(
      fc.asyncProperty(body, async function (b) {
        bodies.d = b
        var res = await get(false, 'd', { 'if-none-match': reference(b, true) + ', ' + reference(b, false) + ', *' })
        assert.strictEqual(res.headers.etag, undefined)
        assert.strictEqual(res.status, 200)
      })
    )
  })
})

// utils.etag and utils.wetag compute the tag with crypto.hash() (and hash
// UTF-8 strings without copying them into a Buffer). They must give exactly
// what the etag package (1.8.1) gives for the body's bytes, for every
// encoding res.send can pass.
describe('property: the ETag generator matches the etag package', function () {
  var etagPackage = require('etag')
  var utils = require('../../lib/utils')
  var encodings = [undefined, 'utf8', 'utf-8', 'latin1', 'binary', 'ascii', 'hex', 'base64', 'ucs2', 'utf16le']
  var anyBody = fc.oneof(
    fc.string({ unit: 'binary', maxLength: 3000 }),
    fc.string({ unit: 'grapheme', maxLength: 300 }),
    fc.uint8Array({ maxLength: 3000 }).map((a) => Buffer.from(a))
  )

  function expected(b, encoding, weak) {
    return etagPackage(Buffer.isBuffer(b) ? b : Buffer.from(b, encoding), { weak: weak })
  }

  for (var weak of [false, true]) {
    var generate = weak ? utils.wetag : utils.etag
    var label = weak ? 'wetag' : 'etag'

    it(label + ': equal for any body and encoding', function () {
      var g = generate
      var w = weak
      check(
        fc.property(anyBody, fc.constantFrom.apply(fc, encodings), function (b, encoding) {
          assert.strictEqual(g(b, encoding), expected(b, encoding, w))
        })
      )
    })

    it(label + ': equal for empty bodies, lone surrogates, NUL and the 1000-character boundary', function () {
      var cases = [
        '',
        Buffer.alloc(0),
        '\ud800',
        'a\udc00b',
        '\u0000',
        'x'.repeat(999),
        'x'.repeat(1000),
        'é'.repeat(700)
      ]
      for (var b of cases) {
        for (var encoding of encodings) {
          assert.strictEqual(
            generate(b, encoding),
            expected(b, encoding, weak),
            JSON.stringify([b, encoding]).slice(0, 60)
          )
        }
      }
    })
  }
})
