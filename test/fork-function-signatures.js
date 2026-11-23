'use strict'

// Every public function keeps the `name` and `length` it has in Express 5.3.0
// (ROADMAP.md, "Performance on the compatible line": rest parameters instead
// of copying `arguments` by hand). A rest parameter doesn't count toward
// `length`, so a function rewritten with one keeps its declared parameters.
// The calls whose arguments are now read differently are checked against
// Express 5.3.0 too: same result, or the same error.

var assert = require('node:assert')
var express = require('../')
var baseline = require('express-baseline')

function functionsOf(obj) {
  var out = Object.create(null)
  Object.getOwnPropertyNames(obj).forEach(function (key) {
    var desc = Object.getOwnPropertyDescriptor(obj, key)
    if (typeof desc.value === 'function') out[key] = desc.value
  })
  return out
}

var targets = {
  express: function (e) {
    return e
  },
  app: function (e) {
    return e.application
  },
  req: function (e) {
    return e.request
  },
  res: function (e) {
    return e.response
  },
  Router: function (e) {
    return e.Router.prototype
  },
  Route: function (e) {
    return e.Route.prototype
  }
}

// Names the fork changed on purpose, before this check existed (VENDORED.md,
// "router"): the coverage merge rejects a file with two functions of one name.
var renamed = {
  'Router.handle': 'handleRequest'
}

function outcome(fn) {
  try {
    return { value: fn() }
  } catch (err) {
    return { error: err.constructor.name + ': ' + err.message }
  }
}

function sameOutcome(call) {
  assert.deepStrictEqual(outcome(call.bind(null, express)), outcome(call.bind(null, baseline)))
}

describe('fork: public function signatures', function () {
  Object.keys(targets).forEach(function (label) {
    it('keeps the name and length of every ' + label + ' function', function () {
      var ours = functionsOf(targets[label](express))
      var theirs = functionsOf(targets[label](baseline))
      var keys = Object.keys(theirs)

      assert.ok(keys.length > 0)
      keys.forEach(function (key) {
        assert.strictEqual(typeof ours[key], 'function', label + '.' + key + ' is missing')
        assert.deepStrictEqual(
          { name: ours[key].name, length: ours[key].length },
          { name: renamed[label + '.' + key] || theirs[key].name, length: theirs[key].length },
          label + '.' + key
        )
      })
    })
  })

  it('checks every public function of Express 5.3.0', function () {
    var count = Object.keys(targets).reduce(function (sum, label) {
      return sum + Object.keys(functionsOf(targets[label](baseline))).length
    }, 0)
    assert.ok(count >= 168, String(count))
  })
})

describe('fork: arguments read as Express 5.3.0 reads them', function () {
  function noop() {}

  it('app.use() and router.use() with no handler throw the same error', function () {
    sameOutcome(function (e) {
      return e().use()
    })
    sameOutcome(function (e) {
      return e().use(undefined)
    })
    sameOutcome(function (e) {
      return e().use('/x')
    })
    sameOutcome(function (e) {
      return e().use([])
    })
    sameOutcome(function (e) {
      e.Router().use()
    })
    sameOutcome(function (e) {
      e.Router().use(undefined)
    })
    sameOutcome(function (e) {
      e.Router().use('/x', [])
    })
  })

  it('app.use() and router.use() throw the same error for a non-function handler', function () {
    sameOutcome(function (e) {
      e().use('/x', noop, [null])
    })
    sameOutcome(function (e) {
      e.Router().use(noop, 'x')
    })
  })

  it('route.VERB() and route.all() tell no handler from an undefined one', function () {
    sameOutcome(function (e) {
      e.Router().route('/').get()
    })
    sameOutcome(function (e) {
      e.Router().route('/').get(undefined)
    })
    sameOutcome(function (e) {
      e.Router().route('/').all()
    })
    sameOutcome(function (e) {
      e.Router().route('/').all(undefined)
    })
    sameOutcome(function (e) {
      e
        .Router()
        .route('/')
        .post([[noop], [], [[noop]]]).stack.length
    })
  })

  it('app.VERB(), app.all(), router.VERB() and router.all() pass the same handlers on', function () {
    sameOutcome(function (e) {
      e().get('/')
    })
    sameOutcome(function (e) {
      e().post('/', undefined)
    })
    sameOutcome(function (e) {
      e().all('/')
    })
    sameOutcome(function (e) {
      var router = e.Router()
      router.put('/', noop, [noop, [noop]])
      router.all('/', noop)
      return router.stack.map(function (layer) {
        return layer.route.stack.length
      })
    })
    sameOutcome(function (e) {
      e.Router().patch('/')
    })
  })

  it('req.is() reads its arguments as a list, or takes an array as given', function () {
    function is(e, args) {
      var req = Object.create(e.request)
      req.headers = { 'content-type': 'application/json', 'transfer-encoding': 'chunked' }
      return req.is.apply(req, args)
    }
    ;[[], [undefined], ['json'], ['html', 'json'], [['html', 'json']], [['html'], 'json'], ['html', undefined]].forEach(
      function (args) {
        sameOutcome(function (e) {
          return is(e, args)
        })
      }
    )
  })

  it('app.get() with one argument reads the setting, with none makes a route', function () {
    sameOutcome(function (e) {
      return e().get('env')
    })
    sameOutcome(function (e) {
      return e().get(undefined)
    })
    sameOutcome(function (e) {
      e().get()
    })
  })
})
