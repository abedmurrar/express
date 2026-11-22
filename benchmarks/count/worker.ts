// Sends one scenario's request to an Express app a fixed number of times, then
// exits. run.ts runs it under `perf stat` or valgrind, which count the
// instructions of the whole process. Based on bench/count-worker.js in the
// objection.js fork (github.com/abedmurrar/objection.js).
//
//   node worker.ts <scenario> <express directory> <requests>
//
// There is no network: each request is a real http.IncomingMessage and
// http.ServerResponse, as Node's HTTP server would create them, on an
// in-memory socket that throws the bytes away. So the counts don't depend on
// the kernel, the loopback interface or how the bytes arrive, and every run
// does the same work. Only Node's HTTP parser is left out, which Express
// doesn't change.

import { Buffer } from 'node:buffer'
import { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import { Duplex } from 'node:stream'
import { createApp, REQUESTS, SCENARIOS } from './scenarios.ts'
import type { App, ExpressModule, Request, Scenario } from './scenarios.ts'

// The bytes of the first response, to check it.
let written: Buffer[] | null = []

// One keep-alive connection for all the requests, as a client sending them one
// after another would use.
const socket = new Duplex({
  read() {},
  write(chunk: Buffer, encoding, callback) {
    written?.push(chunk)
    callback()
  }
})

function send(app: App, request: Request): Promise<void> {
  const req = new IncomingMessage(socket as never)
  req.method = request.method
  req.url = request.path
  req.httpVersion = '1.1'
  req.httpVersionMajor = 1
  req.httpVersionMinor = 1
  req.headers = { host: 'localhost' }
  req.rawHeaders = ['Host', 'localhost']
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    // a new string from the bytes, as Node's parser makes for each request
    req.headers[name] = Buffer.from(value, 'latin1').toString('latin1')
    req.rawHeaders.push(name, value)
  }
  if (request.body !== undefined) {
    const length = String(Buffer.byteLength(request.body))
    req.headers['content-type'] = 'application/json'
    req.headers['content-length'] = length
    req.rawHeaders.push('Content-Type', 'application/json', 'Content-Length', length)
    req.push(request.body)
  }
  // What Node's parser does at the end of a message.
  req.complete = true
  req.push(null)

  const res = new ServerResponse(req)
  res.shouldKeepAlive = true
  res.assignSocket(socket as never)
  return new Promise((resolve) => {
    res.on('finish', () => {
      res.detachSocket(socket as never)
      resolve()
    })
    app(req, res)
  })
}

function check(scenario: Scenario, request: Request, bytes: Buffer[]): void {
  const response = Buffer.concat(bytes).toString('utf8')
  const end = response.indexOf('\r\n\r\n')
  const status = Number(response.slice('HTTP/1.1 '.length, 'HTTP/1.1 '.length + 3))
  const body = response.slice(end + 4)
  if (end === -1 || status !== request.status || (request.text !== undefined && body !== request.text)) {
    throw new Error(`${scenario}: unexpected response:\n${response}`)
  }
}

async function main(): Promise<void> {
  const [scenario, dir, count] = process.argv.slice(2)
  if (!SCENARIOS.includes(scenario as Scenario) || dir === undefined || count === undefined) {
    throw new Error('Usage: node worker.ts <scenario> <express directory> <requests>')
  }
  const name = scenario as Scenario
  const request = REQUESTS[name]
  const express = createRequire(import.meta.url)(path.resolve(dir)) as ExpressModule
  const app = createApp(express, name)
  const n = Number(count)

  for (let i = 0; i < n; i++) {
    await send(app, request)
    if (written !== null) {
      check(name, request, written)
      written = null
    }
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`)
  process.exit(1)
})
