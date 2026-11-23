'use strict'

// Not from upstream. Every error Express creates, thrown or forwarded to
// next(), carries a stable `code` (expressjs/express#6951; the names follow
// expressjs/express#6982). Everything else stays as on Express 5.3.0: the
// message, the class, the enumerable own properties (so JSON.stringify,
// Object.keys and util.inspect print the same), `status`, `statusCode` and
// `expose`, and where the stack starts. Each case runs on the fork and on
// Express 5.3.0 (whose res.sendFile and express.static use the npm send and
// serve-static).

var assert = require('node:assert')
var fs = require('node:fs')
var http = require('node:http')
var path = require('node:path')
var util = require('node:util')
var express = require('..')
var baseline = require('express-baseline')
var send = require('../lib/send')
var baselineSend = require('send')
var request = require('supertest')
var tmpl = require('./support/tmpl')

var FIXTURES = path.join(__dirname, 'fixtures')
var SEND_FIXTURES = path.join(__dirname, 'send', 'fixtures')
var FILE = path.join(FIXTURES, 'name.txt')

// The error `fn` throws.
function thrown(fn) {
  try {
    fn()
  } catch (err) {
    return Promise.resolve(err)
  }
  return Promise.reject(new Error('nothing was thrown'))
}

// Requests `url` from an app made with `lib` and `setup`, and resolves with
// the error that reached the app's error handler (or that `setup` passes to
// `done`).
function caught(lib, setup, url, headers) {
  return new Promise(function (resolve, reject) {
    var app = lib()
    setup(app, resolve)
    app.use(function (err, req, res, next) {
      resolve(err)
      res.end()
    })
    var test = request(app).get(url || '/')
    Object.keys(headers || {}).forEach(function (name) {
      test.set(name, headers[name])
    })
    test.end(function (err) {
      if (err) reject(err)
    })
  })
}

// Runs `handler` as the only route of an app made with `lib`.
function handled(lib, handler, url, headers) {
  return caught(
    lib,
    function (app) {
      app.get('*splat', handler)
    },
    url,
    headers
  )
}

// Pipes a send stream for `url` (after `before(res)`, if given) and resolves
// with the error it emits.
function emitted(sendFn, url, options, before) {
  return new Promise(function (resolve, reject) {
    var server = http.createServer(function (req, res) {
      if (before) before(res)
      sendFn(req, url, options)
        .on('error', function (err) {
          resolve(err)
          res.end()
        })
        .pipe(res)
    })
    request(server)
      .get('/')
      .end(function (err) {
        if (err) reject(err)
      })
  })
}

// The function name of each stack frame: the name it was called by when V8
// gives one ("[as handle]"), else its own name without the receiver. The fork
// renamed some functions and receivers (VENDORED.md, and its TypeScript
// sources assign methods through `proto`), which this leaves out.
function frames(err) {
  return err.stack
    .split('\n')
    .slice(1)
    .map(function (line) {
      line = line.trim().replace(/ \(.*\)$/, '')
      var alias = /\[as ([^\]]+)\]$/.exec(line)
      var name = alias ? alias[1] : line.split(' ').pop()
      // an anonymous function's frame is only its position
      if (/:\d+:\d+$/.test(name)) return '<anonymous>'
      return name.slice(name.lastIndexOf('.') + 1)
    })
}

// Each code, what raises it, and how to get the error from an Express:
// get(lib, sendFn) resolves with the error.
var CASES = [
  // application
  ['EXPRESS_ERR_MIDDLEWARE_REQUIRED', 'app.use() without a function', (lib) => thrown(() => lib().use('/'))],
  [
    'EXPRESS_ERR_ENGINE_CALLBACK_REQUIRED',
    'app.engine() without a callback',
    (lib) => thrown(() => lib().engine('html'))
  ],
  [
    'EXPRESS_ERR_INVALID_ETAG_OPTION',
    'app.set("etag") with an unknown value',
    (lib) => thrown(() => lib().set('etag', 'bogus'))
  ],
  [
    'EXPRESS_ERR_INVALID_QUERY_PARSER_OPTION',
    'app.set("query parser") with an unknown value',
    (lib) => thrown(() => lib().set('query parser', 'bogus'))
  ],
  // views
  [
    'EXPRESS_ERR_NO_DEFAULT_ENGINE',
    'res.render() with no extension and no "view engine"',
    (lib) => handled(lib, (req, res) => res.render('user'))
  ],
  [
    'EXPRESS_ERR_VIEW_ENGINE_NOT_FOUND',
    'res.render() with an extension whose module has no __express',
    (lib) => handled(lib, (req, res) => res.render(path.join(FIXTURES, 'broken.send'))),
    // already on master: the "view engines" lookup moved the require into
    // loadEngine(), called from the View constructor
    { addedFrame: 'loadEngine' }
  ],
  [
    'EXPRESS_ERR_VIEW_NOT_FOUND',
    'res.render() of a view that is not there',
    (lib) =>
      caught(lib, function (app) {
        app.set('views', FIXTURES)
        app.engine('tmpl', tmpl)
        app.set('view engine', 'tmpl')
        app.get('/', (req, res) => res.render('missing'))
      })
  ],
  // request
  ['EXPRESS_ERR_HEADER_NAME_REQUIRED', 'req.get() without a name', (lib) => handled(lib, (req) => req.get())],
  ['EXPRESS_ERR_HEADER_NAME_NOT_STRING', 'req.get() with a number', (lib) => handled(lib, (req) => req.get(42))],
  // response
  [
    'EXPRESS_ERR_INVALID_STATUS_CODE',
    'res.status() with a non-integer',
    (lib) => handled(lib, (req, res) => res.status(200.5))
  ],
  [
    'EXPRESS_ERR_STATUS_CODE_OUT_OF_RANGE',
    'res.status() below 100',
    (lib) => handled(lib, (req, res) => res.status(99))
  ],
  [
    'EXPRESS_ERR_SENDFILE_PATH_REQUIRED',
    'res.sendFile() without a path',
    (lib) => handled(lib, (req, res) => res.sendFile())
  ],
  [
    'EXPRESS_ERR_SENDFILE_PATH_NOT_STRING',
    'res.sendFile() with a number',
    (lib) => handled(lib, (req, res) => res.sendFile(42))
  ],
  [
    'EXPRESS_ERR_SENDFILE_PATH_NOT_ABSOLUTE',
    'res.sendFile() with a relative path and no root',
    (lib) => handled(lib, (req, res) => res.sendFile('name.txt'))
  ],
  [
    'EXPRESS_ERR_CONTENT_TYPE_ARRAY',
    'res.set("Content-Type") with an array',
    (lib) => handled(lib, (req, res) => res.set('Content-Type', ['text/plain']))
  ],
  [
    'EXPRESS_ERR_COOKIE_SECRET_REQUIRED',
    'res.cookie() signed without a secret',
    (lib) => handled(lib, (req, res) => res.cookie('name', 'tobi', { signed: true }))
  ],
  [
    'EXPRESS_ERR_NOT_ACCEPTABLE',
    'res.format() with no type the client accepts',
    (lib) =>
      handled(lib, (req, res) => res.format({ 'text/html': () => res.end() }), '/', { Accept: 'application/json' })
  ],
  // router
  ['EXPRESS_ERR_PARAM_NAME_REQUIRED', 'router.param() without a name', (lib) => thrown(() => lib.Router().param())],
  [
    'EXPRESS_ERR_PARAM_NAME_NOT_STRING',
    'router.param() with a number',
    (lib) => thrown(() => lib.Router().param(42, () => {}))
  ],
  [
    'EXPRESS_ERR_PARAM_CALLBACK_REQUIRED',
    'router.param() without a callback',
    (lib) => thrown(() => lib.Router().param('id'))
  ],
  [
    'EXPRESS_ERR_PARAM_CALLBACK_NOT_FUNCTION',
    'router.param() with a callback that is not a function',
    (lib) => thrown(() => lib.Router().param('id', 42))
  ],
  [
    'EXPRESS_ERR_ROUTER_CALLBACK_REQUIRED',
    'router.handle() without a callback',
    (lib) => thrown(() => lib.Router().handle({}, {}))
  ],
  ['EXPRESS_ERR_HANDLER_REQUIRED', 'router.use() without a handler', (lib) => thrown(() => lib.Router().use('/'))],
  ['EXPRESS_ERR_HANDLER_REQUIRED', 'route.all() without a handler', (lib) => thrown(() => lib().all('/'))],
  ['EXPRESS_ERR_HANDLER_REQUIRED', 'route.METHOD() without a handler', (lib) => thrown(() => lib().post('/'))],
  [
    'EXPRESS_ERR_HANDLER_NOT_FUNCTION',
    'router.use() with a handler that is not a function',
    (lib) => thrown(() => lib.Router().use('/', 42))
  ],
  [
    'EXPRESS_ERR_HANDLER_NOT_FUNCTION',
    'route.all() with a handler that is not a function',
    (lib) => thrown(() => lib().all('/', 42))
  ],
  [
    'EXPRESS_ERR_HANDLER_NOT_FUNCTION',
    'route.METHOD() with a handler that is not a function',
    (lib) => thrown(() => lib().post('/', 42))
  ],
  [
    'EXPRESS_ERR_ROUTER_MOUNTS_ITSELF',
    'router.use() mounting the router on itself at "/" (fork only: 5.3.0 accepts it and loops)',
    (lib) => {
      var router = lib.Router()
      return thrown(() => router.use(router))
    },
    { forkOnly: true }
  ],
  [
    'EXPRESS_ERR_PARAM_DECODE_FAILED',
    'a route parameter that is not valid percent-encoding',
    (lib) => caught(lib, (app) => app.get('/users/:id', (req, res) => res.end()), '/users/%E0')
  ],
  [
    'EXPRESS_ERR_REJECTED_PROMISE',
    'a handler whose promise rejects without a reason',
    (lib) => handled(lib, () => Promise.reject())
  ],
  [
    'EXPRESS_ERR_REJECTED_PROMISE',
    'an error handler whose promise rejects without a reason',
    (lib) =>
      caught(lib, function (app) {
        app.get(
          '/',
          (req, res, next) => next(new Error('boom')),
          (err, req, res, next) => Promise.reject()
        )
      })
  ],
  [
    'EXPRESS_ERR_REJECTED_PROMISE',
    'a param callback whose promise rejects without a reason',
    (lib) =>
      caught(
        lib,
        function (app) {
          app.param('id', () => Promise.reject())
          app.get('/:id', (req, res) => res.end())
        },
        '/1'
      )
  ],
  // send (res.sendFile, res.download, express.static)
  [
    'EXPRESS_ERR_INVALID_DOTFILES_OPTION',
    'res.sendFile() with an unknown dotfiles option',
    (lib) => handled(lib, (req, res) => res.sendFile(FILE, { dotfiles: 'maybe' }))
  ],
  [
    'EXPRESS_ERR_INVALID_EXTENSIONS_OPTION',
    'res.sendFile() with an extensions option that is not strings',
    (lib) => handled(lib, (req, res) => res.sendFile(FILE, { extensions: [42] }))
  ],
  [
    'EXPRESS_ERR_INVALID_INDEX_OPTION',
    'res.sendFile() with an index option that is not strings',
    (lib) => handled(lib, (req, res) => res.sendFile(FILE, { index: [42] }))
  ],
  [
    'EXPRESS_ERR_SEND_HEADERS_SENT',
    'send piped to a response whose headers were sent (res.sendFile() after a response)',
    // send directly: through res.sendFile(), a finished response can also
    // report ECONNABORTED first, depending on timing
    (lib, sendFn) =>
      emitted(sendFn, '/name.txt', { root: SEND_FIXTURES }, function (res) {
        res.writeHead(200)
      })
  ],
  [
    'EXPRESS_ERR_SEND_INVALID_PATH',
    'express.static() for a path that is not valid percent-encoding',
    (lib) => caught(lib, (app) => app.use(lib.static(FIXTURES, { fallthrough: false })), '/%E0')
  ],
  [
    'EXPRESS_ERR_SEND_INVALID_PATH',
    'express.static() for a path with a null byte',
    (lib) => caught(lib, (app) => app.use(lib.static(FIXTURES, { fallthrough: false })), '/name%00.txt')
  ],
  [
    'EXPRESS_ERR_SEND_MALICIOUS_PATH',
    'res.sendFile() with ".." above its root',
    (lib) => handled(lib, (req, res) => res.sendFile('../name.txt', { root: FIXTURES }))
  ],
  [
    'EXPRESS_ERR_SEND_MALICIOUS_PATH',
    'res.sendFile() with ".." and no root',
    (lib) => handled(lib, (req, res) => res.sendFile(FIXTURES + '/users/../name.txt'))
  ],
  [
    'EXPRESS_ERR_SEND_DOTFILE_DENIED',
    'res.sendFile() of a dotfile with dotfiles "deny"',
    (lib) => handled(lib, (req, res) => res.sendFile(path.join(FIXTURES, '.name'), { dotfiles: 'deny' }))
  ],
  [
    'EXPRESS_ERR_SEND_DOTFILE_IGNORED',
    'res.sendFile() of a dotfile with dotfiles "ignore" (the default)',
    (lib) => handled(lib, (req, res) => res.sendFile(path.join(FIXTURES, '.name')))
  ],
  [
    'EXPRESS_ERR_SEND_IS_DIRECTORY',
    'express.static() for a directory, with redirect off',
    (lib) => caught(lib, (app) => app.use(lib.static(FIXTURES, { fallthrough: false, redirect: false })), '/users')
  ],
  [
    'EXPRESS_ERR_SEND_IS_DIRECTORY',
    'express.static() for a directory with a trailing slash and no index',
    (lib) => caught(lib, (app) => app.use(lib.static(FIXTURES, { fallthrough: false, index: false })), '/users/')
  ],
  [
    'EXPRESS_ERR_SEND_IS_DIRECTORY',
    'send for a directory with a trailing slash, with no "directory" listener',
    (lib, sendFn) => emitted(sendFn, '/pets/', { root: SEND_FIXTURES, index: false })
  ],
  [
    'EXPRESS_ERR_SEND_NOT_FOUND',
    'res.sendFile() where every extension tried is a directory',
    (lib) => handled(lib, (req, res) => res.sendFile(path.join(SEND_FIXTURES, 'name'), { extensions: ['dir'] }))
  ],
  [
    'EXPRESS_ERR_SEND_NOT_FOUND',
    'res.sendFile() of a directory whose index is a directory',
    (lib) => handled(lib, (req, res) => res.sendFile(SEND_FIXTURES + '/', { index: ['name.dir'] }))
  ],
  [
    'EXPRESS_ERR_SEND_NOT_FOUND',
    'send for a file path with a trailing separator that stats as a file',
    (lib, sendFn) => {
      // Linux and macOS answer ENOTDIR for "file/"; Windows stats the file.
      var file = path.join(SEND_FIXTURES, 'name.txt')
      var realStat = fs.stat
      fs.stat = function (p, cb) {
        return p === file + path.sep ? realStat.call(fs, file, cb) : realStat.apply(fs, arguments)
      }
      return emitted(sendFn, '/name.txt/', { root: SEND_FIXTURES, index: false }).finally(function () {
        fs.stat = realStat
      })
    }
  ],
  [
    'EXPRESS_ERR_SEND_PRECONDITION_FAILED',
    'res.sendFile() with an If-Match that does not match',
    (lib) => handled(lib, (req, res) => res.sendFile(FILE), '/', { 'If-Match': '"nope"' })
  ],
  [
    'EXPRESS_ERR_SEND_RANGE_NOT_SATISFIABLE',
    'res.sendFile() with a Range past the end',
    (lib) => handled(lib, (req, res) => res.sendFile(FILE), '/', { Range: 'bytes=9999-' })
  ],
  // serve-static
  ['EXPRESS_ERR_STATIC_ROOT_REQUIRED', 'express.static() without a root', (lib) => thrown(() => lib.static())],
  ['EXPRESS_ERR_STATIC_ROOT_NOT_STRING', 'express.static() with a number', (lib) => thrown(() => lib.static(42))],
  [
    'EXPRESS_ERR_STATIC_SET_HEADERS_NOT_FUNCTION',
    'express.static() with a setHeaders that is not a function',
    (lib) => thrown(() => lib.static(FIXTURES, { setHeaders: 42 }))
  ]
]

// Every code, in the order the docs list them.
var CODES = CASES.map((c) => c[0]).filter((code, i, all) => all.indexOf(code) === i)

// The own properties an app could see, other than `stack` and `code`.
function visible(err) {
  var out = {}
  Object.getOwnPropertyNames(err).forEach(function (name) {
    if (name === 'stack' || name === 'code' || name === 'view') return
    var desc = Object.getOwnPropertyDescriptor(err, name)
    out[name] = [desc.enumerable, desc.writable, desc.value]
  })
  return out
}

describe('error codes (fork)', function () {
  CASES.forEach(function (c) {
    var code = c[0]
    var when = c[1]
    var get = c[2]
    var forkOnly = c[3] && c[3].forkOnly
    var addedFrame = c[3] && c[3].addedFrame

    describe(code + ': ' + when, function () {
      it('has the code, as an own property that is writable and configurable but not enumerable', function () {
        return get(express, send).then(function (err) {
          assert.ok(err instanceof Error)
          assert.strictEqual(err.code, code)
          assert.deepStrictEqual(Object.getOwnPropertyDescriptor(err, 'code'), {
            value: code,
            writable: true,
            enumerable: false,
            configurable: true
          })
          assert.ok(!/withCode/.test(err.stack), 'a frame for withCode: ' + err.stack)
        })
      })

      if (forkOnly) return

      it('keeps the message, class, properties, serialisation and first frames of Express 5.3.0', function () {
        return Promise.all([get(express, send), get(baseline, baselineSend)]).then(function (errs) {
          var ours = errs[0]
          var theirs = errs[1]
          assert.ok(!('code' in theirs), '5.3.0 has a code')
          assert.strictEqual(ours.message, theirs.message)
          assert.strictEqual(ours.constructor, theirs.constructor)
          assert.strictEqual(Object.getPrototypeOf(ours), Object.getPrototypeOf(theirs))
          assert.strictEqual(ours.name, theirs.name)
          assert.deepStrictEqual(Object.keys(ours), Object.keys(theirs))
          assert.deepStrictEqual(visible(ours), visible(theirs))
          if (!ours.view) {
            assert.strictEqual(JSON.stringify(ours), JSON.stringify(theirs))
            assert.strictEqual(
              util.inspect(ours).replace(ours.stack, ''),
              util.inspect(theirs).replace(theirs.stack, '')
            )
          }
          var ourFrames = frames(ours)
          if (addedFrame) assert.strictEqual(ourFrames.shift(), addedFrame)
          assert.deepStrictEqual(ourFrames.slice(0, 2), frames(theirs).slice(0, 2))
        })
      })
    })
  })

  it('lets an app assign and delete the code, as on any error', function () {
    return thrown(() => express().use('/')).then(function (err) {
      err.code = 'MINE'
      assert.strictEqual(err.code, 'MINE')
      assert.ok(delete err.code)
      assert.ok(!('code' in err))
    })
  })

  describe('errors that already have a code keep it', function () {
    it('ENOENT from res.sendFile() of a missing file', function () {
      var missing = (lib) => handled(lib, (req, res) => res.sendFile(path.join(FIXTURES, 'missing.txt')))
      return Promise.all([missing(express), missing(baseline)]).then(function (errs) {
        assert.strictEqual(errs[0].code, 'ENOENT')
        assert.deepStrictEqual(
          Object.getOwnPropertyDescriptor(errs[0], 'code'),
          Object.getOwnPropertyDescriptor(errs[1], 'code')
        )
        assert.deepStrictEqual(Object.keys(errs[0]), Object.keys(errs[1]))
      })
    })

    it('EISDIR from res.sendFile() of a directory', function () {
      // without a callback, res.sendFile() calls next() with no error for EISDIR
      var dir = (lib) =>
        caught(lib, function (app, done) {
          app.get('/', (req, res) => res.sendFile(path.join(FIXTURES, 'users'), done))
        })
      return Promise.all([dir(express), dir(baseline)]).then(function (errs) {
        assert.strictEqual(errs[0].code, 'EISDIR')
        assert.deepStrictEqual(
          Object.getOwnPropertyDescriptor(errs[0], 'code'),
          Object.getOwnPropertyDescriptor(errs[1], 'code')
        )
      })
    })

    it("ERR_HTTP_HEADERS_SENT from Node's response", function () {
      var twice = (lib) =>
        caught(lib, function (app, done) {
          app.get('/', function (req, res) {
            res.send('first')
            try {
              res.set('X-Late', 'yes')
            } catch (err) {
              done(err)
            }
          })
        })
      return Promise.all([twice(express), twice(baseline)]).then(function (errs) {
        assert.strictEqual(errs[0].code, 'ERR_HTTP_HEADERS_SENT')
        assert.deepStrictEqual(
          Object.getOwnPropertyDescriptor(errs[0], 'code'),
          Object.getOwnPropertyDescriptor(errs[1], 'code')
        )
      })
    })
  })

  it("send's error() still emits an error without a code when it is given none", function () {
    var bare = (sendFn) =>
      new Promise(function (resolve) {
        var stream = sendFn({ headers: {}, url: '/' }, '/name.txt', { root: SEND_FIXTURES })
        stream.on('error', resolve)
        stream.error(404)
      })
    return Promise.all([bare(send), bare(baselineSend)]).then(function (errs) {
      assert.ok(!('code' in errs[0]))
      assert.strictEqual(errs[0].message, errs[1].message)
      assert.strictEqual(errs[0].status, 404)
    })
  })

  describe('the list of codes', function () {
    it('is the list in docs/api/errors.md, in order', function () {
      var doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'api', 'errors.md'), 'utf8')
      var listed = doc.match(/^\| `EXPRESS_ERR_[A-Z_]+`/gm).map((row) => row.slice(3, -1))
      assert.deepStrictEqual(listed, CODES)
    })

    it('is the ErrorCode type in typings/index.d.ts', function () {
      var types = fs.readFileSync(path.join(__dirname, '..', 'typings', 'index.d.ts'), 'utf8')
      var union = types.slice(types.indexOf('type ErrorCode ='))
      union = union.slice(0, union.indexOf('\n\n'))
      assert.deepStrictEqual(union.match(/EXPRESS_ERR_[A-Z_]+/g).sort(), CODES.slice().sort())
    })

    it('is every code the source gives an error', function () {
      var found = new Set()
      fs.readdirSync(path.join(__dirname, '..', 'src'), { recursive: true }).forEach(function (file) {
        if (!/\.ts$/.test(file)) return
        var text = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8')
        ;(text.match(/'EXPRESS_ERR_[A-Z_]+'/g) || []).forEach((code) => found.add(code.slice(1, -1)))
      })
      assert.deepStrictEqual([...found].sort(), CODES.slice().sort())
    })
  })
})
