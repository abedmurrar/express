'use strict'

// Not from upstream. Edge cases for the fork's fixes to res.links with empty
// values, res.append with an existing empty value, res.redirect's body for a
// status without a standard message, and a quoted ";" in the type
// parameters that res.format's keys are parsed with. The bug tests themselves
// are in test/regressions/response.js.

var assert = require('node:assert')
var http = require('node:http')
var express = require('..')
var request = require('supertest')
var utils = require('./support/utils')
var { normalizeType } = require('../lib/utils')

function appWith(handler) {
  var app = express()
  app.use(handler)
  return app
}

// Send one GET and resolve with the raw header lines for `name`, which
// supertest's merged headers hide.
function rawHeaderLines(app, name) {
  return new Promise(function (resolve, reject) {
    var server = http.createServer(app).listen(0, '127.0.0.1', function () {
      http
        .get({ host: '127.0.0.1', port: server.address().port, path: '/' }, function (res) {
          var lines = []
          for (var i = 0; i < res.rawHeaders.length; i += 2) {
            if (res.rawHeaders[i].toLowerCase() === name) lines.push(res.rawHeaders[i + 1])
          }
          res.resume()
          res.on('end', function () {
            server.close()
            resolve(lines)
          })
        })
        .on('error', function (err) {
          server.close()
          reject(err)
        })
    })
  })
}

describe('res.links with empty values (fork)', function () {
  it('sends no Link header for an empty object', function (done) {
    var app = appWith(function (req, res) {
      res.links({}).end()
    })
    request(app).get('/').expect(utils.shouldNotHaveHeader('Link')).expect(200, done)
  })

  it('sends no Link header when every relation is an empty array', function (done) {
    var app = appWith(function (req, res) {
      res.links({ prev: [], next: [] }).end()
    })
    request(app).get('/').expect(utils.shouldNotHaveHeader('Link')).expect(200, done)
  })

  it('leaves an existing Link header alone when every relation is an empty array', function (done) {
    var app = appWith(function (req, res) {
      res.links({ next: '/2' })
      res.links({ prev: [] })
      res.end()
    })
    request(app).get('/').expect('Link', '</2>; rel="next"').expect(200, done)
  })

  it('leaves a Link header set with res.set alone for an empty object', function (done) {
    var app = appWith(function (req, res) {
      res.set('Link', '</0>; rel="first"')
      res.links({})
      res.end()
    })
    request(app).get('/').expect('Link', '</0>; rel="first"').expect(200, done)
  })

  it('leaves an array Link header from res.append alone for an empty object', function (done) {
    var app = appWith(function (req, res) {
      res.append('Link', ['</a>', '</b>'])
      res.links({})
      res.end(JSON.stringify(res.get('Link')))
    })
    request(app).get('/').expect(200, '["</a>","</b>"]', done)
  })

  it('skips an empty array between two relations without a double comma', function (done) {
    var app = appWith(function (req, res) {
      res.links({ first: '/1', prev: [], last: '/9' }).end()
    })
    request(app).get('/').expect('Link', '</1>; rel="first", </9>; rel="last"').expect(200, done)
  })

  it('keeps the other URLs of an array relation and the order of relations', function (done) {
    var app = appWith(function (req, res) {
      res.links({ prev: [], alternate: ['/a', '/b'], next: '/2' }).end()
    })
    request(app)
      .get('/')
      .expect('Link', '</a>; rel="alternate", </b>; rel="alternate", </2>; rel="next"')
      .expect(200, done)
  })

  it('keeps an empty URL string, which is a link to the current document', function (done) {
    var app = appWith(function (req, res) {
      res.links({ self: [''] }).end()
    })
    request(app).get('/').expect('Link', '<>; rel="self"').expect(200, done)
  })

  it('returns the response from the empty case, for chaining', function (done) {
    var app = appWith(function (req, res) {
      assert.strictEqual(res.links({}), res)
      res.links({ prev: [] }).links({ next: '/2' }).end()
    })
    request(app).get('/').expect('Link', '</2>; rel="next"').expect(200, done)
  })

  it('still throws for a links value that is not an object, as before', function (done) {
    var app = appWith(function (req, res) {
      res.links(null)
    })
    request(app)
      .get('/')
      .expect(500, /Cannot convert undefined or null to object/, done)
  })
})

describe('res.append with an existing empty value (fork)', function () {
  it('keeps the empty value before an appended array', function (done) {
    var app = appWith(function (req, res) {
      res.set('X-A', '')
      res.append('X-A', ['b', 'c'])
      res.end(JSON.stringify(res.get('X-A')))
    })
    request(app).get('/').expect(200, '["","b","c"]', done)
  })

  it('keeps a number 0 set with res.setHeader', function (done) {
    var app = appWith(function (req, res) {
      res.setHeader('X-Count', 0)
      res.append('X-Count', '1')
      res.end(JSON.stringify(res.get('X-Count')))
    })
    request(app).get('/').expect(200, '["0","1"]', done)
  })

  it('appends to an empty value twice', function (done) {
    var app = appWith(function (req, res) {
      res.set('X-A', '')
      res.append('X-A', 'b').append('X-A', 'c')
      res.end(JSON.stringify(res.get('X-A')))
    })
    request(app).get('/').expect(200, '["","b","c"]', done)
  })

  it('sends the empty value as its own header line', async function () {
    var app = appWith(function (req, res) {
      res.set('X-A', '')
      res.append('X-A', 'b')
      res.end()
    })
    assert.deepStrictEqual(await rawHeaderLines(app, 'x-a'), ['', 'b'])
  })

  it('sets the value alone when the header is not set (unchanged)', function (done) {
    var app = appWith(function (req, res) {
      res.append('X-A', 'b')
      res.end(JSON.stringify(res.get('X-A')))
    })
    request(app).get('/').expect(200, '"b"', done)
  })

  it('appends to an empty array (unchanged)', function (done) {
    var app = appWith(function (req, res) {
      res.set('X-A', [])
      res.append('X-A', 'b')
      res.end(JSON.stringify(res.get('X-A')))
    })
    request(app).get('/').expect(200, '["b"]', done)
  })
})

describe('res.redirect with a non-standard status (fork)', function () {
  function redirecting(status) {
    return appWith(function (req, res) {
      res.redirect(status, '/next')
    })
  }

  it('names the status by its number in the text body', function (done) {
    request(redirecting(399))
      .get('/')
      .set('Accept', 'text/plain')
      .expect('Content-Type', 'text/plain; charset=utf-8')
      .expect('Location', '/next')
      .expect('Content-Length', '25')
      .expect(399, '399. Redirecting to /next', done)
  })

  it('names the status by its number in the HTML title and body', function (done) {
    request(redirecting(399))
      .get('/')
      .set('Accept', 'text/html')
      .expect('Content-Type', 'text/html; charset=utf-8')
      .expect(399, '<!DOCTYPE html><head><title>399</title></head><body><p>399. Redirecting to /next</p></body>', done)
  })

  it('counts the number in Content-Length for HEAD', function (done) {
    request(redirecting(399)).head('/').set('Accept', 'text/plain').expect('Content-Length', '25').expect(399, done)
  })

  it('names other unassigned statuses too', function (done) {
    request(redirecting(999)).get('/').set('Accept', 'text/plain').expect(999, '999. Redirecting to /next', done)
  })

  it('keeps the standard message for a standard status (unchanged)', function (done) {
    request(redirecting(308))
      .get('/')
      .set('Accept', 'text/plain')
      .expect(308, 'Permanent Redirect. Redirecting to /next', done)
  })

  it('keeps the empty body when neither text nor HTML is accepted (unchanged)', function (done) {
    request(redirecting(399)).get('/').set('Accept', 'image/png').expect('Content-Length', '0').expect(399, '', done)
  })

  it('still rejects a status that is not an integer, before sending a body', function (done) {
    request(redirecting('<b>'))
      .get('/')
      .set('Accept', 'text/html')
      .expect(500, /Invalid status code: &quot;&lt;b&gt;&quot;/, done)
  })
})

describe('utils.normalizeType with quoted parameters (fork)', function () {
  it('keeps a ";" inside a quoted value', function () {
    assert.deepStrictEqual(normalizeType('text/plain; foo="a;b"; bar=baz'), {
      value: 'text/plain',
      quality: 1,
      params: { foo: '"a;b"', bar: 'baz' }
    })
  })

  it('does not end the quoted value at an escaped quote', function () {
    assert.deepStrictEqual(normalizeType('text/plain; foo="a\\"b;c"; bar=baz'), {
      value: 'text/plain',
      quality: 1,
      params: { foo: '"a\\"b;c"', bar: 'baz' }
    })
  })

  it('ends the quoted value at a quote after an escaped backslash', function () {
    // upstream PR #7479 checks only the character before the quote, so it
    // reads this quote as escaped and swallows "; bar=baz"
    assert.deepStrictEqual(normalizeType('text/plain; foo="a\\\\"; bar=baz'), {
      value: 'text/plain',
      quality: 1,
      params: { foo: '"a\\\\"', bar: 'baz' }
    })
  })

  it('does not read a q inside a quoted value as the quality', function () {
    assert.deepStrictEqual(normalizeType('text/html; foo="x;q=0"'), {
      value: 'text/html',
      quality: 1,
      params: { foo: '"x;q=0"' }
    })
  })

  it('reads the quality next to a quoted value', function () {
    assert.deepStrictEqual(normalizeType('text/html;q=0.5; foo="a;b"'), {
      value: 'text/html',
      quality: 0.5,
      params: { foo: '"a;b"' }
    })
  })

  it('keeps "=" and ";" inside a quoted value', function () {
    assert.deepStrictEqual(normalizeType('text/plain; foo="a=b;c=d"'), {
      value: 'text/plain',
      quality: 1,
      params: { foo: '"a=b;c=d"' }
    })
  })

  it('skips a parameter without "=" before a quoted value', function () {
    assert.deepStrictEqual(normalizeType('text/plain; flag; foo="a;b"; other'), {
      value: 'text/plain',
      quality: 1,
      params: { foo: '"a;b"' }
    })
  })

  it('runs an unterminated quoted value to the end', function () {
    assert.deepStrictEqual(normalizeType('text/plain; foo="a;b'), {
      value: 'text/plain',
      quality: 1,
      params: { foo: '"a;b' }
    })
  })

  it('treats a trailing backslash in an unterminated value as part of it', function () {
    assert.deepStrictEqual(normalizeType('text/plain; foo="a\\'), {
      value: 'text/plain',
      quality: 1,
      params: { foo: '"a\\' }
    })
  })

  it('parses empty parameters, empty keys and spaces as before', function () {
    assert.deepStrictEqual(normalizeType('a/b;;;=x;q=0.2; ;k = v '), {
      value: 'a/b',
      quality: 0.2,
      params: { '': 'x', k: 'v' }
    })
  })

  it('lets res.format pick a key with a quoted parameter', function (done) {
    var app = appWith(function (req, res) {
      res.format({
        'text/plain; foo="a;b"': function () {
          res.send('plain')
        }
      })
    })
    request(app)
      .get('/')
      .set('Accept', 'text/plain')
      .expect('Content-Type', 'text/plain; charset=utf-8')
      .expect(200, 'plain', done)
  })
})
