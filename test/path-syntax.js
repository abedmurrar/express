'use strict'

// What docs/guide/path-syntax.md says about path strings. Every path and
// message here is on that page, and the first test checks that they still are.

var assert = require('node:assert')
var express = require('../')
var fs = require('node:fs')
var path = require('node:path')
var request = require('supertest')

var page = fs.readFileSync(path.join(__dirname, '../docs/guide/path-syntax.md'), 'utf8')

// [path, message]: Express 4 paths, and others, that throw
var throwing = [
  ['*', 'Missing parameter name at index 1: *; visit https://git.new/pathToRegexpError for info'],
  ['/*', 'Missing parameter name at index'],
  ['/api/*', 'Missing parameter name at index'],
  ['/:1', 'Missing parameter name at index'],
  ['/user/:id?', 'Unexpected ? at index'],
  ['/:file.:ext?', 'Unexpected ? at index'],
  ['/ab?cd', 'Unexpected ? at index'],
  ['/:ids+', 'Unexpected + at index'],
  ['/a(bc)?d', 'Unexpected ( at index'],
  ['/(discussion|page)/:slug', 'Unexpected ( at index'],
  ['/user/:id(\\d+)', 'Unexpected ( at index'],
  ['/a!b', 'Unexpected ! at index'],
  ['/:a:b', 'Missing text before "b" param'],
  ['/a{b', 'Unexpected end at index 4, expected }', 'A `{` with no `}`'],
  ['/a[b', 'Unexpected [ at index', 'Unexpected [ at index'],
  ['/a]b', 'Unexpected ] at index', 'Unexpected ] at index'],
  ['/a)b', 'Unexpected ) at index', 'Unexpected ) at index'],
  ['/a}b', 'Unexpected } at index', 'Unexpected } at index'],
  ['/*a*b', 'Missing text before "b" wildcard', 'Missing text before "…" wildcard'],
  ['/a\\', 'Unexpected end after \\ at index', 'Unexpected end after \\ at index'],
  ['/:"a', 'Unterminated quote at index', 'Unterminated quote at index']
]

// [path, url, params or null for no match]
var matching = [
  ['/*splat', '/', null],
  ['/*splat', '/a/b', { splat: ['a', 'b'] }],
  ['/{*splat}', '/', {}],
  ['/{*splat}', '/a/b', { splat: ['a', 'b'] }],
  ['*splat', '/', { splat: ['', ''] }],
  ['*splat', '/a', { splat: ['', 'a'] }],
  ['/api/*splat', '/api', null],
  ['/api/*splat', '/api/', null],
  ['/api/*splat', '/api/a', { splat: ['a'] }],
  ['/api/*splat', '/api/a/b', { splat: ['a', 'b'] }],
  ['/api/{*splat}', '/api', null],
  ['/api/{*splat}', '/api/', {}],
  ['/api/{*splat}', '/api/a', { splat: ['a'] }],
  ['/api/{*splat}', '/api/a/b', { splat: ['a', 'b'] }],
  ['/api{/*splat}', '/api', {}],
  ['/api{/*splat}', '/api/', {}],
  ['/api{/*splat}', '/api/a', { splat: ['a'] }],
  ['/api{/*splat}', '/api/a/b', { splat: ['a', 'b'] }],
  ['/files/{*path}', '/files/docs/a%2Fb.txt', { path: ['docs', 'a/b.txt'] }],
  ['/files/{*path}', '/files/', {}],
  ['/user{/:id}', '/user', {}],
  ['/user{/:id}', '/user/', {}],
  ['/user{/:id}', '/user/7', { id: '7' }],
  ['/user/{:id}', '/user', null],
  ['/user/{:id}', '/user/', {}],
  ['/user/{:id}', '/user/7', { id: '7' }],
  ['/:file{.:ext}', '/image', { file: 'image' }],
  ['/:file{.:ext}', '/image.png', { file: 'image', ext: 'png' }],
  ['/a{b}cd', '/acd', {}],
  ['/a{b}cd', '/abcd', {}],
  ['/a{bc}d', '/ad', {}],
  ['/a{bc}d', '/abcd', {}],
  ['/*ids', '/a/b', { ids: ['a', 'b'] }],
  [['/discussion/:slug', '/page/:slug'], '/page/x', { slug: 'x' }],
  [['/discussion/:slug', '/page/:slug'], '/other/x', null],
  [/^\/user\/(?<id>\d+)\/?$/i, '/USER/7/', { id: '7' }],
  [/^\/user\/(?<id>\d+)\/?$/i, '/user/x', null],
  ['/a\\!b', '/a!b', {}],
  ['/price\\(usd\\)', '/price(usd)', {}],
  ['/:"user-id"', '/7', { 'user-id': '7' }],
  ['/:user-id', '/7-id', { user: '7' }],
  ['/ab*cd', '/abxyz', { cd: ['xyz'] }],
  ['/a{b}', '/a', {}],
  ['/a{b}', '/ab', {}]
]

describe('path syntax guide', function () {
  it('should have every path and message tested here', function () {
    throwing.forEach(function (args) {
      var text = args[2] || '`' + args[0].replaceAll('|', '\\|').replaceAll('\\d', '\\\\d') + '`'
      assert.ok(page.includes(text), text)
      if (!args[2]) assert.ok(page.includes(args[1].replace('"b"', '"…"')), args[1])
    })

    matching.forEach(function (args) {
      var source = [].concat(args[0])[0]
      source = source instanceof RegExp ? String(source) : source.replaceAll('\\', '\\\\')
      assert.ok(page.includes(source), source)
    })
  })

  throwing.forEach(function (args) {
    it('should throw for ' + args[0], function () {
      ;[
        function () {
          express().get(args[0], noop)
        },
        function () {
          express().use(args[0], noop)
        },
        function () {
          express().error(args[0], noop)
        },
        function () {
          express.Router().route(args[0])
        }
      ].forEach(function (add) {
        assert.throws(add, function (err) {
          return err instanceof TypeError && err.message.startsWith(args[1])
        })
      })
    })
  })

  matching.forEach(function (args) {
    it(args[0] + ' should ' + (args[2] ? '' : 'not ') + 'match ' + args[1], function (done) {
      var app = express()

      app.get(args[0], function (req, res) {
        res.json(req.params)
      })

      var req = request(app).get(args[1])
      if (args[2]) req.expect(200, args[2], done)
      else req.expect(404, done)
    })
  })

  it('should read req.params as the page says', function (done) {
    var app = express()

    app.get(/^\/user\/(?<id>\d+)\/?$/i, function (req, res, next) {
      assert.strictEqual(Object.getPrototypeOf(req.params), Object.prototype)
      next()
    })
    app.get('/user/:id', function (req, res) {
      assert.strictEqual(Object.getPrototypeOf(req.params), null)
      res.end()
    })

    request(app).get('/user/7').expect(200, done)
  })

  it('should run middleware without a path, or with a prefix, for every request under it', async function () {
    var app = express()

    app.use('/api', function (req, res) {
      res.send('api ' + req.baseUrl)
    })
    app.use('/wild/*splat', function (req, res) {
      res.send('wild ' + req.baseUrl)
    })
    app.use(function (req, res) {
      res.status(404).send('Not found')
    })

    await request(app).get('/api').expect(200, 'api /api')
    await request(app).get('/api/a/b').expect(200, 'api /api')
    await request(app).get('/wild/a/b').expect(200, 'wild /wild/a/b')
    await request(app).get('/wild').expect(404, 'Not found')
    await request(app).get('/').expect(404, 'Not found')
  })

  it('should leave a path to the next route when the handler checks it', async function () {
    var app = express()

    app.get('/user/:id', function (req, res, next) {
      if (!/^\d+$/.test(req.params.id)) return next('route')
      res.send('user ' + req.params.id)
    })

    await request(app).get('/user/7').expect(200, 'user 7')
    await request(app).get('/user/x').expect(404)
  })
})

function noop() {}
