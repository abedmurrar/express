'use strict'

const assert = require('node:assert')
const Layer = require('../../lib/router/lib/layer')
const { matchedPattern } = require('../../lib/router/lib/original-route')

// router 2.3.0's test/layer.js. There layer.match() returns the match
// (pillarjs/router#216, not taken). Here it returns whether it matched and
// stores the result in layer.params, layer.path and layer.keys, so this reads
// the same object from there, and the pattern as tracing does.
function matchOf(layer, path) {
  if (!layer.match(path)) {
    assert.strictEqual(layer.params, undefined)
    assert.strictEqual(layer.path, undefined)
    return false
  }

  return {
    params: layer.params,
    path: layer.path,
    keys: layer.keys,
    pattern: matchedPattern(layer, path, false)
  }
}

// Upstream freezes the whole layer; everything but the stored match here.
function freeze(layer) {
  for (const name of Object.keys(layer)) {
    if (name === 'keys' || name === 'params' || name === 'path') continue
    Object.defineProperty(layer, name, { writable: false, configurable: false })
  }

  return Object.preventExtensions(layer)
}

describe('match', function () {
  it('should return independent results for nested path arrays', function () {
    const layer = new Layer(['/users/:id', ['/posts/:id', '/legacy/:n']], {}, function handle() {})
    const first = matchOf(layer, '/users/1')
    const second = matchOf(layer, '/posts/2')
    const legacy = matchOf(layer, '/legacy/3')

    assert.strictEqual(first.pattern, '/users/:id')
    assert.strictEqual(first.path, '/users/1')
    assert.strictEqual(first.params.id, '1')
    assert.deepStrictEqual(first.keys, ['id'])
    assert.strictEqual(second.pattern, '/posts/:id')
    assert.strictEqual(second.path, '/posts/2')
    assert.strictEqual(second.params.id, '2')
    assert.strictEqual(legacy.pattern, '/legacy/:n')
    assert.strictEqual(legacy.path, '/legacy/3')
    assert.deepStrictEqual(Object.assign({}, legacy.params), { n: '3' })
    assert.deepStrictEqual(legacy.keys, ['n'])

    assert.strictEqual(matchOf(layer, '/missing'), false)
    assert.strictEqual(matchOf(layer, null), false)
    assert.strictEqual(matchOf(layer, undefined), false)
    assert.strictEqual(first.params.id, '1')
    assert.strictEqual(first.path, '/users/1')
    assert.strictEqual(second.params.id, '2')
  })

  // Upstream's nested array holds a RegExp, which 2.3.0 accepts because it
  // builds its matchers from the flattened array (pillarjs/router#207). That
  // part is not taken: it would also stop an empty nested array from matching
  // "/", as it does in 5.3.0.
  it('should match an empty nested path array and reject a RegExp in one, as in 2.2.0', function () {
    const layer = new Layer(['/a', []], { end: false }, function handle() {})
    assert.strictEqual(layer.match('/b'), true)
    assert.throws(function () {
      new Layer(['/a', [/^\/b$/]], {}, function handle() {})
    }, TypeError)
  })

  it('should return the root pattern for middleware without an explicit path', function () {
    const layer = new Layer('/', { end: false }, function handle() {})

    const first = matchOf(layer, '/users/1')
    const second = matchOf(layer, '/users/2')

    assert.deepStrictEqual(first, { params: {}, path: '', keys: [], pattern: '/' })
    assert.deepStrictEqual(second, first)
    assert.notStrictEqual(first.params, second.params)
    assert.strictEqual(matchOf(layer, null), false)
  })

  for (const path of ['/:id', /^\/(\w+)$/, '/']) {
    it('should match a layer, frozen except for the stored match, registered at ' + path, function () {
      const layer = freeze(new Layer(path, { end: false }, function handle() {}))

      assert.ok(layer.match('/first'))
      assert.ok(layer.match('/second'))
      assert.strictEqual(layer.match(null), false)
      // kept, as in 2.2.0, for code that walks router.stack
      assert.strictEqual('params' in layer, true)
      assert.strictEqual('path' in layer, true)
      assert.strictEqual('keys' in layer, true)
    })
  }

  it('should keep a previous result after a decoding error', function () {
    const layer = freeze(new Layer('/:id', {}, function handle() {}))
    const first = matchOf(layer, '/first')

    assert.throws(function () {
      layer.match('/%Z')
    }, URIError)
    assert.strictEqual(first.params.id, 'first')
    assert.strictEqual(first.path, '/first')
    assert.deepStrictEqual(first.keys, ['id'])
    assert.strictEqual(first.pattern, '/:id')
  })

  it('should return fresh wildcard params and keys for each match', function () {
    const layer = new Layer('/files{/*parts}', {}, function handle() {})
    const first = matchOf(layer, '/files/a/b')
    const second = matchOf(layer, '/files/a/b')
    const absent = matchOf(layer, '/files')

    first.params.parts.push('c')
    first.keys.push('extra')
    assert.deepStrictEqual(second.params.parts, ['a', 'b'])
    assert.deepStrictEqual(second.keys, ['parts'])
    assert.deepStrictEqual(absent.keys, [])
    assert.strictEqual(absent.params.parts, undefined)
    assert.strictEqual(absent.pattern, '/files{/*parts}')
  })

  it('should preserve empty registered patterns', function () {
    const layer = new Layer('', {}, function handle() {})
    const result = matchOf(layer, '/')

    assert.strictEqual(result.pattern, '')
    assert.strictEqual(result.path, '/')
    assert.deepStrictEqual(result.keys, [])
  })
})

describe('decodeParam', function () {
  it('should set status and statusCode to 400 on URIError', function () {
    const layer = new Layer('/:param', {}, function handle() {})

    assert.throws(
      function () {
        layer.match('/%Z')
      },
      function (err) {
        assert.ok(err instanceof URIError)
        assert.strictEqual(err.status, 400)
        assert.strictEqual(err.statusCode, 400)
        assert.strictEqual(err.message, "Failed to decode param '%Z'")
        return true
      }
    )
  })

  it('should successfully decode valid parameters', function () {
    // Create a layer with a parameter route - note the need to provide a handler function
    const layer = new Layer('/:param', {}, function handle() {})

    // Create a valid encoded parameter
    const original = 'test value'
    const encoded = encodeURIComponent(original)

    // Match will internally call decodeParam with our encoded value
    const matched = matchOf(layer, '/' + encoded)

    // Verify the parameter was properly decoded
    assert.ok(matched, 'Route should match')
    assert.strictEqual(matched.params.param, original, 'Parameter should be properly decoded')
  })
})
