'use strict'

// Helpers for the security suite. Requests are written to a raw TCP socket,
// so the path reaches the server byte for byte (no client-side URL
// normalisation of `..`, `//`, `\` or percent-escapes), and the response is
// read back as raw bytes, so an injected header or a split response is seen
// exactly as a browser or proxy would see it.

var http = require('node:http')
var net = require('node:net')
var { Buffer } = require('node:buffer')

// Start `app` once and return a client for it. Tests that need the same app
// to answer several requests (for example a stateful RegExp) must reuse it.
function serve(app) {
  var server = http.createServer(app)
  var ready = new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', resolve)
  })

  function send(opts) {
    if (typeof opts === 'string') opts = { path: opts }
    return ready.then(function () {
      return raw(server.address().port, opts)
    })
  }

  send.close = function () {
    return new Promise(function (resolve) {
      server.close(resolve)
      server.closeAllConnections()
    })
  }

  return send
}

// Send one request to `app` on a fresh server and close it afterwards.
function request(app, opts) {
  var send = serve(app)
  return send(opts).then(function (res) {
    return send.close().then(function () {
      return res
    })
  })
}

function raw(port, opts) {
  var headers = Object.assign({ Host: 'localhost', Connection: 'close' }, opts.headers)
  var body = opts.body === undefined ? '' : opts.body
  if (opts.body !== undefined) headers['Content-Length'] = Buffer.byteLength(body)
  var head = (opts.method || 'GET') + ' ' + (opts.path || '/') + ' HTTP/1.1\r\n'
  for (var name in headers) head += name + ': ' + headers[name] + '\r\n'

  return new Promise(function (resolve, reject) {
    var chunks = []
    var socket = net.connect(port, '127.0.0.1', function () {
      // write, not end: a half-closed socket makes Node abort a streamed
      // file response. `Connection: close` makes the server close it.
      socket.write(head + '\r\n' + body)
    })
    socket.on('data', function (c) {
      chunks.push(c)
    })
    // A response that never ends (for example after an uncaught exception)
    // resolves with whatever arrived, so the test fails instead of hanging.
    socket.setTimeout(1000, function () {
      socket.destroy()
    })
    socket.on('error', reject)
    socket.on('close', function () {
      resolve(parse(Buffer.concat(chunks).toString('latin1')))
    })
  })
}

// Parse one raw HTTP/1.1 response. `lines` keeps every header line as sent;
// `headers` maps lower-cased names to values (repeated names are joined
// into an array). `extra` is anything after the declared body, which is
// where a second, smuggled response would show up.
function parse(text) {
  var end = text.indexOf('\r\n\r\n')
  if (end === -1) return { raw: text, status: 0, lines: [], headers: {}, body: '', extra: '' }
  var lines = text.slice(0, end).split('\r\n')
  var status = Number(lines.shift().split(' ')[1])
  var headers = {}
  lines.forEach(function (line) {
    var i = line.indexOf(':')
    var name = line.slice(0, i).toLowerCase()
    var value = line.slice(i + 1).trim()
    if (name in headers) headers[name] = [].concat(headers[name], value)
    else headers[name] = value
  })
  var rest = text.slice(end + 4)
  var body = rest
  var extra = ''
  if (headers['transfer-encoding'] === 'chunked') {
    body = ''
    var pos = 0
    for (;;) {
      var nl = rest.indexOf('\r\n', pos)
      var size = parseInt(rest.slice(pos, nl), 16)
      if (!size) {
        extra = rest.slice(nl + 4)
        break
      }
      body += rest.slice(nl + 2, nl + 2 + size)
      pos = nl + 2 + size + 2
    }
  } else if (headers['content-length'] !== undefined) {
    var length = Number(headers['content-length'])
    body = rest.slice(0, length)
    extra = rest.slice(length)
  }
  return { raw: text, status: status, lines: lines, headers: headers, body: body, extra: extra }
}

// An auth guard that records that it ran, and lets a request through only
// when it carries the right Authorization header.
function auth(req, res, next) {
  req.authChecked = true
  if (req.headers.authorization === 'letmein') return next()
  res.status(401).send('denied')
}

// The protected handler. It answers BYPASS when it runs without the guard
// having run first on the same request.
function secret(req, res) {
  res.send(req.authChecked ? 'secret' : 'BYPASS')
}

module.exports = { serve: serve, request: request, auth: auth, secret: secret }
