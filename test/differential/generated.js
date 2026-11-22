'use strict'

// Generated scenarios for the differential harness. Instead of writing each
// case by hand, every `res` method and every `req` property gets a list of
// calls (argument types and edge cases), and each call is combined with app
// settings, HTTP methods, paths and request headers.
//
// The full cross product would be billions of requests, so each group is an
// all-pairs (pairwise) covering array: every value of every factor meets
// every value of every other factor in at least one scenario. Most bugs need
// only two things to line up (a setting and a header, an argument and a
// method), so this finds them in a few thousand requests. The arrays are
// built with the IPOG strategy (Lei and Tai, "In-Parameter-Order: a test
// generation strategy for pairwise testing", 1998) and use no randomness, so
// the same scenarios come out on every run.
//
// Each factor's first value is the default (no setting, no header), and a
// scenario's name lists only its non-default values.

var path = require('node:path')
var util = require('node:util')
var { Buffer } = require('node:buffer')
var tmpl = require('../support/tmpl')

var FIXTURES = path.join(__dirname, '..', 'fixtures')

// ---------------------------------------------------------------------------
// All-pairs covering array (IPOG)

// `sizes[i]` is the number of values of factor i. Returns rows of value
// indices in which every pair of values of every two factors appears.
function allPairs(sizes) {
  // IPOG builds smaller arrays when the largest factors come first.
  var order = sizes
    .map(function (n, i) {
      return i
    })
    .sort(function (a, b) {
      return sizes[b] - sizes[a] || a - b
    })
  var s = order.map(function (i) {
    return sizes[i]
  })
  var rows = []
  var DONT_CARE = -1

  for (var a = 0; a < s[0]; a++) {
    for (var b = 0; b < s[1]; b++) rows.push([a, b])
  }

  for (var k = 2; k < s.length; k++) {
    // covered[j][vj * s[k] + vk] for every earlier factor j
    var covered = []
    for (var j = 0; j < k; j++) covered.push(new Uint8Array(s[j] * s[k]))

    // horizontal growth: give each existing row the value of factor k that
    // covers the most new pairs (ties go to the lowest value)
    rows.forEach(function (row) {
      var best = 0
      var bestGain = -1
      for (var v = 0; v < s[k]; v++) {
        var gain = 0
        for (var j = 0; j < k; j++) {
          if (row[j] !== DONT_CARE && !covered[j][row[j] * s[k] + v]) gain++
        }
        if (gain > bestGain) {
          best = v
          bestGain = gain
        }
      }
      row.push(best)
      for (var j = 0; j < k; j++) {
        if (row[j] !== DONT_CARE) covered[j][row[j] * s[k] + best] = 1
      }
    })

    // vertical growth: cover what is left, reusing a row whose factor j is
    // still free before adding a new one
    for (var j = 0; j < k; j++) {
      for (var vj = 0; vj < s[j]; vj++) {
        for (var vk = 0; vk < s[k]; vk++) {
          if (covered[j][vj * s[k] + vk]) continue
          var row = rows.find(function (r) {
            return r[k] === vk && r[j] === DONT_CARE
          })
          if (!row) {
            row = new Array(k + 1).fill(DONT_CARE)
            row[k] = vk
            rows.push(row)
          }
          row[j] = vj
          covered[j][vj * s[k] + vk] = 1
        }
      }
    }
  }

  // Any value fills a free slot; spread them so the defaults don't pile up.
  return rows.map(function (row, r) {
    var out = new Array(sizes.length)
    row.forEach(function (v, i) {
      out[order[i]] = v === DONT_CARE ? r % s[i] : v
    })
    return out
  })
}

// ---------------------------------------------------------------------------
// App settings. Each value is [label, configure(app)].

function setting(name, value) {
  return function (app) {
    app.set(name, value)
  }
}

function dropSecret(key, value) {
  return key === 'secret' ? undefined : value
}

function trustTwoHops(addr, i) {
  return i < 2
}

function rawQuery(str) {
  return { raw: str }
}

var SETTINGS = {
  etag: [
    ['', null],
    ['etag=weak', setting('etag', 'weak')],
    ['etag=strong', setting('etag', 'strong')],
    ['etag=false', setting('etag', false)]
  ],
  json: [
    ['', null],
    ['json spaces=2', setting('json spaces', 2)],
    ['json spaces=tab', setting('json spaces', '\t')],
    ['json escape', setting('json escape', true)],
    ['json replacer', setting('json replacer', dropSecret)],
    [
      'json escape+spaces+replacer',
      function (app) {
        app.set('json escape', true)
        app.set('json spaces', 1)
        app.set('json replacer', dropSecret)
      }
    ]
  ],
  queryParser: [
    ['', null],
    ['query parser=simple', setting('query parser', 'simple')],
    ['query parser=extended', setting('query parser', 'extended')],
    ['query parser=false', setting('query parser', false)],
    ['query parser=fn', setting('query parser', rawQuery)]
  ],
  trustProxy: [
    ['', null],
    ['trust proxy=true', setting('trust proxy', true)],
    ['trust proxy=loopback', setting('trust proxy', 'loopback')],
    ['trust proxy=1', setting('trust proxy', 1)],
    ['trust proxy=list', setting('trust proxy', '10.0.0.0/8, 127.0.0.1')],
    ['trust proxy=fn', setting('trust proxy', trustTwoHops)]
  ],
  routing: [
    ['', null],
    ['strict routing', setting('strict routing', true)],
    ['case sensitive routing', setting('case sensitive routing', true)],
    [
      'strict+case sensitive routing',
      function (app) {
        app.set('strict routing', true)
        app.set('case sensitive routing', true)
      }
    ]
  ],
  jsonpName: [
    ['', null],
    ['jsonp callback name=cb', setting('jsonp callback name', 'cb')]
  ],
  poweredBy: [
    ['', null],
    ['x-powered-by=false', setting('x-powered-by', false)]
  ],
  env: [
    ['', null],
    ['env=production', setting('env', 'production')]
  ],
  subdomainOffset: [
    ['', null],
    ['subdomain offset=1', setting('subdomain offset', 1)],
    ['subdomain offset=3', setting('subdomain offset', 3)]
  ]
}

// ---------------------------------------------------------------------------
// Requests. Each header value is [label, headers].

function header(name, values) {
  return [['', {}]].concat(
    values.map(function (v) {
      var h = {}
      h[name] = v
      return [name + ': ' + v, h]
    })
  )
}

var REQUEST = {
  method: ['GET', 'HEAD', 'POST', 'PUT', 'OPTIONS'].map(function (m) {
    return [m === 'GET' ? '' : m, m]
  }),
  path: [
    '/r',
    '/r/',
    '/R',
    '/r?a=1&a=2&b[c]=d&e',
    '/r?callback=fn',
    '/r?cb=x.y&callback=z',
    '/r?callback[]=a&callback[]=b',
    '/r?callback=%3Cscript%3E&q=%E2%98%83',
    '/r?a[__proto__][x]=1&a[b]=2&c[]=1&c[]=2'
  ].map(function (p) {
    return [p === '/r' ? '' : p, p]
  }),
  accept: header('accept', [
    'application/json',
    'text/html',
    'text/plain;q=0.5, application/json;q=0.9',
    '*/*',
    'image/png',
    'text/*;q=0.8, application/xml;q=0'
  ]),
  acceptEncoding: header('accept-encoding', ['gzip', 'gzip;q=0, br', 'identity;q=0, *;q=0', '*']),
  acceptLanguage: header('accept-language', ['en-US,en;q=0.9', 'fr-CA, fr;q=0.8, *;q=0.1', 'x-bogus;q=abc']),
  acceptCharset: header('accept-charset', ['utf-8, iso-8859-1;q=0.5', '*;q=0']),
  conditional: [
    ['', {}],
    ['if-none-match: *', { 'if-none-match': '*' }],
    ['if-none-match: W/"x"', { 'if-none-match': 'W/"x"' }],
    ['if-none-match: list', { 'if-none-match': '"a", W/"b"' }],
    ['if-modified-since: 1970', { 'if-modified-since': 'Thu, 01 Jan 1970 00:00:01 GMT' }],
    ['if-modified-since: 2100', { 'if-modified-since': 'Fri, 01 Jan 2100 00:00:00 GMT' }],
    [
      'if-none-match: * + if-modified-since: 2100',
      { 'if-none-match': '*', 'if-modified-since': 'Fri, 01 Jan 2100 00:00:00 GMT' }
    ],
    ['cache-control: no-cache + if-none-match: *', { 'cache-control': 'no-cache', 'if-none-match': '*' }]
  ],
  range: header('range', [
    'bytes=0-2',
    'bytes=2-',
    'bytes=-3',
    'bytes=0-1,3-4',
    'bytes=50-60',
    'items=0-1',
    'bytes=abc'
  ]),
  host: header('host', ['example.com:8080', 'tobi.ferrets.example.com', '[::1]:3000', 'EXAMPLE.COM']),
  forwardedFor: header('x-forwarded-for', ['10.0.0.1', '203.0.113.5, 10.0.0.2', 'not-an-ip']),
  // No uppercase value: the fork lowercases a trusted X-Forwarded-Proto on
  // purpose (upstream PR #7330), and the `allowed` scenario
  // 'req.protocol uppercase forwarded' in ./scenarios.js shows that difference.
  forwardedProto: header('x-forwarded-proto', ['https', 'https, http', 'http, https']),
  forwardedHost: header('x-forwarded-host', ['proxy.example.com', 'a.example.com:9000, b.example.com']),
  contentType: header('content-type', [
    'application/json',
    'text/plain; charset=utf-8',
    'application/x-www-form-urlencoded',
    'multipart/form-data; boundary=x'
  ]),
  extra: [
    ['', {}],
    ['x-requested-with: XMLHttpRequest', { 'x-requested-with': 'XMLHttpRequest' }],
    ['x-requested-with: fetch', { 'x-requested-with': 'fetch' }],
    ['referer', { referer: 'http://ref.example/page' }]
  ]
}

var SETTING_KEYS = Object.keys(SETTINGS)
var REQUEST_KEYS = Object.keys(REQUEST)

// ---------------------------------------------------------------------------
// Calls. Each value is [label, handler(req, res)].

function file(name) {
  return path.join(FIXTURES, name)
}

// Values of every argument type, for res.send, res.json and res.jsonp.
var VALUES = [
  ['"Hello"', 'Hello'],
  ['""', ''],
  ['html string', '<p>hi</p>'],
  ['unicode string', 'ünï ☃ 😀'],
  ['string with <>&, U+2028 and U+2029', '<script>&  </script>'],
  ['long string', 'x'.repeat(4096)],
  ['0', 0],
  ['42', 42],
  ['-1.5', -1.5],
  ['NaN', NaN],
  ['true', true],
  ['false', false],
  ['null', null],
  ['undefined', undefined],
  ['object', { a: 1, b: [true, null], secret: 's', html: '<b>&' }],
  ['nested object', { a: { b: { c: [1, { d: '<>' }] } } }],
  ['{}', {}],
  ['array', [1, 'two', null]],
  ['[]', []],
  ['Buffer', Buffer.from('bytes')],
  ['empty Buffer', Buffer.alloc(0)],
  ['Uint8Array', new Uint8Array([104, 105])],
  ['Float64Array', new Float64Array([1.5, -2])],
  ['ArrayBuffer', new Uint8Array([1, 2, 3]).buffer],
  ['DataView', new DataView(new Uint8Array([104, 105]).buffer)],
  ['Date', new Date(0)],
  [
    'object with toJSON',
    {
      toJSON: function () {
        return { j: 1 }
      }
    }
  ],
  ['Map', new Map([['a', 1]])],
  ['BigInt', 10n]
]

function valueCalls(method) {
  return VALUES.map(function (v) {
    return [
      v[0],
      function (req, res) {
        res[method](v[1])
      }
    ]
  })
}

// Calls that only set something, followed by res.send so the result shows.
function then(label, fn, body) {
  return [
    label,
    function (req, res) {
      fn(req, res)
      res.send(body === undefined ? 'ok' : body)
    }
  ]
}

function many(method, list) {
  return list.map(function (args) {
    return then(
      args.map(label).join(', '),
      function (req, res) {
        res[method].apply(res, args)
      },
      'ok'
    )
  })
}

function label(v) {
  if (typeof v === 'function') return 'fn'
  if (typeof v === 'bigint') return v + 'n'
  if (v instanceof Date) return 'Date(' + v.getTime() + ')'
  if (typeof v === 'number' && !Number.isFinite(v)) return String(v)
  return v === undefined ? 'undefined' : JSON.stringify(v)
}

function withSecret(fn) {
  return function (req, res) {
    req.secret = 'kitty'
    fn(req, res)
  }
}

// Respond from a res.download or res.sendFile callback when it failed before
// sending anything.
function fileCallback(res) {
  return function (err) {
    if (err && !res.headersSent) res.status(err.status || 500).send('callback: ' + err.code)
  }
}

var CALLS = {
  send: valueCalls('send').concat([
    [
      'string after res.type("text")',
      function (req, res) {
        res.type('text').send('<b>x</b>')
      }
    ],
    [
      'string after a latin1 Content-Type',
      function (req, res) {
        res.set('Content-Type', 'text/plain; charset=iso-8859-1').send('é')
      }
    ],
    [
      'object after res.type("text")',
      function (req, res) {
        res.type('text').send({ a: 1 })
      }
    ],
    [
      'string with ETag set',
      function (req, res) {
        res.set('ETag', '"x"').send('tagged')
      }
    ]
  ]),
  json: valueCalls('json'),
  jsonp: valueCalls('jsonp'),
  status: [200, 201, 204, 205, 301, 304, 404, 418, 500, 599, 999, 1000, 99, '200', 200.5, null, undefined, NaN].map(
    function (code) {
      return [
        label(code),
        function (req, res) {
          res.status(code).send('status body')
        }
      ]
    }
  ),
  sendStatus: [200, 201, 204, 304, 404, 418, 451, 500, 599, 999, 1000, '404', null, undefined].map(function (code) {
    return [
      label(code),
      function (req, res) {
        res.sendStatus(code)
      }
    ]
  }),
  redirect: [
    ['/foo'],
    ['http://example.com/ü?q=☃'],
    ['//evil.example/'],
    ['../up?x=1'],
    [''],
    ['/%zz'],
    ['/<script>"&'],
    ['mailto:x@example.com'],
    [301, '/foo'],
    [308, 'http://example.com/'],
    ['/foo', 301],
    [999, '/foo'],
    ['301', '/foo'],
    [undefined],
    [42]
  ].map(function (args) {
    return [
      args.map(label).join(', '),
      function (req, res) {
        res.redirect.apply(res, args)
      }
    ]
  }),
  location: [
    '/foo',
    'http://example.com/ü?q=☃',
    '//evil.example',
    '',
    'back',
    '/%zz%20ok',
    'javascript:alert(1)',
    123,
    null
  ].map(function (url) {
    return [
      label(url),
      function (req, res) {
        res.location(url).end()
      }
    ]
  }),
  set: many('set', [
    ['X-A', 'v'],
    [{ 'X-A': 'a', 'X-B': ['1', '2'] }],
    ['Content-Type', 'json'],
    ['Content-Type', 'text/html'],
    ['Content-Type', 'text/plain; charset=iso-8859-1'],
    ['Content-Type', ['a/b']],
    ['X-Num', 5],
    ['X-Arr', [1, 2]],
    ['X-Bad', 'a\nb'],
    ['Set-Cookie', ['a=1', 'b=2']],
    ['ETag', '"fixed"'],
    ['Link', '<http://x/>; rel="next"'],
    [{}]
  ]),
  append: [
    then('X-A after set', function (req, res) {
      res.set('X-A', '0').append('X-A', '1')
    }),
    then('Set-Cookie twice', function (req, res) {
      res.append('Set-Cookie', 'a=1').append('Set-Cookie', 'b=2')
    }),
    then('array value', function (req, res) {
      res.append('X-Arr', ['1', '2']).append('X-Arr', '3')
    }),
    then('onto an array', function (req, res) {
      res.set('X-Arr', ['1', '2']).append('X-Arr', ['3', '4'])
    }),
    then('Link', function (req, res) {
      res.append('Link', '<http://a/>').append('Link', '<http://b/>')
    }),
    then('number', function (req, res) {
      res.append('X-Num', 3)
    }),
    then('undefined', function (req, res) {
      res.append('X-U', undefined)
    }),
    then('empty array', function (req, res) {
      res.append('X-E', [])
    }),
    then('after res.cookie', function (req, res) {
      res.cookie('c', '1').append('Set-Cookie', 'd=2')
    }),
    then('Content-Type', function (req, res) {
      res.append('Content-Type', 'text/plain')
    })
  ],
  type: [
    'json',
    'html',
    '.png',
    'text/plain',
    'application/x-unknown-type',
    'unknownext',
    '',
    'text/html; charset=iso-8859-1',
    'JSON',
    'image/svg+xml',
    'js'
  ].map(function (t) {
    return then(label(t), function (req, res) {
      res.type(t)
    })
  }),
  vary: [
    then('"Accept"', function (req, res) {
      res.vary('Accept')
    }),
    then('"Accept, Accept-Encoding"', function (req, res) {
      res.vary('Accept, Accept-Encoding')
    }),
    then('["Origin", "Accept"]', function (req, res) {
      res.vary(['Origin', 'Accept'])
    }),
    then('"*"', function (req, res) {
      res.vary('*')
    }),
    then('""', function (req, res) {
      res.vary('')
    }),
    then('undefined', function (req, res) {
      res.vary(undefined)
    }),
    then('invalid header name', function (req, res) {
      res.vary('bad header!')
    }),
    then('twice, repeating a field', function (req, res) {
      res.vary('Accept').vary('accept').vary('Origin')
    }),
    then('after a preset Vary', function (req, res) {
      res.set('Vary', 'User-Agent').vary('Accept')
    }),
    then('before res.format', function (req, res) {
      res.vary('Origin')
    })
  ],
  links: [
    [{ next: 'http://x/2', last: 'http://x/9' }],
    [{}],
    [{ next: ['http://x/2', 'http://y/2'] }],
    [{ 'pre fetch': 'http://x/<a>' }],
    [{ next: 'http://x/2' }, { prev: 'http://x/1' }]
  ]
    .map(function (calls) {
      return then(calls.map(label).join(' then '), function (req, res) {
        calls.forEach(function (c) {
          res.links(c)
        })
      })
    })
    .concat([
      then('after a preset Link', function (req, res) {
        res.set('Link', '<http://x/0>; rel="first"').links({ next: 'http://x/2' })
      })
    ]),
  cookie: [
    ['name', 'tobi'],
    ['cart', { items: [1, 2] }],
    ['n', 'v', { httpOnly: true, secure: true, sameSite: 'strict', path: '/admin' }],
    ['n', 'v', { maxAge: 60000 }],
    ['n', 'v', { maxAge: 1500 }],
    ['n', 'v', { maxAge: -1 }],
    ['n', 'v', { maxAge: 'abc' }],
    ['n', 'v', { expires: new Date(0) }],
    ['n', 'v', { domain: 'example.com', sameSite: 'none', secure: true }],
    ['n', 'v', { priority: 'high', partitioned: true, secure: true }],
    ['n', 'ü ☃;,'],
    ['n', ''],
    ['n', 5],
    ['n', null],
    ['n', undefined],
    ['bad name', 'v'],
    ['n', 'v', { encode: String }],
    ['n', 'v', { signed: true }]
  ]
    .map(function (args) {
      return then(args.map(label).join(', '), function (req, res) {
        res.cookie.apply(res, args)
      })
    })
    .concat([
      then(
        'signed with a secret',
        withSecret(function (req, res) {
          res.cookie('user', { id: 1 }, { signed: true, maxAge: 1000 })
        })
      )
    ]),
  clearCookie: [
    ['sid'],
    ['sid', { path: '/x' }],
    ['sid', { maxAge: 1000 }],
    ['sid', { expires: new Date(5000) }],
    ['sid', { domain: 'a.example.com', secure: true, sameSite: 'lax', httpOnly: true }],
    ['bad name'],
    ['sid', { signed: true }],
    ['sid', { path: '/', priority: 'low' }]
  ]
    .map(function (args) {
      return then(args.map(label).join(', '), function (req, res) {
        res.clearCookie.apply(res, args)
      })
    })
    .concat([
      then(
        'signed with a secret',
        withSecret(function (req, res) {
          res.clearCookie('user', { signed: true })
        })
      )
    ]),
  attachment: [undefined, 'report.pdf', 'ü ☃.txt', 'path/to/file.json', 'noext', 'quote".txt', '%20.txt', ''].map(
    function (name) {
      return then(
        label(name),
        function (req, res) {
          res.attachment(name)
        },
        'data'
      )
    }
  ),
  download: [
    ['user.html', [file('user.html')]],
    ['nums.txt', [file('nums.txt')]],
    ['custom name', [file('user.html'), 'Document.html']],
    ['unicode name', [file('user.html'), 'ü ☃.html']],
    ['headers option', [file('name.txt'), { headers: { 'X-H': '1', 'Content-Type': 'text/x-custom' } }]],
    ['name and maxAge', [file('name.txt'), 'n.txt', { maxAge: 1000 }]],
    ['root option', ['nums.txt', { root: FIXTURES }]],
    ['relative path', [path.relative(process.cwd(), file('name.txt'))]],
    ['missing file', [file('nope.txt')]],
    ['directory', [file('users')]],
    ['dotfile denied', ['.name', { root: FIXTURES, dotfiles: 'deny' }]],
    ['dotfile allowed', ['.name', 'name', { root: FIXTURES, dotfiles: 'allow' }]],
    ['".." outside root', ['../fixtures/name.txt', { root: FIXTURES }]],
    ['percent in name', [file('% of dogs.txt')]],
    ['lastModified false', [file('name.txt'), { lastModified: false, etag: false }]]
  ]
    .map(function (d) {
      return [
        d[0],
        function (req, res) {
          res.download.apply(res, d[1])
        }
      ]
    })
    .concat([
      [
        'missing file with callback',
        function (req, res) {
          res.download(file('nope.txt'), fileCallback(res))
        }
      ]
    ]),
  sendFile: [
    ['name.txt', [file('name.txt')]],
    ['user.html', [file('user.html')]],
    ['root option', ['nums.txt', { root: FIXTURES }]],
    ['headers option', ['user.html', { root: FIXTURES, headers: { 'X-H': '1' } }]],
    ['maxAge number', [file('name.txt'), { maxAge: 5000 }]],
    ['maxAge string', [file('name.txt'), { maxAge: '1d' }]],
    ['immutable', [file('name.txt'), { immutable: true, maxAge: 1000 }]],
    ['lastModified false', [file('name.txt'), { lastModified: false }]],
    ['etag false', [file('name.txt'), { etag: false }]],
    ['cacheControl false', [file('name.txt'), { cacheControl: false }]],
    ['acceptRanges false', [file('nums.txt'), { acceptRanges: false }]],
    ['relative path', ['name.txt']],
    ['missing file', [file('nope.txt')]],
    ['directory', [file('users')]],
    ['dotfile ignored', ['.name', { root: FIXTURES }]],
    ['dotfile allowed', ['.name', { root: FIXTURES, dotfiles: 'allow' }]],
    ['percent in name', ['% of dogs.txt', { root: FIXTURES }]],
    ['null byte', [file('name.txt\0')]],
    ['empty file', [file('empty.txt')]]
  ]
    .map(function (d) {
      return [
        d[0],
        function (req, res) {
          res.sendFile.apply(res, d[1])
        }
      ]
    })
    .concat([
      [
        'missing file with callback',
        function (req, res) {
          res.sendFile(file('nope.txt'), fileCallback(res))
        }
      ]
    ]),
  format: [
    ['text and json', { text: 'text', json: 'json' }],
    ['text, json and default', { text: 'text', json: 'json', default: 'default' }],
    ['html only', { html: 'html' }],
    ['full types', { 'application/json': 'json', 'text/html': 'html' }],
    ['wildcard type', { 'text/*': 'text-any' }],
    ['default only', { default: 'default' }],
    ['empty', {}],
    ['image/png and text', { 'image/png': 'png', text: 'text' }]
  ].map(function (f) {
    return [
      f[0],
      function (req, res) {
        var handlers = {}
        Object.keys(f[1]).forEach(function (type) {
          handlers[type] = function () {
            res.send(f[1][type])
          }
        })
        res.vary('Origin').format(handlers)
      }
    ]
  }),
  render: [
    [
      'with locals',
      function (req, res) {
        res.render('user.tmpl', { user: { name: 'tobi' } })
      }
    ],
    [
      'with view engine',
      function (req, res) {
        req.app.set('view engine', 'tmpl')
        res.render('user', { user: { name: 'loki' } })
      }
    ],
    [
      'with app.locals and res.locals',
      function (req, res) {
        req.app.locals.name = 'app'
        res.locals.user = { name: 'res' }
        res.render('name.tmpl')
      }
    ],
    [
      'missing view',
      function (req, res) {
        res.render('missing.tmpl')
      }
    ],
    [
      'unknown engine',
      function (req, res) {
        res.render('user.html')
      }
    ],
    [
      'render error',
      function (req, res) {
        res.render('user.tmpl', {})
      }
    ],
    [
      'with callback',
      function (req, res) {
        res.render('email.tmpl', function (err, html) {
          res.status(err ? 500 : 201).send(html)
        })
      }
    ],
    [
      'options as callback',
      function (req, res) {
        res.render('name.tmpl', { name: '<b>' }, function (err, html) {
          res.type('text').send(err ? 'error' : html)
        })
      }
    ],
    [
      'absolute path',
      function (req, res) {
        res.render(file('email.tmpl'))
      }
    ],
    [
      'no extension and no view engine',
      function (req, res) {
        res.render('user')
      }
    ]
  ],
  end: [
    ['no arguments', []],
    ['string', ['body']],
    ['empty string', ['']],
    ['Buffer', [Buffer.from('buf')]],
    ['Uint8Array', [new Uint8Array([104, 105])]],
    ['latin1 string', ['é', 'latin1']],
    ['hex string', ['6869', 'hex']],
    ['null', [null]],
    ['number', [123]],
    ['after set Content-Type', ['{}'], 'application/json']
  ].map(function (e) {
    return [
      e[0],
      function (req, res) {
        if (e[2]) res.set('Content-Type', e[2])
        res.end.apply(res, e[1])
      }
    ]
  })
}

// ---------------------------------------------------------------------------
// req properties and methods, echoed back with util.inspect so the type of
// each value shows (null-prototype objects, array properties such as
// req.range()'s `type`, and so on).

function prop(name) {
  return [
    'req.' + name,
    function (req) {
      return req[name]
    }
  ]
}

function call(name, args) {
  return [
    'req.' + name + '(' + args.map(label).join(', ') + ')',
    function (req) {
      return req[name].apply(req, args)
    }
  ]
}

var READS = [
  prop('ip'),
  prop('ips'),
  prop('protocol'),
  prop('secure'),
  prop('hostname'),
  prop('host'),
  prop('subdomains'),
  prop('path'),
  prop('query'),
  prop('fresh'),
  prop('stale'),
  prop('xhr'),
  prop('method'),
  prop('url'),
  prop('originalUrl'),
  prop('baseUrl'),
  prop('params'),
  call('accepts', []),
  call('accepts', ['json']),
  call('accepts', ['html', 'json']),
  call('accepts', [['text', 'image/png']]),
  call('acceptsEncodings', []),
  call('acceptsEncodings', ['gzip', 'br']),
  call('acceptsEncodings', ['identity']),
  call('acceptsCharsets', []),
  call('acceptsCharsets', ['utf-8', 'iso-8859-1']),
  call('acceptsLanguages', []),
  call('acceptsLanguages', ['en', 'fr']),
  call('acceptsLanguages', [['fr-CA']]),
  call('is', ['json']),
  call('is', ['text/*']),
  call('is', [['urlencoded', 'multipart']]),
  call('is', []),
  call('range', [10]),
  call('range', [10, { combine: true }]),
  call('range', [0]),
  call('get', ['Content-Type']),
  call('get', ['referrer']),
  call('get', ['Referer']),
  call('get', ['X-Forwarded-For']),
  call('get', ['host']),
  call('get', [1]),
  call('get', []),
  call('header', ['Accept']),
  [
    'req.fresh with ETag set',
    function (req, res) {
      res.set('ETag', 'W/"x"')
      return req.fresh
    }
  ],
  [
    'req.fresh with Last-Modified set',
    function (req, res) {
      res.set('Last-Modified', 'Thu, 01 Jan 2026 00:00:00 GMT')
      return req.fresh
    }
  ],
  [
    'req.stale with ETag set',
    function (req, res) {
      res.set('ETag', '"a"')
      return req.stale
    }
  ]
]

CALLS.req = READS.map(function (r) {
  return [
    r[0],
    function (req, res) {
      var value = r[1](req, res)
      res.type('text').send(util.inspect(value, { depth: 5 }))
    }
  ]
})

// ---------------------------------------------------------------------------
// Scenarios

// Every app gets the same view engine, so res.render works in any scenario.
function views(app) {
  app.engine('tmpl', tmpl)
  app.set('views', FIXTURES)
}

function group(name, calls) {
  var factors = [calls]
    .concat(
      SETTING_KEYS.map(function (k) {
        return SETTINGS[k]
      })
    )
    .concat(
      REQUEST_KEYS.map(function (k) {
        return REQUEST[k]
      })
    )
  var rows = allPairs(
    factors.map(function (f) {
      return f.length
    })
  )
  var scenarios = rows.map(function (row) {
    var pick = row.map(function (v, i) {
      return factors[i][v]
    })
    var handle = pick[0][1]
    var configure = pick.slice(1, 1 + SETTING_KEYS.length)
    var req = pick.slice(1 + SETTING_KEYS.length)
    var method = req[0][1]
    var url = req[1][1]
    var headers = Object.assign.apply(
      null,
      [{}].concat(
        req.slice(2).map(function (h) {
          return h[1]
        })
      )
    )
    var labels = pick.slice(1).map(function (p) {
      return p[0]
    })
    var scenarioName =
      (name ? name + ' ' : '') + pick[0][0] + ' | ' + labels.filter(Boolean).join(' | ').replace(/^$/, 'defaults')

    return {
      name: scenarioName,
      setup: function (app) {
        configure.forEach(function (c) {
          if (c[1]) c[1](app)
        })
        views(app)
        app.all('/r', handle)
      },
      req: {
        method: method,
        path: url,
        headers: headers,
        // POST and PUT carry a body, so req.is() has something to look at
        body: method === 'POST' || method === 'PUT' ? 'payload' : undefined
      }
    }
  })

  return { name: name || 'req', factors: factors, rows: rows, scenarios: scenarios }
}

var groups = Object.keys(CALLS).map(function (method) {
  // req calls are already labelled `req.<name>`
  return group(method === 'req' ? '' : 'res.' + method, CALLS[method])
})

var scenarios = groups.reduce(function (all, g) {
  return all.concat(g.scenarios)
}, [])

// Calls whose responses differ from 5.3.0 on purpose, by the call's label
// (the part of a scenario name before the first " | "). Its scenarios may
// differ, and at least one must (some give both the same 304 or 412), so the
// list never goes stale; the value names the ROADMAP.md item whose fix
// changes it.
var BINARY =
  "fixed in the fork: `res.send` corrupts ArrayBuffer, DataView and typed-array bodies (it now sends the view's own bytes)"
var allowed = {
  'res.send Float64Array': BINARY,
  'res.send ArrayBuffer': BINARY,
  'res.send DataView': BINARY
}

module.exports = { scenarios: scenarios, groups: groups, allPairs: allPairs, allowed: allowed }
