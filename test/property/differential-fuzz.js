'use strict'

// Differential fuzzing against Express 5.3.0: random route tables (string
// paths with parameters, optional parts and splats, some RegExps, mounted
// routers), random request paths and query strings, random Host and
// X-Forwarded-* headers, and random settings including "trust proxy". Each
// case builds the same app on Express 5.3.0 (`express-baseline`) and on this
// repository, sends the same requests to both, and requires the same setup
// errors and the same responses: status, headers (minus Date) and body.

var assert = require('node:assert')
var fc = require('fast-check')
var baseline = require('express-baseline')
var ours = require('../..')
var http = require('node:http')
var { request, close } = require('../differential/support')
var { FUZZ, URL_CHARS, queryString, timeout } = require('./support')

// Route tables

var literal = fc.constantFrom('a', 'b', 'A', 'users', 'x-y', 'a.b', '1', 'api', 'v1')
var param = fc.constantFrom(':id', ':name', ':a', ':id.:ext', 'file-:n')
var routeSegment = fc.oneof(
  { weight: 4, arbitrary: literal },
  { weight: 3, arbitrary: param },
  { weight: 1, arbitrary: fc.constantFrom('*rest', '*splat') },
  // reserved characters, which path-to-regexp rejects (or escapes)
  { weight: 1, arbitrary: fc.constantFrom('(x)', 'a?', 'a+', '[b]', ':', '*', '\\(x\\)', '!', '{a', ':9') }
)
var routeSuffix = fc.constantFrom('', '', '', '{/:opt}', '{/b}', '{.:ext}', '{/*rest}', '/')
// A path made only of slashes ("//", from no segments and a "/" suffix) is
// left out: Express 5.3.0 loosens it to "", which matches every request, and
// the fork keeps it on purpose (#4557, test/router/fork-slash-mounts.js).
var routeString = fc
  .oneof(
    {
      weight: 9,
      arbitrary: fc.tuple(fc.array(routeSegment, { maxLength: 3 }), routeSuffix).map((t) => '/' + t[0].join('/') + t[1])
    },
    { weight: 1, arbitrary: fc.constantFrom('', '*splat', '/{*splat}', '//a', '/a//b') }
  )
  .filter((p) => !/^\/\/+$/.test(p))
var routeRegExp = fc.constantFrom(
  /^\/a\/(\d+)$/,
  /^\/([^/]+)\/b/i,
  /a/,
  /^\/(?<word>[a-z]+)(?:\/|$)/,
  /\/users\/?$/,
  /^\/$/,
  /^\/(.*)$/
)
var routePath = fc.oneof(
  { weight: 8, arbitrary: routeString },
  { weight: 1, arbitrary: routeRegExp },
  { weight: 1, arbitrary: fc.array(fc.oneof(routeString, routeRegExp), { minLength: 1, maxLength: 2 }) }
)
var mountPath = fc.oneof(
  fc.constantFrom('/', '/a', '/api', '/A', '/users/:id', '/a/', '/:x'),
  routeString.filter((p) => !p.includes('*'))
)
var handler = fc.constantFrom('echo', 'echo', 'echo', 'next', 'route')
var method = fc.constantFrom('get', 'get', 'post', 'all', 'put', 'delete', 'options')

var inner = fc.record({ kind: fc.constant('route'), method: method, path: routePath, handler: handler })
var entry = fc.oneof(
  { weight: 5, arbitrary: inner },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('use'),
      path: fc.option(mountPath, { nil: undefined }),
      handler: fc.constantFrom('echo', 'next')
    })
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('router'),
      path: mountPath,
      options: fc.record({ mergeParams: fc.boolean(), caseSensitive: fc.boolean(), strict: fc.boolean() }),
      routes: fc.array(inner, { minLength: 1, maxLength: 3 })
    })
  }
)

var trustProxy = fc.constantFrom(
  undefined,
  false,
  true,
  0,
  1,
  2,
  3,
  'loopback',
  '127.0.0.1',
  '10.0.0.0/8',
  'loopback, 10.0.0.1',
  ['loopback', 'uniquelocal'],
  'not-an-ip',
  'hops'
)
var settings = fc.record({
  trustProxy: trustProxy,
  caseSensitive: fc.boolean(),
  strict: fc.boolean(),
  queryParser: fc.constantFrom(undefined, 'simple', 'extended', false),
  subdomainOffset: fc.constantFrom(undefined, 0, 1, 2, 3)
})

// Requests

var requestSegment = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom('a', 'b', 'A', 'users', 'x-y', 'a.b', '1', '42', 'api', 'v1', 'file-7') },
  {
    weight: 3,
    arbitrary: fc.constantFrom('%41', '%2F', '%2f', '%zz', '%', '..', '.', '', '%E2%82%AC', '%C3%A9', '%00', 'a%20b')
  },
  { weight: 1, arbitrary: fc.string({ unit: fc.constantFrom.apply(fc, URL_CHARS), maxLength: 6 }) }
)
var requestPath = fc.oneof(
  {
    weight: 9,
    arbitrary: fc
      .tuple(fc.array(requestSegment, { maxLength: 4 }), fc.boolean())
      .map((t) => '/' + t[0].join('/') + (t[1] ? '/' : ''))
  },
  { weight: 1, arbitrary: fc.constantFrom('http://example.com/a/b', 'http://example.com', '//a/b', '/a?#x', '*') }
)
var fragment = fc.string({ unit: fc.constantFrom.apply(fc, URL_CHARS), maxLength: 6 }).map((f) => '#' + f)
var target = fc
  .tuple(
    requestPath,
    fc.option(queryString, { nil: undefined, freq: 2 }),
    fc.option(fragment, { nil: undefined, freq: 8 })
  )
  .map((t) => t[0] + (t[1] === undefined ? '' : '?' + t[1]) + (t[2] === undefined ? '' : t[2]))

// (An empty Host is left out: Node's client replaces it with the server's
// address, which differs between the two servers.)
var host = fc.oneof(
  fc.constantFrom(
    'localhost',
    'example.com',
    'EXAMPLE.com:8080',
    'a.b.example.com',
    'x.y.z.example.co.uk',
    '127.0.0.1',
    '127.0.0.1:3000',
    '[::1]',
    '[::1]:3000',
    '[::ffff:127.0.0.1]:80',
    'user@example.com',
    'example.com:',
    'a..b',
    '.example.com'
  ),
  fc
    .tuple(fc.array(fc.stringMatching(/^[a-z0-9-]{1,5}$/), { minLength: 1, maxLength: 4 }), fc.option(fc.nat(65535)))
    .map((t) => t[0].join('.') + (t[1] === null ? '' : ':' + t[1]))
)
var ip = fc.oneof(
  fc.ipV4(),
  fc.ipV6(),
  fc.constantFrom('127.0.0.1', '10.0.0.1', '::1', 'fd00::1', 'unknown', '', ' 10.0.0.2 ', '1.2.3.4:80')
)
var forwardedFor = fc.array(ip, { minLength: 1, maxLength: 4 }).map((l) => l.join(', '))
var forwardedProto = fc.constantFrom('https', 'http', 'HTTPS', 'https, http', 'http,https', 'ftp', '', ' https ')
var forwardedHost = fc.oneof(
  host,
  fc.tuple(host, fc.constantFrom(',', ', ', ' , ', '  ,'), host).map((t) => t.join(''))
)
var opt = (a) => fc.option(a, { nil: undefined })
var headers = fc
  .record({
    host: host,
    'x-forwarded-for': opt(forwardedFor),
    'x-forwarded-proto': opt(forwardedProto),
    'x-forwarded-host': opt(forwardedHost)
  })
  .map((h) => Object.fromEntries(Object.entries(h).filter((e) => e[1] !== undefined)))
var httpRequest = fc.record({
  method: fc.constantFrom('GET', 'GET', 'GET', 'POST', 'HEAD', 'OPTIONS', 'PUT', 'DELETE', 'PATCH'),
  path: target,
  headers: headers
})

// Two requests in three are aimed at a route in the table: its path with each
// parameter, optional part and splat filled in, so most of them match.
var VALUES = ['1', 'x', 'A', 'a.b', '%41', '%2F', 'file-2', '%E2%82%AC', '..', '%zz']
var REGEXP_HITS = ['/a/12', '/x/b', '/users', '/', '/abc/', '/A/7', '/users/']

function concretize(p, picks) {
  var k = 0
  function pick(n) {
    return picks.length === 0 ? 0 : picks[k++ % picks.length] % n
  }
  if (p === undefined) return ''
  if (p instanceof RegExp) return REGEXP_HITS[pick(REGEXP_HITS.length)]
  if (Array.isArray(p)) return concretize(p[pick(p.length)], picks.slice(1))
  return p
    .replace(/\{([^}]*)\}/g, (m, inner) => (pick(2) ? inner : ''))
    .replace(/:([A-Za-z_$][\w$]*)/g, () => VALUES[pick(VALUES.length)])
    .replace(/\*([A-Za-z_$][\w$]*)/g, () => ['z', 'p/q', 'a/b/c'][pick(3)])
    .replace(/\\(.)/g, '$1')
}

function join(mount, rest) {
  return mount.replace(/\/$/, '') + rest
}

function aimedAt(entries) {
  return fc
    .record({
      at: fc.nat(),
      picks: fc.array(fc.nat(), { minLength: 1, maxLength: 8 }),
      upper: fc.constantFrom(false, false, false, true),
      slash: fc.constantFrom(false, false, true),
      query: fc.option(queryString, { nil: undefined, freq: 2 }),
      method: fc.constantFrom('GET', 'GET', 'HEAD', 'POST', 'OPTIONS', 'PUT'),
      headers: headers
    })
    .map(function (o) {
      var e = entries[o.at % entries.length]
      var route = e.kind === 'router' ? e.routes[o.at % e.routes.length] : e
      var p
      if (e.kind === 'route') p = concretize(e.path, o.picks)
      else if (e.kind === 'use') p = join(concretize(e.path, o.picks), o.picks[0] % 2 ? '/x' : '')
      else p = join(concretize(e.path, o.picks), concretize(route.path, o.picks.slice(1)))
      if (!p.startsWith('/')) p = '/' + p
      if (o.upper) p = p.toUpperCase()
      if (o.slash) p += '/'
      // usually the route's own method
      var m = route.method === undefined || route.method === 'all' || o.picks[0] % 4 === 0 ? o.method : route.method
      return { method: m.toUpperCase(), path: o.query === undefined ? p : p + '?' + o.query, headers: o.headers }
    })
}

var fuzzCase = fc
  .record({ settings: settings, entries: fc.array(entry, { minLength: 1, maxLength: 6 }) })
  .chain(function (c) {
    return fc.record({
      settings: fc.constant(c.settings),
      entries: fc.constant(c.entries),
      requests: fc.array(
        fc.oneof({ weight: 1, arbitrary: httpRequest }, { weight: 2, arbitrary: aimedAt(c.entries) }),
        {
          minLength: 1,
          maxLength: 5
        }
      )
    })
  })

// Building the same app on both copies

function snapshot(tag) {
  return function (req, res) {
    res.json({
      tag: tag,
      url: req.url,
      originalUrl: req.originalUrl,
      baseUrl: req.baseUrl,
      path: req.path,
      params: req.params,
      query: req.query,
      route: req.route ? String(req.route.path) : null,
      host: req.host,
      hostname: req.hostname,
      protocol: req.protocol,
      secure: req.secure,
      ip: req.ip,
      ips: req.ips,
      subdomains: req.subdomains
    })
  }
}

function handlerFor(kind, tag) {
  if (kind === 'next') {
    return function (req, res, next) {
      next()
    }
  }
  if (kind === 'route') {
    return function (req, res, next) {
      next('route')
    }
  }
  return snapshot(tag)
}

// Each step that throws records its error, and the build carries on, so the
// routes that did register are still compared.
function attempt(errors, fn) {
  try {
    fn()
  } catch (err) {
    errors.push(err.name + ': ' + err.message)
  }
}

function addRoute(errors, target, r, tag) {
  attempt(errors, function () {
    target[r.method](r.path, handlerFor(r.handler, tag))
  })
}

function build(app, express, c) {
  var errors = []
  var s = c.settings
  if (s.trustProxy !== undefined) attempt(errors, () => app.set('trust proxy', s.trustProxy))
  app.set('case sensitive routing', s.caseSensitive)
  app.set('strict routing', s.strict)
  if (s.queryParser !== undefined) app.set('query parser', s.queryParser)
  if (s.subdomainOffset !== undefined) app.set('subdomain offset', s.subdomainOffset)

  c.entries.forEach(function (e, i) {
    if (e.kind === 'route') return addRoute(errors, app, e, String(i))
    if (e.kind === 'use') {
      var fn = handlerFor(e.handler, 'use ' + i)
      return attempt(errors, () => (e.path === undefined ? app.use(fn) : app.use(e.path, fn)))
    }
    var router = express.Router(e.options)
    e.routes.forEach(function (r, j) {
      addRoute(errors, router, r, i + '.' + j)
    })
    attempt(errors, () => app.use(e.path, router))
  })
  return errors
}

// The fork drops a "#" fragment from req.url before it routes
// (src/router/index.ts), so it must answer a target with a fragment exactly
// as Express 5.3.0 does when the fragment is dropped as the request arrives.
// (5.3.0 on its own routes some of them differently: url.parse reads
// "//user@host" before a fragment as a host.) Both servers still get the
// same bytes, so a target Node itself rejects is rejected by both.
function droppingFragments(app) {
  return function (req, res) {
    var hash = req.url.indexOf('#')
    if (hash !== -1) req.url = req.url.slice(0, hash)
    app(req, res)
  }
}

async function run(express, c, wrap) {
  var errors
  var app = express()
  errors = build(app, express, c)
  var server = await new Promise(function (resolve) {
    var s = http.createServer(wrap ? wrap(app) : app).listen(0, '127.0.0.1', function () {
      resolve(s)
    })
  })
  try {
    var responses = []
    for (var r of c.requests) {
      var res = await request(server, r)
      delete res.rawHeaders
      responses.push(res)
    }
    return { errors: errors, responses: responses }
  } finally {
    await close(server)
  }
}

describe('differential fuzz: random apps and requests match Express 5.3.0', function () {
  this.timeout(timeout(FUZZ.numRuns, 25))

  it('the same setup errors and the same responses, for ' + FUZZ.numRuns + ' random apps', async function () {
    await fc.assert(
      fc.asyncProperty(fuzzCase, async function (c) {
        var expected = await run(baseline, c, droppingFragments)
        var actual = await run(ours, c)
        assert.deepStrictEqual(actual.errors, expected.errors)
        for (var i = 0; i < c.requests.length; i++) {
          assert.deepStrictEqual(actual.responses[i], expected.responses[i], JSON.stringify(c.requests[i]))
        }
      }),
      FUZZ
    )
  })
})
