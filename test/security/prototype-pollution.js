'use strict'

// Prototype pollution: no query string or request body may change
// Object.prototype. Each case also pins exactly what req.query or req.body
// holds (its own keys, as JSON, and its prototype), so a faster parser that
// differs from qs or JSON.parse is noticed.
//
// Dangerous today, kept on this line on purpose:
// - The extended query parser (qs with allowPrototypes) and the extended
//   urlencoded parser keep keys such as hasOwnProperty, toString and
//   constructor as own properties, so `req.query.hasOwnProperty('a')`
//   throws when a client sends `?hasOwnProperty=1`.
// - express.json keeps a "__proto__" key as an own property (that is what
//   JSON.parse does). It does not pollute anything by itself, but an app that
//   deep-merges req.body into another object can be polluted by it.

var assert = require('node:assert')
var express = require('../../')
var { request } = require('./support')

var ORIGINAL = Object.getOwnPropertyNames(Object.prototype).sort()

function prototypeName(value) {
  var proto = Object.getPrototypeOf(value)
  if (proto === null) return 'null'
  if (proto === Object.prototype) return 'Object'
  if (proto === Array.prototype) return 'Array'
  return 'other'
}

function assertClean() {
  assert.deepStrictEqual(Object.getOwnPropertyNames(Object.prototype).sort(), ORIGINAL, 'Object.prototype changed')
  assert.strictEqual({}.polluted, undefined, 'Object.prototype was polluted')
}

// [query string, JSON of req.query, prototype of req.query]
var EXTENDED_QUERY = [
  ['__proto__[polluted]=yes', '{}', 'Object'],
  ['__proto__=yes', '{}', 'Object'],
  ['%5F%5Fproto%5F%5F[polluted]=yes', '{}', 'Object'],
  ['__proto__%5Bpolluted%5D=yes', '{}', 'Object'],
  ['[__proto__][polluted]=yes', '{}', 'Object'],
  ['__proto__.polluted=yes', '{"__proto__.polluted":"yes"}', 'Object'],
  ['a[__proto__][polluted]=yes', '{"a":{}}', 'Object'],
  ['a[__proto__]=yes', '{"a":{}}', 'Object'],
  ['a[0]=1&a[__proto__][polluted]=yes', '{"a":{"0":"1"}}', 'Object'],
  ['a[]=1&a[__proto__]=yes', '{"a":{"0":"1"}}', 'Object'],
  ['a.__proto__.polluted=yes', '{"a.__proto__.polluted":"yes"}', 'Object'],
  ['constructor[prototype][polluted]=yes', '{"constructor":{"prototype":{"polluted":"yes"}}}', 'Object'],
  ['a[constructor][prototype][polluted]=yes', '{"a":{"constructor":{"prototype":{"polluted":"yes"}}}}', 'Object'],
  ['hasOwnProperty=yes', '{"hasOwnProperty":"yes"}', 'Object'],
  ['a[hasOwnProperty]=yes', '{"a":{"hasOwnProperty":"yes"}}', 'Object'],
  ['toString=yes', '{"toString":"yes"}', 'Object'],
  ['valueOf=yes', '{"valueOf":"yes"}', 'Object'],
  ['__pro__proto__to__[polluted]=yes', '{"__pro__proto__to__":{"polluted":"yes"}}', 'Object']
]

var SIMPLE_QUERY = [
  ['__proto__[polluted]=yes', '{"__proto__[polluted]":"yes"}', 'null'],
  ['__proto__=yes', '{"__proto__":"yes"}', 'null'],
  ['constructor[prototype][polluted]=yes', '{"constructor[prototype][polluted]":"yes"}', 'null'],
  ['hasOwnProperty=yes', '{"hasOwnProperty":"yes"}', 'null'],
  ['toString=yes', '{"toString":"yes"}', 'null']
]

// [body parser, content type, body, JSON of req.body, prototype of req.body]
var BODIES = [
  ['json', 'application/json', '{"__proto__":{"polluted":"yes"}}', '{"__proto__":{"polluted":"yes"}}', 'Object'],
  ['json', 'application/json', '{"\\u005f_proto__":{"polluted":"yes"}}', '{"__proto__":{"polluted":"yes"}}', 'Object'],
  [
    'json',
    'application/json',
    '{"a":{"__proto__":{"polluted":"yes"}}}',
    '{"a":{"__proto__":{"polluted":"yes"}}}',
    'Object'
  ],
  ['json', 'application/json', '[{"__proto__":{"polluted":"yes"}}]', '[{"__proto__":{"polluted":"yes"}}]', 'Array'],
  [
    'json',
    'application/json',
    '{"constructor":{"prototype":{"polluted":"yes"}}}',
    '{"constructor":{"prototype":{"polluted":"yes"}}}',
    'Object'
  ],
  ['json', 'application/json', '{"hasOwnProperty":"yes"}', '{"hasOwnProperty":"yes"}', 'Object'],
  ['urlencoded extended', 'application/x-www-form-urlencoded', '__proto__[polluted]=yes', '{}', 'Object'],
  ['urlencoded extended', 'application/x-www-form-urlencoded', 'a[__proto__][polluted]=yes', '{"a":{}}', 'Object'],
  [
    'urlencoded extended',
    'application/x-www-form-urlencoded',
    'constructor[prototype][polluted]=yes',
    '{"constructor":{"prototype":{"polluted":"yes"}}}',
    'Object'
  ],
  [
    'urlencoded extended',
    'application/x-www-form-urlencoded',
    'hasOwnProperty=yes',
    '{"hasOwnProperty":"yes"}',
    'Object'
  ],
  [
    'urlencoded',
    'application/x-www-form-urlencoded',
    '__proto__[polluted]=yes',
    '{"__proto__[polluted]":"yes"}',
    'Object'
  ],
  ['urlencoded', 'application/x-www-form-urlencoded', '__proto__=yes', '{}', 'Object'],
  ['urlencoded', 'application/x-www-form-urlencoded', 'hasOwnProperty=yes', '{"hasOwnProperty":"yes"}', 'Object']
]

var PARSERS = {
  json: function () {
    return express.json()
  },
  'urlencoded extended': function () {
    return express.urlencoded({ extended: true })
  },
  urlencoded: function () {
    return express.urlencoded({ extended: false })
  }
}

describe('security: prototype pollution', function () {
  afterEach(function () {
    // keep a polluting (broken) build from breaking every later test
    delete Object.prototype.polluted
  })

  function queryCases(parser, cases) {
    describe(parser + ' query parser', function () {
      cases.forEach(function (c) {
        it('?' + c[0], async function () {
          var app = express()
          var seen
          app.set('query parser', parser)
          app.get('/', function (req, res) {
            seen = req.query
            res.send('ok')
          })
          var r = await request(app, '/?' + c[0])
          assert.strictEqual(r.status, 200)
          assertClean()
          assert.strictEqual(JSON.stringify(seen), c[1])
          assert.strictEqual(prototypeName(seen), c[2])
        })
      })
    })
  }

  queryCases('extended', EXTENDED_QUERY)
  queryCases('simple', SIMPLE_QUERY)

  describe('body parsers', function () {
    BODIES.forEach(function (c) {
      it(c[0] + ' ' + c[2], async function () {
        var app = express()
        var seen
        app.use(PARSERS[c[0]]())
        app.post('/', function (req, res) {
          seen = req.body
          res.send('ok')
        })
        var r = await request(app, { method: 'POST', path: '/', headers: { 'Content-Type': c[1] }, body: c[2] })
        assert.strictEqual(r.status, 200)
        assertClean()
        assert.strictEqual(JSON.stringify(seen), c[3])
        assert.strictEqual(prototypeName(seen), c[4])
      })
    })
  })

  it('pinned: ?hasOwnProperty=1 breaks req.query.hasOwnProperty() with the extended parser (dangerous)', async function () {
    var app = express()
    app.get('/', function (req, res) {
      res.send(req.query.hasOwnProperty('a'))
    })
    app.use(function (err, req, res, next) {
      res.status(500).send(err.name)
    })
    var r = await request(app, '/?hasOwnProperty=1')
    assert.strictEqual(r.status + ' ' + r.body, '500 TypeError')
  })

  it('req.params and res.locals are not polluted by a "__proto__" path segment', async function () {
    var app = express()
    var seen
    app.get('/:key/{*rest}', function (req, res) {
      seen = [JSON.stringify(req.params), prototypeName(req.params), res.locals.polluted]
      res.send('ok')
    })
    var r = await request(app, '/__proto__/polluted')
    assert.strictEqual(r.status, 200)
    assertClean()
    assert.deepStrictEqual(seen, ['{"key":"__proto__","rest":["polluted"]}', 'null', undefined])
  })
})
