'use strict'

// Not from upstream. res.sendFile's `etag` option: the app's "etag" setting
// is the default, and a per-call `etag` wins (src/response.ts, sendFile).
// The bug test itself is in test/regressions/response.js.

var assert = require('node:assert')
var path = require('node:path')
var express = require('..')
var request = require('supertest')
var utils = require('./support/utils')

var FILE = path.join(__dirname, 'fixtures', 'name.txt')
var ETAG = /^W\/"[^"]+"$/

function appSending(options, appEtag) {
  var app = express()
  if (appEtag !== undefined) app.set('etag', appEtag)
  app.get('/', function (req, res) {
    res.sendFile(FILE, options)
  })
  return app
}

describe('res.sendFile etag option (fork)', function () {
  it('leaves the ETag out with etag: false when the app setting is on', function (done) {
    request(appSending({ etag: false }))
      .get('/')
      .expect(utils.shouldNotHaveHeader('ETag'))
      .expect(200, 'tobi', done)
  })

  it('sends an ETag with etag: true when the app setting is off', function (done) {
    request(appSending({ etag: true }, false))
      .get('/')
      .expect('ETag', ETAG)
      .expect(200, 'tobi', done)
  })

  it('answers 304 to a matching If-None-Match with etag: true when the app setting is off', function (done) {
    var app = appSending({ etag: true }, false)
    request(app)
      .get('/')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err)
        request(app).get('/').set('If-None-Match', res.headers.etag).expect(304, done)
      })
  })

  ;[undefined, null].forEach(function (value) {
    it('follows the app setting when etag is ' + value, function (done) {
      request(appSending({ etag: value }, false))
        .get('/')
        .expect(utils.shouldNotHaveHeader('ETag'))
        .expect(200, function (err) {
          if (err) return done(err)
          request(appSending({ etag: value }))
            .get('/')
            .expect('ETag', ETAG)
            .expect(200, done)
        })
    })
  })

  it('follows the app setting with no options, or a callback in their place', function (done) {
    var app = express()
    app.disable('etag')
    app.get('/none', function (req, res) {
      res.sendFile(FILE)
    })
    app.get('/cb', function (req, res, next) {
      res.sendFile(FILE, function (err) {
        if (err) next(err)
      })
    })
    request(app)
      .get('/none')
      .expect(utils.shouldNotHaveHeader('ETag'))
      .expect(200, function (err) {
        if (err) return done(err)
        request(app).get('/cb').expect(utils.shouldNotHaveHeader('ETag')).expect(200, done)
      })
  })

  it('does not change the options object', function (done) {
    var options = { root: path.dirname(FILE) }
    var app = express()
    app.get('/', function (req, res) {
      res.sendFile('name.txt', options)
    })
    request(app)
      .get('/')
      .expect('ETag', ETAG)
      .expect(200, function (err) {
        if (err) return done(err)
        assert.deepStrictEqual(options, { root: path.dirname(FILE) })
        done()
      })
  })

  it('accepts a frozen options object', function (done) {
    request(appSending(Object.freeze({ headers: { 'X-A': '1' } })))
      .get('/')
      .expect('X-A', '1')
      .expect('ETag', ETAG)
      .expect(200, 'tobi', done)
  })

  it('passes etag: false through res.download', function (done) {
    var app = express()
    app.get('/', function (req, res) {
      res.download(FILE, 'n.txt', { etag: false })
    })
    request(app)
      .get('/')
      .expect('Content-Disposition', 'attachment; filename=n.txt')
      .expect(utils.shouldNotHaveHeader('ETag'))
      .expect(200, done)
  })
})
