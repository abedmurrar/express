'use strict'

// Path traversal: res.sendFile and res.download with a `root`, and
// express.static, must never serve a file outside the root or a dotfile,
// however the path is spelled. The status of every case is pinned, for each
// way of passing the path in.
//
// express.static (our copy of serve-static, in lib/serve-static), res.sendFile
// and res.download all use our copy of send in lib/send.
//
// Dangerous today, by design: res.sendFile(path.join(dir, input)) without the
// `root` option is not protected, because path.join resolves ".." before
// Express sees the path. Only the `root` option gives the traversal check.

var assert = require('node:assert')
var fs = require('node:fs')
var path = require('node:path')
var express = require('../../')
var { serve } = require('./support')

var FIXTURES = path.join(__dirname, '..', 'send', 'fixtures')
var ROOT = path.join(FIXTURES, 'name.d')

// Everything outside ROOT, and every dotfile, that a request might reach.
var PRIVATE = [
  'name.html',
  'nums.txt',
  'tobi.html',
  '.hidden.txt',
  path.join('.mine', 'name.txt'),
  path.join('.mine', '.hidden')
].map(function (file) {
  return fs.readFileSync(path.join(FIXTURES, file), 'utf8')
})

function onError(res) {
  return function (err) {
    if (err) res.status(err.status || 500).send('error ' + (err.status || err.code))
  }
}

// The ways an app can hand a request path to the file senders, in the
// column order of the tables below.
var SERVERS = [
  {
    name: 'res.sendFile(req.path, { root })',
    build: function (root) {
      var app = express()
      app.get('/{*file}', function (req, res) {
        res.sendFile(req.path, { root: root }, onError(res))
      })
      return app
    }
  },
  {
    name: 'res.sendFile(decoded param, { root })',
    build: function (root) {
      var app = express()
      app.get('/{*file}', function (req, res) {
        res.sendFile(req.params.file.join('/'), { root: root }, onError(res))
      })
      return app
    }
  },
  {
    name: 'res.download(decoded param, { root })',
    build: function (root) {
      var app = express()
      app.get('/{*file}', function (req, res) {
        res.download(req.params.file.join('/'), { root: root }, onError(res))
      })
      return app
    }
  },
  {
    name: 'express.static(root)',
    build: function (root) {
      var app = express()
      app.use(express.static(root))
      return app
    }
  },
  {
    name: 'express.static(root, { fallthrough: false })',
    build: function (root) {
      var app = express()
      app.use(express.static(root, { fallthrough: false }))
      app.use(function (err, req, res, next) {
        res.status(err.status).send('error ' + err.status)
      })
      return app
    }
  },
  {
    name: "app.use('/static', express.static(root))",
    prefix: '/static',
    build: function (root) {
      var app = express()
      app.use('/static', express.static(root))
      return app
    }
  }
]

// Requests against ROOT. Only /name.txt is inside it.
var TRAVERSAL = {
  '/name.txt': [200, 200, 200, 200, 200, 200],
  '/../name.html': [403, 403, 403, 404, 403, 404],
  '/..%2fname.html': [404, 403, 403, 404, 403, 404],
  '/..%2Fname.html': [404, 403, 403, 404, 403, 404],
  '/%2e%2e/name.html': [404, 403, 403, 404, 403, 404],
  '/%2e%2e%2fname.html': [404, 403, 403, 404, 403, 404],
  '/%2E%2E%2Fname.html': [404, 403, 403, 404, 403, 404],
  '/.%2e/name.html': [404, 403, 403, 404, 403, 404],
  '/%2e./name.html': [404, 403, 403, 404, 403, 404],
  '/..%5cname.html': [404, 403, 403, 404, 403, 404],
  '/..%5Cname.html': [404, 403, 403, 404, 403, 404],
  '/%2e%2e%5cname.html': [404, 403, 403, 404, 403, 404],
  '/..\\name.html': [403, 403, 403, 404, 403, 404],
  '/%252e%252e%252fname.html': [404, 404, 404, 404, 404, 404],
  '/..%252fname.html': [404, 404, 404, 404, 404, 404],
  '/x/../../name.html': [403, 403, 403, 404, 403, 404],
  '/./../name.html': [403, 403, 403, 404, 403, 404],
  '/../../fixtures/name.html': [403, 403, 403, 404, 403, 404],
  '/../name.d/name.txt': [403, 403, 403, 404, 403, 404],
  '/..%2fname.d%2fname.txt': [404, 403, 403, 404, 403, 404],
  '/name.txt%00.html': [404, 400, 400, 404, 400, 404],
  '/%00../name.html': [404, 400, 400, 404, 400, 404],
  '/..%00/name.html': [404, 400, 400, 404, 400, 404],
  '/../.hidden.txt': [403, 403, 403, 404, 403, 404],
  '/..%2f.hidden.txt': [404, 403, 403, 404, 403, 404],
  '/....//name.html': [404, 404, 404, 404, 404, 404],
  '/..;/name.html': [404, 404, 404, 404, 404, 404],
  '/%c0%ae%c0%ae/name.html': [400, 400, 400, 404, 400, 404],
  '/%uff0e%uff0e/name.html': [400, 400, 400, 404, 400, 404],
  '/..%c0%afname.html': [400, 400, 400, 404, 400, 404]
}

// Requests against FIXTURES for its dotfiles, with the default
// `dotfiles: 'ignore'`.
var DOTFILES = {
  '/.hidden.txt': [404, 404, 404, 404, 404, 404],
  '/%2ehidden.txt': [404, 404, 404, 404, 404, 404],
  '/%2Ehidden.txt': [404, 404, 404, 404, 404, 404],
  '/.%68idden.txt': [404, 404, 404, 404, 404, 404],
  '/./.hidden.txt': [404, 404, 404, 404, 404, 404],
  '/pets/../.hidden.txt': [404, 404, 404, 404, 404, 404],
  '/name.d/../.hidden.txt': [404, 404, 404, 404, 404, 404],
  '/.hidden.txt%00': [404, 400, 400, 404, 400, 404],
  '/.mine': [404, 404, 404, 404, 404, 404],
  '/.mine/': [404, 404, 404, 404, 404, 404],
  '/.mine/name.txt': [404, 404, 404, 404, 404, 404],
  '/%2emine/name.txt': [404, 404, 404, 404, 404, 404],
  '/.mine%2fname.txt': [404, 404, 404, 404, 404, 404],
  '/.mine/.hidden': [404, 404, 404, 404, 404, 404]
}

// Absolute paths. Their status depends on the platform's path rules, so
// only "not served" is asserted.
var ABSOLUTE = [
  '/' + path.join(FIXTURES, 'name.html'),
  '/' + encodeURIComponent(path.join(FIXTURES, 'name.html')),
  '//' + path.join(FIXTURES, 'name.html').replace(/^[\\/]+/, ''),
  '/%2f' + path.join(FIXTURES, 'name.html').replace(/^[\\/]+/, ''),
  '/' + path.join(FIXTURES, 'name.html').replace(/\\/g, '/')
]

function table(label, root, cases) {
  SERVERS.forEach(function (server, column) {
    describe(label + ': ' + server.name, function () {
      var send
      before(function () {
        send = serve(server.build(root))
      })
      after(function () {
        return send.close()
      })

      Object.keys(cases).forEach(function (reqPath) {
        it(JSON.stringify(reqPath) + ' answers ' + cases[reqPath][column], async function () {
          var r = await send((server.prefix || '') + reqPath)
          PRIVATE.forEach(function (content) {
            assert.notStrictEqual(r.body, content, 'served a private file')
          })
          assert.strictEqual(r.status, cases[reqPath][column])
          if (r.status === 200) assert.strictEqual(r.body, 'loki')
        })
      })
    })
  })
}

describe('security: path traversal', function () {
  table('outside the root', ROOT, TRAVERSAL)
  table('dotfiles', FIXTURES, DOTFILES)

  describe('absolute paths stay inside the root', function () {
    SERVERS.forEach(function (server) {
      ABSOLUTE.forEach(function (reqPath) {
        it(server.name + ' ' + JSON.stringify(reqPath.replace(FIXTURES, '<fixtures>')), async function () {
          var send = serve(server.build(ROOT))
          var r = await send((server.prefix || '') + reqPath)
          await send.close()
          assert.notStrictEqual(r.status, 200)
          PRIVATE.forEach(function (content) {
            assert.notStrictEqual(r.body, content, 'served a private file')
          })
        })
      })
    })
  })

  describe('dotfiles option', function () {
    it("dotfiles: 'deny' answers 403", async function () {
      var app = express()
      app.get('/{*file}', function (req, res) {
        res.sendFile(req.params.file.join('/'), { root: FIXTURES, dotfiles: 'deny' }, onError(res))
      })
      var send = serve(app)
      var file = await send('/.hidden.txt')
      var dir = await send('/.mine/name.txt')
      await send.close()
      assert.strictEqual(file.status + ' ' + dir.status, '403 403')
    })

    it("dotfiles: 'allow' serves them (so the tests above can tell the difference)", async function () {
      var app = express()
      app.use(express.static(FIXTURES, { dotfiles: 'allow' }))
      var send = serve(app)
      var r = await send('/.hidden.txt')
      await send.close()
      assert.strictEqual(r.status + ' ' + r.body, '200 secret')
    })

    it("dotfiles: 'allow' still keeps a '..' inside the root", async function () {
      var app = express()
      app.get('/{*file}', function (req, res) {
        res.sendFile(req.params.file.join('/'), { root: ROOT, dotfiles: 'allow' }, onError(res))
      })
      var send = serve(app)
      var r = await send('/..%2f.hidden.txt')
      await send.close()
      assert.strictEqual(r.status, 403)
    })
  })

  it('pinned: res.sendFile(path.join(root, input)) without the root option serves files outside it (dangerous)', async function () {
    var app = express()
    app.get('/{*file}', function (req, res) {
      res.sendFile(path.join(ROOT, req.params.file.join('/')), onError(res))
    })
    var send = serve(app)
    var r = await send('/..%2fname.html')
    await send.close()
    assert.strictEqual(r.status + ' ' + r.body, '200 <p>tobi</p>')
  })

  it('res.sendFile rejects a relative path without a root', async function () {
    var app = express()
    var seen
    app.get('/{*file}', function (req, res) {
      try {
        res.sendFile(req.params.file.join('/'))
      } catch (err) {
        seen = err.message
        res.status(500).end()
      }
    })
    var send = serve(app)
    await send('/../name.html')
    await send.close()
    assert.strictEqual(seen, 'path must be absolute or specify root to res.sendFile')
  })
})
