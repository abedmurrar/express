'use strict'

// Many requests at once: 500 requests in flight together across a few
// routes (route parameters, a query, a JSON body, an async handler that
// yields in the middle, res.locals set by middleware, and a 404), over
// keep-alive connections shared between them. Each request carries its own
// id in every place it can (path, query, header, body), and each answer must
// carry back that id and nothing from another request.

var assert = require('node:assert')
var http = require('node:http')
var { Buffer } = require('node:buffer')
var express = require('../..')
var support = require('./support')

var COUNT = 500

function build(barrier) {
  var app = express()
  if (barrier) app.use(barrier)
  app.use(function (req, res, next) {
    res.locals.id = req.get('X-Id')
    res.set('X-Echo-Id', req.get('X-Id'))
    next()
  })
  app.get('/user/:id', function (req, res) {
    res.json({ id: req.params.id, local: res.locals.id })
  })
  app.get('/search', function (req, res) {
    res.json({ id: req.query.id, local: res.locals.id })
  })
  app.post('/echo', express.json(), function (req, res) {
    res.json({ id: req.body.id, local: res.locals.id })
  })
  app.get('/async/:id', async function (req, res) {
    var before = req.params.id
    // let the other requests run in between
    await new Promise(setImmediate)
    await new Promise(setImmediate)
    res.json({
      id: before === req.params.id ? req.params.id : 'changed',
      local: res.locals.id,
      aborted: req.signal.aborted
    })
  })
  return app
}

function send(agent, port, i) {
  var id = 'r' + i
  var kind = i % 5
  var options = { agent: agent, host: '127.0.0.1', port: port, headers: { 'X-Id': id } }
  var body
  if (kind === 0) options.path = '/user/' + id
  if (kind === 1) options.path = '/search?id=' + id
  if (kind === 2) {
    options.method = 'POST'
    options.path = '/echo'
    body = JSON.stringify({ id: id })
    options.headers['Content-Type'] = 'application/json'
    options.headers['Content-Length'] = Buffer.byteLength(body)
  }
  if (kind === 3) options.path = '/async/' + id
  if (kind === 4) options.path = '/missing/' + id

  return new Promise(function (resolve, reject) {
    var req = http.request(options, function (res) {
      var text = ''
      res.setEncoding('utf8')
      res.on('data', function (chunk) {
        text += chunk
      })
      res.on('end', function () {
        resolve({ id: id, kind: kind, status: res.statusCode, echo: res.headers['x-echo-id'], text: text })
      })
    })
    req.on('error', reject)
    req.end(body)
  })
}

// A middleware that holds every request until `count` of them have arrived,
// so they are all in the app at the same time.
function holdUntil(count) {
  var arrived = 0
  var all = support.deferred()
  return function (req, res, next) {
    if (++arrived === count) all.resolve()
    all.promise.then(function () {
      next()
    })
  }
}

function check(results) {
  return results.filter(function (r) {
    if (r.echo !== r.id) return true
    if (r.kind === 4) return r.status !== 404
    if (r.status !== 200) return true
    var body = JSON.parse(r.text)
    if (body.id !== r.id || body.local !== r.id) return true
    return r.kind === 3 && body.aborted !== false
  })
}

describe('robustness: many concurrent requests', function () {
  var uncaught = support.trackUncaught()
  var server
  var agent

  beforeEach(function () {
    uncaught.start()
  })

  afterEach(async function () {
    if (agent) agent.destroy()
    if (server && server.listening) await support.close(server)
    server = undefined
    uncaught.stop()
  })

  it('answers ' + COUNT + ' requests in flight at once, each with its own data', async function () {
    var app = build()
    var sockets = new Set()
    server = await support.listen(app)
    server.on('connection', function (socket) {
      sockets.add(socket)
    })
    // keep-alive connections, fewer than the requests, so most connections
    // carry several requests one after another
    agent = new http.Agent({ keepAlive: true, maxSockets: 50 })

    var port = server.address().port
    var all = []
    for (var i = 0; i < COUNT; i++) all.push(send(agent, port, i))
    var results = await Promise.all(all)

    assert.deepStrictEqual(check(results), [])
    assert.strictEqual(results.length, COUNT)
    assert.ok(sockets.size <= 50, sockets.size + ' connections')
    assert.ok(sockets.size < COUNT / 2, 'the connections were reused')
  })

  it('answers ' + COUNT + ' requests held in the app at the same time, each on its own connection', async function () {
    server = await support.listen(build(holdUntil(COUNT)))
    var port = server.address().port
    var all = []
    for (var i = 0; i < COUNT; i++) all.push(send(false, port, i))
    var results = await Promise.all(all)

    assert.deepStrictEqual(check(results), [])
    assert.strictEqual(results.length, COUNT)
  })
})
