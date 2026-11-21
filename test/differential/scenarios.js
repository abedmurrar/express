'use strict'

// Scenarios for the differential harness. Each one builds the same app on
// the baseline Express (5.3.0 from npm) and on this repository, sends the
// same request to both, and expects byte-identical responses.
//
// setup(app, express) receives the Express module under test, so
// express.json(), express.Router() and the rest come from the matching side.

var path = require('node:path')
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
// method before matching its path. One app with routes that test where that
// could go wrong (methods, HEAD and OPTIONS, all(), route chains, case, escapes,
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

// Differences we expect on purpose. Each key is a scenario name, and the
// value names the ROADMAP.md item whose fix changes that response.
var allowed = {}

module.exports = { scenarios: scenarios, allowed: allowed }
