'use strict'

// The fork's fixes to req.host, req.hostname, req.subdomains, req.protocol
// and req.secure (ROADMAP.md, "Bug fixes on the compatible line"):
// - userinfo in the Host or X-Forwarded-Host header is dropped (from
//   upstream PR #7317), and a non-numeric port gives no host;
// - a trusted X-Forwarded-Proto is lowercased (from upstream PR #7330);
// - an IPv6 literal with dots has no subdomains (from upstream PR #7533);
// - a trailing DNS root dot is not a subdomain part (from upstream PR #7331).

var assert = require('node:assert')
var express = require('../')
var request = require('supertest')

function hostApp(settings) {
  var app = express()
  Object.keys(settings || {}).forEach(function (name) {
    app.set(name, settings[name])
  })
  app.use(function (req, res) {
    res.json({
      host: req.host === undefined ? null : req.host,
      hostname: req.hostname === undefined ? null : req.hostname,
      subdomains: req.subdomains
    })
  })
  return app
}

function expectHost(app, headers, expected) {
  var test = request(app).get('/')
  Object.keys(headers).forEach(function (name) {
    test.set(name, headers[name])
  })
  return test.expect(200).then(function (res) {
    assert.deepStrictEqual(res.body, expected, JSON.stringify(headers))
  })
}

describe('fork: request getters', function () {
  describe('Host with userinfo', function () {
    var cases = [
      ['evil.example:x@good.example', 'good.example', 'good.example'],
      ['evil.example:x@good.example:3000', 'good.example:3000', 'good.example'],
      ['admin.example:x@public.example', 'public.example', 'public.example'],
      ['user@example.com', 'example.com', 'example.com'],
      ['user:pass@example.com:8080', 'example.com:8080', 'example.com'],
      ['a@b@example.com', 'example.com', 'example.com'],
      ['a@b:c@d.example:80', 'd.example:80', 'd.example'],
      ['@example.com', 'example.com', 'example.com'],
      ['[::1]@evil.example', 'evil.example', 'evil.example'],
      ['a:[b@c.example:80', 'c.example:80', 'c.example'],
      ['user@[::1]:8080', '[::1]:8080', '[::1]'],
      ['evil.example@[::1]', '[::1]', '[::1]'],
      ['user@', null, null],
      ['@', null, null]
    ]

    cases.forEach(function (c) {
      it('Host "' + c[0] + '" gives the host ' + c[1], function () {
        return expectHost(hostApp(), { Host: c[0] }, { host: c[1], hostname: c[2], subdomains: [] })
      })
    })

    it('keeps the subdomains of the real host, not of the userinfo', function () {
      return expectHost(
        hostApp(),
        { Host: 'tobi.ferrets.example.com:x@a.b.example.org' },
        { host: 'a.b.example.org', hostname: 'a.b.example.org', subdomains: ['b', 'a'] }
      )
    })

    it('a host-based guard sees the real host', function () {
      var app = express()
      app.use(function (req, res, next) {
        if (req.hostname === 'admin.example') return next()
        res.status(403).send('wrong host')
      })
      app.get('/', function (req, res) {
        res.send('admin')
      })
      return request(app)
        .get('/')
        .set('Host', 'admin.example:x@public.example')
        .expect(403)
        .then(function () {
          return request(app).get('/').set('Host', 'user@admin.example:8080').expect(200, 'admin')
        })
    })
  })

  describe('Host with a non-numeric port', function () {
    var cases = [
      'example.com:notaport',
      'evil.example:x%40good.example',
      '[::1]:notaport',
      'example.com:80:80',
      'a:80x'
    ]

    cases.forEach(function (host) {
      it('Host "' + host + '" gives no host', function () {
        return expectHost(hostApp(), { Host: host }, { host: null, hostname: null, subdomains: [] })
      })
    })

    it('an empty port is still a port, as in Express 5.3.0', function () {
      return expectHost(
        hostApp(),
        { Host: 'example.com:' },
        { host: 'example.com:', hostname: 'example.com', subdomains: [] }
      )
    })
  })

  describe('IPv6 hosts', function () {
    var cases = [
      ['[::1]', '[::1]'],
      ['[::1]:3000', '[::1]'],
      ['[::ffff:127.0.0.1]', '[::ffff:127.0.0.1]'],
      ['[::ffff:127.0.0.1]:3000', '[::ffff:127.0.0.1]'],
      ['[2001:db8::192.0.2.33]:443', '[2001:db8::192.0.2.33]'],
      ['user@[::ffff:127.0.0.1]:8080', '[::ffff:127.0.0.1]']
    ]

    cases.forEach(function (c) {
      it('Host "' + c[0] + '" has no subdomains', function () {
        return request(hostApp())
          .get('/')
          .set('Host', c[0])
          .expect(200)
          .then(function (res) {
            assert.strictEqual(res.body.hostname, c[1])
            assert.deepStrictEqual(res.body.subdomains, [])
          })
      })

      it('Host "' + c[0] + '" is one whole part with "subdomain offset" 0', function () {
        return request(hostApp({ 'subdomain offset': 0 }))
          .get('/')
          .set('Host', c[0])
          .expect(200)
          .then(function (res) {
            assert.deepStrictEqual(res.body.subdomains, [c[1]])
          })
      })
    })

    it('an IPv4 host still has no subdomains', function () {
      return expectHost(
        hostApp(),
        { Host: '127.0.0.1:3000' },
        { host: '127.0.0.1:3000', hostname: '127.0.0.1', subdomains: [] }
      )
    })

    it('a domain with brackets around a name is still split', function () {
      return expectHost(
        hostApp({ 'subdomain offset': 0 }),
        { Host: '[a.b]' },
        { host: '[a.b]', hostname: '[a.b]', subdomains: ['b]', '[a'] }
      )
    })
  })

  describe('a trailing root dot', function () {
    // [Host, subdomains, subdomains with "subdomain offset" 0]; req.hostname
    // keeps the dot, as in Express 5.3.0
    var cases = [
      ['tobi.ferrets.example.com.', ['ferrets', 'tobi'], ['com', 'example', 'ferrets', 'tobi']],
      ['tobi.ferrets.example.com.:3000', ['ferrets', 'tobi'], ['com', 'example', 'ferrets', 'tobi']],
      ['user@tobi.ferrets.example.com.:3000', ['ferrets', 'tobi'], ['com', 'example', 'ferrets', 'tobi']],
      ['example.com.', [], ['com', 'example']],
      ['localhost.', [], ['localhost']],
      ['127.0.0.1.', [], ['127.0.0.1']],
      ['.', [], []]
    ]

    cases.forEach(function (c) {
      var hostname = c[0].replace(/^.*@/, '').replace(/:\d+$/, '')

      it('Host "' + c[0] + '" gives ' + JSON.stringify(c[1]), function () {
        return request(hostApp())
          .get('/')
          .set('Host', c[0])
          .expect(200)
          .then(function (res) {
            assert.strictEqual(res.body.hostname, hostname)
            assert.deepStrictEqual(res.body.subdomains, c[1])
          })
      })

      it('Host "' + c[0] + '" gives ' + JSON.stringify(c[2]) + ' with "subdomain offset" 0', function () {
        return request(hostApp({ 'subdomain offset': 0 }))
          .get('/')
          .set('Host', c[0])
          .expect(200)
          .then(function (res) {
            assert.deepStrictEqual(res.body.subdomains, c[2])
          })
      })
    })

    it('drops only one dot, so an empty label before it still counts', function () {
      return expectHost(
        hostApp({ 'subdomain offset': 0 }),
        { Host: 'tobi.example..' },
        { host: 'tobi.example..', hostname: 'tobi.example..', subdomains: ['', 'example', 'tobi'] }
      )
    })

    it('uses the subdomains of a trusted X-Forwarded-Host with a root dot', function () {
      return expectHost(
        hostApp({ 'trust proxy': true }),
        { Host: 'proxy.internal', 'X-Forwarded-Host': 'tobi.ferrets.example.com.' },
        { host: 'tobi.ferrets.example.com.', hostname: 'tobi.ferrets.example.com.', subdomains: ['ferrets', 'tobi'] }
      )
    })

    it('is the same with "subdomain offset" 3 as without the dot', function () {
      return expectHost(
        hostApp({ 'subdomain offset': 3 }),
        { Host: 'tobi.ferrets.example.com.' },
        { host: 'tobi.ferrets.example.com.', hostname: 'tobi.ferrets.example.com.', subdomains: ['tobi'] }
      )
    })
  })

  describe('X-Forwarded-Host with userinfo', function () {
    it('drops the userinfo of a trusted X-Forwarded-Host', function () {
      return expectHost(
        hostApp({ 'trust proxy': true }),
        { Host: 'localhost', 'X-Forwarded-Host': 'evil.example:x@good.example' },
        { host: 'good.example', hostname: 'good.example', subdomains: [] }
      )
    })

    it('drops it from the first value of a list', function () {
      return expectHost(
        hostApp({ 'trust proxy': true }),
        { Host: 'localhost', 'X-Forwarded-Host': 'evil.example:x@tobi.ferrets.example.com:8443, other.example' },
        { host: 'tobi.ferrets.example.com:8443', hostname: 'tobi.ferrets.example.com', subdomains: ['ferrets', 'tobi'] }
      )
    })

    it('drops it before an IPv6 literal', function () {
      return expectHost(
        hostApp({ 'trust proxy': true }),
        { Host: 'localhost', 'X-Forwarded-Host': 'user@[::ffff:10.0.0.1]:443' },
        { host: '[::ffff:10.0.0.1]:443', hostname: '[::ffff:10.0.0.1]', subdomains: [] }
      )
    })

    it('gives no host for a non-numeric port', function () {
      return expectHost(
        hostApp({ 'trust proxy': true }),
        { Host: 'localhost', 'X-Forwarded-Host': 'good.example:x%40evil.example' },
        { host: null, hostname: null, subdomains: [] }
      )
    })

    it('uses the Host when X-Forwarded-Host is not trusted', function () {
      return expectHost(
        hostApp(),
        { Host: 'user@localhost:3000', 'X-Forwarded-Host': 'evil.example' },
        { host: 'localhost:3000', hostname: 'localhost', subdomains: [] }
      )
    })
  })

  describe('X-Forwarded-Proto case', function () {
    function protoApp(trust) {
      var app = express()
      app.set('trust proxy', trust)
      app.use(function (req, res) {
        res.json([req.protocol, req.secure])
      })
      return app
    }

    var cases = [
      ['HTTPS', 'https', true],
      ['Https', 'https', true],
      ['hTtPs', 'https', true],
      [' HTTPS ', 'https', true],
      ['HTTP', 'http', false],
      ['HTTPS, http', 'https', true],
      ['HTTPS,HTTP', 'https', true],
      ['http, HTTPS', 'http', false],
      ['WSS', 'wss', false]
    ]

    cases.forEach(function (c) {
      it('a trusted "' + c[0] + '" gives ' + c[1] + (c[2] ? ' (secure)' : ''), function () {
        return request(protoApp(true)).get('/').set('X-Forwarded-Proto', c[0]).expect(200, [c[1], c[2]])
      })
    })

    it('a trusted "HTTPS" through a hop count is secure too', function () {
      return request(protoApp(1)).get('/').set('X-Forwarded-Proto', 'HTTPS').expect(200, ['https', true])
    })

    it('an untrusted "HTTPS" is still ignored', function () {
      return request(protoApp(false)).get('/').set('X-Forwarded-Proto', 'HTTPS').expect(200, ['http', false])
    })
  })
})
