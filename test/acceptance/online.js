'use strict'

var createApp = require('../../examples/online')
var request = require('supertest')

describe('online', function () {
  it('should list the users of the last 5 minutes, escaped', async function () {
    var users = new Map([['gone', Date.now() - 6 * 60 * 1000]])
    var app = createApp({
      zAdd: async function (key, member) {
        users.set(member.value, member.score)
      },
      zRemRangeByScore: async function (key, min, max) {
        users.forEach(function (score, value) {
          if (score >= min && score <= max) users.delete(value)
        })
      },
      zRange: async function () {
        return Array.from(users.keys())
      }
    })

    await request(app)
      .get('/')
      .set('User-Agent', '<script>alert(1)</script>')
      .expect(200, '<p>Users online: 1</p><ul><li>&lt;script&gt;alert(1)&lt;/script&gt;</li></ul>')
    await request(app)
      .get('/')
      .set('User-Agent', 'curl')
      .expect(200, '<p>Users online: 2</p><ul><li>&lt;script&gt;alert(1)&lt;/script&gt;</li><li>curl</li></ul>')
  })

  it('should pass a Redis error on', function (done) {
    var app = createApp({
      zAdd: async function () {
        throw new Error('no redis')
      }
    })
    app.set('env', 'test')

    request(app)
      .get('/')
      .expect(500, /no redis/, done)
  })
})
