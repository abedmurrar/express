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
  'app.use(stateful RegExp guard with lastIndex left at 3)':
    'fixed in the fork: a g or y RegExp path is matched from index 0 on every request (an auth bypass in 5.3.0)'
}

module.exports = { scenarios: scenarios, allowed: allowed }
