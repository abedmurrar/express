'use strict'

// Checks that the public types in typings/ and the implementation in src/
// describe the same thing. It writes down the members the built lib/ really
// has, and the options it really reads, then has tsc compare them, the src/
// interfaces and the typings (test/types-drift; the differences that are there
// on purpose are listed in drift.ts, with their reasons).

var { spawnSync } = require('node:child_process')
var EventEmitter = require('node:events')
var fs = require('node:fs')
var http = require('node:http')
var path = require('node:path')

var root = path.join(__dirname, '..')
var tests = path.join(root, 'test', 'types-drift')
var surfaceFile = path.join(tests, 'surface.json')

var express = require('..')

// What every function has of its own.
var functionNames = ['length', 'name', 'prototype', 'arguments', 'caller']

/** The names `objects` have of their own, as an object, without `inherited`'s. */
function members(objects, inherited) {
  var names = {}

  objects.forEach(function (object) {
    var skip = ['constructor'].concat(inherited || [], typeof object === 'function' ? functionNames : [])

    Object.getOwnPropertyNames(object).forEach(function (name) {
      if (name[0] !== '_' && skip.indexOf(name) === -1) names[name] = true
    })
  })
  return names
}

/** An options object that notes the name of each option read from it. */
function recorder(names, options) {
  return new Proxy(options || {}, {
    get: function (target, name, receiver) {
      if (typeof name === 'string') names[name] = true
      return Reflect.get(target, name, receiver)
    }
  })
}

async function main() {
  var app = express()
  var options = { json: {}, raw: {}, text: {}, urlencoded: {}, static: {}, sendFile: {}, download: {}, router: {} }
  var live = {}
  var settings = members([app.settings])

  app.settings = recorder(settings, app.settings)

  express.raw(recorder(options.raw))
  express.text(recorder(options.text))
  express.urlencoded(recorder(options.urlencoded, { extended: true }))

  var router = express.Router(recorder(options.router))
  var strictMount = express.Router({ strictMount: true })

  app.use(express.json(recorder(options.json)))
  app.use('/static', express.static(tests, recorder(options.static)))
  app.get('/send', function (req, res) {
    res.sendFile('tsconfig.json', recorder(options.sendFile, { root: tests }))
  })
  app.get('/download', function (req, res) {
    res.download('tsconfig.json', 'tsconfig.json', recorder(options.download, { root: tests }))
  })
  router.post('/:id', function (req, res) {
    live.request = members([req], Object.keys(live.node))
    live.response = members([res], Object.keys(live.nodeRes))
    res.end()
  })
  app.use('/router', router)
  app.get('/settings', function (req, res) {
    // what reads the settings that nothing above does
    void [req.query, req.ip, req.host, req.subdomains]
    app.engine('html', function () {})
    app.render('missing.html', function () {
      res.jsonp({})
    })
  })

  var sub = express()
  app.use('/sub', sub)

  var server = http.createServer(function (req, res) {
    // a plain request and response, to tell what Express adds to them
    live.node = members([req])
    live.nodeRes = members([res])
    app(req, res)
  })
  await new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', resolve)
  })
  var base = 'http://127.0.0.1:' + server.address().port

  var answers = [
    await fetch(base + '/static/tsconfig.json'),
    await fetch(base + '/send'),
    await fetch(base + '/download'),
    await fetch(base + '/settings'),
    await fetch(base + '/router/1', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    })
  ]
  for (var answer of answers) {
    if (answer.status !== 200) throw new Error(answer.url + ' answered ' + answer.status)
    await answer.arrayBuffer()
  }
  server.close()

  return {
    express: members([express]),
    request: Object.assign(members([express.request, app.request]), live.request),
    response: Object.assign(members([express.response, app.response]), live.response),
    application: members([app, sub], Object.getOwnPropertyNames(EventEmitter.prototype)),
    router: members([express.Router.prototype, router, strictMount]),
    route: members([express.Route.prototype, new express.Route('/')]),
    layer: members([router.stack[0], router.stack[0].route.stack[0], Object.getPrototypeOf(router.stack[0])]),
    settings: settings,
    options: options
  }
}

main().then(function (surface) {
  fs.writeFileSync(surfaceFile, JSON.stringify(surface, null, 2) + '\n')
  var tsc = spawnSync(process.execPath, [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', tests], {
    cwd: root,
    stdio: 'inherit'
  })
  process.exitCode = tsc.status === 0 ? 0 : 1
})
