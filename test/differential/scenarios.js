'use strict'

// Scenarios for the differential harness. Each one builds the same app on
// the baseline Express (5.3.0 from npm) and on this repository, sends the
// same request to both, and expects byte-identical responses.
//
// setup(app, express) receives the Express module under test, so
// express.json(), express.Router() and the rest come from the matching side.

var path = require('node:path')
var util = require('node:util')
var zlib = require('node:zlib')
var { Buffer } = require('node:buffer')
var tmpl = require('../support/tmpl')

var FIXTURES = path.join(__dirname, '..', 'fixtures')

function get(p, headers) {
  return { method: 'GET', path: p, headers: headers || {} }
}

function post(p, body, headers) {
  return { method: 'POST', path: p, headers: headers || {}, body: body }
}

function route(method, p, handler) {
  return function (app) {
    app[method](p, handler)
  }
}

function sendWith(value) {
  return route('get', '/', function (req, res) {
    res.send(value)
  })
}

function echo(fn) {
  return route('get', '*splat', function (req, res) {
    res.json(fn(req))
  })
}

// The extended query parser (qs) on a query string. The response shows
// req.query as JSON and through util.inspect, which also shows null
// prototypes, array holes and own `__proto__` keys.
function extendedQueryScenario(name, query) {
  return {
    name: 'req.query extended: ' + name,
    setup: function (app) {
      app.set('query parser', 'extended')
      echo(function (req) {
        return { json: req.query, inspect: util.inspect(req.query, { depth: 20 }) }
      })(app)
    },
    req: get('/?' + query)
  }
}

// express.static(FIXTURES, options), with an error handler that shows the
// error's status and message (finalhandler's page would show its stack).
function staticScenario(name, options, req) {
  return {
    name: name,
    setup: function (app, express) {
      app.use(express.static(FIXTURES, options))
      app.use(function (err, req, res, next) {
        res.status(err.status || 500).send(err.status + ' ' + err.message)
      })
    },
    req: req
  }
}

// A body parser (built from the Express under test by `parser(express)`) in
// front of a handler that shows what it parsed, and an error handler that
// shows the error's own properties (finalhandler's page would show only the
// message, and a stack in development).
function bodyScenario(name, parser, req) {
  return {
    name: name,
    setup: function (app, express) {
      app.use(parser(express))
      app.post('/', function (req, res) {
        res.json({ type: typeof req.body, buffer: Buffer.isBuffer(req.body), body: req.body })
      })
      app.use(function (err, req, res, next) {
        res.status(err.status || 500).json({
          name: err.name,
          status: err.status,
          statusCode: err.statusCode,
          expose: err.expose,
          type: err.type,
          message: err.message,
          charset: err.charset,
          encoding: err.encoding,
          limit: err.limit,
          length: err.length,
          expected: err.expected,
          received: err.received,
          body: err.body === undefined ? 'undefined' : String(err.body),
          keys: Object.keys(err).sort()
        })
      })
    },
    req: req
  }
}

function form(body, headers) {
  return post('/', body, Object.assign({ 'content-type': 'application/x-www-form-urlencoded' }, headers))
}

function jsonBody(body, headers) {
  return post('/', body, Object.assign({ 'content-type': 'application/json' }, headers))
}

var LATIN1_FORM = Buffer.from('name=caf%E9&sym=%A3', 'latin1')

function views(app) {
  app.engine('tmpl', tmpl)
  app.set('views', FIXTURES)
}

var scenarios = [
  // res.send
  { name: 'res.send string', setup: sendWith('Hello World!'), req: get('/') },
  { name: 'res.send empty string', setup: sendWith(''), req: get('/') },
  { name: 'res.send html string', setup: sendWith('<p>hi</p>'), req: get('/') },
  { name: 'res.send Buffer', setup: sendWith(Buffer.from('bytes')), req: get('/') },
  { name: 'res.send Uint8Array', setup: sendWith(new Uint8Array([104, 105])), req: get('/') },
  { name: 'res.send null', setup: sendWith(null), req: get('/') },
  { name: 'res.send undefined', setup: sendWith(undefined), req: get('/') },
  { name: 'res.send object', setup: sendWith({ a: 1, b: [true, null] }), req: get('/') },
  { name: 'res.send array', setup: sendWith([1, 'two']), req: get('/') },
  { name: 'res.send boolean', setup: sendWith(true), req: get('/') },
  { name: 'res.send number', setup: sendWith(42), req: get('/') },
  { name: 'res.send ArrayBuffer', setup: sendWith(new Uint8Array([1, 2, 3]).buffer), req: get('/') },
  { name: 'res.send DataView', setup: sendWith(new DataView(new Uint8Array([104, 105]).buffer)), req: get('/') },
  { name: 'res.send Uint16Array', setup: sendWith(new Uint16Array([0x0102, 0x0304])), req: get('/') },
  {
    name: 'res.send with preset Content-Type',
    setup: route('get', '/', function (req, res) {
      res.type('text/plain').send('<b>x</b>')
    }),
    req: get('/')
  },
  { name: 'res.send HEAD', setup: sendWith('Hello'), req: { method: 'HEAD', path: '/', headers: {} } },
  {
    name: 'res.send 304 with If-None-Match',
    setup: sendWith('cached body'),
    req: get('/', { 'if-none-match': 'W/"b-g5MtDBk2zQGRc1vOKoUw7g8ykPU"' })
  },
  {
    name: 'res.send 204 strips body',
    setup: route('get', '/', function (req, res) {
      res.status(204).send('gone')
    }),
    req: get('/')
  },
  {
    name: 'res.send with Transfer-Encoding set',
    setup: route('get', '/', function (req, res) {
      res.set('Transfer-Encoding', 'chunked').send('te')
    }),
    req: get('/')
  },
  {
    name: 'res.send etag disabled',
    setup: function (app) {
      app.set('etag', false)
      sendWith('no etag')(app)
    },
    req: get('/')
  },
  {
    name: 'res.send strong etag',
    setup: function (app) {
      app.set('etag', 'strong')
      sendWith('strong')(app)
    },
    req: get('/')
  },

  // res.json and res.jsonp
  {
    name: 'res.json object',
    setup: route('get', '/', function (req, res) {
      res.json({ name: 'tobi', n: 1.5 })
    }),
    req: get('/')
  },
  {
    name: 'res.json null',
    setup: route('get', '/', function (req, res) {
      res.json(null)
    }),
    req: get('/')
  },
  {
    name: 'res.json string',
    setup: route('get', '/', function (req, res) {
      res.json('str')
    }),
    req: get('/')
  },
  {
    name: 'res.json json spaces',
    setup: function (app) {
      app.set('json spaces', 2)
      route('get', '/', function (req, res) {
        res.json({ a: { b: 1 } })
      })(app)
    },
    req: get('/')
  },
  {
    name: 'res.json json replacer',
    setup: function (app) {
      app.set('json replacer', function (k, v) {
        return k === 'secret' ? undefined : v
      })
      route('get', '/', function (req, res) {
        res.json({ a: 1, secret: 2 })
      })(app)
    },
    req: get('/')
  },
  {
    name: 'res.json json escape',
    setup: function (app) {
      app.set('json escape', true)
      route('get', '/', function (req, res) {
        res.json({ html: '<script>&</script>' })
      })(app)
    },
    req: get('/')
  },
  {
    name: 'res.json with status',
    setup: route('get', '/', function (req, res) {
      res.status(201).json({ created: true })
    }),
    req: get('/')
  },
  {
    name: 'res.jsonp with callback',
    setup: route('get', '/', function (req, res) {
      res.jsonp({ a: 1 })
    }),
    req: get('/?callback=cb')
  },
  {
    name: 'res.jsonp without callback',
    setup: route('get', '/', function (req, res) {
      res.jsonp({ a: 1 })
    }),
    req: get('/')
  },
  {
    name: 'res.jsonp sanitised callback',
    setup: route('get', '/', function (req, res) {
      res.jsonp({ a: 1 })
    }),
    req: get('/?callback=a.b[0]<x>')
  },
  {
    name: 'res.jsonp empty after sanitising',
    setup: route('get', '/', function (req, res) {
      res.jsonp({ a: 1 })
    }),
    req: get('/?callback=()')
  },
  {
    name: 'res.jsonp custom callback name',
    setup: function (app) {
      app.set('jsonp callback name', 'cb')
      route('get', '/', function (req, res) {
        res.jsonp([1])
      })(app)
    },
    req: get('/?cb=handle')
  },

  // status helpers
  {
    name: 'res.sendStatus 404',
    setup: route('get', '/', function (req, res) {
      res.sendStatus(404)
    }),
    req: get('/')
  },
  {
    name: 'res.sendStatus unknown code',
    setup: route('get', '/', function (req, res) {
      res.sendStatus(599)
    }),
    req: get('/')
  },
  {
    name: 'res.status then end',
    setup: route('get', '/', function (req, res) {
      res.status(202).end()
    }),
    req: get('/')
  },

  // redirects
  {
    name: 'res.redirect path',
    setup: route('get', '/', function (req, res) {
      res.redirect('/login')
    }),
    req: get('/')
  },
  {
    name: 'res.redirect with status',
    setup: route('get', '/', function (req, res) {
      res.redirect(301, 'https://example.com/a b')
    }),
    req: get('/')
  },
  {
    name: 'res.redirect html accept',
    setup: route('get', '/', function (req, res) {
      res.redirect('/<la>')
    }),
    req: get('/', { accept: 'text/html' })
  },
  {
    name: 'res.redirect text accept',
    setup: route('get', '/', function (req, res) {
      res.redirect('/next')
    }),
    req: get('/', { accept: 'text/plain' })
  },
  {
    name: 'res.redirect no accept match',
    setup: route('get', '/', function (req, res) {
      res.redirect('/next')
    }),
    req: get('/', { accept: 'application/octet-stream' })
  },
  {
    name: 'res.redirect HEAD',
    setup: route('head', '/', function (req, res) {
      res.redirect('/next')
    }),
    req: { method: 'HEAD', path: '/', headers: {} }
  },
  {
    name: 'res.redirect with Transfer-Encoding',
    setup: route('get', '/', function (req, res) {
      res.set('Transfer-Encoding', 'chunked')
      res.redirect('/x')
    }),
    req: get('/')
  },
  {
    name: 'res.location back',
    setup: route('get', '/', function (req, res) {
      res.location('back').end()
    }),
    req: get('/', { referer: '/from' })
  },

  // headers
  {
    name: 'res.set object',
    setup: route('get', '/', function (req, res) {
      res.set({ 'X-A': '1', 'X-B': ['2', '3'] }).end()
    }),
    req: get('/')
  },
  {
    name: 'res.set Content-Type shorthand',
    setup: route('get', '/', function (req, res) {
      res.set('Content-Type', 'html').end()
    }),
    req: get('/')
  },
  {
    name: 'res.set Content-Type unknown',
    setup: route('get', '/', function (req, res) {
      res.set('Content-Type', 'definitely-unknown').end()
    }),
    req: get('/')
  },
  {
    name: 'res.append',
    setup: route('get', '/', function (req, res) {
      res.append('Link', '<a>').append('Link', ['<b>', '<c>']).end()
    }),
    req: get('/')
  },
  {
    name: 'res.type extension',
    setup: route('get', '/', function (req, res) {
      res.type('json').send('{}')
    }),
    req: get('/')
  },
  {
    name: 'res.vary',
    setup: route('get', '/', function (req, res) {
      res.vary('Accept').vary('Origin').end()
    }),
    req: get('/')
  },
  {
    name: 'res.links',
    setup: route('get', '/', function (req, res) {
      res.links({ next: '/p/2', last: '/p/9' }).end()
    }),
    req: get('/')
  },
  {
    name: 'res.attachment',
    setup: route('get', '/', function (req, res) {
      res.attachment('report final.pdf').end()
    }),
    req: get('/')
  },
  {
    name: 'res.get after set',
    setup: route('get', '/', function (req, res) {
      res.set('X-Thing', 'v')
      res.send(String(res.get('x-thing')))
    }),
    req: get('/')
  },
  {
    name: 'x-powered-by disabled',
    setup: function (app) {
      app.disable('x-powered-by')
      sendWith('x')(app)
    },
    req: get('/')
  },

  // cookies
  {
    name: 'res.cookie basic',
    setup: route('get', '/', function (req, res) {
      res.cookie('name', 'tobi').end()
    }),
    req: get('/')
  },
  {
    name: 'res.cookie object value',
    setup: route('get', '/', function (req, res) {
      res.cookie('cart', { items: [1, 2] }).end()
    }),
    req: get('/')
  },
  {
    name: 'res.cookie options',
    setup: route('get', '/', function (req, res) {
      res.cookie('s', 'v', { httpOnly: true, secure: true, sameSite: 'strict', path: '/admin', maxAge: 60000 }).end()
    }),
    req: get('/')
  },
  {
    name: 'res.cookie expires 0',
    setup: route('get', '/', function (req, res) {
      res.cookie('n', 'v', { expires: 0 }).end()
    }),
    req: get('/')
  },
  {
    name: 'res.cookie signed',
    setup: function (app) {
      app.use(function (req, res, next) {
        req.secret = 'keyboard cat'
        next()
      })
      route('get', '/', function (req, res) {
        res.cookie('user', 'tobi', { signed: true }).end()
      })(app)
    },
    req: get('/')
  },
  {
    name: 'res.clearCookie',
    setup: route('get', '/', function (req, res) {
      res.clearCookie('sid', { path: '/x' }).end()
    }),
    req: get('/')
  },

  // files
  {
    name: 'res.sendFile text',
    setup: route('get', '/', function (req, res) {
      res.sendFile(path.join(FIXTURES, 'name.txt'))
    }),
    req: get('/')
  },
  {
    name: 'res.sendFile root option',
    setup: route('get', '/', function (req, res) {
      res.sendFile('user.html', { root: FIXTURES })
    }),
    req: get('/')
  },
  {
    name: 'res.sendFile missing',
    setup: route('get', '/', function (req, res) {
      res.sendFile(path.join(FIXTURES, 'nope.txt'))
    }),
    req: get('/')
  },
  {
    name: 'res.sendFile range',
    setup: route('get', '/', function (req, res) {
      res.sendFile(path.join(FIXTURES, 'nums.txt'))
    }),
    req: get('/', { range: 'bytes=0-3' })
  },
  {
    name: 'res.sendFile etag false option',
    setup: route('get', '/', function (req, res) {
      res.sendFile(path.join(FIXTURES, 'name.txt'), { etag: false })
    }),
    req: get('/')
  },
  {
    name: 'res.sendFile dotfile denied',
    setup: route('get', '/', function (req, res) {
      res.sendFile('.hidden', { root: FIXTURES })
    }),
    req: get('/')
  },
  {
    name: 'res.sendFile utf8 name',
    setup: route('get', '/', function (req, res) {
      res.sendFile(path.join(FIXTURES, 'snow ☃'))
    }),
    req: get('/')
  },
  {
    name: 'res.download',
    setup: route('get', '/', function (req, res) {
      res.download(path.join(FIXTURES, 'user.html'))
    }),
    req: get('/')
  },
  {
    name: 'res.download custom name',
    setup: route('get', '/', function (req, res) {
      res.download(path.join(FIXTURES, 'user.html'), 'Document.html')
    }),
    req: get('/')
  },
  {
    name: 'express.static file',
    setup: function (app, express) {
      app.use(express.static(FIXTURES))
    },
    req: get('/todo.txt')
  },
  {
    name: 'express.static directory redirect',
    setup: function (app, express) {
      app.use(express.static(FIXTURES))
    },
    req: get('/users')
  },
  {
    name: 'express.static missing falls through',
    setup: function (app, express) {
      app.use(express.static(FIXTURES))
    },
    req: get('/missing.txt')
  },
  // express.static options and requests (our copy of serve-static and send)
  staticScenario('express.static HEAD', {}, { method: 'HEAD', path: '/todo.txt', headers: {} }),
  staticScenario('express.static POST falls through', {}, post('/todo.txt', '')),
  staticScenario('express.static POST without fallthrough is 405', { fallthrough: false }, post('/todo.txt', '')),
  staticScenario('express.static missing without fallthrough', { fallthrough: false }, get('/missing.txt')),
  staticScenario('express.static directory without redirect', { redirect: false }, get('/users')),
  staticScenario('express.static directory index', {}, get('/users/')),
  staticScenario('express.static index off', { index: false }, get('/users/')),
  staticScenario('express.static extensions', { extensions: ['html'] }, get('/todo')),
  staticScenario('express.static maxAge string and immutable', { maxAge: '1d', immutable: true }, get('/todo.txt')),
  staticScenario('express.static maxAge number', { maxAge: 5000 }, get('/todo.txt')),
  staticScenario('express.static cacheControl off', { cacheControl: false }, get('/todo.txt')),
  staticScenario('express.static etag and lastModified off', { etag: false, lastModified: false }, get('/todo.txt')),
  staticScenario('express.static range', {}, get('/nums.txt', { range: 'bytes=0-3' })),
  staticScenario('express.static unsatisfiable range', {}, get('/nums.txt', { range: 'bytes=100-200' })),
  staticScenario('express.static acceptRanges off', { acceptRanges: false }, get('/nums.txt', { range: 'bytes=0-3' })),
  staticScenario('express.static dotfiles deny', { dotfiles: 'deny', fallthrough: false }, get('/.hidden')),
  staticScenario('express.static traversal', { fallthrough: false }, get('/../name.txt')),
  staticScenario('express.static encoded path', {}, get('/snow%20%E2%98%83/')),
  staticScenario(
    'express.static setHeaders',
    {
      setHeaders: function (res, filePath, stat) {
        res.setHeader('X-File', path.basename(filePath) + ' ' + stat.size)
      }
    },
    get('/todo.txt')
  ),
  {
    name: 'express.static mounted directory redirect',
    setup: function (app, express) {
      app.use('/static', express.static(FIXTURES))
    },
    req: get('/static/users?a=1')
  },
  {
    name: 'express.static mounted at its root without a slash',
    setup: function (app, express) {
      app.use('/static', express.static(FIXTURES))
    },
    req: get('/static')
  },

  // content negotiation and views
  {
    name: 'res.format json',
    setup: route('get', '/', function (req, res) {
      res.format({
        text: function () {
          res.send('t')
        },
        json: function () {
          res.json({ j: 1 })
        }
      })
    }),
    req: get('/', { accept: 'application/json' })
  },
  {
    name: 'res.format default 406',
    setup: route('get', '/', function (req, res) {
      res.format({
        text: function () {
          res.send('t')
        }
      })
    }),
    req: get('/', { accept: 'image/png' })
  },
  {
    name: 'res.format default callback',
    setup: route('get', '/', function (req, res) {
      res.format({
        text: function () {
          res.send('t')
        },
        default: function () {
          res.status(418).send('d')
        }
      })
    }),
    req: get('/', { accept: 'image/png' })
  },
  {
    name: 'res.render',
    setup: function (app) {
      views(app)
      route('get', '/', function (req, res) {
        res.render('user.tmpl', { user: { name: 'tobi' } })
      })(app)
    },
    req: get('/')
  },
  {
    name: 'res.render with app.locals',
    setup: function (app) {
      views(app)
      app.locals.user = { name: 'loki' }
      route('get', '/', function (req, res) {
        res.render('user.tmpl')
      })(app)
    },
    req: get('/')
  },
  {
    name: 'res.render missing view',
    setup: function (app) {
      views(app)
      route('get', '/', function (req, res) {
        res.render('nope.tmpl')
      })(app)
    },
    req: get('/')
  },
  {
    name: 'res.render default engine',
    setup: function (app) {
      views(app)
      app.set('view engine', 'tmpl')
      route('get', '/', function (req, res) {
        res.render('name', { name: 'tj' })
      })(app)
    },
    req: get('/')
  },

  // request properties
  {
    name: 'req.query simple',
    setup: echo(function (req) {
      return req.query
    }),
    req: get('/?a=1&a=2&b[c]=3')
  },
  {
    name: 'req.query extended',
    setup: function (app) {
      app.set('query parser', 'extended')
      echo(function (req) {
        return req.query
      })(app)
    },
    req: get('/?a[b]=1&c[]=2&c[]=3')
  },
  extendedQueryScenario('nested objects and arrays', 'a[b][c]=1&a[b][d][]=2&a[b][d][]=3&e[0]=x&e[1]=y'),
  extendedQueryScenario('deeper than depth 5', 'a[b][c][d][e][f][g][h]=1'),
  extendedQueryScenario('an index past arrayLimit', 'a[0]=x&a[25]=y&b[19]=p&b[20]=q&b[21]=r'),
  extendedQueryScenario('more than 20 repeated keys', Array.from({ length: 25 }, (_, i) => 'a=' + i).join('&')),
  extendedQueryScenario(
    'prototype keys (allowPrototypes)',
    '__proto__[x]=1&constructor[prototype][y]=2&toString=3&hasOwnProperty[a]=4&a[__proto__][b]=5&valueOf'
  ),
  extendedQueryScenario('dots, encoded brackets and plus signs', 'a.b=1&c%5Bd%5D=2&e%5b%5d=3&f+g=h+i&j%2Ek=l'),
  extendedQueryScenario('mixed keys: scalar, index and brackets', 'a=1&a[0]=2&a[]=3&a[b]=4&c[]=1&c=2&c[x]=3'),
  extendedQueryScenario('bad escapes and empty parts', '%=1&a=%E9&b=%ZZ&&=&c&d=&[]=e&[x]=f&g[=h&i]=j'),
  extendedQueryScenario('utf8 sentinel and numeric entities', 'utf8=%26%2310003%3B&a=%E9&b=%26%239786%3B'),
  extendedQueryScenario(
    '1200 parameters (parameterLimit 1000)',
    Array.from({ length: 1200 }, (_, i) => 'k[' + i + ']=1').join('&')
  ),
  {
    name: 'req.query disabled',
    setup: function (app) {
      app.set('query parser', false)
      echo(function (req) {
        return req.query
      })(app)
    },
    req: get('/?a=1')
  },
  {
    name: 'req.query 1200 keys',
    setup: echo(function (req) {
      return Object.keys(req.query).length
    }),
    req: get(
      '/?' +
        Array.from({ length: 1200 }, function (_, i) {
          return 'k' + i + '=1'
        }).join('&')
    )
  },
  {
    name: 'req.path and baseUrl',
    setup: function (app, express) {
      var r = express.Router()
      r.get('/b', function (req, res) {
        res.json({ path: req.path, baseUrl: req.baseUrl, originalUrl: req.originalUrl, url: req.url })
      })
      app.use('/a', r)
    },
    req: get('/a/b?x=1')
  },
  {
    name: 'req.hostname',
    setup: echo(function (req) {
      return [req.hostname, req.host, req.subdomains]
    }),
    req: get('/', { host: 'tobi.ferrets.example.com:3000' })
  },
  {
    name: 'req.hostname IPv6',
    setup: echo(function (req) {
      return [req.hostname, req.subdomains]
    }),
    req: get('/', { host: '[::1]:3000' })
  },
  {
    name: 'req.hostname userinfo',
    setup: echo(function (req) {
      return req.hostname
    }),
    req: get('/', { host: 'evil.example:x@good.example' })
  },
  {
    name: 'req.hostname trusted X-Forwarded-Host userinfo',
    setup: function (app) {
      app.set('trust proxy', true)
      echo(function (req) {
        return [req.host, req.hostname, req.subdomains]
      })(app)
    },
    req: get('/', { 'x-forwarded-host': 'admin.example:x@tobi.ferrets.example.com:8443, other.example' })
  },
  {
    name: 'req.host non-numeric port',
    setup: echo(function (req) {
      return [req.host === undefined, req.hostname === undefined]
    }),
    req: get('/', { host: 'evil.example:x%40good.example' })
  },
  {
    name: 'req.subdomains IPv6 with dots',
    setup: echo(function (req) {
      return [req.hostname, req.subdomains]
    }),
    req: get('/', { host: '[::ffff:127.0.0.1]:3000' })
  },
  {
    name: 'req.protocol untrusted',
    setup: echo(function (req) {
      return [req.protocol, req.secure, req.ip, req.ips]
    }),
    req: get('/', { 'x-forwarded-proto': 'https', 'x-forwarded-for': '1.2.3.4' })
  },
  {
    name: 'req.protocol trusted',
    setup: function (app) {
      app.set('trust proxy', true)
      echo(function (req) {
        return [req.protocol, req.secure, req.ip, req.ips, req.hostname]
      })(app)
    },
    req: get('/', {
      'x-forwarded-proto': 'https',
      'x-forwarded-for': '1.2.3.4, 5.6.7.8',
      'x-forwarded-host': 'fwd.example'
    })
  },
  {
    name: 'req.protocol trust proxy hop count',
    setup: function (app) {
      app.set('trust proxy', 1)
      echo(function (req) {
        return [req.protocol, req.ip, req.hostname]
      })(app)
    },
    req: get('/', {
      'x-forwarded-proto': 'https,http',
      'x-forwarded-for': '9.9.9.9',
      'x-forwarded-host': 'a.example, b.example'
    })
  },
  {
    name: 'req.protocol uppercase forwarded',
    setup: function (app) {
      app.set('trust proxy', true)
      echo(function (req) {
        return [req.protocol, req.secure]
      })(app)
    },
    req: get('/', { 'x-forwarded-proto': 'HTTPS' })
  },
  {
    name: 'req.get referer',
    setup: echo(function (req) {
      return [req.get('Referrer'), req.get('referer'), req.get('content-type')]
    }),
    req: get('/', { referer: '/r' })
  },
  {
    name: 'req.accepts',
    setup: echo(function (req) {
      return [
        req.accepts(['json', 'html']),
        req.acceptsLanguages('en', 'fr'),
        req.acceptsEncodings('gzip'),
        req.acceptsCharsets('utf-8')
      ]
    }),
    req: get('/', {
      accept: 'text/html;q=0.5, application/json',
      'accept-language': 'fr;q=0.8, en',
      'accept-encoding': 'gzip'
    })
  },
  {
    name: 'req.is',
    setup: route('post', '/', function (req, res) {
      res.json([req.is('json'), req.is('text/*'), req.is('application/*')])
    }),
    req: post('/', '{}', { 'content-type': 'application/json; charset=utf-8' })
  },
  {
    name: 'req.fresh and stale',
    setup: route('get', '/', function (req, res) {
      res.set('ETag', '"abc"')
      res.json([req.fresh, req.stale])
    }),
    req: get('/', { 'if-none-match': '"abc"' })
  },
  {
    name: 'req.range',
    setup: echo(function (req) {
      return req.range(100)
    }),
    req: get('/', { range: 'bytes=0-10,20-30' })
  },
  {
    name: 'req.xhr',
    setup: echo(function (req) {
      return req.xhr
    }),
    req: get('/', { 'x-requested-with': 'XMLHttpRequest' })
  },

  // routing
  {
    name: 'route params',
    setup: route('get', '/users/:id/:op', function (req, res) {
      res.json(req.params)
    }),
    req: get('/users/42/edit')
  },
  {
    name: 'route optional segment',
    setup: route('get', '/files{/:name}', function (req, res) {
      res.json(req.params)
    }),
    req: get('/files')
  },
  {
    name: 'route splat',
    setup: route('get', '/assets/*path', function (req, res) {
      res.json(req.params)
    }),
    req: get('/assets/css/a.css')
  },
  {
    name: 'route regexp',
    setup: route('get', /^\/item-(\d+)$/, function (req, res) {
      res.json(req.params)
    }),
    req: get('/item-7')
  },
  {
    name: 'route encoded param',
    setup: route('get', '/q/:term', function (req, res) {
      res.json(req.params)
    }),
    req: get('/q/caf%C3%A9%20au%20lait')
  },
  {
    name: 'route bad encoding',
    setup: route('get', '/q/:term', function (req, res) {
      res.json(req.params)
    }),
    req: get('/q/%E0%A4%A')
  },
  {
    name: 'route case insensitive by default',
    setup: route('get', '/About', function (req, res) {
      res.send('about')
    }),
    req: get('/about')
  },
  {
    name: 'route case sensitive',
    setup: function (app) {
      app.set('case sensitive routing', true)
      route('get', '/About', function (req, res) {
        res.send('about')
      })(app)
    },
    req: get('/about')
  },
  {
    name: 'route strict routing',
    setup: function (app) {
      app.set('strict routing', true)
      route('get', '/dir', function (req, res) {
        res.send('dir')
      })(app)
    },
    req: get('/dir/')
  },
  {
    name: 'route trailing slash loose',
    setup: route('get', '/dir', function (req, res) {
      res.send('dir')
    }),
    req: get('/dir/')
  },
  {
    name: 'next route',
    setup: function (app) {
      app.get(
        '/x',
        function (req, res, next) {
          next('route')
        },
        function (req, res) {
          res.send('skipped')
        }
      )
      app.get('/x', function (req, res) {
        res.send('second')
      })
    },
    req: get('/x')
  },
  {
    name: 'next router',
    setup: function (app, express) {
      var r = express.Router()
      r.use(function (req, res, next) {
        next('router')
      })
      r.get('/y', function (req, res) {
        res.send('inner')
      })
      app.use(r)
      app.get('/y', function (req, res) {
        res.send('outer')
      })
    },
    req: get('/y')
  },
  {
    name: 'app.param',
    setup: function (app) {
      app.param('id', function (req, res, next, id) {
        req.loaded = 'user-' + id
        next()
      })
      app.get('/u/:id', function (req, res) {
        res.send(req.loaded)
      })
    },
    req: get('/u/5')
  },
  {
    name: 'router mergeParams',
    setup: function (app, express) {
      var r = express.Router({ mergeParams: true })
      r.get('/:child', function (req, res) {
        res.json(req.params)
      })
      app.use('/p/:parent', r)
    },
    req: get('/p/1/2')
  },
  {
    name: 'mounted sub app',
    setup: function (app, express) {
      var sub = express()
      sub.get('/', function (req, res) {
        res.json([req.baseUrl, sub.mountpath, req.app === sub])
      })
      app.use('/blog', sub)
    },
    req: get('/blog')
  },
  {
    name: 'mounted sub app inherits settings',
    setup: function (app, express) {
      app.set('json spaces', 4)
      var sub = express()
      sub.get('/', function (req, res) {
        res.json({ a: 1 })
      })
      app.use('/s', sub)
    },
    req: get('/s')
  },
  {
    name: 'double slash mount',
    setup: function (app, express) {
      var r = express.Router()
      r.get('/secret', function (req, res) {
        res.send('from router')
      })
      app.use('//', r)
      app.get('/secret', function (req, res) {
        res.send('from app')
      })
    },
    req: get('/secret')
  },
  {
    name: 'url rewrite in mounted router',
    setup: function (app, express) {
      var r = express.Router()
      r.use(function (req, res, next) {
        req.url = '/index.html'
        next()
      })
      r.get('/index.html', function (req, res) {
        res.send(req.originalUrl + ' ' + req.url)
      })
      app.use('/app', r)
      app.use(function (req, res) {
        res.send('fell through ' + req.url)
      })
    },
    req: get('/app/')
  },
  {
    name: 'auto OPTIONS',
    setup: function (app) {
      app.get('/r', function (req, res) {
        res.send('g')
      })
      app.post('/r', function (req, res) {
        res.send('p')
      })
    },
    req: { method: 'OPTIONS', path: '/r', headers: {} }
  },
  {
    name: 'auto HEAD from GET',
    setup: route('get', '/h', function (req, res) {
      res.send('body')
    }),
    req: { method: 'HEAD', path: '/h', headers: {} }
  },
  {
    name: 'unknown method 404',
    setup: route('get', '/m', function (req, res) {
      res.send('g')
    }),
    req: { method: 'DELETE', path: '/m', headers: {} }
  },
  {
    name: 'app.all',
    setup: route('all', '/any', function (req, res) {
      res.send(req.method)
    }),
    req: { method: 'PATCH', path: '/any', headers: {} }
  },
  {
    name: 'app.route chain',
    setup: function (app) {
      app
        .route('/c')
        .get(function (req, res) {
          res.send('get')
        })
        .put(function (req, res) {
          res.send('put')
        })
    },
    req: { method: 'PUT', path: '/c', headers: {} }
  },
  { name: '404 default', setup: function () {}, req: get('/missing/page') },
  { name: '404 with html in url', setup: function () {}, req: get('/<script>') },

  // errors
  {
    name: 'sync throw',
    setup: route('get', '/', function () {
      throw new Error('boom')
    }),
    req: get('/')
  },
  {
    name: 'async rejection',
    setup: route('get', '/', async function () {
      throw new Error('async boom')
    }),
    req: get('/')
  },
  {
    name: 'next(err) with status',
    setup: route('get', '/', function (req, res, next) {
      var e = new Error('nope')
      e.status = 403
      next(e)
    }),
    req: get('/')
  },
  {
    name: 'next(err) with expose false',
    setup: route('get', '/', function (req, res, next) {
      var e = new Error('secret detail')
      e.status = 500
      e.expose = false
      next(e)
    }),
    req: get('/')
  },
  {
    name: 'error with headers',
    setup: route('get', '/', function (req, res, next) {
      var e = new Error('slow down')
      e.status = 429
      e.headers = { 'Retry-After': '10' }
      next(e)
    }),
    req: get('/')
  },
  {
    name: 'custom error handler',
    setup: function (app) {
      app.get('/', function () {
        throw new Error('caught')
      })
      app.use(function (err, req, res, next) {
        res.status(500).json({ message: err.message })
      })
    },
    req: get('/')
  },
  {
    name: 'error handler skipped by normal middleware',
    setup: function (app) {
      app.get('/', function () {
        throw new Error('x')
      })
      app.use(function (req, res) {
        res.send('not me')
      })
      app.use(function (err, req, res, next) {
        res.status(500).send('handled ' + err.message)
      })
    },
    req: get('/')
  },
  {
    name: 'production error page',
    setup: function (app) {
      app.set('env', 'production')
      route('get', '/', function () {
        throw new Error('hidden')
      })(app)
    },
    req: get('/')
  },

  // body parsers
  {
    name: 'express.json',
    setup: function (app, express) {
      app.use(express.json())
      app.post('/', function (req, res) {
        res.json(req.body)
      })
    },
    req: post('/', '{"a":[1,2],"b":"c"}', { 'content-type': 'application/json' })
  },
  {
    name: 'express.json invalid',
    setup: function (app, express) {
      app.use(express.json())
      app.post('/', function (req, res) {
        res.json(req.body)
      })
    },
    req: post('/', '{"a":', { 'content-type': 'application/json' })
  },
  {
    name: 'express.json strict primitive',
    setup: function (app, express) {
      app.use(express.json())
      app.post('/', function (req, res) {
        res.json(req.body)
      })
    },
    req: post('/', '"str"', { 'content-type': 'application/json' })
  },
  {
    name: 'express.json proto key',
    setup: function (app, express) {
      app.use(express.json())
      app.post('/', function (req, res) {
        res.json(req.body)
      })
    },
    req: post('/', '{"__proto__":{"x":1}}', { 'content-type': 'application/json' })
  },
  {
    name: 'express.json wrong type',
    setup: function (app, express) {
      app.use(express.json())
      app.post('/', function (req, res) {
        res.json(req.body === undefined ? 'none' : req.body)
      })
    },
    req: post('/', 'a=1', { 'content-type': 'text/plain' })
  },
  {
    name: 'express.json too large',
    setup: function (app, express) {
      app.use(express.json({ limit: '10b' }))
      app.post('/', function (req, res) {
        res.json(req.body)
      })
    },
    req: post('/', '{"long":"aaaaaaaaaaaaaaa"}', { 'content-type': 'application/json' })
  },
  {
    name: 'express.urlencoded',
    setup: function (app, express) {
      app.use(express.urlencoded())
      app.post('/', function (req, res) {
        res.json(req.body)
      })
    },
    req: post('/', 'a=1&b=two&b=three', { 'content-type': 'application/x-www-form-urlencoded' })
  },
  {
    name: 'express.urlencoded extended',
    setup: function (app, express) {
      app.use(express.urlencoded({ extended: true }))
      app.post('/', function (req, res) {
        res.json(req.body)
      })
    },
    req: post('/', 'user[name]=tobi&tags[]=a&tags[]=b', { 'content-type': 'application/x-www-form-urlencoded' })
  },
  {
    name: 'express.text',
    setup: function (app, express) {
      app.use(express.text())
      app.post('/', function (req, res) {
        res.send(typeof req.body + ':' + req.body)
      })
    },
    req: post('/', 'plain text', { 'content-type': 'text/plain' })
  },
  {
    name: 'express.raw',
    setup: function (app, express) {
      app.use(express.raw())
      app.post('/', function (req, res) {
        res.send(String(Buffer.isBuffer(req.body)) + ':' + req.body.length)
      })
    },
    req: post('/', Buffer.from([0, 1, 2, 3]), { 'content-type': 'application/octet-stream' })
  },

  // body parsers: details
  bodyScenario(
    'express.json body details',
    function (express) {
      return express.json()
    },
    jsonBody('{"user":{"name":"tobi"},"n":[1,2.5,null]}')
  ),
  bodyScenario(
    'express.json empty body',
    function (express) {
      return express.json()
    },
    jsonBody('')
  ),
  bodyScenario(
    'express.json leading whitespace',
    function (express) {
      return express.json()
    },
    jsonBody(' \n\t {"a":1}')
  ),
  bodyScenario(
    'express.json strict violation message',
    function (express) {
      return express.json()
    },
    jsonBody('  true')
  ),
  bodyScenario(
    'express.json strict violation after whitespace only',
    function (express) {
      return express.json()
    },
    jsonBody('   ')
  ),
  bodyScenario(
    'express.json malformed details',
    function (express) {
      return express.json()
    },
    jsonBody('{"a":1,}')
  ),
  bodyScenario(
    'express.json non-strict primitive',
    function (express) {
      return express.json({ strict: false })
    },
    jsonBody('"str"')
  ),
  bodyScenario(
    'express.json non-strict malformed',
    function (express) {
      return express.json({ strict: false })
    },
    jsonBody('nope')
  ),
  bodyScenario(
    'express.json reviver',
    function (express) {
      return express.json({
        reviver: function (k, v) {
          return typeof v === 'number' ? v * 2 : v
        }
      })
    },
    jsonBody('{"a":1,"b":[2]}')
  ),
  bodyScenario(
    'express.json reviver throws',
    function (express) {
      return express.json({
        reviver: function () {
          throw Object.assign(new Error('bad'), { code: 'E' })
        }
      })
    },
    jsonBody('{"a":1}')
  ),
  bodyScenario(
    'express.json too large details',
    function (express) {
      return express.json({ limit: '10b' })
    },
    jsonBody('{"long":"aaaaaaaaaaaaaaa"}')
  ),
  bodyScenario(
    'express.json numeric limit',
    function (express) {
      return express.json({ limit: 5 })
    },
    jsonBody('{"a":12}')
  ),
  bodyScenario(
    'express.json latin1 charset',
    function (express) {
      return express.json()
    },
    jsonBody('{}', { 'content-type': 'application/json; charset=latin1' })
  ),
  bodyScenario(
    'express.json utf-16 charset',
    function (express) {
      return express.json()
    },
    jsonBody(Buffer.from('{"a":"\u00e9"}', 'utf16le'), { 'content-type': 'application/json; charset=utf-16le' })
  ),
  bodyScenario(
    'express.json unknown utf- charset',
    function (express) {
      return express.json()
    },
    jsonBody('{}', { 'content-type': 'application/json; charset=utf-9' })
  ),
  bodyScenario(
    'express.json unknown charset with verify',
    function (express) {
      return express.json({ verify: function () {} })
    },
    jsonBody('{}', { 'content-type': 'application/json; charset=utf-9' })
  ),
  bodyScenario(
    'express.json verify throws',
    function (express) {
      return express.json({
        verify: function () {
          throw new Error('no')
        }
      })
    },
    jsonBody('{"a":1}')
  ),
  bodyScenario(
    'express.json verify throws with type',
    function (express) {
      return express.json({
        verify: function () {
          throw Object.assign(new Error('no'), { type: 'custom.type', status: 401 })
        }
      })
    },
    jsonBody('{"a":1}')
  ),
  bodyScenario(
    'express.json gzip',
    function (express) {
      return express.json()
    },
    jsonBody(zlib.gzipSync('{"z":"gzip"}'), { 'content-encoding': 'gzip' })
  ),
  bodyScenario(
    'express.json deflate',
    function (express) {
      return express.json()
    },
    jsonBody(zlib.deflateSync('{"z":"deflate"}'), { 'content-encoding': 'deflate' })
  ),
  bodyScenario(
    'express.json brotli',
    function (express) {
      return express.json()
    },
    jsonBody(zlib.brotliCompressSync('{"z":"br"}'), { 'content-encoding': 'br' })
  ),
  bodyScenario(
    'express.json uppercase GZIP',
    function (express) {
      return express.json()
    },
    jsonBody(zlib.gzipSync('{"z":1}'), { 'content-encoding': 'GZIP' })
  ),
  bodyScenario(
    'express.json gzip inflate false',
    function (express) {
      return express.json({ inflate: false })
    },
    jsonBody(zlib.gzipSync('{"z":1}'), { 'content-encoding': 'gzip' })
  ),
  bodyScenario(
    'express.json unknown content encoding',
    function (express) {
      return express.json()
    },
    jsonBody('{}', { 'content-encoding': 'compress' })
  ),
  bodyScenario(
    'express.json corrupt gzip',
    function (express) {
      return express.json()
    },
    jsonBody(Buffer.from('not gzip at all'), { 'content-encoding': 'gzip' })
  ),
  bodyScenario(
    'express.json gzip over limit',
    function (express) {
      return express.json({ limit: '20b' })
    },
    jsonBody(zlib.gzipSync(JSON.stringify({ a: 'x'.repeat(100) })), { 'content-encoding': 'gzip' })
  ),
  bodyScenario(
    'express.json type option',
    function (express) {
      return express.json({ type: 'application/*+json' })
    },
    jsonBody('{"a":1}', { 'content-type': 'application/vnd.api+json' })
  ),
  bodyScenario(
    'express.json type function',
    function (express) {
      return express.json({
        type: function () {
          return true
        }
      })
    },
    post('/', '{"a":1}', { 'content-type': 'text/plain' })
  ),
  bodyScenario(
    'express.urlencoded simple nested keys',
    function (express) {
      return express.urlencoded()
    },
    form('user[name]=tobi&a[]=1&a[]=2&x.y=z')
  ),
  bodyScenario(
    'express.urlencoded simple repeated keys',
    function (express) {
      return express.urlencoded({ extended: false })
    },
    form('a=1&a=2&b=&c')
  ),
  bodyScenario(
    'express.urlencoded extended nested',
    function (express) {
      return express.urlencoded({ extended: true })
    },
    form('a[b][c]=1&a[d][]=2&a[d][]=3&e[0]=x&e[2]=y')
  ),
  bodyScenario(
    'express.urlencoded extended proto key',
    function (express) {
      return express.urlencoded({ extended: true })
    },
    form('__proto__[x]=1&hasOwnProperty=2&a[__proto__]=3')
  ),
  bodyScenario(
    'express.urlencoded extended depth exceeded',
    function (express) {
      return express.urlencoded({ extended: true, depth: 2 })
    },
    form('a[b][c][d]=1')
  ),
  bodyScenario(
    'express.urlencoded extended array over 100',
    function (express) {
      return express.urlencoded({ extended: true })
    },
    form('a[150]=x&a[1]=y')
  ),
  bodyScenario(
    'express.urlencoded empty body',
    function (express) {
      return express.urlencoded()
    },
    form('')
  ),
  bodyScenario(
    'express.urlencoded too many parameters',
    function (express) {
      return express.urlencoded({ parameterLimit: 3 })
    },
    form('a=1&b=2&c=3&d=4')
  ),
  bodyScenario(
    'express.urlencoded at the parameter limit',
    function (express) {
      return express.urlencoded({ parameterLimit: 3 })
    },
    form('a=1&b=2&c=3')
  ),
  bodyScenario(
    'express.urlencoded too large',
    function (express) {
      return express.urlencoded({ limit: '8b' })
    },
    form('a=123456789')
  ),
  bodyScenario(
    'express.urlencoded latin1 charset',
    function (express) {
      return express.urlencoded()
    },
    form(LATIN1_FORM, { 'content-type': 'application/x-www-form-urlencoded; charset=iso-8859-1' })
  ),
  bodyScenario(
    'express.urlencoded latin1 default charset',
    function (express) {
      return express.urlencoded({ defaultCharset: 'iso-8859-1' })
    },
    form(LATIN1_FORM)
  ),
  bodyScenario(
    'express.urlencoded charset sentinel',
    function (express) {
      return express.urlencoded({ charsetSentinel: true })
    },
    form('utf8=%E2%9C%93&name=caf%C3%A9', { 'content-type': 'application/x-www-form-urlencoded; charset=iso-8859-1' })
  ),
  bodyScenario(
    'express.urlencoded numeric entities',
    function (express) {
      return express.urlencoded({ interpretNumericEntities: true })
    },
    form('a=%26%239786%3B', { 'content-type': 'application/x-www-form-urlencoded; charset=iso-8859-1' })
  ),
  bodyScenario(
    'express.urlencoded unsupported charset',
    function (express) {
      return express.urlencoded()
    },
    form('a=1', { 'content-type': 'application/x-www-form-urlencoded; charset=koi8-r' })
  ),
  bodyScenario(
    'express.urlencoded gzip',
    function (express) {
      return express.urlencoded()
    },
    form(zlib.gzipSync('a=1&b=2'), { 'content-encoding': 'gzip' })
  ),
  bodyScenario(
    'express.text latin1 charset',
    function (express) {
      return express.text()
    },
    post('/', Buffer.from('caf\u00e9', 'latin1'), { 'content-type': 'text/plain; charset=iso-8859-1' })
  ),
  bodyScenario(
    'express.text koi8-r charset',
    function (express) {
      return express.text()
    },
    post('/', Buffer.from([0xf0, 0xd2, 0xc9]), { 'content-type': 'text/plain; charset=koi8-r' })
  ),
  bodyScenario(
    'express.text unknown charset',
    function (express) {
      return express.text()
    },
    post('/', 'x', { 'content-type': 'text/plain; charset=bogus' })
  ),
  bodyScenario(
    'express.text unknown charset with verify',
    function (express) {
      return express.text({ verify: function () {} })
    },
    post('/', 'x', { 'content-type': 'text/plain; charset=bogus' })
  ),
  bodyScenario(
    'express.text default charset',
    function (express) {
      return express.text({ defaultCharset: 'utf-16le' })
    },
    post('/', Buffer.from('hi', 'utf16le'), { 'content-type': 'text/plain' })
  ),
  bodyScenario(
    'express.text too large',
    function (express) {
      return express.text({ limit: '3b' })
    },
    post('/', 'four', { 'content-type': 'text/plain' })
  ),
  bodyScenario(
    'express.text deflate',
    function (express) {
      return express.text()
    },
    post('/', zlib.deflateSync('inflated text'), { 'content-type': 'text/plain', 'content-encoding': 'deflate' })
  ),
  bodyScenario(
    'express.raw body bytes',
    function (express) {
      return express.raw()
    },
    post('/', Buffer.from([0, 255, 10, 13]), { 'content-type': 'application/octet-stream' })
  ),
  bodyScenario(
    'express.raw ignores charset',
    function (express) {
      return express.raw()
    },
    post('/', Buffer.from([1, 2]), { 'content-type': 'application/octet-stream; charset=bogus' })
  ),
  bodyScenario(
    'express.raw too large',
    function (express) {
      return express.raw({ limit: '2b' })
    },
    post('/', Buffer.from([1, 2, 3]), { 'content-type': 'application/octet-stream' })
  ),
  bodyScenario(
    'express.raw gzip',
    function (express) {
      return express.raw()
    },
    post('/', zlib.gzipSync(Buffer.from([9, 8, 7])), {
      'content-type': 'application/octet-stream',
      'content-encoding': 'gzip'
    })
  ),
  bodyScenario(
    'express.raw type array',
    function (express) {
      return express.raw({ type: ['image/png', 'application/pdf'] })
    },
    post('/', Buffer.from([1]), { 'content-type': 'application/pdf' })
  ),
  bodyScenario(
    'express.json zstd',
    function (express) {
      return express.json()
    },
    jsonBody('zstdCompressSync' in zlib ? zlib.zstdCompressSync('{"z":"zstd"}') : '{}', {
      'content-encoding': 'zstd'
    })
  ),

  // locals and misc
  {
    name: 'res.locals per request',
    setup: function (app) {
      app.use(function (req, res, next) {
        res.locals.who = 'mw'
        next()
      })
      route('get', '/', function (req, res) {
        res.json(Object.assign({}, res.locals))
      })(app)
    },
    req: get('/')
  },
  {
    name: 'app.locals settings',
    setup: echo(function (req) {
      return [req.app.locals.settings['x-powered-by'], req.app.get('env'), req.app.enabled('etag')]
    }),
    req: get('/')
  },
  {
    name: 'middleware order',
    setup: function (app) {
      app.use(function (req, res, next) {
        req.trail = ['a']
        next()
      })
      app.use('/x', function (req, res, next) {
        req.trail.push('b')
        next()
      })
      app.get('/x/y', function (req, res) {
        req.trail.push('c')
        res.json(req.trail)
      })
    },
    req: get('/x/y')
  }
]

// Routing fast paths: the router skips a route that has no handler for the
// method before matching its path, and checks a string path's literal start
// before its regex. One app with routes that test where either could go
// wrong (methods, HEAD and OPTIONS, all(), route chains, case, escapes,
// which match raw with their hex digits in any case, trailing slashes,
// segment-bounded middleware, a mounted router with mergeParams, a bad
// escape in a route the method skips), and the requests that hit them, with
// and without case-sensitive and strict routing. Non-ASCII paths are in
// test/router/fork-fast-paths.js: Node's HTTP parser rejects them.
function fastPathApp(settings) {
  return function (app, express) {
    Object.keys(settings).forEach(function (name) {
      app.set(name, settings[name])
    })
    function reply(label) {
      return function (req, res) {
        res.json([label, req.method, req.params, req.baseUrl, req.url])
      }
    }
    app.use('/api', function (req, res, next) {
      res.append('x-seen', 'api ' + req.baseUrl + ' ' + req.url)
      next()
    })
    app.param('id', function (req, res, next, id) {
      res.append('x-param', id)
      next()
    })
    app.get('/users/:id', reply('get user'))
    app.post('/users/:id', reply('post user'))
    app.all('/any/:id', reply('all'))
    app.route('/chain').get(reply('chain get')).post(reply('chain post'))
    app.put('/put', reply('put'))
    app.get('/Mixed/Case', reply('mixed'))
    app.get('/a%2Fb', reply('escaped'))
    app.get('/caf%C3%A9/:x', reply('cafe'))
    app.get('/dir/', reply('dir'))
    app.get('/apix', reply('apix'))
    app.get('/api/users/:id', reply('api user'))
    var org = express.Router({ mergeParams: true })
    org.get('/team/:team', reply('get team'))
    org.delete('/team/:team', reply('delete team'))
    app.use('/org/:org', org)
    app.use(function (err, req, res, next) {
      res.status(err.status || 500).send('error ' + err.message)
    })
  }
}

var FAST_PATH_REQUESTS = [
  ['GET', '/users/1'],
  ['POST', '/users/1'],
  ['PUT', '/users/1'],
  ['DELETE', '/USERS/1'],
  ['HEAD', '/users/1'],
  ['OPTIONS', '/users/1'],
  ['OPTIONS', '/chain'],
  ['OPTIONS', '/put'],
  ['HEAD', '/put'],
  ['POST', '/chain'],
  ['PATCH', '/chain'],
  ['PATCH', '/any/1'],
  ['OPTIONS', '/any/1'],
  ['HEAD', '/any/1'],
  ['GET', '/MIXED/case'],
  ['GET', '/Mixed/Case'],
  ['GET', '/a%2fb'],
  ['GET', '/a%2Fb'],
  ['GET', '/a/b'],
  ['GET', '/caf%C3%A9/1'],
  ['GET', '/CAF%c3%a9/1'],
  ['GET', '/caf%C3%89/1'],
  ['GET', '/cafe/1'],
  ['GET', '/dir'],
  ['GET', '/dir/'],
  ['GET', '/api'],
  ['GET', '/apix'],
  ['GET', '/API/users/1'],
  ['POST', '/api/users/1'],
  ['POST', '/users/%E0'],
  ['GET', '/users/%E0'],
  ['DELETE', '/org/acme/team/blue'],
  ['GET', '/ORG/acme/TEAM/blue'],
  ['POST', '/org/acme/team/blue'],
  ['OPTIONS', '/org/acme/team/blue']
]

var FAST_PATH_SETTINGS = [
  { label: '', settings: {} },
  { label: ', case sensitive and strict', settings: { 'case sensitive routing': true, 'strict routing': true } }
]

FAST_PATH_SETTINGS.forEach(function (variant) {
  FAST_PATH_REQUESTS.forEach(function (r) {
    scenarios.push({
      name: 'routing fast paths' + variant.label + ': ' + r[0] + ' ' + r[1],
      setup: fastPathApp(variant.settings),
      req: { method: r[0], path: r[1], headers: {} }
    })
  })
})

// Fixed in src/response.ts, so each differs from 5.3.0 on purpose (listed in
// `allowed` below).
scenarios.push(
  {
    // 5.3.0 hands the view to res.end, which rejects it: a 500
    name: 'res.send Float32Array window without ETag',
    setup: function (app) {
      app.set('etag', false)
      sendWith(new Float32Array([1, 2.5, -3, 4]).subarray(1, 3))(app)
    },
    req: get('/')
  },
  {
    name: 'res.send SharedArrayBuffer',
    setup: function (app) {
      var sab = new SharedArrayBuffer(3)
      new Uint8Array(sab).set([104, 105, 33])
      sendWith(sab)(app)
    },
    req: get('/')
  },
  {
    name: 'res.redirect 301 HEAD with Transfer-Encoding',
    setup: route('head', '/', function (req, res) {
      res.set('Transfer-Encoding', 'chunked')
      res.redirect(301, '/moved')
    }),
    req: { method: 'HEAD', path: '/', headers: {} }
  },
  {
    // 5.3.0 stores false, which res.send replaces with text/html
    name: 'res.set unknown Content-Type then res.send string',
    setup: route('get', '/', function (req, res) {
      res.set('Content-Type', 'definitely-unknown').send('hi')
    }),
    req: get('/')
  },
  {
    name: 'res.cookie maxAge with expires 0',
    setup: route('get', '/', function (req, res) {
      res.cookie('n', 'v', { maxAge: 60000, expires: 0 }).end()
    }),
    req: get('/')
  },
  {
    name: 'res.jsonp first callback sanitises to nothing',
    setup: route('get', '/', function (req, res) {
      res.jsonp({ a: 1 })
    }),
    req: get('/?callback=%3C%3E&callback=ok')
  }
)

// A per-call etag option wins over the app setting (src/response.ts,
// sendFile), so this differs from 5.3.0 on purpose too.
scenarios.push({
  name: 'res.sendFile etag true option with etag disabled',
  setup: function (app) {
    app.disable('etag')
    route('get', '/', function (req, res) {
      res.sendFile(path.join(FIXTURES, 'name.txt'), { etag: true })
    })(app)
  },
  req: get('/')
})

// Rendering fixes (src/response.ts render, src/view.ts), so these differ
// from 5.3.0 on purpose too. res.render after another response was sent has
// no scenario: on 5.3.0 it throws from a deferred callback and ends the
// process, which would take the harness down with it.
scenarios.push(
  {
    // 5.3.0 assigns _locals onto the frozen object: a 500
    name: 'res.render with frozen options',
    setup: function (app) {
      views(app)
      app.get('/', function (req, res) {
        res.render('user.tmpl', Object.freeze({ user: { name: 'tobi' } }))
      })
    },
    req: get('/')
  },
  {
    // 5.3.0 calls require(''): a 500 with an ERR_INVALID_ARG_VALUE message
    name: 'res.render view name ending in a dot',
    setup: function (app) {
      views(app)
      app.set('view engine', 'tmpl')
      app.get('/', function (req, res) {
        res.render('user.')
      })
    },
    req: get('/')
  }
)

// A view whose extension matches a registered engine in another case
// (src/view.ts): 5.3.0 misses the "TMPL" engine for "user.tmpl" and fails
// on require('tmpl'), a 500; the fork renders it.
scenarios.push({
  name: 'res.render engine registered in another case',
  setup: function (app) {
    app.engine('TMPL', tmpl)
    app.set('views', FIXTURES)
    app.get('/', function (req, res) {
      res.render('user.tmpl', { user: { name: 'tobi' } })
    })
  },
  req: get('/')
})

// A fully qualified Host with the DNS root dot (src/request.ts): 5.3.0 counts
// the empty label after it, so "example" becomes a subdomain.
scenarios.push({
  name: 'req.subdomains trailing root dot',
  setup: echo(function (req) {
    return [req.hostname, req.subdomains]
  }),
  req: get('/', { host: 'tobi.ferrets.example.com.:3000' })
})

// Differences we expect on purpose. Each key is a scenario name, and the
// value names the ROADMAP.md item whose fix changes that response.
// A g-flag RegExp guard whose lastIndex the app left non-zero: Express 5.3.0
// matches from that index, skips the guard and answers 404; the fork starts
// every match at 0 and runs the guard (src/router/lib/layer.ts).
scenarios.push({
  name: 'app.use(stateful RegExp guard with lastIndex left at 3)',
  setup: function (app) {
    var re = /^\/admin/g
    re.lastIndex = 3
    app.use(re, function (req, res) {
      res.status(401).send('denied')
    })
  },
  req: get('/admin/secret')
})

// A router mounted at "//" in front of a guard: Express 5.3.0 loosens "//"
// to "", which matches every path, so the router answers "/secret" before
// the guard runs; the fork keeps "//" (src/router/lib/layer.ts, loosen).
scenarios.push({
  name: 'router at "//" in front of a guarded "/secret"',
  setup: function (app, express) {
    var open = express.Router()
    open.get('/secret', function (req, res) {
      res.send('open')
    })
    app.use('//', open)
    app.use(function (req, res) {
      res.status(401).send('denied')
    })
  },
  req: get('/secret')
})

// A router mounted on itself at "/": Express 5.3.0 accepts the mount (and
// overflows the stack on any request the router doesn't answer); the fork's
// router.use() throws a TypeError (src/router/index.ts, mountsAtRoot).
scenarios.push({
  name: 'router.use(router) on itself',
  setup: function (app, express) {
    var r = express.Router()
    var result = 'mounted'
    try {
      r.use(r)
    } catch (err) {
      result = err.name + ': ' + err.message
    }
    app.get('/', function (req, res) {
      res.send(result)
    })
  },
  req: get('/')
})

// A "#" fragment after "//user@host/admin": Express 5.3.0 parses the target
// with url.parse, reads "x@evil.example" as a host and routes "/admin"; the
// fork drops the fragment first (src/router/index.ts, handle) and routes the
// path the client sent.
scenarios.push({
  name: 'GET //x@evil.example/admin#z',
  setup: function (app) {
    app.get('/admin', function (req, res) {
      res.send('admin')
    })
    app.get('*splat', function (req, res) {
      res.json([req.url, req.originalUrl, req.path])
    })
  },
  req: get('//x@evil.example/admin#z')
})

// A strict router mounted at "/dir" with a route for "": Express 5.3.0 only
// ever shows that router "/" (the slash it adds so req.url is never empty),
// so the route never matches and the request is a 404; the fork's strict
// router tries "" for that slash (src/router/index.ts, addedSlashUrl).
scenarios.push({
  name: 'strict router at "/dir" with a "" route: GET /dir',
  setup: function (app, express) {
    var router = express.Router({ strict: true })
    router.get('', function (req, res) {
      res.send('no slash ' + req.url)
    })
    app.use('/dir', router)
  },
  req: get('/dir')
})

// A sub-app mounted with router.use() that passes the request on: Express
// 5.3.0 leaves req and res with the sub-app's prototypes, so the parent's
// next middleware sees the sub-app's req.app and settings; the fork's
// app.handle gives the parent's back (src/application.ts).
scenarios.push({
  name: 'router.use(subApp) then a parent middleware',
  setup: function (app, express) {
    app.set('trust proxy', true)
    var sub = express()
    var router = express.Router()
    router.use('/sub', sub)
    app.use(router)
    app.use(function (req, res) {
      res.json([req.app === app, res.app === app, req.ip])
    })
  },
  req: get('/sub/x', { 'X-Forwarded-For': '203.0.113.9' })
})

// The error listeners on the server at request time. app.listen(port, cb) in
// Express 5.3.0 leaves its startup error listener attached; the fork removes
// it once the server is listening (src/application.ts). On
// http.createServer(app) both have none, so only the app.listen() mode is in
// `allowed`.
scenarios.push({
  name: 'server error listeners after a successful start',
  setup: echo(function (req) {
    return req.socket.server.listenerCount('error')
  }),
  req: get('/')
})

// A regular file that stats as 0 bytes but has content: Express 5.3.0 sends
// it empty with Content-Length 0; the fork streams it to EOF
// (src/send/index.ts). Only where /proc exists.
var PROC_FILE = '/proc/version'
var HAS_PROC = require('node:fs').existsSync(PROC_FILE)
if (HAS_PROC) {
  scenarios.push({
    name: 'res.sendFile /proc file (size 0 with content)',
    setup: route('get', '/', function (req, res) {
      res.sendFile(PROC_FILE)
    }),
    req: get('/')
  })
}

// res.links with empty values, res.append with an existing empty value,
// res.redirect with a status that has no standard message, and a quoted ";"
// in a type parameter (src/response.ts, src/utils.ts acceptParams), so these
// differ from 5.3.0 on purpose. The last one has no effect on a response
// (res.format only uses the type before the parameters), so it shows what
// each side's lib/utils parses.
var UTILS = new Map([
  [require('express-baseline'), require('express-baseline/lib/utils')],
  [require('../..'), require('../../lib/utils')]
])

scenarios.push(
  {
    // 5.3.0 sends `</2>; rel="next", ` with a trailing comma
    name: 'res.links with an empty relation',
    setup: route('get', '/', function (req, res) {
      res.links({ next: '/2', prev: [] }).end()
    }),
    req: get('/')
  },
  {
    // 5.3.0 sends an empty Link header
    name: 'res.links({}) on a fresh response',
    setup: route('get', '/', function (req, res) {
      res.links({}).end()
    }),
    req: get('/')
  },
  {
    // 5.3.0 drops the empty value
    name: 'res.append to an empty value',
    setup: route('get', '/', function (req, res) {
      res.set('X-A', '')
      res.append('X-A', 'b')
      res.end(JSON.stringify(res.get('X-A')))
    }),
    req: get('/')
  },
  {
    // 5.3.0 says "undefined. Redirecting to /next"
    name: 'res.redirect 399 text accept',
    setup: route('get', '/', function (req, res) {
      res.redirect(399, '/next')
    }),
    req: get('/', { accept: 'text/plain' })
  },
  {
    name: 'res.redirect 399 html accept',
    setup: route('get', '/', function (req, res) {
      res.redirect(399, '/next')
    }),
    req: get('/', { accept: 'text/html' })
  },
  {
    // 5.3.0 cuts foo at the quoted ";" and reads the quoted q=0 as the quality
    name: 'lib/utils normalizeType with a quoted ";"',
    setup: function (app, express) {
      var utils = UTILS.get(express)
      route('get', '/', function (req, res) {
        res.json(utils.normalizeType('text/plain; foo="a;q=0"; bar=baz'))
      })(app)
    },
    req: get('/')
  }
)

// A req.url rewritten inside a mounted layer (router 2.3.0's fix,
// pillarjs/router#206, in src/router/index.ts), and the statusCode of a
// parameter that can't be decoded (pillarjs/router#171). The baseline has
// router 2.2.0, so the ones in `allowed` differ on purpose; on router 2.3.0
// every one of these is the same.
function rewriteAt(mount, to) {
  return function (app) {
    app.use(mount, function (req, res, next) {
      req.url = to
      next()
    })
    app.use(function (req, res) {
      res.json([req.url, req.baseUrl, req.path, req.originalUrl])
    })
  }
}

scenarios.push(
  { name: 'req.url rewritten under "/app": GET /app', setup: rewriteAt('/app', '/index.html'), req: get('/app') },
  {
    name: 'req.url rewritten under "/app": GET /app?q=1',
    setup: rewriteAt('/app', '/index.html?q=1'),
    req: get('/app?q=1')
  },
  { name: 'req.url rewritten under "/app": GET /app/', setup: rewriteAt('/app', '/index.html'), req: get('/app/') },
  { name: 'req.url rewritten under "/app": GET /app/x', setup: rewriteAt('/app', '/index.html'), req: get('/app/x') },
  { name: 'req.url rewritten to "/" under "/app"', setup: rewriteAt('/app', '/'), req: get('/app') },
  { name: 'req.url rewritten to "/?x=1" under "/app"', setup: rewriteAt('/app', '/?x=1'), req: get('/app') },
  {
    name: 'statusCode of an undecodable route parameter',
    setup: function (app) {
      app.get('/:id', function (req, res) {
        res.end()
      })
      app.use(function (err, req, res, next) {
        res.status(err.statusCode || 500).json([err.status, err.statusCode, err.message])
      })
    },
    req: get('/%ZZ')
  },
  {
    name: 'default error page of an undecodable route parameter',
    setup: route('get', '/:id', function (req, res) {
      res.end()
    }),
    req: get('/%ZZ')
  }
)

// ETags. Express 5.3.0 sends the ETag it computes on every response res.send
// makes, whatever the status, the method or Cache-Control, and calls a custom
// `etag` function once for each one, or not at all. None of these may differ:
// an app sees the header, and each call to its function.
var ETAG_REQUESTS = {
  GET: get('/'),
  HEAD: { method: 'HEAD', path: '/', headers: {} },
  // "*" matches any ETag, so only a fresh status (2xx or 304) becomes a 304
  'If-None-Match *': get('/', { 'if-none-match': '*' })
}

function etagScenario(name, setting, handler, req) {
  return {
    name: 'ETag: ' + name,
    setup: function (app) {
      if (setting !== undefined) app.set('etag', setting)
      app.use(handler)
      app.use(function (err, req, res, next) {
        res.status(err.status || 500).send('handled: ' + err.message)
      })
    },
    req: req
  }
}

// Every way to answer, including those that go past res.send and so make no
// ETag (res.end, res.write) or make their own (res.sendFile, through send).
var ETAG_RESPONDERS = {
  'res.send string': function (res) {
    res.send('body')
  },
  'res.send long string': function (res) {
    res.send('aé'.repeat(1000))
  },
  'res.send Buffer': function (res) {
    res.send(Buffer.from('body'))
  },
  'res.send empty string': function (res) {
    res.send('')
  },
  'res.send null': function (res) {
    res.send(null)
  },
  'res.send undefined': function (res) {
    res.send()
  },
  'res.json': function (res) {
    res.json({ a: 1 })
  },
  'res.jsonp': function (res) {
    res.jsonp({ a: 1 })
  },
  'res.format': function (res) {
    res.format({
      text: function () {
        res.send('text')
      },
      json: function () {
        res.json({ a: 1 })
      }
    })
  },
  'res.end': function (res) {
    res.end('body')
  },
  'res.end without a body': function (res) {
    res.end()
  },
  'res.write then res.end': function (res) {
    res.write('bo')
    res.end('dy')
  },
  'res.set ETag then res.end': function (res) {
    res.set('ETag', '"set"').end('body')
  },
  'res.sendFile': function (res) {
    res.sendFile(path.join(FIXTURES, 'name.txt'), { lastModified: false })
  }
}

Object.keys(ETAG_RESPONDERS).forEach(function (responder) {
  Object.keys(ETAG_REQUESTS).forEach(function (kind) {
    ;[205, 404, 500].forEach(function (status) {
      scenarios.push(
        etagScenario(
          status + ' ' + responder + ', ' + kind,
          undefined,
          function (req, res) {
            ETAG_RESPONDERS[responder](res.status(status))
          },
          ETAG_REQUESTS[kind]
        )
      )
    })
    scenarios.push(
      etagScenario(
        'Cache-Control: no-store, ' + responder + ', ' + kind,
        undefined,
        function (req, res) {
          ETAG_RESPONDERS[responder](res.set('Cache-Control', 'no-store'))
        },
        ETAG_REQUESTS[kind]
      )
    )
  })
})

// The other settings on the same responses, and no-store with more values, on
// other statuses, and from the request.
;['strong', false].forEach(function (setting) {
  ;[205, 404, 500].forEach(function (status) {
    scenarios.push(
      etagScenario(
        'etag ' + setting + ', ' + status + ' res.json',
        setting,
        function (req, res) {
          res.status(status).json({ a: 1 })
        },
        get('/')
      )
    )
  })
  scenarios.push(
    etagScenario(
      'etag ' + setting + ', Cache-Control: no-store',
      setting,
      function (req, res) {
        res.set('Cache-Control', 'no-store').send('body')
      },
      get('/')
    )
  )
})
;['private, no-store', 'NO-STORE', 'no-store, max-age=0', 'no-cache', 'private'].forEach(function (value) {
  scenarios.push(
    etagScenario(
      'Cache-Control: ' + value,
      undefined,
      function (req, res) {
        res.set('Cache-Control', value).send('body')
      },
      get('/')
    )
  )
})
;[201, 205, 404, 500].forEach(function (status) {
  scenarios.push(
    etagScenario(
      status + ' with Cache-Control: no-store',
      undefined,
      function (req, res) {
        res.status(status).set('Cache-Control', 'no-store').send('body')
      },
      get('/')
    )
  )
})
scenarios.push(
  etagScenario(
    'Cache-Control: no-store in the request',
    undefined,
    function (req, res) {
      res.send('body')
    },
    get('/', { 'cache-control': 'no-store', 'if-none-match': '*' })
  )
)

// A custom `etag` function that records its calls. X-ETag-Calls, set as the
// head is written, has each call's arguments (and not only the number of
// calls), so responses without a body (HEAD, 204, 304) show them too.
function etagCallsScenario(name, handler, req, options) {
  options = options || {}
  return {
    name: 'custom etag calls: ' + name,
    setup: function (app, express) {
      var calls = []
      app.set('etag', function (body, encoding) {
        calls.push([arguments.length, Buffer.isBuffer(body), body.length, typeof encoding])
        if (options.throws) throw new Error('etag failed')
        return Object.hasOwn(options, 'returns') ? options.returns : '"custom"'
      })
      app.use(function (req, res, next) {
        var writeHead = res.writeHead
        res.writeHead = function () {
          res.setHeader('X-ETag-Calls', JSON.stringify(calls))
          return writeHead.apply(res, arguments)
        }
        next()
      })
      if (options.setup) options.setup(app, express)
      app.use(handler)
      app.use(function (err, req, res, next) {
        if (options.unhandled) return next(err)
        res.status(500).send('handled: ' + err.message)
      })
    },
    req: req || get('/')
  }
}

// Every way to answer, on each of these requests.
var CUSTOM_ETAG_REQUESTS = {
  GET: get('/'),
  HEAD: { method: 'HEAD', path: '/', headers: {} },
  'If-None-Match hit': get('/', { 'if-none-match': '"custom"' }),
  'If-None-Match miss': get('/', { 'if-none-match': '"other"' })
}

var CUSTOM_ETAG_RESPONDERS = Object.assign({}, ETAG_RESPONDERS, {
  'res.send boolean': function (res) {
    res.send(true)
  },
  'res.send object': function (res) {
    res.send({ a: 1 })
  },
  'res.send Uint8Array': function (res) {
    res.send(new Uint8Array([104, 105]))
  },
  'res.send empty Buffer': function (res) {
    res.send(Buffer.alloc(0))
  },
  'res.json undefined': function (res) {
    res.json(undefined)
  },
  'res.sendStatus 200': function (res) {
    res.sendStatus(200)
  },
  'res.render': function (res) {
    res.render('user.tmpl', { user: { name: 'tobi' } })
  },
  'res.redirect': function (res) {
    res.redirect('/elsewhere')
  },
  'res.download': function (res) {
    res.download(path.join(FIXTURES, 'name.txt'), 'n.txt', { lastModified: false })
  },
  // the error handler answers
  "res.send object that can't be JSON": function (res) {
    var cycle = {}
    cycle.self = cycle
    res.send(cycle)
  },
  'ETag already set': function (res) {
    res.set('ETag', '"custom"').send('body')
  },
  'ETag already set, res.json': function (res) {
    res.set('ETag', '"custom"').json({ a: 1 })
  },
  'ETag already set to an empty string': function (res) {
    res.set('ETag', '').send('body')
  },
  'ETag set with res.setHeader in lower case': function (res) {
    res.setHeader('etag', '"custom"')
    res.send('body')
  },
  'Cache-Control: no-store': function (res) {
    res.set('Cache-Control', 'no-store').send('body')
  }
})

Object.keys(CUSTOM_ETAG_RESPONDERS).forEach(function (responder) {
  Object.keys(CUSTOM_ETAG_REQUESTS).forEach(function (kind) {
    scenarios.push(
      etagCallsScenario(
        responder + ', ' + kind,
        function (req, res) {
          CUSTOM_ETAG_RESPONDERS[responder](res)
        },
        CUSTOM_ETAG_REQUESTS[kind],
        { setup: views }
      )
    )
  })
})
;[201, 204, 205, 301, 304, 404, 500].forEach(function (status) {
  Object.keys(CUSTOM_ETAG_REQUESTS).forEach(function (kind) {
    ;['res.send string', 'res.send undefined', 'res.json', 'res.end without a body'].forEach(function (responder) {
      scenarios.push(
        etagCallsScenario(
          status + ' ' + responder + ', ' + kind,
          function (req, res) {
            CUSTOM_ETAG_RESPONDERS[responder](res.status(status))
          },
          CUSTOM_ETAG_REQUESTS[kind]
        )
      )
    })
    scenarios.push(
      etagCallsScenario(
        status + ' res.sendStatus, ' + kind,
        function (req, res) {
          res.sendStatus(status)
        },
        CUSTOM_ETAG_REQUESTS[kind]
      )
    )
  })
})

// More requests, on two ways to answer.
var MORE_ETAG_REQUESTS = {
  POST: post('/', ''),
  'POST If-None-Match hit': post('/', '', { 'if-none-match': '"custom"' }),
  'HEAD If-None-Match hit': { method: 'HEAD', path: '/', headers: { 'if-none-match': '"custom"' } },
  'If-None-Match *': get('/', { 'if-none-match': '*' }),
  'If-None-Match weak hit in a list': get('/', { 'if-none-match': '"other", W/"custom"' }),
  'If-None-Match hit with Cache-Control: no-cache': get('/', {
    'if-none-match': '"custom"',
    'cache-control': 'no-cache'
  })
}

Object.keys(MORE_ETAG_REQUESTS).forEach(function (kind) {
  ;['res.send string', 'res.json'].forEach(function (responder) {
    scenarios.push(
      etagCallsScenario(
        responder + ', ' + kind,
        function (req, res) {
          CUSTOM_ETAG_RESPONDERS[responder](res)
        },
        MORE_ETAG_REQUESTS[kind]
      )
    )
  })
})

// What the function returns: a value that isn't truthy sends no ETag.
;['', undefined, null, false, 0, 'unquoted', 7].forEach(function (value) {
  scenarios.push(
    etagCallsScenario(
      'returns ' + util.inspect(value),
      function (req, res) {
        res.send('body')
      },
      get('/', { 'if-none-match': '"custom"' }),
      { returns: value }
    )
  )
})

scenarios.push(
  etagCallsScenario(
    'throws, then again for the error handler',
    function (req, res) {
      res.send('body')
    },
    get('/'),
    { throws: true }
  ),
  etagCallsScenario(
    'throws, unhandled',
    function (req, res) {
      res.send('body')
    },
    get('/'),
    { throws: true, unhandled: true }
  ),
  etagCallsScenario('unhandled 404', function (req, res, next) {
    next()
  }),
  etagCallsScenario(
    'unhandled error',
    function (req, res, next) {
      var err = new Error('boom')
      err.status = 503
      res.set('ETag', '"kept"')
      next(err)
    },
    get('/'),
    { unhandled: true }
  ),
  etagCallsScenario('error handler response', function (req, res, next) {
    next(new Error('boom'))
  }),
  etagCallsScenario(
    'express.static',
    function (req, res, next) {
      next()
    },
    get('/name.txt'),
    {
      setup: function (app, express) {
        app.use(express.static(FIXTURES, { lastModified: false }))
      }
    }
  ),
  etagCallsScenario(
    'automatic OPTIONS response',
    function (req, res, next) {
      next()
    },
    { method: 'OPTIONS', path: '/options', headers: {} },
    {
      setup: function (app) {
        app.get('/options', function (req, res) {
          res.send('get')
        })
      }
    }
  ),
  etagCallsScenario(
    'sub-app does not inherit the function',
    function (req, res, next) {
      next()
    },
    get('/sub'),
    {
      setup: function (app, express) {
        var sub = express()
        sub.get('/', function (req, res) {
          res.send('sub')
        })
        app.use('/sub', sub)
      }
    }
  ),
  etagCallsScenario(
    'sub-app with the etag setting off',
    function (req, res, next) {
      next()
    },
    get('/sub'),
    {
      setup: function (app, express) {
        var sub = express()
        sub.get('/', function (req, res) {
          res.send('sub')
        })
        app.use('/sub', sub)
        sub.set('etag', false)
      }
    }
  )
)

var allowed = {
  'res.render with frozen options':
    "fixed in the fork: `res.render` mutates the caller's options (it now merges res.locals into a copy)",
  'res.render view name ending in a dot':
    'fixed in the fork: a view name ending in `.` throws synchronously (it now gets the usual lookup error)',
  'res.sendFile etag false option':
    'fixed in the fork: `sendFile` ignores a per-call `etag: false` (the app setting is now only the default)',
  'res.sendFile etag true option with etag disabled':
    'fixed in the fork: `sendFile` ignores a per-call `etag: false` (a per-call `etag: true` wins too)',
  'res.send ArrayBuffer':
    "fixed in the fork: `res.send` corrupts ArrayBuffer, DataView and typed-array bodies (it now sends the view's own bytes)",
  'res.send DataView':
    "fixed in the fork: `res.send` corrupts ArrayBuffer, DataView and typed-array bodies (it now sends the view's own bytes)",
  'res.send Uint16Array':
    "fixed in the fork: `res.send` corrupts ArrayBuffer, DataView and typed-array bodies (it now sends the view's own bytes)",
  'res.send Float32Array window without ETag':
    "fixed in the fork: `res.send` corrupts ArrayBuffer, DataView and typed-array bodies (it now sends the view's own bytes)",
  'res.send SharedArrayBuffer':
    "fixed in the fork: `res.send` corrupts ArrayBuffer, DataView and typed-array bodies (it now sends the view's own bytes)",
  'res.redirect with Transfer-Encoding':
    'fixed in the fork: `res.redirect` sends Content-Length with Transfer-Encoding (it now leaves it out, as res.send does)',
  'res.redirect 301 HEAD with Transfer-Encoding':
    'fixed in the fork: `res.redirect` sends Content-Length with Transfer-Encoding (it now leaves it out, as res.send does)',
  'res.set Content-Type unknown':
    'fixed in the fork: `res.set` sends `Content-Type: false` for unknown types (it now keeps the value as given)',
  'res.set unknown Content-Type then res.send string':
    'fixed in the fork: `res.set` sends `Content-Type: false` for unknown types (res.send now keeps the value as given)',
  'res.cookie maxAge with expires 0':
    'fixed in the fork: `res.cookie` adds Expires despite `expires: 0` (it now sends Max-Age alone)',
  'res.jsonp empty after sanitising':
    'fixed in the fork: a JSONP callback that sanitises to nothing gives broken JS (it now sends plain JSON)',
  'res.jsonp first callback sanitises to nothing':
    'fixed in the fork: a JSONP callback that sanitises to nothing gives broken JS (it now sends plain JSON)',
  'res.links with an empty relation':
    'fixed in the fork: `res.links` with empty values (an empty array adds nothing, so no trailing comma)',
  'res.links({}) on a fresh response':
    'fixed in the fork: `res.links` with empty values (nothing to add leaves the header alone, so no empty Link)',
  'res.append to an empty value':
    'fixed in the fork: `res.append` keeps an existing empty header value (it is sent as its own header line)',
  'res.redirect 399 text accept':
    'fixed in the fork: `res.redirect` body says `undefined` for non-standard status codes (it now says 399)',
  'res.redirect 399 html accept':
    'fixed in the fork: `res.redirect` body says `undefined` for non-standard status codes (it now says 399)',
  'lib/utils normalizeType with a quoted ";"':
    'fixed in the fork: quoted `;` in `acceptParams` (a parameter ends at the next `;` outside quotes)',
  'req.hostname userinfo':
    'fixed in the fork: userinfo before an "@" in the Host header is dropped, so req.hostname is good.example, not evil.example (upstream PR #7317)',
  'req.hostname trusted X-Forwarded-Host userinfo':
    'fixed in the fork: userinfo is dropped from a trusted X-Forwarded-Host too, so req.host, req.hostname and req.subdomains come from tobi.ferrets.example.com:8443 (upstream PR #7317)',
  'req.host non-numeric port':
    'fixed in the fork: a Host whose port is not all digits (an encoded "@" here) gives no req.host or req.hostname, where 5.3.0 gave evil.example (upstream PR #7317)',
  'req.protocol uppercase forwarded':
    'fixed in the fork: a trusted X-Forwarded-Proto is lowercased, so "HTTPS" gives req.protocol "https" and req.secure true (upstream PR #7330)',
  'req.subdomains IPv6 with dots':
    'fixed in the fork: an IPv6 host with dots has no subdomains, where 5.3.0 split "[::ffff:127.0.0.1]" on its dots (#7532, upstream PR #7533)',
  'req.subdomains trailing root dot':
    'fixed in the fork: a trailing DNS root dot is not a subdomain part, so "tobi.ferrets.example.com." gives ["ferrets", "tobi"], where 5.3.0 gave ["example", "ferrets", "tobi"] (upstream PR #7331)',
  'res.render engine registered in another case':
    'fixed in the fork: a view extension matches a registered engine ignoring case, so "user.tmpl" renders with the "TMPL" engine, where 5.3.0 tried require("tmpl") (#4594)',

  'app.use(stateful RegExp guard with lastIndex left at 3)':
    'fixed in the fork: a g or y RegExp path is matched from index 0 on every request (an auth bypass in 5.3.0)',
  'double slash mount':
    'fixed in the fork: a `//` mount no longer also matches `/` (#4557), so "/secret" reaches the app route, not the router',
  'router at "//" in front of a guarded "/secret"':
    'fixed in the fork: a `//` mount no longer also matches `/` (#4557, an auth bypass in 5.3.0)',
  'router.use(router) on itself':
    'fixed in the fork: a router cycle gives a clear error instead of a stack overflow (#6809)',
  'GET //x@evil.example/admin#z':
    'fixed in the fork: a `#` fragment in the request target no longer changes the routed path',
  'strict router at "/dir" with a "" route: GET /dir':
    'fixed in the fork: mount-path edge case from #3798 (a strict router\'s "" route now answers "/dir")',
  'req.url rewritten under "/app": GET /app':
    'fixed in the fork: a `req.url` rewrite in a mounted router loses a slash (#4059, router 2.3.0): "/app/index.html", where 5.3.0 gave "/appindex.html"',
  'req.url rewritten under "/app": GET /app?q=1':
    'fixed in the fork: a `req.url` rewrite in a mounted router loses a slash (#4059, router 2.3.0)',
  'statusCode of an undecodable route parameter':
    'router 2.3.0 (pillarjs/router#171): the 400 error has statusCode as well as status, so a handler that reads statusCode answers 400, not 500',
  'router.use(subApp) then a parent middleware':
    "fixed in the fork: `router.use(subApp)` restores req/res prototypes like `app.use` (the parent's req.app and trust proxy apply again)",

  'app.listen(): server error listeners after a successful start':
    'fixed in the fork: app.listen() removes its startup error listener once the server listens, so a later error is not swallowed (upstream PR #7501)'
}

if (HAS_PROC) {
  allowed['res.sendFile /proc file (size 0 with content)'] =
    'fixed in the fork: a file that stats as 0 bytes but has content is streamed to EOF instead of sent empty (#4944)'
}

module.exports = { scenarios: scenarios, allowed: allowed }
