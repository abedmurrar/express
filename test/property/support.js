'use strict'

// Shared helpers for the property tests (test/property/) and the differential
// fuzzer. Every property runs with a fixed seed, so CI is deterministic.
//
//   PROPERTY_RUNS  runs per property (default 300)
//   PROPERTY_SEED  seed for the properties (default below)
//   FUZZ_RUNS      random apps tried by the differential fuzzer (default 300)
//   FUZZ_SEED      seed for the fuzzer
//
// A longer run, for example nightly: PROPERTY_RUNS=10000 FUZZ_RUNS=10000
// FUZZ_SEED=$RANDOM npm test. A failure prints the seed and path that
// reproduce it.

var http = require('node:http')
var { Buffer } = require('node:buffer')
var fc = require('fast-check')

var DEFAULT_SEED = 20261121

function envInt(name, fallback, min) {
  var value = process.env[name]
  if (value === undefined || value === '') return fallback
  var n = Number(value)
  if (!Number.isSafeInteger(n) || n < min) {
    throw new TypeError(name + ' must be an integer of at least ' + min + ', got ' + JSON.stringify(value))
  }
  return n
}

var PROPERTY = { numRuns: envInt('PROPERTY_RUNS', 300, 1), seed: envInt('PROPERTY_SEED', DEFAULT_SEED, -(2 ** 31)) }
var FUZZ = { numRuns: envInt('FUZZ_RUNS', 300, 1), seed: envInt('FUZZ_SEED', DEFAULT_SEED, -(2 ** 31)) }

// Run an (async) property with the shared settings.
function check(property, options) {
  return fc.assert(property, Object.assign({}, PROPERTY, options))
}

// A mocha timeout that grows with the number of runs.
function timeout(runs, perRunMs) {
  return 5000 + runs * (perRunMs || 2)
}

// Start `app` on a free port. The client keeps one connection alive, so a
// property can send thousands of requests cheaply. Responses resolve as
// { status, headers, body } with `body` a Buffer.
function listen(app) {
  return new Promise(function (resolve) {
    var server = http.createServer(app)
    var agent = new http.Agent({ keepAlive: true, maxSockets: 1 })
    server.listen(0, '127.0.0.1', function () {
      var port = server.address().port
      resolve({
        request: function (opts) {
          return send(agent, port, opts)
        },
        close: function () {
          agent.destroy()
          server.closeAllConnections()
          return new Promise(function (done) {
            server.close(done)
          })
        }
      })
    })
  })
}

function send(agent, port, opts) {
  return new Promise(function (resolve, reject) {
    var req = http.request(
      {
        agent: agent,
        host: '127.0.0.1',
        port: port,
        method: opts.method || 'GET',
        path: opts.path || '/',
        headers: opts.headers || {}
      },
      function (res) {
        var chunks = []
        res.on('data', function (c) {
          chunks.push(c)
        })
        res.on('end', function () {
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })
        })
      }
    )
    req.on('error', reject)
    req.end()
  })
}

// Every printable ASCII character, which is what a request target can carry
// unencoded through Node's HTTP client and parser.
var URL_CHARS = []
for (var c = 0x21; c <= 0x7e; c++) URL_CHARS.push(String.fromCharCode(c))

// Query strings: half built from qs-style keys (brackets, indexes,
// prototype names, percent-escapes), half any printable characters.
var queryPiece = fc.constantFrom(
  'a',
  'b',
  'Z',
  '0',
  '7',
  '-',
  '_',
  '.',
  '~',
  '+',
  ',',
  ':',
  '/',
  '?',
  '%20',
  '%25',
  '%26',
  '%3D',
  '%5B',
  '%5D',
  '%2E',
  '%E2%82%AC',
  '%C3',
  '%',
  '%zz',
  '__proto__',
  'constructor',
  'toString',
  'hasOwnProperty'
)
var queryWord = fc.array(queryPiece, { maxLength: 4 }).map(function (parts) {
  return parts.join('')
})
var queryBracket = fc.oneof(
  fc.constantFrom('[]', '[0]', '[1]', '[21]', '[__proto__]', '[constructor]', '[', ']', '.x'),
  queryWord.map(function (w) {
    return '[' + w + ']'
  })
)
var queryKey = fc.tuple(queryWord, fc.array(queryBracket, { maxLength: 3 })).map(function (t) {
  return t[0] + t[1].join('')
})
var queryPair = fc.oneof(
  queryKey,
  fc.tuple(queryKey, queryWord).map(function (t) {
    return t[0] + '=' + t[1]
  }),
  fc.tuple(queryKey, queryWord, queryWord).map(function (t) {
    return t[0] + '=' + t[1] + '=' + t[2]
  })
)
var structuredQuery = fc.array(queryPair, { maxLength: 8 }).map(function (pairs) {
  return pairs.join('&')
})
// "#" starts the fragment, which is not part of the query (see the fragment
// property in query.js).
var QUERY_CHARS = URL_CHARS.filter(function (ch) {
  return ch !== '#'
})
var rawQuery = fc.string({ unit: fc.constantFrom.apply(fc, QUERY_CHARS), maxLength: 40 })
var queryString = fc.oneof(structuredQuery, rawQuery)

module.exports = {
  check: check,
  timeout: timeout,
  listen: listen,
  PROPERTY: PROPERTY,
  FUZZ: FUZZ,
  URL_CHARS: URL_CHARS,
  QUERY_CHARS: QUERY_CHARS,
  queryString: queryString
}
