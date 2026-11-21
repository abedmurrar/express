'use strict'

// Helpers shared by the differential harness (index.js) and the differential
// fuzzer (test/property/differential-fuzz.js): start an app, send one raw
// request, and reduce the response to what must match between the two
// Express copies.

var http = require('node:http')
var { Buffer } = require('node:buffer')

// Headers whose value depends on the moment, not on Express.
var VOLATILE = new Set(['date'])

function listen(app) {
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
          // A HEAD error page has no body to normalise, but its length still
          // counts the stack trace.
          var headErrorPage =
            req.method === 'HEAD' &&
            res.statusCode >= 400 &&
            res.headers['content-security-policy'] === "default-src 'none'"
          if (body !== raw || headErrorPage) {
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

module.exports = { listen: listen, request: request, normaliseBody: normaliseBody, close: close }
