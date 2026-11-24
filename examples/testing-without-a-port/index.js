'use strict'

/**
 * Module dependencies.
 */

const express = require('../..')

const app = (module.exports = express())

app.set('trust proxy', 'loopback')
app.use(express.json())

const users = new Map([['1', { id: '1', name: 'Tobi' }]])

app.get('/users/:id', function (req, res) {
  const user = users.get(req.params.id)
  if (!user) return res.status(404).json({ error: 'no such user' })
  res.json(user)
})

app.post('/users', function (req, res) {
  const user = { id: String(users.size + 1), name: req.body.name }
  users.set(user.id, user)
  res
    .status(201)
    .location('/users/' + user.id)
    .json(user)
})

app.post('/login', function (req, res) {
  res.cookie('sid', 'abc', { httpOnly: true, sameSite: 'lax', secure: req.secure })
  res.redirect('/')
})

app.get('/whoami', function (req, res) {
  res.json({ ip: req.ip, host: req.host, secure: req.secure, cookie: req.get('Cookie') })
})

/* istanbul ignore next */
if (!module.parent) {
  app.listen(3000)
  console.log('Express started on port 3000')
}
