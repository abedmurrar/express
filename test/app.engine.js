'use strict'

var assert = require('node:assert')
var express = require('../'),
  fs = require('node:fs')
var os = require('node:os')
var path = require('node:path')

function render(path, options, fn) {
  fs.readFile(path, 'utf8', function (err, str) {
    if (err) return fn(err)
    str = str.replace('{{user.name}}', options.user.name)
    fn(null, str)
  })
}

describe('app', function () {
  describe('.engine(ext, fn)', function () {
    it('should map a template engine', function (done) {
      var app = express()

      app.set('views', path.join(__dirname, 'fixtures'))
      app.engine('.html', render)
      app.locals.user = { name: 'tobi' }

      app.render('user.html', function (err, str) {
        if (err) return done(err)
        assert.strictEqual(str, '<p>tobi</p>')
        done()
      })
    })

    it('should throw when the callback is missing', function () {
      var app = express()
      assert.throws(function () {
        app.engine('.html', null)
      }, /callback function required/)
    })

    it('should work without leading "."', function (done) {
      var app = express()

      app.set('views', path.join(__dirname, 'fixtures'))
      app.engine('html', render)
      app.locals.user = { name: 'tobi' }

      app.render('user.html', function (err, str) {
        if (err) return done(err)
        assert.strictEqual(str, '<p>tobi</p>')
        done()
      })
    })

    it('should work "view engine" setting', function (done) {
      var app = express()

      app.set('views', path.join(__dirname, 'fixtures'))
      app.engine('html', render)
      app.set('view engine', 'html')
      app.locals.user = { name: 'tobi' }

      app.render('user', function (err, str) {
        if (err) return done(err)
        assert.strictEqual(str, '<p>tobi</p>')
        done()
      })
    })

    it('should work "view engine" with leading "."', function (done) {
      var app = express()

      app.set('views', path.join(__dirname, 'fixtures'))
      app.engine('.html', render)
      app.set('view engine', '.html')
      app.locals.user = { name: 'tobi' }

      app.render('user', function (err, str) {
        if (err) return done(err)
        assert.strictEqual(str, '<p>tobi</p>')
        done()
      })
    })

    // Not from upstream: the fork matches the extension to a registered engine
    // ignoring case (#4594). File names keep their case, so lookups don't
    // depend on whether the file system ignores case.
    describe('extension case (fork)', function () {
      var dirs = []

      // a views directory holding one file with the given name
      function viewsWith(name) {
        var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'express-engine-case-'))
        fs.writeFileSync(path.join(dir, name), 'x')
        dirs.push(dir)
        return dir
      }

      // an engine that renders its name and the file it was given
      function named(name) {
        return function (file, options, fn) {
          fn(null, name + ' ' + path.basename(file))
        }
      }

      after(function () {
        dirs.forEach(function (dir) {
          fs.rmSync(dir, { recursive: true })
        })
      })

      it('should match an engine registered in uppercase', function (done) {
        var app = express()

        app.set('views', path.join(__dirname, 'fixtures'))
        app.engine('HTML', render)
        app.locals.user = { name: 'tobi' }

        app.render('user.html', function (err, str) {
          if (err) return done(err)
          assert.strictEqual(str, '<p>tobi</p>')
          done()
        })
      })

      it('should match a file extension in uppercase, keeping the file name', function (done) {
        var app = express()

        app.set('views', viewsWith('page.HTML'))
        app.engine('html', named('html'))

        app.render('page.HTML', function (err, str) {
          if (err) return done(err)
          assert.strictEqual(str, 'html page.HTML')
          done()
        })
      })

      it('should match "view engine" set in another case than the engine', function (done) {
        var app = express()

        app.set('views', path.join(__dirname, 'fixtures'))
        app.engine('Html', render)
        app.set('view engine', 'html')
        app.locals.user = { name: 'tobi' }

        app.render('user', function (err, str) {
          if (err) return done(err)
          assert.strictEqual(str, '<p>tobi</p>')
          done()
        })
      })

      it('should add "view engine" to the file name in its own case', function (done) {
        var app = express()

        app.set('views', viewsWith('page.Html'))
        app.engine('html', named('html'))
        app.set('view engine', 'Html')

        app.render('page', function (err, str) {
          if (err) return done(err)
          assert.strictEqual(str, 'html page.Html')
          done()
        })
      })

      it('should prefer the engine registered in the same case', function (done) {
        var app = express()

        app.set('views', [path.join(__dirname, 'fixtures'), viewsWith('page.HTML')])
        app.engine('html', named('lower'))
        app.engine('HTML', named('upper'))

        app.render('user.html', function (err, str) {
          if (err) return done(err)
          assert.strictEqual(str, 'lower user.html')

          app.render('page.HTML', function (err, str) {
            if (err) return done(err)
            assert.strictEqual(str, 'upper page.HTML')
            done()
          })
        })
      })

      it('should not add the extension to app.engines', function (done) {
        var app = express()

        app.set('views', path.join(__dirname, 'fixtures'))
        app.engine('HTML', named('upper'))

        app.render('user.html', function (err) {
          if (err) return done(err)
          assert.deepStrictEqual(Object.keys(app.engines), ['.HTML'])
          done()
        })
      })

      it('should match an engine a sub app inherits, after its own', function (done) {
        var app = express()
        var blog = express()
        var admin = express()

        blog.set('views', path.join(__dirname, 'fixtures'))
        admin.set('views', path.join(__dirname, 'fixtures'))
        app.engine('HTML', named('parent'))
        admin.engine('Html', named('admin'))
        app.use('/blog', blog)
        app.use('/admin', admin)

        blog.render('user.html', function (err, str) {
          if (err) return done(err)
          assert.strictEqual(str, 'parent user.html')

          admin.render('user.html', function (err, str) {
            if (err) return done(err)
            assert.strictEqual(str, 'admin user.html')
            done()
          })
        })
      })

      it('should skip an empty entry in another case', function (done) {
        var app = express()

        app.set('views', path.join(__dirname, 'fixtures'))
        app.engines['.HTML'] = undefined
        app.engine('Html', named('mixed'))

        app.render('user.html', function (err, str) {
          if (err) return done(err)
          assert.strictEqual(str, 'mixed user.html')
          done()
        })
      })

      it('should still load the module when no engine matches', function (done) {
        var app = express()

        app.set('views', path.join(__dirname, 'fixtures'))
        app.engine('tmpl', named('tmpl'))
        app.locals.user = { name: 'tobi' }

        app.render('user.ejs', function (err, str) {
          if (err) return done(err)
          assert.strictEqual(str, '<p>tobi</p>')
          assert.strictEqual(typeof app.engines['.ejs'], 'function')
          done()
        })
      })
    })
  })
})
