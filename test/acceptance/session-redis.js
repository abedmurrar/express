'use strict'

var createApp = require('../../examples/session/redis')
var request = require('supertest')

describe('session/redis', function () {
  it('should keep the session in the Redis client it is given', async function () {
    var values = new Map()
    var app = createApp({
      get: async function (key) {
        return values.get(key) ?? null
      },
      set: async function (key, value) {
        values.set(key, value)
      },
      expire: async function () {}
    })

    var res = await request(app)
      .get('/')
      .expect(200, /First time.*viewed <strong>1<\/strong> times/)
    await request(app)
      .get('/')
      .set('Cookie', res.headers['set-cookie'][0].split(';')[0])
      .expect(200, '<p>viewed <strong>2</strong> times.</p>')

    if (values.size !== 1) throw new Error('expected one session, got ' + values.size)
  })
})
