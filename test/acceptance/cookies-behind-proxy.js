'use strict'

var assert = require('node:assert')
var app = require('../../examples/cookies-behind-proxy')
var cookieSession = require('cookie-session')
var express = require('../..')
var request = require('supertest')
var session = require('express-session')

describe('cookies-behind-proxy', function () {
  it('should set the session cookie when the proxy says HTTPS', async function () {
    var res = await request(app).get('/').set('X-Forwarded-Proto', 'https').expect(200, { secure: true, views: 1 })

    assert.match(res.headers['set-cookie'][0], /^__Host-sid=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax$/)

    await request(app)
      .get('/')
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', res.headers['set-cookie'][0].split(';')[0])
      .expect(200, { secure: true, views: 2 })
  })

  it('should not set the session cookie over plain HTTP', async function () {
    var res = await request(app).get('/').expect(200, { secure: false, views: 1 })

    assert.strictEqual(res.headers['set-cookie'], undefined)
  })

  it('should set and clear a cookie with res.cookie() whatever the protocol', async function () {
    var res = await request(app).get('/theme').expect(200)

    assert.match(
      res.headers['set-cookie'][0],
      /^__Host-theme=dark; Max-Age=86400; Path=\/; Expires=[^;]+; Secure; SameSite=Lax$/
    )

    res = await request(app).get('/theme/reset').expect(200)

    assert.deepStrictEqual(res.headers['set-cookie'], [
      '__Host-theme=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=Lax'
    ])
  })

  // the tables in docs/guide/cookies.md
  ;[
    ['express-session, secure: true', { secure: true }, 'Secure', undefined],
    ['express-session, secure: auto', { secure: 'auto' }, 'Secure', ''],
    ['express-session, both auto', { secure: 'auto', sameSite: 'auto' }, 'Secure; SameSite=None', 'SameSite=Lax'],
    ['cookie-session, secure: true', null, 'secure', undefined]
  ].forEach(function (args) {
    it(args[0] + ', over HTTPS and HTTP', async function () {
      var app = express()
      app.set('trust proxy', 'loopback')
      app.use(
        args[1]
          ? session({ secret: 's', resave: false, saveUninitialized: false, cookie: { ...args[1], httpOnly: false } })
          : cookieSession({ secret: 's', secure: true, httpOnly: false })
      )
      app.get('/', function (req, res) {
        req.session.views = 1
        res.end()
      })

      var attributes = function (res) {
        var header = res.headers['set-cookie']
        return header && header[0].split('; ').slice(2).join('; ')
      }

      var https = await request(app).get('/').set('X-Forwarded-Proto', 'https').expect(200)
      assert.strictEqual(attributes(https), args[2])
      var http = await request(app).get('/').expect(200)
      assert.strictEqual(attributes(http), args[3])
    })
  })
  ;[
    [undefined, 'a=1; Path=/'],
    [{ httpOnly: true, secure: true, sameSite: 'lax' }, 'a=1; Path=/; HttpOnly; Secure; SameSite=Lax'],
    [{ sameSite: true }, 'a=1; Path=/; SameSite=Strict'],
    [{ sameSite: 'none', secure: true, partitioned: true }, 'a=1; Path=/; Secure; Partitioned; SameSite=None'],
    [{ domain: 'example.com' }, 'a=1; Domain=example.com; Path=/']
  ].forEach(function (args) {
    it('res.cookie with ' + JSON.stringify(args[0]), function (done) {
      var app = express()

      app.get('/', function (req, res) {
        res.cookie('a', '1', args[0])
        res.end()
      })

      request(app).get('/').expect('Set-Cookie', args[1]).expect(200, done)
    })
  })
})
