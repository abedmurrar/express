'use strict'

// Helpers for the robustness suite. Every test talks to a real server
// (app.listen(0) or http.createServer(app)) over real sockets, mostly raw TCP
// ones, so a test controls exactly when bytes are sent, when the client stops
// reading and when it goes away. Waits are on events, or on short polls of
// server state where Node has no event for it (a file descriptor closing).

var assert = require('node:assert')
var fs = require('node:fs')
var http = require('node:http')
var net = require('node:net')
var os = require('node:os')
var path = require('node:path')
var { Buffer } = require('node:buffer')
var { once } = require('node:events')

// File descriptors are counted through /proc, so that part of a test runs
// on Linux only (CI runs Linux and Windows).
var canCountFds = process.platform === 'linux' && fs.existsSync('/proc/self/fd')

// Starts the app with app.listen(), or on http.createServer() with `plain`,
// and resolves with the server once it listens.
function listen(app, plain) {
  var server = plain ? http.createServer(app) : app.listen(0, '127.0.0.1')
  if (plain) server.listen(0, '127.0.0.1')
  return once(server, 'listening').then(function () {
    return server
  })
}

function close(server) {
  server.closeAllConnections()
  return new Promise(function (resolve) {
    server.close(function () {
      resolve()
    })
  })
}

// Raw connections opened by the current test, destroyed after it.
var sockets = []

// Opens a raw TCP connection to the server. Errors (a reset after the server
// closes) are ignored: the tests check what the server did.
function connect(server) {
  var socket = net.connect(server.address().port, '127.0.0.1')
  socket.setNoDelay(true)
  socket.on('error', function () {})
  sockets.push(socket)
  return socket
}

function destroySockets() {
  sockets.splice(0).forEach(function (socket) {
    socket.destroy()
  })
}

// Reads HTTP/1.1 responses off a raw socket, in order: next() resolves with
// { status, headers, body } for each response. Bodies are read by
// Content-Length (every response in this suite has one, or is never read to
// the end). Resolves with null when the connection closes first.
function reader(socket) {
  var buffer = Buffer.alloc(0)
  var waiting = []
  var ended = false

  socket.on('data', function (chunk) {
    buffer = Buffer.concat([buffer, chunk])
    drain()
  })
  socket.on('close', function () {
    ended = true
    drain()
  })

  function parse() {
    var end = buffer.indexOf('\r\n\r\n')
    if (end === -1) return undefined
    var lines = buffer.subarray(0, end).toString('latin1').split('\r\n')
    var headers = {}
    lines.slice(1).forEach(function (line) {
      var colon = line.indexOf(':')
      var name = line.slice(0, colon).toLowerCase()
      var value = line.slice(colon + 1).trim()
      headers[name] = name in headers ? headers[name] + ', ' + value : value
    })
    assert.ok(!('transfer-encoding' in headers), 'reader() needs a Content-Length response')
    var length = Number(headers['content-length'] || 0)
    if (buffer.length < end + 4 + length) return undefined
    var response = {
      status: Number(lines[0].split(' ')[1]),
      headers: headers,
      body: buffer.subarray(end + 4, end + 4 + length)
    }
    buffer = buffer.subarray(end + 4 + length)
    return response
  }

  function drain() {
    while (waiting.length) {
      var response = parse()
      if (response === undefined) {
        if (ended) waiting.shift()(null)
        else return
      } else {
        waiting.shift()(response)
      }
    }
  }

  return {
    next: function () {
      return new Promise(function (resolve) {
        waiting.push(resolve)
        drain()
      })
    },
    // the bytes received after the last parsed response
    rest: function () {
      return buffer
    }
  }
}

// A raw HTTP/1.1 request with a Host header.
function rawRequest(method, target, headers, body) {
  var head = method + ' ' + target + ' HTTP/1.1\r\nHost: localhost\r\n'
  Object.keys(headers || {}).forEach(function (name) {
    head += name + ': ' + headers[name] + '\r\n'
  })
  return Buffer.concat([Buffer.from(head + '\r\n', 'latin1'), Buffer.from(body || '')])
}

// Polls `check` every few milliseconds until it returns true, for server
// state that has no event (a file descriptor closing, a socket buffer
// filling). Fails after `timeout` ms with `message`.
function waitFor(check, message, timeout) {
  var deadline = Date.now() + (timeout || 3000)
  return new Promise(function (resolve, reject) {
    ;(function poll() {
      Promise.resolve(check()).then(function (ok) {
        if (ok) return resolve()
        if (Date.now() > deadline) return reject(new Error('timed out waiting: ' + message))
        setTimeout(poll, 2)
      }, reject)
    })()
  })
}

function connections(server) {
  return new Promise(function (resolve, reject) {
    server.getConnections(function (err, count) {
      if (err) reject(err)
      else resolve(count)
    })
  })
}

// The file descriptors of this process that are open on `file`. Vitest runs
// other test files in other threads of the same process, so the suite looks
// only at descriptors it can attribute to itself: its own temporary files,
// and the sockets it saw on its own server's port.
function fdsOnFile(file) {
  return readFds().filter(function (target) {
    return target === file
  }).length
}

// The socket inodes of this process's open TCP sockets with `port` at either
// end: the server's listening and accepted sockets, and the test's client
// sockets. Taken while the server still listens, so that a socket another
// thread opens later on the same port number (after the server closed) is
// not counted. Empty where /proc is missing.
function socketsOnPort(port) {
  var inodes = new Set()
  if (!canCountFds) return inodes
  ;['/proc/net/tcp', '/proc/net/tcp6'].forEach(function (table) {
    var text
    try {
      text = fs.readFileSync(table, 'utf8')
    } catch {
      return
    }
    text
      .split('\n')
      .slice(1)
      .forEach(function (line) {
        var fields = line.trim().split(/\s+/)
        if (fields.length < 10) return
        var local = parseInt(fields[1].split(':')[1], 16)
        var remote = parseInt(fields[2].split(':')[1], 16)
        if ((local === port || remote === port) && fields[9] !== '0') inodes.add(fields[9])
      })
  })
  var open = new Set()
  readFds().forEach(function (target) {
    var m = /^socket:\[(\d+)\]$/.exec(target)
    if (m !== null && inodes.has(m[1])) open.add(m[1])
  })
  return open
}

function readFds() {
  var targets = []
  fs.readdirSync('/proc/self/fd').forEach(function (fd) {
    try {
      targets.push(fs.readlinkSync('/proc/self/fd/' + fd))
    } catch {
      // closed between the listing and the read
    }
  })
  return targets
}

// Waits until no descriptor of this process is open on `file`, or on any of
// the `sockets` (from socketsOnPort). Does nothing where /proc is missing.
function noLeakedFds(file, sockets) {
  if (!canCountFds) return Promise.resolve()
  return waitFor(
    function () {
      if (file && fdsOnFile(file) !== 0) return false
      if (!sockets || sockets.size === 0) return true
      return !readFds().some(function (target) {
        var m = /^socket:\[(\d+)\]$/.exec(target)
        return m !== null && sockets.has(m[1])
      })
    },
    'descriptors left open on ' + (file || 'the sockets')
  )
}

// A large temporary file, made sparse (truncate), so it costs no disk and is
// quick to create. It holds zeros, apart from a short marker at the start, in
// the middle and at the end, so ranges can be checked.
function bigFile(name, size) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'express-robustness-'))
  var file = path.join(fs.realpathSync(dir), name)
  var fd = fs.openSync(file, 'w')
  fs.ftruncateSync(fd, size)
  fs.writeSync(fd, 'START', 0)
  fs.writeSync(fd, 'MIDDLE', size / 2)
  fs.writeSync(fd, 'END', size - 3)
  fs.closeSync(fd)
  return {
    dir: path.dirname(file),
    path: file,
    size: size,
    remove: function () {
      fs.rmSync(path.dirname(file), { recursive: true, force: true })
    }
  }
}

// Records uncaught exceptions and unhandled rejections while a test runs, so
// a test fails on its own when something escapes, instead of the whole run
// failing later with an error nobody can place.
function trackUncaught() {
  var errors = []
  function record(err) {
    errors.push(err)
  }
  return {
    start: function () {
      errors.length = 0
      process.on('uncaughtException', record)
      process.on('unhandledRejection', record)
    },
    stop: function () {
      process.removeListener('uncaughtException', record)
      process.removeListener('unhandledRejection', record)
      assert.deepStrictEqual(errors, [], 'uncaught errors')
    }
  }
}

// A promise and the function that resolves it.
function deferred() {
  var resolve
  var promise = new Promise(function (r) {
    resolve = r
  })
  return { promise: promise, resolve: resolve }
}

// Resolves when the signal aborts (at once if it has).
function aborted(signal) {
  if (signal.aborted) return Promise.resolve()
  return once(signal, 'abort')
}

module.exports = {
  aborted: aborted,
  bigFile: bigFile,
  canCountFds: canCountFds,
  close: close,
  connect: connect,
  connections: connections,
  deferred: deferred,
  destroySockets: destroySockets,
  fdsOnFile: fdsOnFile,
  listen: listen,
  noLeakedFds: noLeakedFds,
  rawRequest: rawRequest,
  socketsOnPort: socketsOnPort,
  reader: reader,
  trackUncaught: trackUncaught,
  waitFor: waitFor
}
