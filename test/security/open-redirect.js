'use strict'

// Open redirects: res.redirect and res.location do not validate where they
// point. They only percent-encode characters that are not allowed in a URL
// (encodeurl), and res.redirect HTML-escapes the address in its body. These
// tests pin exactly what reaches the client today, so a change to the
// encoding is noticed.
//
// Dangerous today, by design (the app must validate the target itself):
// - protocol-relative '//evil.example' and the backslash forms '/\evil.example',
//   '\\evil.example' and '\/evil.example' pass through unchanged, and
//   browsers treat all of them as a redirect to evil.example. A same-site
//   check like `url.startsWith('/')` lets the first two through.
// - 'javascript:' and 'data:' targets pass through. Browsers do not follow
//   them from a Location header, and the body is text, not a link.
// - 'back' is not special in Express 5: it is sent as the relative URL
//   "back", whatever the Referer says.

var assert = require('node:assert')
var express = require('../../')
var { serve } = require('./support')

// [what the app passes, the Location header sent]
var TARGETS = [
  ['back', 'back'],
  ['//evil.example', '//evil.example'],
  ['///evil.example', '///evil.example'],
  ['/\\evil.example', '/\\evil.example'],
  ['\\\\evil.example', '\\\\evil.example'],
  ['\\/evil.example', '\\/evil.example'],
  ['/\\/evil.example', '/\\/evil.example'],
  ['/%5Cevil.example', '/%5Cevil.example'],
  ['/%2F/evil.example', '/%2F/evil.example'],
  ['%2F%2Fevil.example', '%2F%2Fevil.example'],
  ['/\t/evil.example', '/%09/evil.example'],
  ['/\n/evil.example', '/%0A/evil.example'],
  ['/∕∕evil.example', '/%E2%88%95%E2%88%95evil.example'],
  ['https://evil.example', 'https://evil.example'],
  ['HTTPS://evil.example', 'HTTPS://evil.example'],
  ['http:evil.example', 'http:evil.example'],
  ['https:/evil.example', 'https:/evil.example'],
  ['//evil.example@good.example', '//evil.example@good.example'],
  ['http://good.example@evil.example', 'http://good.example@evil.example'],
  ['http://evil.example%2F@good.example', 'http://evil.example%2F@good.example'],
  ['javascript:alert(1)', 'javascript:alert(1)'],
  ['JaVaScRiPt:alert(1)', 'JaVaScRiPt:alert(1)'],
  ['javascript%3Aalert(1)', 'javascript%3Aalert(1)'],
  ['java\tscript:alert(1)', 'java%09script:alert(1)'],
  [' javascript:alert(1)', '%20javascript:alert(1)'],
  ['\0javascript:alert(1)', '%00javascript:alert(1)'],
  ['data:text/html,<script>alert(1)</script>', 'data:text/html,%3Cscript%3Ealert(1)%3C/script%3E'],
  ['/"><script>alert(1)</script>', '/%22%3E%3Cscript%3Ealert(1)%3C/script%3E'],
  ["/?a=1&b='x'", "/?a=1&b='x'"],
  ['/ok/../../evil', '/ok/../../evil'],
  ['/%E0%A4%A', '/%E0%A4%25A']
]

describe('security: open redirects', function () {
  var send
  var target
  before(function () {
    var app = express()
    app.get('/redirect', function (req, res) {
      res.redirect(target)
    })
    app.get('/location', function (req, res) {
      res.location(target).end()
    })
    send = serve(app)
  })
  after(function () {
    return send.close()
  })

  TARGETS.forEach(function (pair) {
    describe(JSON.stringify(pair[0]), function () {
      before(function () {
        target = pair[0]
      })

      it('res.location sends ' + JSON.stringify(pair[1]), async function () {
        var r = await send('/location')
        assert.strictEqual(r.headers.location, pair[1])
      })

      it('res.redirect sends the same Location and a text body', async function () {
        var r = await send({ path: '/redirect', headers: { Accept: 'text/plain' } })
        assert.strictEqual(r.status, 302)
        assert.strictEqual(r.headers.location, pair[1])
        assert.strictEqual(r.body, 'Found. Redirecting to ' + pair[1])
      })

      it('res.redirect escapes the address in its HTML body and adds no link', async function () {
        var r = await send({ path: '/redirect', headers: { Accept: 'text/html' } })
        var escaped = pair[1]
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')
        assert.strictEqual(r.headers.location, pair[1])
        assert.strictEqual(
          r.body,
          '<!DOCTYPE html><head><title>Found</title></head><body><p>Found. Redirecting to ' + escaped + '</p></body>'
        )
        assert.ok(!/<a\b|href|<script/i.test(r.body))
      })
    })
  })

  it("'back' ignores the Referer header", async function () {
    target = 'back'
    var r = await send({ path: '/redirect', headers: { Referer: 'https://evil.example/', Accept: 'text/plain' } })
    assert.strictEqual(r.headers.location, 'back')
  })

  it('a Host header does not change a relative redirect', async function () {
    target = '/home'
    var r = await send({ path: '/redirect', headers: { Host: 'evil.example' } })
    assert.strictEqual(r.headers.location, '/home')
  })

  it('a HEAD redirect sends the Location and no body', async function () {
    target = '//evil.example'
    var r = await send({ method: 'HEAD', path: '/redirect' })
    assert.strictEqual(r.status, 302)
    assert.strictEqual(r.headers.location, '//evil.example')
    assert.strictEqual(r.raw.slice(r.raw.indexOf('\r\n\r\n') + 4), '')
  })
})
