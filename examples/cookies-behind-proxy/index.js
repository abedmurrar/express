'use strict'

/**
 * Module dependencies.
 */

const express = require('../..')
const session = require('express-session')

const app = (module.exports = express())

// The proxy that ends HTTPS runs on this machine, and sets X-Forwarded-Proto
// on every request. List the real addresses of yours instead.
app.set('trust proxy', 'loopback')

// express-session sets a `secure` cookie only when the request is HTTPS, which
// it reads from req.secure, so it needs the `trust proxy` line above.
app.use(
  session({
    name: '__Host-sid',
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: true, sameSite: 'lax' }
  })
)

app.get('/', function (req, res) {
  req.session.views = (req.session.views || 0) + 1
  res.json({ secure: req.secure, views: req.session.views })
})

// res.cookie() sends what it is told, over HTTP too
app.get('/theme', function (req, res) {
  res.cookie('__Host-theme', 'dark', { secure: true, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 })
  res.send('ok')
})

// the options must match those the cookie was set with
app.get('/theme/reset', function (req, res) {
  res.clearCookie('__Host-theme', { secure: true, sameSite: 'lax' })
  res.send('ok')
})

/* istanbul ignore next */
if (require.main === module) {
  app.listen(3000)
  console.log('Express started on port 3000')
}
