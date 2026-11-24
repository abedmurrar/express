'use strict'

// The security bugs fixed in the examples: lookups by a request's value that
// found inherited properties (expressjs/express#7496), unescaped output
// (#7495) and a quadratic regular expression (#6689).

var assert = require('node:assert')
var childProcess = require('node:child_process')
var fs = require('node:fs')
var os = require('node:os')
var path = require('node:path')
var request = require('supertest')

var examples = path.join(__dirname, '..', '..', 'examples')

describe('examples: lookups by a value from the request', function () {
  var keys = ['__proto__', 'constructor', 'length', 'map', '9']

  afterEach(function () {
    // so that a failing test doesn't break the ones after it
    delete Array.prototype.name
    delete Array.prototype.email
  })

  keys.forEach(function (key) {
    it('route-separation should have no user ' + key, function (done) {
      request(load('route-separation'))
        .get('/user/' + key)
        .expect(404, done)
    })

    it('mvc should have no user or pet ' + key, async function () {
      var app = load('mvc')
      await request(app)
        .get('/user/' + key)
        .expect(404)
      await request(app)
        .get('/pet/' + key)
        .expect(404)
    })

    it('params should have no user ' + key, function (done) {
      request(load('params'))
        .get('/user/' + key)
        .expect(404, done)
    })

    it('route-middleware should have no user ' + key, function (done) {
      request(load('route-middleware'))
        .get('/user/' + key)
        .expect(500, /Failed to load user/, done)
    })

    it('resource should have no user ' + key, function (done) {
      request(load('resource'))
        .get('/users/' + key)
        .expect(200, { error: 'Cannot find user' }, done)
    })

    it('web-service should have no repos of ' + key, function (done) {
      request(load('web-service'))
        .get('/api/user/' + key + '/repos?api-key=foo')
        .expect(404, { error: "Sorry, can't find that" }, done)
    })

    it('auth should have no user ' + key, async function () {
      await request(load('auth'))
        .post('/login')
        .type('urlencoded')
        .send({ username: key, password: 'foobar' })
        .expect('Location', '/login')
        .expect(302)
    })
  })

  it('route-separation should not change Array.prototype', async function () {
    await request(load('route-separation'))
      .put('/user/__proto__/edit')
      .type('urlencoded')
      .send({ user: { name: 'pwned', email: 'pwned' } })
      .expect(404)
    assert.strictEqual([].name, undefined)
    assert.strictEqual([].email, undefined)
  })

  it('mvc should not change Array.prototype', async function () {
    var app = load('mvc')
    await request(app)
      .put('/user/__proto__')
      .type('urlencoded')
      .send({ user: { name: 'pwned' } })
      .expect(404)
    await request(app)
      .put('/pet/__proto__')
      .type('urlencoded')
      .send({ pet: { name: 'pwned' } })
      .expect(404)
    await request(app)
      .post('/user/__proto__/pet')
      .type('urlencoded')
      .send({ pet: { name: 'pwned' } })
      .expect(404)
    assert.strictEqual([].name, undefined)
  })
})

describe('examples: output', function () {
  it('vhost should escape the path', function (done) {
    request(load('vhost')).get('/%3Cscript%3E').set('Host', 'example.com').expect(200, 'requested &lt;script&gt;', done)
  })

  it('view-constructor should escape the locals', function (done) {
    load('view-constructor').engines['.md']('# {title}', { title: '<script>' }, function (err, html) {
      assert.strictEqual(err, null)
      assert.match(html, /<h1[^>]*>&lt;script&gt;<\/h1>/)
      done()
    })
  })
})

describe('examples: templates', function () {
  // the old expression needed over 20 seconds for these, past the test's 10
  var braces = '{'.repeat(200000)

  it('markdown should take a run of braces in linear time', function (done) {
    var file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'express-markdown-')), 'braces.md')
    fs.writeFileSync(file, braces)

    load('markdown').engines['.md'](file, {}, function (err, html) {
      fs.rmSync(path.dirname(file), { recursive: true })
      assert.strictEqual(err, null)
      assert.strictEqual(html, '<p>' + braces + '</p>\n')
      done()
    })
  })

  it('view-constructor should take a run of braces in linear time', function (done) {
    load('view-constructor').engines['.md'](braces, {}, function (err, html) {
      assert.strictEqual(err, null)
      assert.strictEqual(html, '<p>' + braces + '</p>\n')
      done()
    })
  })
})

describe('examples: starting', function () {
  // module.parent is undefined in a module loaded with import, so the examples
  // started a server there (#7092). static-files has no check: it always starts.
  it('should not listen when they are imported', function () {
    var script = [
      "import http from 'node:http'",
      "import { pathToFileURL } from 'node:url'",
      "http.Server.prototype.listen = function () { throw new Error('listen') }",
      'for (const file of process.argv.slice(1)) await import(pathToFileURL(file))'
    ].join('\n')
    var files = fs
      .readdirSync(examples)
      .filter(function (name) {
        return name !== 'static-files' && fs.statSync(path.join(examples, name)).isDirectory()
      })
      .map(function (name) {
        return path.join(examples, name, 'index.js')
      })
      .concat(path.join(examples, 'session', 'redis.js'))

    var run = childProcess.spawnSync(process.execPath, ['--input-type=module', '-e', script, '--'].concat(files), {
      encoding: 'utf8'
    })

    assert.ok(files.length > 20)
    assert.strictEqual(run.status, 0, run.stderr)
  })
})

function load(name) {
  return require(path.join(examples, name))
}
