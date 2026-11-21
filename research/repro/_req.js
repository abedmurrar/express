'use strict'
// Tiny helper: start an Express app on a port, make one raw http request, always close the server.
const http = require('node:http')

function run (app, port, opts = {}) {
  return new Promise((resolve) => {
    const server = app.listen(port, '127.0.0.1', () => {
      const req = http.request({
        host: '127.0.0.1',
        port,
        method: opts.method || 'GET',
        path: opts.path || '/',
        headers: opts.headers || {},
        setHost: opts.setHost !== false
      }, (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          server.close()
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })
        })
      })
      req.on('error', (err) => { server.close(); resolve({ error: err.message }) })
      req.setTimeout(3000, () => { req.destroy(new Error('timeout (no response in 3s)')) })
      req.end()
    })
  })
}

// EXPRESS_DIR lets the same repro run against a scratch copy with an open PR applied
module.exports = { run, express: require(process.env.EXPRESS_DIR || '../..') }
