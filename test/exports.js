'use strict'

var assert = require('node:assert')
var execFileSync = require('node:child_process').execFileSync
var path = require('node:path')
var pathToFileURL = require('node:url').pathToFileURL
var express = require('../')
var request = require('supertest')

// The name, type and, for functions, the name and length of each own property,
// in order.
function shape(obj) {
  return Object.getOwnPropertyNames(obj).map(function (name) {
    var value = obj[name]
    var type = typeof value
    return type === 'function' ? [name, type, value.name, value.length] : [name, type]
  })
}

// Imports the package in a separate Node process, so Node itself (not the test
// runner) resolves `express` through the `exports` map. Inside this repository
// `express` is the package's own name, so it resolves to this package.
function esmExports() {
  var script = [
    "import { createRequire } from 'node:module'",
    "const require = createRequire(process.cwd() + '/')",
    "const ours = await import('express')",
    "const base = await import('express-baseline')",
    "const cjs = require('express')",
    'const keys = Object.keys(ours)',
    'console.log(JSON.stringify({',
    '  keys,',
    '  baseKeys: Object.keys(base),',
    "  same: keys.filter((k) => (k === 'default' || k === 'module.exports' ? ours[k] === cjs : ours[k] === cjs[k])),",
    "  entry: import.meta.resolve('express')",
    '}))'
  ].join('\n')
  var out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8'
  })
  return JSON.parse(out)
}

describe('export shape', function () {
  var baseline = require('express-baseline')

  it('require("express") resolves to this package', function () {
    assert.strictEqual(require('express'), express)
  })

  it('has the own properties of Express 5.3.0, with the same types, function names and lengths', function () {
    assert.deepStrictEqual(shape(express), shape(baseline))
  })

  it('keeps the prototype objects of Express 5.3.0', function () {
    assert.deepStrictEqual(shape(express.application), shape(baseline.application))
    assert.deepStrictEqual(Object.keys(express.request), Object.keys(baseline.request))
    assert.deepStrictEqual(Object.keys(express.response), Object.keys(baseline.response))
  })

  it('keeps deep requires into lib/ working', function () {
    assert.strictEqual(require('express/lib/express'), require('../lib/express'))
    assert.strictEqual(require('express/lib/express.js'), require('../lib/express'))
    assert.strictEqual(require('express/package.json').name, 'express')
  })

  it('import gives the named exports Node gives Express 5.3.0, each the CommonJS value', function () {
    var esm = esmExports()
    assert.strictEqual(esm.entry, pathToFileURL(path.join(__dirname, '..', 'index.mjs')).href)
    esm.baseKeys.forEach(function (key) {
      assert.ok(esm.keys.indexOf(key) !== -1, 'missing named export: ' + key)
    })
    // Node 22 gives CommonJS modules no 'module.exports' export; Node 24 does.
    esm.keys.forEach(function (key) {
      assert.ok(esm.baseKeys.indexOf(key) !== -1 || key === 'module.exports', 'extra named export: ' + key)
    })
    assert.deepStrictEqual(esm.same, esm.keys)
  })
})

describe('exports', function () {
  it('should expose Router', function () {
    assert.strictEqual(typeof express.Router, 'function')
  })

  it('should expose json middleware', function () {
    assert.equal(typeof express.json, 'function')
    assert.equal(express.json.length, 1)
  })

  it('should expose raw middleware', function () {
    assert.equal(typeof express.raw, 'function')
    assert.equal(express.raw.length, 1)
  })

  it('should expose static middleware', function () {
    assert.equal(typeof express.static, 'function')
    assert.equal(express.static.length, 2)
  })

  it('should expose text middleware', function () {
    assert.equal(typeof express.text, 'function')
    assert.equal(express.text.length, 1)
  })

  it('should expose urlencoded middleware', function () {
    assert.equal(typeof express.urlencoded, 'function')
    assert.equal(express.urlencoded.length, 1)
  })

  it('should expose the application prototype', function () {
    assert.strictEqual(typeof express.application, 'object')
    assert.strictEqual(typeof express.application.set, 'function')
  })

  it('should expose the request prototype', function () {
    assert.strictEqual(typeof express.request, 'object')
    assert.strictEqual(typeof express.request.accepts, 'function')
  })

  it('should expose the response prototype', function () {
    assert.strictEqual(typeof express.response, 'object')
    assert.strictEqual(typeof express.response.send, 'function')
  })

  it("should give each app's request and response prototypes a plain .app property", function () {
    var app = express()
    var expected = { configurable: true, enumerable: true, writable: true, value: app }

    assert.deepStrictEqual(Object.getOwnPropertyDescriptor(app.request, 'app'), expected)
    assert.deepStrictEqual(Object.getOwnPropertyDescriptor(app.response, 'app'), expected)
  })

  it('should permit modifying the .application prototype', function () {
    express.application.foo = function () {
      return 'bar'
    }
    assert.strictEqual(express().foo(), 'bar')
  })

  it('should permit modifying the .request prototype', function (done) {
    express.request.foo = function () {
      return 'bar'
    }
    var app = express()

    app.use(function (req, res, next) {
      res.end(req.foo())
    })

    request(app).get('/').expect('bar', done)
  })

  it('should permit modifying the .response prototype', function (done) {
    express.response.foo = function () {
      this.send('bar')
    }
    var app = express()

    app.use(function (req, res, next) {
      res.foo()
    })

    request(app).get('/').expect('bar', done)
  })
})
