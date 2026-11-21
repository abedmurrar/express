'use strict'

// Tests for code paths no other test reached (found by the c8 coverage
// report). Each pins today's behaviour.

var assert = require('node:assert')
var path = require('node:path')
var express = require('../')
var request = require('supertest')

var FIXTURES = path.join(__dirname, 'fixtures')

// depd emits a 'deprecation' event instead of printing when something listens
function captureDeprecations () {
  var seen = []
  function onDeprecation (err) { seen.push(err.message) }
  process.on('deprecation', onDeprecation)
  return {
    seen: seen,
    stop: function () { process.removeListener('deprecation', onDeprecation) }
  }
}

describe('coverage gaps', function () {
  describe('res.redirect deprecations', function () {
    it('warns when no url is given', function (done) {
      var dep = captureDeprecations()
      var app = express()
      app.get('/', function (req, res) { res.redirect() })
      request(app).get('/').end(function (err, res) {
        dep.stop()
        if (err) return done(err)
        assert.ok(dep.seen.includes('Provide a url argument'), dep.seen.join(', '))
        done()
      })
    })

    it('warns when the url is not a string', function (done) {
      var dep = captureDeprecations()
      var app = express()
      app.get('/', function (req, res) { res.redirect(302, 42) })
      request(app).get('/').end(function (err, res) {
        dep.stop()
        if (err) return done(err)
        assert.ok(dep.seen.includes('Url must be a string'), dep.seen.join(', '))
        assert.strictEqual(res.headers.location, '42')
        done()
      })
    })

    it('warns when the status is not a number', function (done) {
      var dep = captureDeprecations()
      var app = express()
      app.get('/', function (req, res) { res.redirect('302', '/next') })
      request(app).get('/').end(function (err, res) {
        dep.stop()
        if (err) return done(err)
        assert.ok(dep.seen.includes('Status must be a number'), dep.seen.join(', '))
        done()
      })
    })
  })

  describe('router', function () {
    it('does not treat a mount path as matching a longer segment', function (done) {
      var app = express()
      app.use('/foo', function (req, res) { res.send('mounted') })
      app.use(function (req, res) { res.send('fell through') })
      request(app).get('/foobar').expect(200, 'fell through', done)
    })

    it('accepts a Promise-like value from a handler, with a deprecation', function (done) {
      var dep = captureDeprecations()
      var app = express()
      app.get('/', function (req, res, next) {
        return { then: function (resolve, reject) { reject(new Error('from thenable')) } }
      })
      app.use(function (err, req, res, next) { res.status(500).send(err.message) })
      request(app).get('/').expect(500, 'from thenable', function (err) {
        dep.stop()
        if (err) return done(err)
        assert.ok(dep.seen.some(function (m) { return /Promise-like are deprecated/.test(m) }), dep.seen.join(', '))
        done()
      })
    })

    it('accepts a Promise-like value from an error handler, with a deprecation', function (done) {
      var dep = captureDeprecations()
      var app = express()
      app.get('/', function () { throw new Error('first') })
      app.use(function (err, req, res, next) {
        return { then: function (resolve, reject) { reject(new Error('second: ' + err.message)) } }
      })
      app.use(function (err, req, res, next) { res.status(500).send(err.message) })
      request(app).get('/').expect(500, 'second: first', function (err) {
        dep.stop()
        if (err) return done(err)
        assert.ok(dep.seen.some(function (m) { return /Promise-like are deprecated/.test(m) }), dep.seen.join(', '))
        done()
      })
    })

    it('accepts a Promise-like value from a param callback, with a deprecation', function (done) {
      var dep = captureDeprecations()
      var app = express()
      app.param('id', function (req, res, next, id) {
        return { then: function (resolve, reject) { reject(new Error('param ' + id)) } }
      })
      app.get('/u/:id', function (req, res) { res.send('unreachable') })
      app.use(function (err, req, res, next) { res.status(500).send(err.message) })
      request(app).get('/u/7').expect(500, 'param 7', function (err) {
        dep.stop()
        if (err) return done(err)
        assert.ok(dep.seen.some(function (m) { return /parameters that are Promise-like are deprecated/.test(m) }), dep.seen.join(', '))
        done()
      })
    })

    it('reports a param callback promise rejected without a reason', function (done) {
      var app = express()
      app.param('id', function () { return Promise.reject(undefined) })
      app.get('/u/:id', function (req, res) { res.send('unreachable') })
      app.use(function (err, req, res, next) { res.status(500).send(err.message) })
      request(app).get('/u/7').expect(500, 'Rejected promise', done)
    })
  })

  describe('res.sendFile with a 304 status already set', function () {
    it('treats the response as cacheable and sends no body', function (done) {
      var app = express()
      app.get('/', function (req, res) { res.status(304).sendFile(path.join(FIXTURES, 'name.txt')) })
      request(app).get('/').expect(304, '', done)
    })
  })
})

describe('coverage gaps: routing edge cases', function () {
  var http = require('node:http')
  var Layer = require('../lib/router/lib/layer')

  it('a RegExp mount that matches only part of a segment falls through', function (done) {
    var app = express()
    app.use(/\/foo/, function (req, res) { res.send('mounted') })
    app.use(function (req, res) { res.send('fell through') })
    request(app).get('/foobar').expect(200, 'fell through', done)
  })

  it('routes an absolute-form URL that has a query string', function (done) {
    var app = express()
    app.get('/path', function (req, res) { res.json([req.path, req.query.x]) })
    var server = app.listen(0, '127.0.0.1', function () {
      http.get({ host: '127.0.0.1', port: server.address().port, path: 'http://example.com/path?x=1', headers: { host: 'example.com' } }, function (res) {
        var body = ''
        res.on('data', function (c) { body += c })
        res.on('end', function () {
          server.close()
          assert.strictEqual(res.statusCode, 200)
          assert.deepStrictEqual(JSON.parse(body), ['/path', '1'])
          done()
        })
      })
    })
  })

  it('matches nested path arrays, loosening the trailing slash', function (done) {
    var app = express()
    app.get([['/a', '/b'], '/c'], function (req, res) { res.send(req.path) })
    request(app).get('/b/').expect(200, '/b/', done)
  })

  it('builds a Layer without an options object', function () {
    var layer = new Layer('/x', undefined, function named () {})
    assert.strictEqual(layer.name, 'named')
    assert.ok(layer.match('/x'))
    assert.ok(layer.match('/x/'))
  })

  it('res.sendFile answers a fresh conditional request with a 304 status already set', function (done) {
    var app = express()
    app.get('/', function (req, res) { res.status(304).sendFile(path.join(FIXTURES, 'name.txt')) })
    request(app).get('/').set('If-None-Match', '*').expect(304, '', done)
  })
})
