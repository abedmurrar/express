'use strict'

/**
 * Module dependencies.
 */

const express = require('../..')
const sleep = require('node:timers/promises').setTimeout

module.exports = start

// Try it:
//   $ node examples/graceful-shutdown
//   $ curl -i http://localhost:3000/slow &
//   $ kill -TERM <pid>
// The slow response arrives whole, then the process exits with code 0.

function start(options) {
  const app = express()
  const responses = new Set() // the ones that aren't sent to the end yet
  let stopping = false

  // First, so it sees every request. While stopping, `Connection: close` makes
  // clients open their next connection to another instance.
  app.use(function (req, res, next) {
    if (stopping) res.set('Connection', 'close')
    responses.add(res)
    res.on('close', function () {
      responses.delete(res)
    })
    next()
  })

  // liveness: the process works, also while it is stopping
  app.get('/livez', function (req, res) {
    res.send('ok')
  })

  // readiness: the load balancer should send requests here
  app.get('/readyz', function (req, res) {
    res.status(stopping ? 503 : 200).send(stopping ? 'stopping' : 'ok')
  })

  app.get('/', function (req, res) {
    res.send('hello')
  })

  app.get('/slow', async function (req, res) {
    await sleep(2000)
    res.send('slow hello')
  })

  const server = app.listen(options.port)

  // Resolves to true when every response was sent, false when some were cut off
  // at the timeout.
  async function stop() {
    // /readyz answers 503 from now on
    stopping = true

    let timedOut = false
    const timer = setTimeout(function () {
      timedOut = true
      server.closeAllConnections()
    }, options.readinessDelay + options.timeout)

    // keep answering until the load balancer has seen the 503
    await sleep(options.readinessDelay)

    // Wait for the responses first: server.close() closes the connection of a
    // response that was ended but not written out to a slow client yet.
    while (responses.size > 0 && !timedOut) await sleep(50)

    // stop listening, and close the idle keep-alive connections
    await new Promise(function (resolve) {
      server.close(resolve)
      if (timedOut) server.closeAllConnections()
    })

    clearTimeout(timer)
    return !timedOut
  }

  return { app, server, stop }
}

if (require.main === module) {
  const { server, stop } = start({
    port: process.env.PORT || 3000,
    readinessDelay: 5000, // a few of the load balancer's health checks
    timeout: 20000 // and then at most this long for the last responses
  })

  server.on('listening', function () {
    console.log('Express started on port %d', server.address().port)
  })

  const shutdown = async function (signal) {
    console.log('%s: stopping', signal)
    const clean = await stop()
    // close database pools, queues and caches here
    console.log(clean ? 'stopped' : 'stopped, some responses were cut off')
    process.exitCode = clean ? 0 : 1
  }

  // once: a second signal ends the process at once, as it does without a handler
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
}
