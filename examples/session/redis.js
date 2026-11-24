'use strict'

// install redis first:
// https://redis.io/

// then:
// $ npm install redis connect-redis@10
// (connect-redis 11 is ES modules only)
// $ redis-server

/**
 * Module dependencies.
 */

var express = require('../..')
var logger = require('morgan')
var session = require('express-session')

var RedisStore = require('connect-redis').RedisStore

module.exports = createApp

// `client` is a connected client from the redis package (5 or later)

function createApp(client) {
  var app = express()

  if (require.main === module) app.use(logger('dev'))

  // Populates req.session
  app.use(
    session({
      resave: false, // don't save session if unmodified
      saveUninitialized: false, // don't create session until something stored
      secret: 'keyboard cat',
      store: new RedisStore({ client: client })
    })
  )

  app.get('/', function (req, res) {
    var body = ''
    if (req.session.views) {
      ++req.session.views
    } else {
      req.session.views = 1
      body += '<p>First time visiting? view this page in several browsers :)</p>'
    }
    res.send(body + '<p>viewed <strong>' + req.session.views + '</strong> times.</p>')
  })

  return app
}

/* istanbul ignore next */
if (require.main === module) {
  var client = require('redis').createClient()

  client.on('error', function (err) {
    console.error('Redis error:', err)
  })

  client.connect().then(function () {
    createApp(client).listen(3000)
    console.log('Express started on port 3000')
  })
}
