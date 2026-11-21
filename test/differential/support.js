'use strict'

// Shared helpers for the differential checks (test/differential,
// test/ecosystem and test/property/differential-fuzz.js): start the same app on two Express copies, send the same
// requests to both, and collect comparable responses.

var http = require('node:http')
var { Buffer } = require('node:buffer')

// Headers whose value depends on the moment, not on Express.
var VOLATILE = new Set(['date'])

function serve(express, setup) {
  var app = express()
  setup(app, express)
  return new Promise(function (resolve) {
    var server = http.createServer(app).listen(0, '127.0.0.1', function () {
      resolve(server)
    })
  })
}

// Development error pages print a stack trace with file paths and line
// numbers, which always differ between the two copies. Keep only the first
// line (the message).
function normaliseBody(text) {
  return text.replace(/<pre>([^\n<]*)[\s\S]*?<\/pre>/g, '<pre>$1</pre>')
}

// Send one request. `normalise(name, value)` may rewrite a header value that
// legitimately differs between runs (a random session id, a timestamp).
function request(server, req, normalise) {
  return new Promise(function (resolve) {
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
            if (VOLATILE.has(name)) continue
            var value = normalise ? normalise(name, res.rawHeaders[i + 1]) : res.rawHeaders[i + 1]
            pairs.push(name + ': ' + value)
          }
          var raw = Buffer.concat(chunks).toString('latin1')
          var text = normaliseBody(raw)
          // A HEAD error page has no body to normalise, but its length still
          // counts the stack trace.
          var headErrorPage =
            req.method === 'HEAD' &&
            res.statusCode >= 400 &&
            res.headers['content-security-policy'] === "default-src 'none'"
          if (text !== raw || headErrorPage) {
            // the length header counts the stripped stack trace
            pairs = pairs.map(function (h) {
              return h.startsWith('content-length: ') ? 'content-length: <normalised>' : h
            })
          }
          resolve({ status: res.statusCode, headers: pairs, body: text, rawHeaders: res.headers })
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

function close(server) {
  return new Promise(function (resolve) {
    server.close(resolve)
  })
}

// Run a list of requests against one server in order. A request may be a
// function of the previous response (to carry a cookie forward).
async function sequence(server, steps, normalise) {
  var results = []
  var previous
  for (var step of steps) {
    var req = typeof step === 'function' ? step(previous) : step
    previous = await request(server, req, normalise)
    results.push(previous)
  }
  return results.map(function (r) {
    var copy = Object.assign({}, r)
    delete copy.rawHeaders
    return copy
  })
}

// Both implementations must see the same clock: res.cookie's `maxAge` sets
// Expires from Date.now(), and two requests a few milliseconds apart can fall
// on either side of a second. Call in a describe block; every test in it runs
// with Date.now() fixed.
var FIXED_NOW = Date.UTC(2026, 0, 1, 12, 0, 0)

function useFixedClock() {
  var realNow = Date.now
  beforeEach(function () {
    Date.now = function now() {
      return FIXED_NOW
    }
  })
  afterEach(function () {
    Date.now = realNow
  })
}

module.exports = {
  serve: serve,
  request: request,
  close: close,
  sequence: sequence,
  normaliseBody: normaliseBody,
  useFixedClock: useFixedClock
}
