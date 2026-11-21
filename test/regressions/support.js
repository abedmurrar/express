'use strict'

// Helpers for the regression tests. Each confirmed bug is a test that asserts
// the correct behaviour. Until its fix lands it is declared with `bug()`,
// which skips it; the fix PR changes `bug(` to `it(`. Run every one of them,
// including the skipped ones, with REGRESSIONS_ALL=1 (they must all fail on
// an unfixed tree).

var http = require('node:http')
var { Buffer } = require('node:buffer')

function bug (title, item, fn) {
  var name = title + ' (roadmap: ' + item + ')'
  return process.env.REGRESSIONS_ALL ? it(name, fn) : it.skip(name, fn)
}

// Start the app on a free port, send one raw request, close the server, and
// resolve with { status, headers, body } or { error } if the client rejects
// the response.
function request (app, opts) {
  opts = opts || {}
  return new Promise(function (resolve) {
    var server = http.createServer(app).listen(0, '127.0.0.1', function () {
      var req = http.request({
        host: '127.0.0.1',
        port: server.address().port,
        method: opts.method || 'GET',
        path: opts.path || '/',
        headers: Object.assign({ connection: 'close' }, opts.headers),
        setHost: opts.setHost !== false
      }, function (res) {
        var chunks = []
        res.on('data', function (c) { chunks.push(c) })
        res.on('end', function () {
          server.close()
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })
        })
      })
      req.on('error', function (err) {
        server.close()
        resolve({ error: err.message })
      })
      req.end()
    })
  })
}

module.exports = { bug: bug, request: request }
