'use strict'

// $ npm install --save-dev light-my-request
// $ node --test examples/testing-without-a-port/test.js

const test = require('node:test')
const assert = require('node:assert')
const inject = require('light-my-request')
const app = require('./index')

test('GET a user', async function () {
  const res = await inject(app, '/users/1')

  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8')
  assert.deepStrictEqual(res.json(), { id: '1', name: 'Tobi' })
})

test('GET a user that is not there', async function () {
  const res = await inject(app, '/users/99')

  assert.strictEqual(res.statusCode, 404)
})

test('POST JSON', async function () {
  // an object is sent as JSON, with its Content-Type
  const res = await inject(app, { method: 'POST', url: '/users', payload: { name: 'Loki' } })

  assert.strictEqual(res.statusCode, 201)
  assert.strictEqual(res.headers.location, '/users/2')
  assert.strictEqual(res.json().name, 'Loki')
})

test('cookies, behind an HTTPS proxy', async function () {
  const res = await inject(app, {
    method: 'POST',
    url: '/login',
    headers: { 'X-Forwarded-Proto': 'https' }
  })

  // a redirect is not followed
  assert.strictEqual(res.statusCode, 302)
  assert.deepStrictEqual(
    res.cookies.map((cookie) => ({ ...cookie })),
    [{ name: 'sid', value: 'abc', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]
  )
})

test('the client address, host and cookies', async function () {
  const res = await inject(app, {
    url: '/whoami',
    remoteAddress: '192.0.2.7',
    authority: 'example.com',
    cookies: { sid: 'abc' }
  })

  assert.deepStrictEqual(res.json(), {
    ip: '192.0.2.7',
    host: 'example.com',
    secure: false,
    cookie: 'sid=abc'
  })
})
