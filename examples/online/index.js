'use strict'

// install redis first:
// https://redis.io/

// then:
// $ npm install redis
// $ redis-server

/**
 * Module dependencies.
 */

var escapeHtml = require('escape-html')
var express = require('../..')

module.exports = createApp

var MINUTE = 60 * 1000

// `db` is a connected client from the redis package (4 or later)

function createApp(db) {
  var app = express()

  // activity tracking: a sorted set of users, scored by the time each was last
  // seen. In this case using the UA string, you would use req.user.id etc

  app.use(async function (req, res, next) {
    await db.zAdd('online', { score: Date.now(), value: req.get('User-Agent') || 'unknown' })
    next()
  })

  // List helper. The User-Agent is whatever the client sent, so it's escaped.

  function list(ids) {
    return (
      '<ul>' +
      ids
        .map(function (id) {
          return '<li>' + escapeHtml(id) + '</li>'
        })
        .join('') +
      '</ul>'
    )
  }

  // GET users online in the last 5 minutes, and forget the others

  app.get('/', async function (req, res) {
    await db.zRemRangeByScore('online', 0, Date.now() - 5 * MINUTE)
    var ids = await db.zRange('online', 0, -1)
    res.send('<p>Users online: ' + ids.length + '</p>' + list(ids))
  })

  return app
}

/* istanbul ignore next */
if (require.main === module) {
  var db = require('redis').createClient()

  db.on('error', function (err) {
    console.error('Redis error:', err)
  })

  db.connect().then(function () {
    createApp(db).listen(3000)
    console.log('Express started on port 3000')
  })
}
