'use strict'

// Not from upstream. The fork's "view engines" setting: a view name without
// a known extension tries the "view engine" extension, then each listed
// one, and renders the first that has a file (expressjs/express#2708,
// #3485, PR #3569).

var assert = require('node:assert')
var fs = require('node:fs')
var os = require('node:os')
var path = require('node:path')
var express = require('..')
var request = require('supertest')

// a views directory with the given files (paths may have folders), removed
// after the file's tests
var dirs = []
function viewsWith(files) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'express-fork-view-engines-'))
  Object.keys(files).forEach(function (name) {
    var file = path.join(dir, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, files[name])
  })
  dirs.push(dir)
  return dir
}

after(function () {
  dirs.forEach(function (dir) {
    fs.rmSync(dir, { recursive: true })
  })
})

// an engine that renders "<tag>:<file contents>", so a test sees which
// engine rendered which file
function tagged(tag) {
  return function (file, options, callback) {
    fs.readFile(file, 'utf8', function (err, str) {
      callback(err, tag + ':' + str)
    })
  }
}

// an app with the "html" and "tmpl" engines and the given views
function createApp(views) {
  var app = express()
  app.engine('html', tagged('html'))
  app.engine('tmpl', tagged('tmpl'))
  app.set('views', views)
  return app
}

function rendersTo(app, name, expected, done) {
  app.render(name, function (err, str) {
    if (err) return done(err)
    assert.strictEqual(str, expected)
    done()
  })
}

function failsWith(app, name, message, done) {
  app.render(name, function (err) {
    assert.ok(err, 'expected an error')
    assert.strictEqual(err.message, message)
    done()
  })
}

describe('app.set("view engines") (fork)', function () {
  describe('when not set', function () {
    it('should still throw without "view engine", whatever engines are registered', function () {
      var app = createApp(viewsWith({ 'page.tmpl': 'p' }))

      assert.throws(function () {
        app.render('page', function () {})
      }, /^Error: No default engine was specified and no extension was provided\.$/)
    })

    it('should still only try the "view engine" extension', function (done) {
      var views = viewsWith({ 'page.tmpl': 'p' })
      var app = createApp(views)
      app.set('view engine', 'html')

      app.render('page', function (err) {
        assert.strictEqual(err.message, 'Failed to lookup view "page" in views directory "' + views + '"')
        assert.strictEqual(err.view.extensions, undefined)
        done()
      })
    })

    it('should be off for an empty list or false', function () {
      var app = createApp(viewsWith({ 'page.tmpl': 'p' }))

      app.set('view engines', [])
      assert.throws(function () {
        app.render('page', function () {})
      }, /No default engine was specified/)

      app.disable('view engines')
      assert.throws(function () {
        app.render('page', function () {})
      }, /No default engine was specified/)
    })

    it('should give a custom "view" class the same options as before', function (done) {
      var app = createApp(viewsWith({}))
      var seen = []

      function CustomView(name, options) {
        seen.push(Object.keys(options))
        this.path = name
      }
      CustomView.prototype.render = function (options, callback) {
        callback(null, 'custom')
      }
      app.set('view', CustomView)

      app.render('a', function (err) {
        if (err) return done(err)
        app.set('view engines', ['tmpl'])
        app.render('b', function (err) {
          if (err) return done(err)
          assert.deepStrictEqual(seen, [
            ['defaultEngine', 'root', 'engines'],
            ['defaultEngine', 'root', 'engines', 'extensions']
          ])
          done()
        })
      })
    })
  })

  describe('order', function () {
    it('should render without "view engine"', function (done) {
      var app = createApp(viewsWith({ 'page.tmpl': 'p' }))
      app.set('view engines', ['html', 'tmpl'])

      rendersTo(app, 'page', 'tmpl:p', done)
    })

    it('should take the first listed extension that has a file', function (done) {
      var app = createApp(viewsWith({ 'page.html': 'h', 'page.tmpl': 't' }))
      app.set('view engines', ['tmpl', 'html'])

      rendersTo(app, 'page', 'tmpl:t', function (err) {
        if (err) return done(err)
        app.set('view engines', ['html', 'tmpl'])
        rendersTo(app, 'page', 'html:h', done)
      })
    })

    it('should try "view engine" first, even when listed later', function (done) {
      var app = createApp(viewsWith({ 'page.html': 'h', 'page.tmpl': 't' }))
      app.set('view engine', 'html')
      app.set('view engines', ['tmpl', 'html'])

      app.render('page', function (err, str) {
        if (err) return done(err)
        assert.strictEqual(str, 'html:h')
        done()
      })
    })

    it('should fall back from "view engine" to the listed extensions', function (done) {
      var app = createApp(viewsWith({ 'page.tmpl': 't' }))
      app.set('view engine', 'html')
      app.set('view engines', 'tmpl')

      rendersTo(app, 'page', 'tmpl:t', done)
    })

    it('should accept extensions with a leading dot and a single string', function (done) {
      var app = createApp(viewsWith({ 'page.tmpl': 't' }))
      app.set('view engines', '.tmpl')

      rendersTo(app, 'page', 'tmpl:t', done)
    })

    it('should find a folder index, for each extension in turn', function (done) {
      var app = createApp(viewsWith({ 'page/index.tmpl': 't' }))
      app.set('view engines', ['html', 'tmpl'])

      rendersTo(app, 'page', 'tmpl:t', done)
    })

    it('should match the engine in another case, keeping the file name', function (done) {
      var app = createApp(viewsWith({ 'page.TMPL': 'T' }))
      app.set('view engines', ['TMPL'])

      app.render('page', function (err, str) {
        if (err) return done(err)
        assert.strictEqual(str, 'tmpl:T')
        assert.strictEqual(app.engines['.TMPL'], undefined)
        done()
      })
    })

    it('should load the module of a listed extension with no engine, once found', function (done) {
      var app = createApp(viewsWith({ 'user.ejs': '<p><%= user.name %></p>' }))
      app.set('view engines', ['missing-engine-module', 'ejs'])
      app.locals.user = { name: 'tobi' }

      app.render('user', function (err, str) {
        if (err) return done(err)
        assert.strictEqual(str, '<p>tobi</p>')
        assert.strictEqual(typeof app.engines['.ejs'], 'function')
        assert.strictEqual(app.engines['.missing-engine-module'], undefined)
        done()
      })
    })

    it('should throw as "view engine" does when the module of the found file is missing', function () {
      var app = createApp(viewsWith({ 'page.missing-engine-module': 'p' }))
      app.set('view engines', ['missing-engine-module'])

      assert.throws(function () {
        app.render('page', function () {})
      }, /Cannot find module 'missing-engine-module'/)
    })
  })

  describe('several "views" folders', function () {
    it('should try each extension in every folder before the next extension', function (done) {
      var first = viewsWith({ 'page.html': 'first' })
      var second = viewsWith({ 'page.tmpl': 'second' })
      var app = createApp([first, second])
      app.set('view engines', ['tmpl', 'html'])

      rendersTo(app, 'page', 'tmpl:second', done)
    })

    it('should keep the "view engine" file in a later folder', function (done) {
      var first = viewsWith({ 'page.tmpl': 'first' })
      var second = viewsWith({ 'page.html': 'second' })
      var app = createApp([first, second])
      app.set('view engine', 'html')
      app.set('view engines', ['tmpl'])

      rendersTo(app, 'page', 'html:second', done)
    })
  })

  describe('sub apps', function () {
    it('should inherit the setting and the engines', function (done) {
      var views = viewsWith({ 'page.tmpl': 't' })
      var app = createApp(views)
      var sub = express()
      // "views" has a default, so a sub app has its own
      sub.set('views', views)
      app.set('view engines', ['html', 'tmpl'])
      app.use('/sub', sub)

      sub.get('/', function (req, res) {
        res.render('page')
      })

      request(app).get('/sub').expect(200, 'tmpl:t', done)
    })

    it('should use its own setting and its own engines first', function (done) {
      var views = viewsWith({ 'page.html': 'h', 'page.md': 'm' })
      var app = createApp(views)
      var sub = express()
      sub.set('views', views)
      app.set('view engines', ['html'])
      sub.set('view engines', ['md', 'html'])
      sub.engine('md', tagged('md'))
      app.use('/sub', sub)

      sub.get('/', function (req, res) {
        res.render('page')
      })
      app.get('/', function (req, res) {
        res.render('page')
      })

      request(app)
        .get('/sub')
        .expect(200, 'md:m', function (err) {
          if (err) return done(err)
          request(app).get('/').expect(200, 'html:h', done)
        })
    })
  })

  describe('names with a dot', function () {
    it('should treat an extension with no engine as part of the name', function (done) {
      var app = createApp(viewsWith({ 'user.profile.tmpl': 't' }))
      app.set('view engines', ['tmpl'])

      rendersTo(app, 'user.profile', 'tmpl:t', done)
    })

    it('should keep a registered extension as it is', function (done) {
      var app = createApp(viewsWith({ 'page.html': 'h', 'page.html.tmpl': 't' }))
      app.set('view engines', ['tmpl'])

      rendersTo(app, 'page.html', 'html:h', done)
    })

    it('should keep a registered extension in another case as it is', function (done) {
      var app = createApp(viewsWith({ 'page.HTML': 'H', 'page.HTML.tmpl': 't' }))
      app.set('view engines', ['tmpl'])

      rendersTo(app, 'page.HTML', 'html:H', done)
    })

    it('should keep a listed extension with no engine as it is', function (done) {
      var app = createApp(viewsWith({ 'user.ejs': '<p>ejs</p>', 'user.ejs.tmpl': 't' }))
      app.set('view engines', ['tmpl', 'EJS'])

      rendersTo(app, 'user.ejs', '<p>ejs</p>', done)
    })

    it('should keep the "view engine" extension as it is', function (done) {
      var app = express()
      app.set('views', viewsWith({ 'user.ejs': '<p>ejs</p>', 'user.ejs.html': 'h' }))
      app.engine('html', tagged('html'))
      app.set('view engine', 'ejs')
      app.set('view engines', ['html'])

      rendersTo(app, 'user.ejs', '<p>ejs</p>', done)
    })

    it('should add the extension to a name ending in "."', function (done) {
      var app = createApp(viewsWith({ 'page..tmpl': 't' }))
      app.set('view engines', ['tmpl'])

      rendersTo(app, 'page.', 'tmpl:t', done)
    })

    it('should give the lookup error, not load a module, when nothing matches', function (done) {
      var views = viewsWith({})
      var app = createApp(views)
      app.set('view engines', ['tmpl'])

      app.render('hello.world', function (err) {
        assert.strictEqual(
          err.message,
          'Failed to lookup view "hello.world" in views directory "' + views + '" with extension ".tmpl"'
        )
        assert.strictEqual(err.view.ext, '.world')
        assert.strictEqual(app.engines['.world'], undefined)
        done()
      })
    })
  })

  describe('when nothing is found', function () {
    it('should list the extensions tried, "view engine" first', function (done) {
      var views = viewsWith({})
      var app = createApp(views)
      app.set('view engine', 'md')
      app.set('view engines', ['tmpl', 'md', 'html'])

      app.render('page', function (err) {
        assert.strictEqual(
          err.message,
          'Failed to lookup view "page" in views directory "' + views + '" with extension ".md", ".tmpl" or ".html"'
        )
        assert.deepStrictEqual(err.view.extensions, ['.md', '.tmpl', '.html'])
        assert.strictEqual(err.view.ext, '')
        assert.strictEqual(err.view.path, undefined)
        done()
      })
    })

    it('should list several folders and extensions', function (done) {
      var first = viewsWith({})
      var second = viewsWith({})
      var app = createApp([first, second])
      app.set('view engines', ['tmpl', 'html'])

      failsWith(
        app,
        'page',
        'Failed to lookup view "page" in views directories "' +
          first +
          '" or "' +
          second +
          '" with extension ".tmpl" or ".html"',
        done
      )
    })

    it('should give the usual message for a name with a known extension', function (done) {
      var views = viewsWith({})
      var app = createApp(views)
      app.set('view engines', ['tmpl'])

      failsWith(app, 'page.html', 'Failed to lookup view "page.html" in views directory "' + views + '"', done)
    })

    it('should reach the error handler through res.render', function (done) {
      var app = createApp(viewsWith({}))
      app.set('view engines', ['tmpl'])

      app.get('/', function (req, res) {
        res.render('page')
      })
      app.use(function (err, req, res, next) {
        res.status(404).send(err.message)
      })

      request(app)
        .get('/')
        .expect(404, /with extension "\.tmpl"$/, done)
    })
  })

  describe('view cache', function () {
    it('should keep the view it found while the cache is on', function (done) {
      var views = viewsWith({ 'page.tmpl': 't' })
      var app = createApp(views)
      app.enable('view cache')
      app.set('view engines', ['html', 'tmpl'])

      rendersTo(app, 'page', 'tmpl:t', function (err) {
        if (err) return done(err)
        assert.strictEqual(app.cache.page.path, path.join(views, 'page.tmpl'))
        fs.writeFileSync(path.join(views, 'page.html'), 'h')
        rendersTo(app, 'page', 'tmpl:t', done)
      })
    })

    it('should look up again while the cache is off', function (done) {
      var views = viewsWith({ 'page.tmpl': 't' })
      var app = createApp(views)
      app.disable('view cache')
      app.set('view engines', ['html', 'tmpl'])

      rendersTo(app, 'page', 'tmpl:t', function (err) {
        if (err) return done(err)
        assert.strictEqual(app.cache.page, undefined)
        fs.writeFileSync(path.join(views, 'page.html'), 'h')
        rendersTo(app, 'page', 'html:h', done)
      })
    })

    it('should not cache a failed lookup', function (done) {
      var views = viewsWith({})
      var app = createApp(views)
      app.enable('view cache')
      app.set('view engines', ['tmpl'])

      app.render('page', function (err) {
        assert.ok(err)
        assert.strictEqual(app.cache.page, undefined)
        fs.writeFileSync(path.join(views, 'page.tmpl'), 't')
        rendersTo(app, 'page', 'tmpl:t', done)
      })
    })
  })
})
