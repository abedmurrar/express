'use strict'

// The examples in the JSDoc of req.accepts*() and req.is(), and in
// docs/api/request.md. From expressjs/express#7452 by krzysdz, with the rest
// of the examples of these methods.

var assert = require('node:assert')
var express = require('../')
var http = require('node:http')

var examples = [
  // [headers, method, arguments, result]
  [{ Accept: 'text/html' }, 'accepts', ['html'], 'html'],
  [{ Accept: 'text/html' }, 'accepts', [], ['text/html']],
  [{ Accept: 'text/*, application/json' }, 'accepts', ['html'], 'html'],
  [{ Accept: 'text/*, application/json' }, 'accepts', ['text/html'], 'text/html'],
  [{ Accept: 'text/*, application/json' }, 'accepts', ['json', 'text'], 'json'],
  [{ Accept: 'text/*, application/json' }, 'accepts', [['json', 'text']], 'json'],
  [{ Accept: 'text/*, application/json' }, 'accepts', ['application/json'], 'application/json'],
  [{ Accept: 'text/*, application/json' }, 'accepts', ['image/png'], false],
  [{ Accept: 'text/*, application/json' }, 'accepts', ['png'], false],
  [{ Accept: 'text/*, application/json' }, 'accepts', ['json, html'], false],
  [{ Accept: 'text/*;q=.5, application/json' }, 'accepts', [['html', 'json']], 'json'],
  [{ Accept: 'text/*;q=.5, application/json' }, 'accepts', ['html', 'json'], 'json'],
  [{ Accept: 'text/*;q=.5, application/json' }, 'accepts', [], ['application/json', 'text/*']],
  [{}, 'accepts', [], ['*/*']],

  [{ 'Accept-Encoding': 'gzip' }, 'acceptsEncodings', ['gzip'], 'gzip'],
  [{ 'Accept-Encoding': 'gzip' }, 'acceptsEncodings', ['identity'], 'identity'],
  [{ 'Accept-Encoding': 'gzip' }, 'acceptsEncodings', ['zstd'], false],
  [{ 'Accept-Encoding': 'gzip' }, 'acceptsEncodings', [], ['gzip', 'identity']],
  [{ 'Accept-Encoding': 'gzip;q=0.5, br, identity;q=0' }, 'acceptsEncodings', ['identity'], false],
  [{ 'Accept-Encoding': 'gzip;q=0.5, br, identity;q=0' }, 'acceptsEncodings', ['gzip', 'br'], 'br'],
  [{ 'Accept-Encoding': 'gzip;q=0.5, br, identity;q=0' }, 'acceptsEncodings', [['gzip', 'br']], 'br'],
  [{ 'Accept-Encoding': 'gzip;q=0.5, br, identity;q=0' }, 'acceptsEncodings', [], ['br', 'gzip']],
  [{ 'Accept-Encoding': 'gzip, deflate' }, 'acceptsEncodings', ['gzip', 'deflate'], 'gzip'],
  [{ 'Accept-Encoding': 'gzip, deflate' }, 'acceptsEncodings', ['br'], false],
  [{ 'Accept-Encoding': 'gzip, deflate' }, 'acceptsEncodings', ['identity'], 'identity'],
  [{ 'Accept-Encoding': 'gzip, deflate' }, 'acceptsEncodings', [], ['gzip', 'deflate', 'identity']],

  [{ 'Accept-Charset': 'utf-8, iso-8859-1' }, 'acceptsCharsets', ['utf-8'], 'utf-8'],
  [{ 'Accept-Charset': 'utf-8, iso-8859-1' }, 'acceptsCharsets', ['utf-16'], false],
  [{ 'Accept-Charset': 'utf-8, iso-8859-1' }, 'acceptsCharsets', ['utf-8', 'iso-8859-1'], 'utf-8'],
  [{ 'Accept-Charset': 'utf-8, iso-8859-1' }, 'acceptsCharsets', [['utf-8', 'utf-16']], 'utf-8'],
  [{ 'Accept-Charset': 'utf-8, iso-8859-1' }, 'acceptsCharsets', ['utf-8, utf-16'], false],
  [{ 'Accept-Charset': 'utf-8, iso-8859-1' }, 'acceptsCharsets', [], ['utf-8', 'iso-8859-1']],
  [{ 'Accept-Charset': 'utf-8, iso-8859-1;q=0.5' }, 'acceptsCharsets', ['utf-8', 'iso-8859-1'], 'utf-8'],
  [{ 'Accept-Charset': 'utf-8, iso-8859-1;q=0.5' }, 'acceptsCharsets', ['us-ascii'], false],
  [{ 'Accept-Charset': 'utf-8, iso-8859-1;q=0.5' }, 'acceptsCharsets', [], ['utf-8', 'iso-8859-1']],

  [{ 'Accept-Language': 'en-gb, en;q=0.9' }, 'acceptsLanguages', ['en-gb'], 'en-gb'],
  [{ 'Accept-Language': 'en-gb, en;q=0.9' }, 'acceptsLanguages', ['de'], false],
  [{ 'Accept-Language': 'en-gb, en;q=0.9' }, 'acceptsLanguages', ['en', 'en-us', 'en-gb'], 'en-gb'],
  [{ 'Accept-Language': 'en-gb, en;q=0.9' }, 'acceptsLanguages', [['en', 'en-us']], 'en'],
  [{ 'Accept-Language': 'en-gb, en;q=0.9' }, 'acceptsLanguages', [], ['en-gb', 'en']],
  [{ 'Accept-Language': 'en;q=0.8, es' }, 'acceptsLanguages', ['en', 'es'], 'es'],
  [{ 'Accept-Language': 'en;q=0.8, es' }, 'acceptsLanguages', [], ['es', 'en']],

  [{ 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': 0 }, 'is', ['html'], 'html'],
  [{ 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': 0 }, 'is', ['text/html'], 'text/html'],
  [{ 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': 0 }, 'is', ['text/*'], 'text/html'],
  [{ 'Content-Type': 'application/json', 'Content-Length': 0 }, 'is', ['json'], 'json'],
  [{ 'Content-Type': 'application/json', 'Content-Length': 0 }, 'is', ['application/json'], 'application/json'],
  [{ 'Content-Type': 'application/json', 'Content-Length': 0 }, 'is', ['application/*'], 'application/json'],
  [{ 'Content-Type': 'application/json', 'Content-Length': 0 }, 'is', [['json', 'html']], 'json'],
  [{ 'Content-Type': 'application/json', 'Content-Length': 0 }, 'is', ['json', 'html'], 'json'],
  [{ 'Content-Type': 'application/json', 'Content-Length': 0 }, 'is', ['html'], false],
  [{ 'Content-Type': 'application/json', 'Content-Length': 0 }, 'is', ['xml', 'yaml'], false],
  [{ 'Content-Type': 'application/json' }, 'is', ['json'], null]
]

describe('JSDoc examples', function () {
  var current
  var result
  var server

  before(function (done) {
    var app = express()

    app.use(function (req, res) {
      result = req[current[1]].apply(req, current[2])
      res.end()
    })

    server = app.listen(0, done)
  })

  after(function (done) {
    server.close(done)
  })

  examples.forEach(function (example) {
    it(JSON.stringify(example), function (done) {
      current = example

      // node:http adds no Accept headers of its own
      http
        .get({ port: server.address().port, headers: example[0], agent: false }, function (res) {
          res.resume()
          assert.strictEqual(res.statusCode, 200)
          assert.deepStrictEqual(result, example[3])
          done()
        })
        .on('error', done)
    })
  })
})
