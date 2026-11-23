'use strict'

// Run by test/fork-diagnostics-channel.js: `node diagnostics-throwing.js none`
// or `... throwing`. With `throwing`, every diagnostics_channel subscriber
// Express can reach throws, and so does a store bound on `start`. Prints the
// handlers that ran, the responses and the uncaught exceptions as JSON.

var { AsyncLocalStorage } = require('node:async_hooks')
var dc = require('node:diagnostics_channel')
var http = require('node:http')
var express = require('../../')

var uncaught = []
var calls = []

process.on('uncaughtException', function (err) {
  uncaught.push(err.message)
})

if (process.argv[2] === 'throwing') {
  var channel = dc.tracingChannel('express.router.request')
  var handlers = {}
  ;['start', 'end', 'asyncStart', 'asyncEnd', 'error'].forEach(function (phase) {
    handlers[phase] = function () {
      throw new Error('subscriber ' + phase)
    }
  })
  channel.subscribe(handlers)
  channel.start.bindStore(new AsyncLocalStorage(), function () {
    throw new Error('subscriber store')
  })
  dc.subscribe('express.initialization', function () {
    throw new Error('subscriber initialization')
  })
}

var app = express()
var api = express.Router()

app.param('id', function loadId(req, res, next) {
  calls.push('param')
  next()
})
app.use(function first(req, res, next) {
  calls.push('first')
  next()
})
api.get('/:id', async function item(req, res, next) {
  calls.push('item')
  await null
  next(new Error('item failed'))
})
api.use(function apiRecover(err, req, res, next) {
  calls.push('apiRecover')
  res.status(503).send(err.message)
})
app.use('/api', api)
app.get('/ok', async function ok(req, res) {
  calls.push('ok')
  await null
  res.send('fine')
})
app.get('/throw', function thrower() {
  calls.push('thrower')
  throw new Error('thrown')
})
// Express's final handler would print the stack, whose frames differ when
// traced (the tracing calls sit between the router and the handler)
app.use(function last(err, req, res, next) {
  calls.push('last')
  res.status(500).send(err.message)
})

var server = app.listen(0, '127.0.0.1', async function () {
  var results = []
  for (var url of ['/api/9', '/ok', '/throw', '/missing']) {
    results.push(await get(url))
  }
  server.close()
  // let the last rethrown subscriber errors arrive
  setImmediate(function () {
    process.stdout.write(JSON.stringify({ calls: calls, results: results, uncaught: uncaught }))
  })
})

function get(url) {
  return new Promise(function (resolve, reject) {
    http
      .get({ host: '127.0.0.1', port: server.address().port, path: url, agent: false }, function (res) {
        var body = ''
        res.setEncoding('utf8')
        res.on('data', function (chunk) {
          body += chunk
        })
        res.on('end', function () {
          resolve([url, res.statusCode, res.headers['content-type'], body])
        })
      })
      .on('error', reject)
  })
}
