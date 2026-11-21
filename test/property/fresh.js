'use strict'

// Properties of req.fresh and req.stale.

var assert = require('node:assert')
var http = require('node:http')
var fc = require('fast-check')
var fresh = require('fresh')
var express = require('../../')
var { check, timeout, listen, PROPERTY } = require('./support')

var METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'].concat(
  http.METHODS.includes('QUERY') ? ['QUERY'] : []
)
var STATUSES = [200, 201, 204, 206, 299, 300, 301, 304, 400, 404, 412, 500]
var TAGS = ['"a"', '"b"', 'W/"a"', 'W/"b"', '"abc-123"', '""']

var date = fc.date({
  min: new Date('2000-01-01T00:00:00Z'),
  max: new Date('2030-01-01T00:00:00Z'),
  noInvalidDate: true
})
var httpDate = fc.oneof(
  { weight: 9, arbitrary: date.map((d) => d.toUTCString()) },
  { weight: 1, arbitrary: fc.constantFrom('not a date', '0', 'Thu, 01 Jan 1970 00:00:00 GMT') }
)
var ifNoneMatch = fc.oneof(
  fc.constant('*'),
  fc.array(fc.constantFrom.apply(fc, TAGS), { minLength: 1, maxLength: 3 }).map((t) => t.join(', ')),
  fc.array(fc.constantFrom.apply(fc, TAGS), { minLength: 1, maxLength: 3 }).map((t) => t.join(','))
)
var cacheControl = fc.constantFrom('no-cache', 'max-age=0', 'public, no-cache', 'no-store', 'no-cachex', 'private')
var opt = (a) => fc.option(a, { nil: undefined })

var exchange = fc.record({
  method: fc.constantFrom.apply(fc, METHODS),
  status: fc.constantFrom.apply(fc, STATUSES),
  etag: opt(fc.constantFrom.apply(fc, TAGS)),
  lastModified: opt(httpDate),
  ifNoneMatch: opt(ifNoneMatch),
  ifModifiedSince: opt(httpDate),
  cacheControl: opt(cacheControl)
})

function defined(obj) {
  return Object.fromEntries(Object.entries(obj).filter((e) => e[1] !== undefined))
}

describe('property: req.fresh', function () {
  this.timeout(timeout(PROPERTY.numRuns, 4))

  var client
  var current
  var seen

  before(async function () {
    var app = express()
    app.all('/', function (req, res) {
      res.status(current.status)
      if (current.etag !== undefined) res.set('ETag', current.etag)
      if (current.lastModified !== undefined) res.set('Last-Modified', current.lastModified)
      seen = { fresh: req.fresh, stale: req.stale, headers: req.headers }
      res.end()
    })
    client = await listen(app)
  })

  after(function () {
    return client.close()
  })

  async function run(x) {
    current = x
    seen = null
    await client.request({
      method: x.method,
      headers: defined({
        'if-none-match': x.ifNoneMatch,
        'if-modified-since': x.ifModifiedSince,
        'cache-control': x.cacheControl
      })
    })
    return seen
  }

  it('agrees with the fresh package for GET, HEAD and QUERY with a 2xx or 304, and is false otherwise', async function () {
    await check(
      fc.asyncProperty(exchange, async function (x) {
        var r = await run(x)
        var conditional = ['GET', 'HEAD', 'QUERY'].includes(x.method)
        var cacheable = (x.status >= 200 && x.status < 300) || x.status === 304
        var expected = conditional && cacheable && fresh(r.headers, { etag: x.etag, 'last-modified': x.lastModified })
        assert.strictEqual(r.fresh, expected)
        assert.strictEqual(r.stale, !expected)
      })
    )
  })

  it('a GET whose If-None-Match lists the ETag is fresh, unless Cache-Control says no-cache', async function () {
    var listing = fc.record({
      etag: fc.constantFrom.apply(fc, TAGS),
      others: fc.array(fc.constantFrom.apply(fc, TAGS)),
      at: fc.nat(),
      noCache: fc.boolean()
    })
    await check(
      fc.asyncProperty(listing, async function (o) {
        var list = o.others.slice()
        list.splice(o.at % (list.length + 1), 0, o.etag)
        var r = await run({
          method: 'GET',
          status: 200,
          etag: o.etag,
          ifNoneMatch: list.join(', '),
          cacheControl: o.noCache ? 'no-cache' : undefined
        })
        assert.strictEqual(r.fresh, !o.noCache)
      })
    )
  })

  it('a GET is fresh by date exactly when Last-Modified is not after If-Modified-Since', async function () {
    await check(
      fc.asyncProperty(date, date, async function (modified, since) {
        var lastModified = modified.toUTCString()
        var ifModifiedSince = since.toUTCString()
        var r = await run({ method: 'GET', status: 200, lastModified: lastModified, ifModifiedSince: ifModifiedSince })
        assert.strictEqual(r.fresh, Date.parse(lastModified) <= Date.parse(ifModifiedSince))
      })
    )
  })

  it('a request with no conditional headers is never fresh', async function () {
    await check(
      fc.asyncProperty(exchange, async function (x) {
        var r = await run(Object.assign({}, x, { ifNoneMatch: undefined, ifModifiedSince: undefined }))
        assert.strictEqual(r.fresh, false)
      })
    )
  })
})
