'use strict'

// Differential harness: every scenario runs on the baseline Express (5.3.0
// from npm, installed as `express-baseline`) and on this repository. Status,
// headers and body bytes must match, except for scenarios listed in
// `allowed`, which must differ (so the list never goes stale).
//
// The method of comparing two implementations response by response comes from
// ultimate-express's test runner (https://github.com/dimdenGD/ultimate-express).

var assert = require('node:assert')
var http = require('node:http')
var { Buffer } = require('node:buffer')
var baseline = require('express-baseline')
var ours = require('../..')
var { scenarios, allowed } = require('./scenarios')

// Headers whose value depends on the moment, not on Express.
var VOLATILE = new Set(['date'])

function serve(express, scenario) {
  var app = express()
  scenario.setup(app, express)
  return new Promise(function (resolve) {
    var server = http.createServer(app).listen(0, '127.0.0.1', function () {
      resolve(server)
    })
  })
}

function request(server, req) {
  return new Promise(function (resolve, reject) {
    var headers = Object.assign({ host: 'localhost', connection: 'close' }, req.headers)
    var body = req.body === undefined ? null : Buffer.from(req.body)
    if (body) headers['content-length'] = String(body.length)
    var r = http.request(
      { port: server.address().port, host: '127.0.0.1', method: req.method, path: req.path, headers: headers },
      function (res) {
        var chunks = []
        res.on('data', function (c) {
          chunks.push(c)
        })
        res.on('end', function () {
          var pairs = []
          for (var i = 0; i < res.rawHeaders.length; i += 2) {
            var name = res.rawHeaders[i].toLowerCase()
            if (!VOLATILE.has(name)) pairs.push(name + ': ' + res.rawHeaders[i + 1])
          }
          var raw = Buffer.concat(chunks).toString('latin1')
          var body = normaliseBody(raw)
          if (body !== raw) {
            // the length header counts the stripped stack trace
            pairs = pairs.map(function (h) {
              return h.startsWith('content-length: ') ? 'content-length: <normalised>' : h
            })
          }
          resolve({ status: res.statusCode, headers: pairs, body: body })
        })
      }
    )
    r.on('error', function (err) {
      resolve({ error: err.code || err.message })
    })
    if (body) r.write(body)
    r.end()
  })
}

// Development error pages print a stack trace with file paths and line
// numbers, which always differ between the two copies. Keep only the first
// line (the message).
function normaliseBody(text) {
  return text.replace(/<pre>([^\n<]*)[\s\S]*?<\/pre>/g, '<pre>$1</pre>')
}

function close(server) {
  return new Promise(function (resolve) {
    server.close(resolve)
  })
}

describe('differential: responses match Express 5.3.0', function () {
  scenarios.forEach(function (scenario) {
    it(scenario.name, async function () {
      var a = await serve(baseline, scenario)
      var b = await serve(ours, scenario)
      try {
        var expected = await request(a, scenario.req)
        var actual = await request(b, scenario.req)
      } finally {
        await close(a)
        await close(b)
      }

      if (Object.prototype.hasOwnProperty.call(allowed, scenario.name)) {
        assert.notDeepStrictEqual(
          actual,
          expected,
          'expected a difference (' + allowed[scenario.name] + '), but the responses match; remove it from `allowed`'
        )
        return
      }

      assert.deepStrictEqual(actual, expected)
    })
  })

  it('has unique scenario names, and every allowed entry exists', function () {
    var names = scenarios.map(function (s) {
      return s.name
    })
    assert.strictEqual(new Set(names).size, names.length)
    Object.keys(allowed).forEach(function (name) {
      assert.ok(names.includes(name), 'unknown scenario in allowed: ' + name)
    })
  })
})
