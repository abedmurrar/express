'use strict'

// Not in Express 5.3.0: deprecation warnings for what the fork's 6.x line
// removes or changes (ROADMAP.md, "Our 6.0"), and for res.send(object)
// (expressjs/express#2249). Each case runs in its own Node process, because
// the warnings print once per process (or once per call site) to stderr, and
// test/support/env.js turns them off for the rest of the suite with
// NO_DEPRECATION. The child keeps the parent's environment otherwise, so its
// coverage is still collected.

var assert = require('node:assert')
var path = require('node:path')
var spawnSync = require('node:child_process').spawnSync

var ROOT = path.join(__dirname, '..')

// Runs `body` with `express`, `request` (supertest) and `assert` in scope,
// inside an async function, and returns the deprecation lines it printed.
function run(body, options) {
  var opts = options || {}
  var env = Object.assign({}, process.env, opts.env)
  if (!opts.env || !('NO_DEPRECATION' in opts.env)) delete env.NO_DEPRECATION
  var script =
    'var express = require(' +
    JSON.stringify(ROOT) +
    ');\n' +
    'var request = require(' +
    JSON.stringify(path.join(ROOT, 'node_modules', 'supertest')) +
    ');\n' +
    "var assert = require('node:assert');\n" +
    '(async function () {\n' +
    body +
    '\n})().catch(function (err) { console.log("FAILED " + err.stack); process.exitCode = 1 });\n'
  var child = spawnSync(process.execPath, (opts.args || []).concat(['-e', script]), {
    cwd: ROOT,
    encoding: 'utf8',
    env: env
  })
  assert.strictEqual(child.status, 0, child.stdout + child.stderr)
  return child.stderr.split('\n').filter(function (line) {
    return line.indexOf('express deprecated') !== -1
  })
}

// "express deprecated <message> at <file>:<line>:<column>"
function messages(lines) {
  return lines.map(function (line) {
    return line.replace(/^.*express deprecated /, '').replace(/ at \S+$/, '')
  })
}

describe('deprecations', function () {
  describe('res.send(object)', function () {
    it('warns once per process, naming res.json, for an object, array, number or boolean', function () {
      var lines = run(
        [
          'var app = express()',
          "app.get('/o', function (req, res) { res.send({ a: 1 }) })",
          "app.get('/a', function (req, res) { res.send([1]) })",
          "app.get('/n', function (req, res) { res.send(42) })",
          "app.get('/b', function (req, res) { res.send(true) })",
          "await request(app).get('/o').expect('Content-Type', /json/).expect(200, '{\"a\":1}')",
          "await request(app).get('/o').expect(200, '{\"a\":1}')",
          "await request(app).get('/a').expect(200, '[1]')",
          "await request(app).get('/n').expect(200, '42')",
          "await request(app).get('/b').expect(200, 'true')"
        ].join('\n')
      )
      assert.deepStrictEqual(messages(lines), ['res.send(object): Use res.json(object) instead'])
      assert.match(lines[0], / at \[eval\]:\d+:\d+$/)
    })

    it('names the type of the first value it sees', function () {
      var lines = run(
        [
          'var app = express()',
          "app.get('/', function (req, res) { res.send(42) })",
          "await request(app).get('/').expect(200, '42')"
        ].join('\n')
      )
      assert.deepStrictEqual(messages(lines), ['res.send(number): Use res.json(number) instead'])
    })

    it('does not warn for res.json, res.jsonp, or a string, Buffer, binary, null or undefined body', function () {
      var lines = run(
        [
          'var app = express()',
          "app.get('/json', function (req, res) { res.json({ a: 1 }) })",
          "app.get('/jsonp', function (req, res) { res.jsonp({ a: 1 }) })",
          "app.get('/string', function (req, res) { res.send('hi') })",
          "app.get('/buffer', function (req, res) { res.send(Buffer.from('hi')) })",
          "app.get('/view', function (req, res) { res.send(new Uint16Array([1])) })",
          "app.get('/ab', function (req, res) { res.send(new ArrayBuffer(2)) })",
          "app.get('/null', function (req, res) { res.send(null) })",
          "app.get('/undefined', function (req, res) { res.send() })",
          "app.get('/status', function (req, res) { res.sendStatus(204) })",
          "for (var p of ['/json', '/jsonp', '/string', '/buffer', '/view', '/ab', '/null', '/undefined', '/status']) {",
          '  await request(app).get(p)',
          '}'
        ].join('\n')
      )
      assert.deepStrictEqual(lines, [])
    })
  })

  describe("res.set('Content-Type', extension)", function () {
    it('warns once per process, naming res.type, and still sets the looked-up type', function () {
      var lines = run(
        [
          'var app = express()',
          "app.get('/', function (req, res) { res.set('Content-Type', 'json').end('{}') })",
          "app.get('/html', function (req, res) { res.set({ 'Content-Type': 'html' }).end('') })",
          "await request(app).get('/').expect('Content-Type', 'application/json; charset=utf-8').expect(200)",
          "await request(app).get('/').expect(200)",
          "await request(app).get('/html').expect('Content-Type', 'text/html; charset=utf-8').expect(200)"
        ].join('\n')
      )
      assert.deepStrictEqual(messages(lines), ["res.set('Content-Type', 'json'): Use res.type('json') instead"])
    })

    it('does not warn for a full type, an unknown value, other headers or res.type', function () {
      var lines = run(
        [
          'var app = express()',
          'app.get("/", function (req, res) {',
          "  res.set('Content-Type', 'text/html')",
          "  res.set('content-type', 'application/json; charset=utf-8')",
          "  res.set('Content-Type', 'not-a-type')",
          "  res.set('X-Kind', 'json')",
          "  for (var i = 0; i < 101; i++) res.set('Content-Type', 'x/y' + i)",
          "  res.type('json')",
          "  res.send('{}')",
          '})',
          "await request(app).get('/').expect('Content-Type', 'application/json; charset=utf-8').expect(200)"
        ].join('\n')
      )
      assert.deepStrictEqual(lines, [])
    })
  })

  describe("app.set('trust proxy', number)", function () {
    it('warns once per call site', function () {
      var lines = run(
        [
          'function make(n) { var app = express(); app.set("trust proxy", n); return app }',
          'make(1)',
          'make(2)',
          "express().set('trust proxy', 0)",
          "var app = express(); app.set('trust proxy', 1)",
          "app.get('/', function (req, res) { res.send(req.ip) })",
          "await request(app).get('/').set('X-Forwarded-For', '10.0.0.9').expect(200, '10.0.0.9')"
        ].join('\n')
      )
      assert.deepStrictEqual(messages(lines), [
        "app.set('trust proxy', 1): a hop count throws in 6.x; list the proxy addresses or subnets instead",
        "app.set('trust proxy', 0): a hop count throws in 6.x; list the proxy addresses or subnets instead",
        "app.set('trust proxy', 1): a hop count throws in 6.x; list the proxy addresses or subnets instead"
      ])
    })

    it('does not warn for true, false, addresses, a list or a function', function () {
      var lines = run(
        [
          'var app = express()',
          "app.set('trust proxy', true)",
          "app.set('trust proxy', false)",
          "app.set('trust proxy', 'loopback, 10.0.0.0/8')",
          "app.set('trust proxy', ['loopback'])",
          "app.set('trust proxy', function () { return true })",
          "app.enable('trust proxy')"
        ].join('\n')
      )
      assert.deepStrictEqual(lines, [])
    })
  })

  describe("req.get('referer')", function () {
    it('warns once per process when Referer and Referrer differ, and still returns Referrer', function () {
      var lines = run(
        [
          'var app = express()',
          "app.get('/', function (req, res) { res.send(req.get('Referer') + ' ' + req.header('referrer')) })",
          "await request(app).get('/').set('Referer', 'https://a.example/').set('Referrer', 'https://b.example/')",
          "  .expect(200, 'https://b.example/ https://b.example/')"
        ].join('\n')
      )
      assert.deepStrictEqual(messages(lines), [
        "req.get('Referer'): this request has different Referer and Referrer headers; 6.x returns Referer, not Referrer"
      ])
    })

    it('does not warn for one of the two headers, or both with the same value', function () {
      var lines = run(
        [
          'var app = express()',
          "app.get('/', function (req, res) { res.send(String(req.get('referer')) + ' ' + req.get('host').length) })",
          "await request(app).get('/').expect(200, /^undefined/)",
          "await request(app).get('/').set('Referer', 'https://a.example/').expect(200, /^https:\\/\\/a/)",
          "await request(app).get('/').set('Referrer', 'https://b.example/').expect(200, /^https:\\/\\/b/)",
          "await request(app).get('/').set('Referer', 'https://c.example/').set('Referrer', 'https://c.example/')",
          '  .expect(200, /^https:\\/\\/c/)'
        ].join('\n')
      )
      assert.deepStrictEqual(lines, [])
    })
  })

  describe('req.query over the parameter limit', function () {
    // n "&"-separated parts: k0=0&k1=1&...
    var parts =
      'function parts(n) { return Array.from({ length: n }, function (_, i) { return "k" + i + "=" + i }).join("&") }'

    it('warns once per process when a built-in parser drops parameters, which it still does', function () {
      var lines = run(
        [
          parts,
          'for (var setting of ["simple", "extended", true]) {',
          '  var app = express()',
          "  app.set('query parser', setting)",
          "  app.get('/', function (req, res) { res.send(String(Object.keys(req.query).length)) })",
          "  await request(app).get('/?' + parts(1001)).expect(200, '1000')",
          "  await request(app).get('/?' + parts(1001) + '&k1001=1').expect(200, '1000')",
          '}'
        ].join('\n')
      )
      assert.deepStrictEqual(messages(lines), [
        'req.query: the query string has more than 1000 parameters and the rest were dropped; 6.x answers 400 instead'
      ])
    })

    it('counts empty parts, as the parsers do', function () {
      var lines = run(
        [
          'var app = express()',
          "app.get('/', function (req, res) { res.send(String(Object.keys(req.query).length)) })",
          "await request(app).get('/?' + '&'.repeat(999) + 'a=1').expect(200, '1')",
          "await request(app).get('/?' + '&'.repeat(1000) + 'a=1').expect(200, '0')"
        ].join('\n')
      )
      assert.strictEqual(lines.length, 1)
    })

    it('does not warn at the limit, for long values, without a query, or for a custom or disabled parser', function () {
      var lines = run(
        [
          parts,
          'var app = express()',
          "app.get('/', function (req, res) { res.send(String(Object.keys(req.query).length)) })",
          "await request(app).get('/?' + parts(1000)).expect(200, '1000')",
          "await request(app).get('/?a=' + 'x'.repeat(3000)).expect(200, '1')",
          "await request(app).get('/').expect(200, '0')",
          'var custom = express()',
          "custom.set('query parser', function (str) { return { length: str.length } })",
          "custom.get('/', function (req, res) { res.send(String(req.query.length > 0)) })",
          "await request(custom).get('/?' + parts(1001)).expect(200, 'true')",
          'var off = express()',
          "off.set('query parser', false)",
          "off.get('/', function (req, res) { res.send(String(Object.keys(req.query).length)) })",
          "await request(off).get('/?' + parts(1001)).expect(200, '0')"
        ].join('\n')
      )
      assert.deepStrictEqual(lines, [])
    })
  })

  describe('a render callback that throws on a missing view', function () {
    it('warns once per call site, and the error still reaches the error handler', function () {
      var lines = run(
        [
          'var app = express()',
          "app.engine('tmpl', function (file, options, cb) { cb(null, 'unused') })",
          "app.get('/', function (req, res) { res.render('missing.tmpl', function (err) { throw err }) })",
          'app.use(function (err, req, res, next) { res.status(500).send(err.code) })',
          "await request(app).get('/').expect(500, 'EXPRESS_ERR_VIEW_NOT_FOUND')",
          "await request(app).get('/').expect(500, 'EXPRESS_ERR_VIEW_NOT_FOUND')",
          'var thrown = new Error("own")',
          "assert.throws(function () { app.render('missing.tmpl', function () { throw thrown }) }, function (e) { return e === thrown })",
          "assert.throws(function () { app.render('missing.tmpl', function () { throw thrown }) }, function (e) { return e === thrown })"
        ].join('\n')
      )
      assert.deepStrictEqual(messages(lines), [
        'render callback threw on a missing view: in 6.x this ends the process; pass the error to next(err)',
        'render callback threw on a missing view: in 6.x this ends the process; pass the error to next(err)',
        'render callback threw on a missing view: in 6.x this ends the process; pass the error to next(err)'
      ])
      // each names the app's own res.render or app.render call
      lines.forEach(function (line) {
        assert.match(line, / at \[eval\]:\d+:\d+$/)
      })
    })

    it('does not warn for a callback that passes the error on, or for res.render without a callback', function () {
      var lines = run(
        [
          'var app = express()',
          "app.engine('tmpl', function (file, options, cb) { cb(null, 'unused') })",
          "app.get('/cb', function (req, res, next) { res.render('missing.tmpl', function (err) { next(err) }) })",
          "app.get('/plain', function (req, res) { res.render('missing.tmpl') })",
          "app.get('/no-engine', function (req, res) { res.render('index', function (err) { throw err }) })",
          'app.use(function (err, req, res, next) { res.status(500).send(err.code) })',
          "await request(app).get('/cb').expect(500, 'EXPRESS_ERR_VIEW_NOT_FOUND')",
          "await request(app).get('/plain').expect(500, 'EXPRESS_ERR_VIEW_NOT_FOUND')",
          "await request(app).get('/no-engine').expect(500, 'EXPRESS_ERR_NO_DEFAULT_ENGINE')"
        ].join('\n')
      )
      assert.deepStrictEqual(lines, [])
    })
  })

  describe('turning them off', function () {
    var body = [
      'var app = express()',
      "app.set('trust proxy', 1)",
      "app.get('/', function (req, res) { res.send({ a: 1 }) })",
      "await request(app).get('/').expect(200)"
    ].join('\n')

    it('prints both without a flag', function () {
      assert.strictEqual(run(body).length, 2)
    })

    it('honours --no-deprecation', function () {
      assert.deepStrictEqual(run(body, { args: ['--no-deprecation'] }), [])
    })

    it('honours NO_DEPRECATION=express', function () {
      assert.deepStrictEqual(run(body, { env: { NO_DEPRECATION: 'express' } }), [])
    })
  })
})
