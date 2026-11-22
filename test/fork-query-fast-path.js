'use strict'

// The extended query parser's fast path for flat query strings. Each case
// must give exactly what qs.parse(str, { allowPrototypes: true }) gives (the
// same values, prototypes and key order), and the fast path must leave qs
// out exactly when the string is flat. test/property/query.js fuzzes the same.

var assert = require('node:assert')
var qs = require('qs')
var request = require('supertest')
var express = require('../')
var { parserCalls, shape } = require('./support/query-fast-path')

var parse = express().set('query parser', 'extended').get('query parser fn')

// Parse `str`, check it against qs and return the result and whether qs ran.
function parsed(str) {
  var calls = parserCalls()
  var actual = parse(str)
  var used = calls.stop()
  var expected = qs.parse(str, { allowPrototypes: true })
  assert.deepStrictEqual(actual, expected)
  assert.deepStrictEqual(shape(actual), shape(expected))
  return { value: actual, qs: used > 0 }
}

function fast(str, expected) {
  var result = parsed(str)
  assert.strictEqual(result.qs, false, 'expected the fast path for ' + JSON.stringify(str))
  assert.deepStrictEqual(result.value, expected)
  return result.value
}

function slow(str, expected) {
  var result = parsed(str)
  assert.strictEqual(result.qs, true, 'expected qs for ' + JSON.stringify(str))
  assert.deepStrictEqual(result.value, expected)
  return result.value
}

function repeat(n, fn) {
  return Array.from({ length: n }, function (_, i) {
    return fn(i)
  })
}

describe('extended query parser fast path', function () {
  describe('the result', function () {
    it('is a plain object, like qs gives with allowPrototypes', function () {
      var query = fast('a=1&b=two', { a: '1', b: 'two' })
      assert.strictEqual(Object.getPrototypeOf(query), Object.prototype)
      assert.strictEqual(typeof query.hasOwnProperty, 'function')
    })

    it('is a new {} for an empty string, null and undefined', function () {
      var empty = fast('', {})
      assert.strictEqual(Object.getPrototypeOf(empty), Object.prototype)
      assert.notStrictEqual(parse(''), parse(''))
      ;[null, undefined].forEach(function (value) {
        var calls = parserCalls()
        var query = parse(value)
        assert.strictEqual(calls.stop(), 0)
        assert.deepStrictEqual(query, qs.parse(value, { allowPrototypes: true }))
        assert.strictEqual(Object.getPrototypeOf(query), Object.prototype)
        assert.notStrictEqual(parse(value), query)
      })
    })

    it('keeps keys in the order qs gives, integer keys first', function () {
      var query = fast('b=1&2=x&a=2&1=y&b=3&01=z', { b: ['1', '3'], 2: 'x', a: '2', 1: 'y', '01': 'z' })
      assert.deepStrictEqual(Object.keys(query), ['1', '2', 'b', 'a', '01'])
    })

    it('leaves non-string input to qs', function () {
      var input = { a: 'b', c: ['d'] }
      var calls = parserCalls()
      var query = parse(input)
      assert.strictEqual(calls.stop(), 1)
      assert.deepStrictEqual(query, { a: 'b', c: ['d'] })
    })
  })

  describe('repeated keys', function () {
    it('become arrays, as with qs', function () {
      fast('a=1&a=2&b=3&a=4', { a: ['1', '2', '4'], b: '3' })
    })

    it('stay an array of 20 values on the fast path', function () {
      var query = fast(
        repeat(20, String)
          .map((i) => 'a=' + i)
          .join('&'),
        { a: repeat(20, String) }
      )
      assert.ok(Array.isArray(query.a))
    })

    it('go to qs past qs`s arrayLimit of 20, which gives an object with numeric keys', function () {
      var query = slow(
        repeat(21, String)
          .map((i) => 'a=' + i)
          .join('&'),
        { a: Object.assign({}, repeat(21, String)) }
      )
      assert.ok(!Array.isArray(query.a))
      slow(repeat(25, (i) => 'a=' + i).join('&') + '&b=1', {
        a: Object.assign({}, repeat(25, String)),
        b: '1'
      })
    })

    it('count every spelling of a key that decodes the same', function () {
      fast('a=1&%61=2&a=3', { a: ['1', '2', '3'] })
      fast('a+b=1&a%20b=2', { 'a b': ['1', '2'] })
    })
  })

  describe("qs's parameterLimit of 1,000", function () {
    it('drops every part after the first 1,000', function () {
      var parts = repeat(999, (i) => 'k' + i + '=' + i)
      var expected = Object.fromEntries(repeat(999, (i) => ['k' + i, String(i)]).concat([['last', '1']]))
      var query = fast(parts.concat('last=1', 'after=1').join('&'), expected)
      assert.strictEqual(Object.keys(query).length, 1000)
      assert.strictEqual(query.last, '1')
      assert.ok(!('after' in query))
    })

    it('counts empty parts', function () {
      fast(repeat(999, () => '').join('&') + '&a=1&b=2', { a: '1' })
    })

    it('counts parts that qs drops for their key', function () {
      var dropped = repeat(500, () => '=x').concat(repeat(499, () => '__proto__=1'))
      fast(dropped.join('&') + '&a=1&b=1', { a: '1' })
    })
  })

  describe('decoding', function () {
    it('reads "+" as a space in keys and values, but "%2B" as "+"', function () {
      fast('a+b=c+d&e=%2B', { 'a b': 'c d', e: '+' })
    })

    it('decodes percent-escapes in keys and values as UTF-8', function () {
      fast('%E2%82%AC=%F0%9F%98%80&caf%C3%A9=%41', { '€': '😀', café: 'A' })
    })

    it('keeps a key or value with a malformed escape as it is, after "+" becomes a space', function () {
      fast('a=%&b=%2&c=%zz&d=%41%zz+x&%ZZ=1', { a: '%', b: '%2', c: '%zz', d: '%41%zz x', '%ZZ': '1' })
    })

    it('keeps escapes that are not valid UTF-8 as they are', function () {
      fast('a=%C3&b=%FF&c=%ED%A0%80', { a: '%C3', b: '%FF', c: '%ED%A0%80' })
    })

    it('passes unescaped unicode through, lone surrogates included', function () {
      fast('é=€&x=\uD800', { é: '€', x: '\uD800' })
    })

    it('ignores a utf8= sentinel, since charsetSentinel is off', function () {
      fast('utf8=%E2%9C%93&a=%C3%A9', { utf8: '✓', a: 'é' })
      fast('utf8=%26%2310003%3B&a=%C3%A9', { utf8: '&#10003;', a: 'é' })
    })
  })

  describe('pairs', function () {
    it('split at the first "="', function () {
      fast('a=b=c&d==', { a: 'b=c', d: '=' })
    })

    it('give "" to a key with no "="', function () {
      fast('a&b=&c', { a: '', b: '', c: '' })
    })

    it('drop an empty key', function () {
      fast('=1&=&&a=1&&', { a: '1' })
      fast('%=1', { '%': '1' })
    })

    it('keep a leading "?" in the first key, since ignoreQueryPrefix is off', function () {
      fast('?a=1&?=2', { '?a': '1', '?': '2' })
    })

    it('ignore a trailing "&" and repeated "&"', function () {
      fast('a=1&&b=2&', { a: '1', b: '2' })
    })

    it('keep "#", ",", ";" and "." in keys and values', function () {
      fast('a.b=1&c,d=2,3&e;f=#g', { 'a.b': '1', 'c,d': '2,3', 'e;f': '#g' })
    })
  })

  describe('prototype names', function () {
    it('drop a __proto__ key, however it is spelled, as qs does', function () {
      var query = fast('__proto__=1&%5F_proto__=2&__proto__&a=1', { a: '1' })
      assert.strictEqual(Object.getPrototypeOf(query), Object.prototype)
      assert.ok(!Object.hasOwn(query, '__proto__'))
    })

    it('keep constructor, prototype and Object.prototype method names as own keys', function () {
      var query = fast('constructor=1&prototype=2&toString=3&hasOwnProperty&valueOf=4&valueOf=5', {
        constructor: '1',
        prototype: '2',
        toString: '3',
        hasOwnProperty: '',
        valueOf: ['4', '5']
      })
      assert.ok(Object.hasOwn(query, 'constructor'))
      assert.strictEqual({}.toString, Object.prototype.toString)
    })

    it('treat a prototype name as new the first time, even though {} inherits it', function () {
      fast('constructor=1&constructor=2', { constructor: ['1', '2'] })
    })
  })

  describe('strings qs nests or reads specially', function () {
    it('go to qs when they have "[" or "]"', function () {
      slow('a[b]=1', { a: { b: '1' } })
      slow('a[]=1&a[]=2', { a: ['1', '2'] })
      slow('a=[', { a: '[' })
      slow('a]=1', { 'a]': '1' })
      slow('a=]=b', { 'a=]': 'b' })
    })

    it('go to qs when they have "%5B" or "%5D" in either case, which qs reads as brackets', function () {
      slow('a%5Bb%5D=1', { a: { b: '1' } })
      slow('a%5bb%5d=1', { a: { b: '1' } })
      // qs turns the escape into a bracket before decoding, so the malformed
      // escape keeps "[" instead of "%5B"
      slow('a=%5B%zz', { a: '[%zz' })
      slow('a=%5d', { a: ']' })
    })

    it('stay on the fast path for dots, since allowDots is off', function () {
      fast('a.b.c=1&.=2', { 'a.b.c': '1', '.': '2' })
    })

    it('stay on the fast path for an escaped "%" before 5B', function () {
      fast('a=%255B', { a: '%5B' })
      fast('%255B=1', { '%5B': '1' })
    })
  })

  describe('through req.query', function () {
    function app() {
      var app = express()
      app.set('query parser', 'extended')
      app.get('/', function (req, res) {
        res.json({ query: req.query, proto: Object.getPrototypeOf(req.query) === Object.prototype })
      })
      return app
    }

    it('parses a flat query string', function (done) {
      request(app())
        .get('/?q=express&page=2&tag=a&tag=b&x=%E2%82%AC+1')
        .expect(200, { query: { q: 'express', page: '2', tag: ['a', 'b'], x: '€ 1' }, proto: true }, done)
    })

    it('parses a nested query string with qs', function (done) {
      request(app())
        .get('/?user[name]=tj&user[age]=3')
        .expect(200, { query: { user: { name: 'tj', age: '3' } }, proto: true }, done)
    })

    it('gives {} with no query string', function (done) {
      request(app()).get('/').expect(200, { query: {}, proto: true }, done)
    })
  })
})
