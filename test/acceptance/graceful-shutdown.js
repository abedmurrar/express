'use strict'

var assert = require('node:assert')
var Buffer = require('node:buffer').Buffer
var childProcess = require('node:child_process')
var http = require('node:http')
var net = require('node:net')
var once = require('node:events').once
var path = require('node:path')
var sleep = require('node:timers/promises').setTimeout

var start = require('../../examples/graceful-shutdown')

describe('graceful-shutdown', function () {
  it('should answer 503 on /readyz, and keep answering with Connection: close, until it stops', async function () {
    var example = await listen({ readinessDelay: 2000, timeout: 5000 }) // time for three requests on a busy machine
    var agent = new http.Agent({ keepAlive: true })
    var port = example.server.address().port

    assert.deepStrictEqual(await get(example, '/readyz', agent), [200, 'ok', 'keep-alive'])

    var stopped = example.stop()

    assert.deepStrictEqual(await get(example, '/readyz', agent), [503, 'stopping', 'close'])
    assert.deepStrictEqual(await get(example, '/livez', agent), [200, 'ok', 'close'])
    assert.deepStrictEqual(await get(example, '/', agent), [200, 'hello', 'close'])
    assert.strictEqual(await stopped, true)
    await assert.rejects(request(port, '/'), { code: 'ECONNREFUSED' })
    agent.destroy()
  })

  it('should wait for the responses in progress, and close their kept-alive connections', async function () {
    var example = await listen({ readinessDelay: 0, timeout: 5000 })
    var agent = new http.Agent({ keepAlive: true })
    var received = once(example.server, 'request')
    var response = get(example, '/slow', agent)
    await received

    var stopped = example.stop()

    assert.deepStrictEqual(await response, [200, 'slow hello', 'keep-alive'])
    // not after the 5 seconds of keepAliveTimeout
    var before = Date.now()
    assert.strictEqual(await stopped, true)
    assert.ok(Date.now() - before < 2000)
    agent.destroy()
  })

  it('should send a large response to a slow client to its end', async function () {
    var example = await listen({ readinessDelay: 0, timeout: 8000 })
    var size = 20e6
    example.app.get('/large', function (req, res) {
      res.send(Buffer.alloc(size, 'a'))
    })

    var client = net.connect(example.server.address().port, '127.0.0.1')
    client.write('GET /large HTTP/1.1\r\nHost: localhost\r\n\r\n')
    var received = 0
    client.on('data', function (chunk) {
      received += chunk.length
      client.pause()
      setTimeout(function () {
        client.resume()
      }, 1)
    })
    await once(client, 'data')

    assert.strictEqual(await example.stop(), true)
    if (!client.closed) await once(client, 'close')
    assert.ok(received > size, 'received ' + received)
  })

  it('should cut off what is left at the timeout', async function () {
    var example = await listen({ readinessDelay: 0, timeout: 300 })
    example.app.get('/never', function () {})
    var received = once(example.server, 'request')
    var response = get(example, '/never')
    response.catch(function () {})
    await received

    assert.strictEqual(await example.stop(), false)
    await assert.rejects(response, { code: 'ECONNRESET' })
  })

  // Windows has no SIGTERM handlers: a kill ends the process at once
  var onSignals = process.platform === 'win32' ? it.skip : it

  onSignals(
    'should stop on SIGTERM with exit code 0, after the response in progress',
    async function () {
      var child = childProcess.spawn(process.execPath, [path.join(__dirname, '../../examples/graceful-shutdown')], {
        env: { ...process.env, PORT: '0' },
        stdio: ['ignore', 'pipe', 'inherit']
      })
      var output = ''
      child.stdout.setEncoding('utf8').on('data', function (str) {
        output += str
      })
      while (!/port \d+/.test(output)) await once(child.stdout, 'data')

      var port = Number(/port (\d+)/.exec(output)[1])
      var response = request(port, '/slow')
      // answered after the process has accepted /slow, which was sent first
      await request(port, '/livez')
      await sleep(200)
      child.kill('SIGTERM')

      assert.deepStrictEqual(await response, [200, 'slow hello', 'keep-alive'])
      assert.deepStrictEqual(await once(child, 'exit'), [0, null])
      assert.match(output, /SIGTERM: stopping\nstopped\n$/)
    },
    30000
  )
})

async function listen(options) {
  var example = start({ port: 0, ...options })
  await once(example.server, 'listening')
  return example
}

function get(example, url, agent) {
  return request(example.server.address().port, url, agent)
}

function request(port, url, agent) {
  return new Promise(function (resolve, reject) {
    http
      .get({ host: '127.0.0.1', port, path: url, agent }, function (res) {
        var body = ''
        res.setEncoding('utf8')
        res.on('data', function (str) {
          body += str
        })
        res.on('end', function () {
          resolve([res.statusCode, body, res.headers.connection])
        })
      })
      .on('error', reject)
  })
}
