'use strict'

// Memory-leak check: for each instruction-count scenario
// (benchmarks/count/scenarios.ts), plus one that reads req.signal on every
// request, send a warm-up, then batches of requests, and check that the heap
// after a full GC does not grow from one batch to the next.
//
//   node --expose-gc scripts/heap-check.js [--requests N] [--express DIR] [--plant-leak]
//
// --requests    requests per batch (default 2,000, what CI runs; a long run
//               uses 100,000)
// --express     the Express to load (default: this repository's build), for
//               example node_modules/express-baseline for Express 5.3.0
// --plant-leak  keep every request in a module-level array, the leak the
//               check has to catch (test/robustness/memory.js runs it)
//
// Prints one JSON line per scenario and exits 1 if any scenario leaks.
//
// Requests are sent in-process, as benchmarks/count/worker.ts sends them:
// a real IncomingMessage and ServerResponse on one in-memory keep-alive
// socket that throws the bytes away. There is no kernel, parser or timer
// noise, and a leak through the shared socket (a listener added per request
// and never removed) shows up as well as one through a module-level object.
//
// The tolerance is 256 KB plus 16 bytes per request. Measured after two
// warm-up batches (JIT, inline caches, lazily compiled regexps), a batch
// without a leak moves the heap by -48 KB to +124 KB on Node 22 and 24, and
// that movement doesn't grow with the batch (+-20 KB after 100,000 requests),
// so it is noise, not a leak. A leak grows with every request: keeping each
// request (or a listener whose closure holds it) is 3.8 KB to 6 KB a
// request, 25 times the limit in a 2,000-request batch. One-off noise doesn't
// repeat, so a scenario passes when any one of up to 4 batches stays under
// the limit, and a leak, which grows every batch, fails all 4.
//
// What it can see: CI's 2,000-request batches catch a leak of about 150
// bytes a request or more (anything that holds a request, response, buffer
// or closure); 100,000-request batches catch about 20 bytes a request (a
// 32-byte object kept per request fails it, and passes the short run).

var assert = require('node:assert')
var path = require('node:path')
var { Buffer } = require('node:buffer')
var { IncomingMessage, ServerResponse } = require('node:http')
var { Duplex } = require('node:stream')
var { pathToFileURL } = require('node:url')

var NOISE = 256 * 1024
var BYTES_PER_REQUEST = 16
var BATCHES = 4

function option(name, fallback) {
  var i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

var requests = Number(option('--requests', 2000))
var expressDir = path.resolve(option('--express', path.join(__dirname, '..')))
var plantLeak = process.argv.includes('--plant-leak')

if (typeof globalThis.gc !== 'function') {
  process.stderr.write('Run with node --expose-gc\n')
  process.exit(2)
}

// the bytes of the response being checked, or null when not checking
var written = null

var socket = new Duplex({
  read: function () {},
  write: function (chunk, encoding, callback) {
    if (written !== null) written.push(chunk)
    callback()
  }
})

function send(app, request) {
  var req = new IncomingMessage(socket)
  req.method = request.method
  req.url = request.path
  req.httpVersion = '1.1'
  req.httpVersionMajor = 1
  req.httpVersionMinor = 1
  req.headers = { host: 'localhost' }
  req.rawHeaders = ['Host', 'localhost']
  var extra = request.headers || {}
  for (var name in extra) {
    // a new string from the bytes, as Node's parser makes for each request (and as benchmarks/count/worker.ts does)
    req.headers[name] = Buffer.from(extra[name], 'latin1').toString('latin1')
    req.rawHeaders.push(name, extra[name])
  }
  if (request.body !== undefined) {
    var length = String(Buffer.byteLength(request.body))
    req.headers['content-type'] = 'application/json'
    req.headers['content-length'] = length
    req.rawHeaders.push('Content-Type', 'application/json', 'Content-Length', length)
    req.push(request.body)
  }
  req.complete = true
  req.push(null)

  var res = new ServerResponse(req)
  res.shouldKeepAlive = true
  res.assignSocket(socket)
  return new Promise(function (resolve) {
    res.on('finish', function () {
      res.detachSocket(socket)
      resolve()
    })
    app(req, res)
  })
}

// Sends one request and checks the answer, so a scenario that answers
// differently fails instead of measuring something else.
async function checked(app, name, request) {
  written = []
  await send(app, request)
  var response = Buffer.concat(written).toString('utf8')
  written = null
  var status = Number(response.slice('HTTP/1.1 '.length, 'HTTP/1.1 '.length + 3))
  var body = response.slice(response.indexOf('\r\n\r\n') + 4)
  assert.strictEqual(status, request.status, name + ': ' + response)
  if (request.text !== undefined) assert.strictEqual(body, request.text, name + ': ' + response)
}

async function batch(app, request) {
  for (var i = 0; i < requests; i++) await send(app, request)
}

function heapUsed() {
  globalThis.gc()
  globalThis.gc()
  return process.memoryUsage().heapUsed
}

async function measure(name, app, request) {
  await checked(app, name, request)
  // warm-up: JIT, inline caches, lazily compiled regexps and parsers
  await batch(app, request)
  await batch(app, request)
  var before = heapUsed()
  var limit = NOISE + requests * BYTES_PER_REQUEST
  var growth = []
  for (var i = 0; i < BATCHES; i++) {
    await batch(app, request)
    var after = heapUsed()
    growth.push(after - before)
    before = after
    if (growth[i] <= limit) break
  }
  var leaked = growth.every(function (g) {
    return g > limit
  })
  return { scenario: name, requests: requests, limit: limit, growth: growth, leaked: leaked }
}

async function main() {
  var scenarios = await import(pathToFileURL(path.join(__dirname, '..', 'benchmarks', 'count', 'scenarios.ts')).href)
  var express = require(expressDir)

  var kept = []
  function createExpress() {
    var app = express()
    if (plantLeak) {
      app.use(function (req, res, next) {
        kept.push(req)
        next()
      })
    }
    return app
  }
  var wrapped = Object.assign(createExpress, { json: express.json })

  var runs = scenarios.SCENARIOS.map(function (name) {
    return { name: name, app: scenarios.createApp(wrapped, name), request: scenarios.REQUESTS[name] }
  })
  // req.signal, read on every request (an AbortController and two listeners
  // each time, which must go with the request)
  var signalApp = createExpress()
  signalApp.get('/', function (req, res) {
    res.send(req.signal.aborted ? 'aborted' : 'Hello World!')
  })
  runs.push({ name: 'signal', app: signalApp, request: scenarios.REQUESTS.hello })

  var failed = false
  for (var i = 0; i < runs.length; i++) {
    var result = await measure(runs[i].name, runs[i].app, runs[i].request)
    process.stdout.write(JSON.stringify(result) + '\n')
    if (result.leaked) failed = true
    // a planted leak starts again for each scenario, so the heap (and the
    // time each GC takes) stays small
    kept.length = 0
  }
  process.exitCode = failed ? 1 : 0
}

main().catch(function (err) {
  process.stderr.write(String(err && err.stack ? err.stack : err) + '\n')
  process.exit(2)
})
