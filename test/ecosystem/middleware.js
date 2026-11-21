'use strict'

// Ecosystem check: popular community middleware mounted on the original
// Express 5.3.0 and on this repository must give identical responses (and,
// for morgan, identical log lines). Values that legitimately differ between
// two runs, such as random session ids, are normalised first.

var assert = require('node:assert')
var baseline = require('express-baseline')
var ours = require('../..')
var { serve, sequence, close } = require('../differential/support')

var bodyParser = require('body-parser')
var compression = require('compression')
var cookieParser = require('cookie-parser')
var cors = require('cors')
var helmet = require('helmet')
var morgan = require('morgan')
var multer = require('multer')
var passport = require('passport')
var LocalStrategy = require('passport-local').Strategy
var rateLimit = require('express-rate-limit').rateLimit
var session = require('express-session')
var signature = require('cookie-signature')

var get = function (path, headers) {
  return { method: 'GET', path: path, headers: headers || {} }
}

var post = function (path, body, headers) {
  return { method: 'POST', path: path, headers: headers || {}, body: body }
}

// Carry the session cookie from the previous response into the next request.
function withCookieFrom(path) {
  return function (previous) {
    var setCookie = previous.rawHeaders['set-cookie'] || []
    var cookie = setCookie
      .map(function (c) {
        return c.split(';')[0]
      })
      .join('; ')
    return get(path, { cookie: cookie })
  }
}

function multipart(boundary, fields, file) {
  var parts = Object.keys(fields).map(function (name) {
    return '--' + boundary + '\r\nContent-Disposition: form-data; name="' + name + '"\r\n\r\n' + fields[name] + '\r\n'
  })
  if (file) {
    parts.push(
      '--' +
        boundary +
        '\r\nContent-Disposition: form-data; name="' +
        file.field +
        '"; filename="' +
        file.name +
        '"\r\nContent-Type: ' +
        file.type +
        '\r\n\r\n' +
        file.content +
        '\r\n'
    )
  }
  return parts.join('') + '--' + boundary + '--\r\n'
}

var BOUNDARY = 'ecosystemboundary'

var scenarios = [
  // body-parser, used directly rather than through express.json()
  {
    name: 'body-parser json',
    setup: function (app) {
      app.use(bodyParser.json())
      app.post('/', function (req, res) {
        res.json(req.body)
      })
    },
    steps: [post('/', '{"a":[1,2],"b":{"c":"d"}}', { 'content-type': 'application/json' })]
  },
  {
    name: 'body-parser urlencoded and invalid json',
    setup: function (app) {
      app.use(bodyParser.urlencoded({ extended: true }))
      app.use(bodyParser.json())
      app.post('/', function (req, res) {
        res.json(req.body)
      })
    },
    steps: [
      post('/', 'user[name]=tobi&tags[]=a', { 'content-type': 'application/x-www-form-urlencoded' }),
      post('/', '{"broken":', { 'content-type': 'application/json' })
    ]
  },

  // cors
  {
    name: 'cors simple request and preflight',
    setup: function (app) {
      app.use(cors({ origin: ['https://allowed.example'], credentials: true, maxAge: 600 }))
      app.get('/data', function (req, res) {
        res.json({ ok: true })
      })
    },
    steps: [
      get('/data', { origin: 'https://allowed.example' }),
      get('/data', { origin: 'https://other.example' }),
      {
        method: 'OPTIONS',
        path: '/data',
        headers: {
          origin: 'https://allowed.example',
          'access-control-request-method': 'PUT',
          'access-control-request-headers': 'x-custom'
        }
      }
    ]
  },

  // helmet
  {
    name: 'helmet default headers',
    setup: function (app) {
      app.use(helmet())
      app.get('/', function (req, res) {
        res.send('secured')
      })
    },
    steps: [get('/'), get('/missing')]
  },

  // cookie-parser
  {
    name: 'cookie-parser plain, signed and JSON cookies',
    setup: function (app) {
      app.use(cookieParser('keyboard cat'))
      app.get('/', function (req, res) {
        res.cookie('signed', 'tobi', { signed: true })
        res.json({ cookies: req.cookies, signed: req.signedCookies })
      })
    },
    steps: [
      get('/', {
        cookie:
          'plain=value; obj=j%3A%7B%22a%22%3A1%7D; signed=' +
          encodeURIComponent('s:' + signature.sign('tobi', 'keyboard cat')) +
          '; forged=s%3Atobi.bad'
      })
    ]
  },

  // express-session: set a value, then read it back with the cookie
  {
    name: 'express-session round trip',
    setup: function (app) {
      app.use(session({ secret: 'keyboard cat', resave: false, saveUninitialized: false }))
      app.get('/set', function (req, res) {
        req.session.user = 'tobi'
        res.send('set')
      })
      app.get('/get', function (req, res) {
        res.json({ user: req.session.user || null })
      })
    },
    steps: [get('/set'), withCookieFrom('/get'), get('/get')],
    normalise: function (name, value) {
      return name === 'set-cookie' ? value.replace(/connect\.sid=[^;]+/, 'connect.sid=<sid>') : value
    }
  },

  // compression
  {
    name: 'compression gzip, br and identity',
    setup: function (app) {
      app.use(compression({ threshold: 0 }))
      app.get('/', function (req, res) {
        res.send('compress me '.repeat(200))
      })
    },
    steps: [
      get('/', { 'accept-encoding': 'gzip' }),
      get('/', { 'accept-encoding': 'br' }),
      get('/', { 'accept-encoding': 'identity' })
    ]
  },

  // morgan: responses and log lines
  {
    name: 'morgan log lines',
    setup: function (app, express, logs) {
      app.use(
        morgan(':method :url :status :res[content-length] :req[x-trace] - :response-time ms', {
          stream: {
            write: function (line) {
              logs.push(line.replace(/[\d.]+ ms\n$/, '<time> ms\n'))
            }
          }
        })
      )
      app.get('/', function (req, res) {
        res.send('logged')
      })
    },
    steps: [get('/', { 'x-trace': 'abc' }), get('/nope')]
  },

  // multer: a multipart upload with fields and a file
  {
    name: 'multer multipart upload',
    setup: function (app) {
      var upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1000 } })
      app.post('/upload', upload.single('doc'), function (req, res) {
        res.json({
          fields: req.body,
          file: req.file && {
            field: req.file.fieldname,
            name: req.file.originalname,
            type: req.file.mimetype,
            size: req.file.size,
            text: req.file.buffer.toString()
          }
        })
      })
      app.use(function (err, req, res, next) {
        res.status(400).json({ code: err.code, field: err.field })
      })
    },
    steps: [
      post(
        '/upload',
        multipart(
          BOUNDARY,
          { title: 'hello' },
          { field: 'doc', name: 'a.txt', type: 'text/plain', content: 'file body' }
        ),
        {
          'content-type': 'multipart/form-data; boundary=' + BOUNDARY
        }
      ),
      post(
        '/upload',
        multipart(BOUNDARY, {}, { field: 'doc', name: 'big.txt', type: 'text/plain', content: 'x'.repeat(1500) }),
        {
          'content-type': 'multipart/form-data; boundary=' + BOUNDARY
        }
      )
    ]
  },

  // passport with the local strategy, without sessions
  {
    name: 'passport local strategy',
    setup: function (app, express) {
      var auth = new passport.Passport()
      auth.use(
        new LocalStrategy(function (username, password, done) {
          if (username === 'tobi' && password === 'ferret') return done(null, { id: 1, username: username })
          return done(null, false, { message: 'bad credentials' })
        })
      )
      app.use(express.urlencoded({ extended: false }))
      app.use(auth.initialize())
      app.post('/login', auth.authenticate('local', { session: false }), function (req, res) {
        res.json(req.user)
      })
    },
    steps: [
      post('/login', 'username=tobi&password=ferret', { 'content-type': 'application/x-www-form-urlencoded' }),
      post('/login', 'username=tobi&password=wrong', { 'content-type': 'application/x-www-form-urlencoded' })
    ]
  },

  // express-rate-limit: two requests allowed, then 429
  {
    name: 'express-rate-limit',
    setup: function (app) {
      app.use(rateLimit({ windowMs: 60000, limit: 2, standardHeaders: 'draft-8', legacyHeaders: true }))
      app.get('/', function (req, res) {
        res.send('ok')
      })
    },
    steps: [get('/'), get('/'), get('/')],
    normalise: function (name, value) {
      // reset times count down in seconds and can differ by one between two servers
      if (name === 'ratelimit' || name === 'x-ratelimit-reset' || name === 'retry-after')
        return value
          .replace(/\d+/g, function (n) {
            return n.length > 3 ? '<n>' : n
          })
          .replace(/t=\d+/, 't=<s>')
      return value
    }
  }
]

describe('ecosystem: community middleware behaves the same as on Express 5.3.0', function () {
  scenarios.forEach(function (scenario) {
    it(scenario.name, async function () {
      var logsA = []
      var logsB = []
      var a = await serve(baseline, function (app, express) {
        scenario.setup(app, express, logsA)
      })
      var b = await serve(ours, function (app, express) {
        scenario.setup(app, express, logsB)
      })
      try {
        var expected = await sequence(a, scenario.steps, scenario.normalise)
        var actual = await sequence(b, scenario.steps, scenario.normalise)
      } finally {
        await close(a)
        await close(b)
      }
      assert.deepStrictEqual(actual, expected)
      assert.deepStrictEqual(logsB, logsA)
      // guard against a scenario that silently does nothing
      assert.ok(
        actual.every(function (r) {
          return r.status >= 200 && !r.error
        }),
        JSON.stringify(
          actual.map(function (r) {
            return r.status || r.error
          })
        )
      )
    })
  })
})
