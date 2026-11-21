'use strict'

// Header injection and response splitting: CR, LF and other control
// characters passed to the response helpers must never start a new header or
// a second response. Today Node's own header validation rejects them (the
// request ends in a 500 from the error handler), or the helper encodes them
// first. Either outcome is pinned exactly. A rewrite that writes headers
// without going through Node's checks, as the uWebSockets.js forks had to
// add back by hand (research/forks.md), fails here.

var assert = require('node:assert')
var path = require('node:path')
var express = require('../../')
var { request } = require('./support')

var CRLF = 'x\r\nX-Injected: 1\r\n\r\n<script>alert(1)</script>'
var FILE = path.join(__dirname, '..', 'fixtures', 'name.txt')

// Run `handler` and return the raw response, after checking that nothing
// injected reached the client.
async function respond(handler, reqPath) {
  var app = express()
  app.get('/', handler)
  app.use(function (err, req, res, next) {
    res.status(500).send('rejected: ' + (err.code || err.name))
  })
  var r = await request(app, reqPath || '/')
  r.lines.forEach(function (line) {
    assert.ok(!/^x-injected/i.test(line), 'an injected header reached the client: ' + line)
    assert.ok(!/[\r\n]/.test(line), 'a raw CR or LF reached a header line')
  })
  assert.ok(!/<script>/i.test(r.body), 'injected markup reached the body')
  assert.strictEqual(r.extra, '', 'bytes after the declared body (a split response)')
  return r
}

function rejected(code) {
  return async function (r) {
    assert.strictEqual(r.status, 500)
    assert.strictEqual(r.body, 'rejected: ' + code)
  }
}

var CASES = [
  {
    name: 'res.set value with CR LF',
    handler: function (req, res) {
      res.set('X-A', CRLF).send('ok')
    },
    check: rejected('ERR_INVALID_CHAR')
  },
  {
    name: 'res.set value with LF only',
    handler: function (req, res) {
      res.set('X-A', 'x\nX-Injected: 1').send('ok')
    },
    check: rejected('ERR_INVALID_CHAR')
  },
  {
    name: 'res.set value with CR only',
    handler: function (req, res) {
      res.set('X-A', 'x\rX-Injected: 1').send('ok')
    },
    check: rejected('ERR_INVALID_CHAR')
  },
  {
    name: 'res.set value with NUL',
    handler: function (req, res) {
      res.set('X-A', 'x\0X-Injected: 1').send('ok')
    },
    check: rejected('ERR_INVALID_CHAR')
  },
  {
    // U+010D and U+010A turn into CR and LF if a writer truncates to latin1
    name: 'res.set value with U+010D U+010A',
    handler: function (req, res) {
      res.set('X-A', 'xčĊX-Injected: 1').send('ok')
    },
    check: rejected('ERR_INVALID_CHAR')
  },
  {
    name: 'res.set name with CR LF',
    handler: function (req, res) {
      res.set('X-A\r\nX-Injected', '1').send('ok')
    },
    check: rejected('ERR_INVALID_HTTP_TOKEN')
  },
  {
    name: 'res.set with an object',
    handler: function (req, res) {
      res.set({ 'X-A': CRLF }).send('ok')
    },
    check: rejected('ERR_INVALID_CHAR')
  },
  {
    name: 'res.set with an array',
    handler: function (req, res) {
      res.set('X-A', ['a', CRLF]).send('ok')
    },
    check: rejected('ERR_INVALID_CHAR')
  },
  {
    name: 'res.header (alias of res.set)',
    handler: function (req, res) {
      res.header('X-A', CRLF).send('ok')
    },
    check: rejected('ERR_INVALID_CHAR')
  },
  {
    name: 'res.set Content-Type',
    handler: function (req, res) {
      res.set('Content-Type', 'text/html' + CRLF).send('ok')
    },
    check: rejected('ERR_INVALID_CHAR')
  },
  {
    name: 'res.type',
    handler: function (req, res) {
      res.type('html' + CRLF).send('ok')
    },
    check: rejected('ERR_INVALID_CHAR')
  },
  {
    name: 'res.append',
    handler: function (req, res) {
      res.append('X-A', CRLF).send('ok')
    },
    check: rejected('ERR_INVALID_CHAR')
  },
  {
    name: 'res.append to an existing header',
    handler: function (req, res) {
      res.append('X-A', 'a').append('X-A', [CRLF]).send('ok')
    },
    check: async function (r) {
      assert.strictEqual(r.status, 500)
      assert.strictEqual(r.headers['x-a'], 'a')
    }
  },
  {
    name: 'res.cookie value (encoded)',
    handler: function (req, res) {
      res.cookie('a', CRLF).send('ok')
    },
    check: async function (r) {
      assert.strictEqual(r.status, 200)
      assert.strictEqual(
        r.headers['set-cookie'],
        'a=x%0D%0AX-Injected%3A%201%0D%0A%0D%0A%3Cscript%3Ealert(1)%3C%2Fscript%3E; Path=/'
      )
    }
  },
  {
    name: 'res.cookie object value (JSON, then encoded)',
    handler: function (req, res) {
      res.cookie('a', { v: 'x\r\nX-Injected: 1' }).send('ok')
    },
    check: async function (r) {
      assert.strictEqual(r.status, 200)
      assert.strictEqual(r.headers['set-cookie'], 'a=j%3A%7B%22v%22%3A%22x%5Cr%5CnX-Injected%3A%201%22%7D; Path=/')
    }
  },
  {
    name: 'res.cookie signed value',
    handler: function (req, res) {
      req.secret = 'keyboard cat'
      res.cookie('a', 'x\r\nX-Injected: 1', { signed: true }).send('ok')
    },
    check: async function (r) {
      assert.strictEqual(r.status, 200)
      assert.match(r.headers['set-cookie'], /^a=s%3Ax%0D%0AX-Injected%3A%201\.[^;\r\n]+; Path=\/$/)
    }
  },
  {
    name: 'res.cookie name',
    handler: function (req, res) {
      res.cookie('a\r\nX-Injected: 1', 'v').send('ok')
    },
    check: rejected('TypeError')
  },
  {
    name: 'res.cookie path option',
    handler: function (req, res) {
      res.cookie('a', 'v', { path: '/' + CRLF }).send('ok')
    },
    check: rejected('TypeError')
  },
  {
    name: 'res.cookie domain option',
    handler: function (req, res) {
      res.cookie('a', 'v', { domain: 'example.com' + CRLF }).send('ok')
    },
    check: rejected('TypeError')
  },
  {
    name: 'res.clearCookie name',
    handler: function (req, res) {
      res.clearCookie('a\r\nX-Injected: 1').send('ok')
    },
    check: rejected('TypeError')
  },
  {
    name: 'res.location (encoded)',
    handler: function (req, res) {
      res.location('/a' + CRLF).send('ok')
    },
    check: async function (r) {
      assert.strictEqual(r.status, 200)
      assert.strictEqual(r.headers.location, '/ax%0D%0AX-Injected:%201%0D%0A%0D%0A%3Cscript%3Ealert(1)%3C/script%3E')
    }
  },
  {
    name: 'res.location with U+010D U+010A (encoded as UTF-8)',
    handler: function (req, res) {
      res.location('/ačĊX-Injected: 1').send('ok')
    },
    check: async function (r) {
      assert.strictEqual(r.headers.location, '/a%C4%8D%C4%8AX-Injected:%201')
    }
  },
  {
    name: 'res.redirect (encoded, in the header and the body)',
    handler: function (req, res) {
      res.redirect('/a' + CRLF)
    },
    check: async function (r) {
      var encoded = '/ax%0D%0AX-Injected:%201%0D%0A%0D%0A%3Cscript%3Ealert(1)%3C/script%3E'
      assert.strictEqual(r.status, 302)
      assert.strictEqual(r.headers.location, encoded)
      assert.strictEqual(r.body, 'Found. Redirecting to ' + encoded)
    }
  },
  {
    name: 'res.redirect with a status',
    handler: function (req, res) {
      res.redirect(301, '/a\r\nX-Injected: 1')
    },
    check: async function (r) {
      assert.strictEqual(r.status, 301)
      assert.strictEqual(r.headers.location, '/a%0D%0AX-Injected:%201')
    }
  },
  {
    name: 'res.attachment (quoted, with an encoded filename*)',
    handler: function (req, res) {
      res.attachment('a\r\nX-Injected: 1.txt').send('ok')
    },
    check: async function (r) {
      assert.strictEqual(r.status, 200)
      assert.strictEqual(
        r.headers['content-disposition'],
        'attachment; filename="a??X-Injected: 1.txt"; filename*=UTF-8\'\'a%0D%0AX-Injected%3A%201.txt'
      )
    }
  },
  {
    name: 'res.attachment with U+010D U+010A',
    handler: function (req, res) {
      res.attachment('ačĊX-Injected: 1.txt').send('ok')
    },
    check: async function (r) {
      assert.strictEqual(
        r.headers['content-disposition'],
        'attachment; filename="a??X-Injected: 1.txt"; filename*=UTF-8\'\'a%C4%8D%C4%8AX-Injected%3A%201.txt'
      )
    }
  },
  {
    name: 'res.download filename',
    handler: function (req, res, next) {
      res.download(FILE, 'a\r\nX-Injected: 1.txt', function (err) {
        if (err) next(err)
      })
    },
    check: async function (r) {
      assert.strictEqual(r.status, 200)
      assert.strictEqual(
        r.headers['content-disposition'],
        'attachment; filename="a??X-Injected: 1.txt"; filename*=UTF-8\'\'a%0D%0AX-Injected%3A%201.txt'
      )
      assert.strictEqual(r.body, 'tobi')
    }
  },
  {
    name: 'res.links URL',
    handler: function (req, res) {
      res.links({ next: '/a>' + CRLF }).send('ok')
    },
    check: rejected('ERR_INVALID_CHAR')
  },
  {
    name: 'res.links rel',
    handler: function (req, res) {
      res.links({ ['next' + CRLF]: '/a' }).send('ok')
    },
    check: rejected('ERR_INVALID_CHAR')
  },
  {
    name: 'res.vary',
    handler: function (req, res) {
      res.vary('X' + CRLF).send('ok')
    },
    check: rejected('TypeError')
  },
  {
    name: 'res.jsonp callback from the query string (sanitised)',
    path: '/?callback=' + encodeURIComponent('cb\r\nX-Injected: 1'),
    handler: function (req, res) {
      res.jsonp({ a: 1 })
    },
    check: async function (r) {
      assert.strictEqual(r.status, 200)
      assert.strictEqual(r.body, '/**/ typeof cbXInjected1 === \'function\' && cbXInjected1({"a":1});')
    }
  },
  {
    name: 'res.writeHead headers',
    handler: function (req, res) {
      res.writeHead(200, { 'X-A': CRLF })
      res.end('ok')
    },
    check: rejected('ERR_INVALID_CHAR')
  }
]

describe('security: header injection and response splitting', function () {
  CASES.forEach(function (c) {
    it(c.name, async function () {
      await c.check(await respond(c.handler, c.path))
    })
  })

  it('a request header with a raw LF is rejected by Node before routing', async function () {
    var app = express()
    var ran = false
    app.use(function (req, res) {
      ran = true
      res.send('ok')
    })
    var r = await request(app, { headers: { 'X-A': 'x\nX-Injected: 1' } })
    assert.strictEqual(r.status, 400)
    assert.strictEqual(ran, false)
  })
})
