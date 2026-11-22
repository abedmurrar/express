'use strict'

// Tests this fork adds for the vendored negotiator (kept apart from
// negotiator's own test files so those can be re-synced from upstream
// unchanged). Our copy remembers each parsed Accept* header; these check the
// cache's edges against the npm negotiator 1.1.0, which parses every time.

var assert = require('node:assert')
var Negotiator = require('../../lib/negotiator')
var Upstream = require('negotiator')

var HEADERS = ['accept', 'accept-charset', 'accept-encoding', 'accept-language']

function answers(Ctor, headers) {
  var n = new Ctor({ headers: headers })
  return [
    n.mediaTypes(),
    n.mediaTypes(['text/html', 'application/json', 'text/plain;level=1']),
    n.charsets(),
    n.charsets(['utf-8', 'iso-8859-1']),
    n.encodings(),
    n.encodings(['gzip', 'br', 'identity']),
    n.encodings(['gzip', 'br', 'identity'], { preferred: ['br'] }),
    n.languages(),
    n.languages(['en-US', 'fr', 'de'])
  ]
}

describe('negotiator (fork additions)', function () {
  it('answers like upstream across more distinct headers than the cache holds', function () {
    // 250 distinct values per header empties each cache twice; the repeated
    // common header in between is served from the cache, then parsed again
    var common = {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-charset': 'utf-8, iso-8859-1;q=0.5',
      'accept-encoding': 'gzip, deflate, br',
      'accept-language': 'en-US,en;q=0.9'
    }
    for (var i = 0; i < 250; i++) {
      var headers = {
        accept: 'application/x-t' + i + ', text/*;q=0.' + (i % 10),
        'accept-charset': 'x-c' + i + ';q=0.' + (i % 10) + ', utf-8',
        'accept-encoding': 'x-e' + i + ', gzip;q=0.' + (i % 10),
        'accept-language': 'x-l' + i + ', en;q=0.' + (i % 10)
      }
      assert.deepStrictEqual(answers(Negotiator, headers), answers(Upstream, headers))
      assert.deepStrictEqual(answers(Negotiator, common), answers(Upstream, common))
    }
  })

  it('parses a header that is not a string every time, as upstream does', function () {
    HEADERS.forEach(function (name) {
      var headers = {}
      headers[name] = 1
      for (var i = 0; i < 3; i++) {
        assert.deepStrictEqual(answers(Negotiator, headers), answers(Upstream, headers))
      }
    })
  })

  it('throws like upstream for a header that cannot be read as text, every time', function () {
    HEADERS.forEach(function (name) {
      var headers = {}
      headers[name] = ['text/html']
      ;[Negotiator, Upstream, Negotiator].forEach(function (Ctor) {
        assert.throws(
          function () {
            answers(Ctor, headers)
          },
          { name: 'TypeError' }
        )
      })
    })
  })

  it('orders preferred encodings of the same quality like upstream', function () {
    var cases = [
      ['gzip, deflate, br', ['gzip', 'deflate', 'br'], ['zstd']],
      ['gzip, deflate, br', ['gzip', 'deflate', 'br'], ['br', 'gzip']],
      ['gzip, deflate, br', ['br', 'deflate', 'gzip'], ['deflate', 'br']],
      ['*', ['gzip', 'deflate'], ['zstd']],
      ['gzip;q=0.5, *', ['gzip', 'deflate', 'br'], ['gzip']],
      ['gzip, deflate, br', undefined, ['br', 'deflate']],
      ['gzip, deflate, br', undefined, ['zstd']]
    ]
    cases.forEach(function ([header, provided, preferred]) {
      var req = { headers: { 'accept-encoding': header } }
      for (var i = 0; i < 2; i++) {
        assert.deepStrictEqual(
          new Negotiator(req).encodings(provided, { preferred: preferred }),
          new Upstream(req).encodings(provided, { preferred: preferred }),
          JSON.stringify({ header, provided, preferred })
        )
      }
    })
  })

  it('gives every caller a fresh result array', function () {
    var req = { headers: { accept: 'text/html, application/json;q=0.5' } }
    var first = new Negotiator(req).mediaTypes()
    first.push('changed')
    first[0] = 'changed'
    assert.deepStrictEqual(new Negotiator(req).mediaTypes(), ['text/html', 'application/json'])
    var picked = new Negotiator(req).mediaTypes(['application/json', 'text/html'])
    picked.length = 0
    assert.deepStrictEqual(new Negotiator(req).mediaTypes(['application/json', 'text/html']), [
      'text/html',
      'application/json'
    ])
  })
})
