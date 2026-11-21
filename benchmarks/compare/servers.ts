// One server per framework and scenario, used by run.ts. Every framework
// gets the same work for a scenario, and run.ts checks each response before
// measuring, so the numbers compare like with like.
//
// Node 24 runs this file directly (type stripping), so there is no build
// step. `npm run typecheck` checks it with strict TypeScript.

import http from 'node:http'
import { Buffer } from 'node:buffer'
import { createRequire } from 'node:module'
import type { Express, NextFunction, Request, Response } from 'express'
import expressOriginal from 'express-original'
import Fastify from 'fastify'
import Koa from 'koa'
import Router from '@koa/router'
import { bodyParser } from '@koa/bodyparser'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import polkaFactory from 'polka'

declare module 'fastify' {
  interface FastifyRequest { hits: number }
}

export type Scenario = 'hello' | 'json' | 'params' | 'mw10' | 'routes100' | 'post-json' | 'not-found'

export const SCENARIOS: readonly Scenario[] = ['hello', 'json', 'params', 'mw10', 'routes100', 'post-json', 'not-found']

export interface Check {
  path: string
  method: 'GET' | 'POST'
  body?: string
  status: number
  // exact text, or a JSON value compared after parsing
  text?: string
  json?: unknown
}

export const PAYLOAD = { hello: 'world', n: 42, list: [1, 2, 3], nested: { a: true, b: 'x' } }
const POST_BODY = JSON.stringify({ user: 'tobi', tags: ['a', 'b'], n: 7 })

export const CHECKS: Record<Scenario, Check> = {
  hello: { path: '/', method: 'GET', status: 200, text: 'Hello World!' },
  json: { path: '/', method: 'GET', status: 200, json: PAYLOAD },
  params: { path: '/user/abc', method: 'GET', status: 200, text: 'abc' },
  mw10: { path: '/', method: 'GET', status: 200, text: 'Hello World!' },
  routes100: { path: '/r99/abc', method: 'GET', status: 200, text: 'abc' },
  'post-json': { path: '/echo', method: 'POST', body: POST_BODY, status: 200, json: JSON.parse(POST_BODY) },
  'not-found': { path: '/nope', method: 'GET', status: 404 }
}

type ExpressModule = typeof expressOriginal
type Start = (scenario: Scenario, port: number, dir?: string) => Promise<void>

const MIDDLEWARE = 10
const ROUTES = 100
const require = createRequire(import.meta.url)

function listen (server: http.Server, port: number): Promise<void> {
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve()))
}

function wantsHello (scenario: Scenario): boolean {
  return scenario === 'hello' || scenario === 'mw10'
}

// Express and Express-compatible trees: the original from npm, or this
// repository (at the base ref or the branch head) loaded from `dir`.
const express: Start = async (scenario, port, dir) => {
  const createApp: ExpressModule = dir === undefined ? expressOriginal : require(dir) as ExpressModule
  const app: Express = createApp()
  if (scenario === 'mw10') {
    for (let i = 0; i < MIDDLEWARE; i++) {
      app.use((req: Request, res: Response, next: NextFunction) => {
        res.locals.hits = (res.locals.hits as number | undefined ?? 0) + 1
        next()
      })
    }
  }
  if (scenario === 'routes100') {
    for (let i = 0; i < ROUTES; i++) app.get(`/r${i}/:id`, (req: Request<{ id: string }>, res: Response) => { res.send(req.params.id) })
  }
  if (scenario === 'params') app.get('/user/:id', (req: Request<{ id: string }>, res: Response) => { res.send(req.params.id) })
  if (scenario === 'json') app.get('/', (req: Request, res: Response) => { res.json(PAYLOAD) })
  if (scenario === 'post-json') app.post('/echo', createApp.json(), (req: Request, res: Response) => { res.json(req.body) })
  if (wantsHello(scenario)) app.get('/', (req: Request, res: Response) => { res.send('Hello World!') })
  // app.listen() is what most apps call, and what upstream PR #7555 optimises
  await new Promise<void>((resolve) => { app.listen(port, '127.0.0.1', () => resolve()) })
}

const fastify: Start = async (scenario, port) => {
  const app = Fastify()
  if (scenario === 'mw10') {
    app.decorateRequest('hits', 0)
    for (let i = 0; i < MIDDLEWARE; i++) app.addHook('onRequest', (req, reply, done) => { req.hits++; done() })
  }
  if (scenario === 'routes100') {
    for (let i = 0; i < ROUTES; i++) app.get<{ Params: { id: string } }>(`/r${i}/:id`, async (req) => req.params.id)
  }
  if (scenario === 'params') app.get<{ Params: { id: string } }>('/user/:id', async (req) => req.params.id)
  if (scenario === 'json') app.get('/', async () => PAYLOAD)
  if (scenario === 'post-json') app.post('/echo', async (req) => req.body)
  if (wantsHello(scenario)) app.get('/', async () => 'Hello World!')
  await app.listen({ port, host: '127.0.0.1' })
}

const koa: Start = async (scenario, port) => {
  const app = new Koa()
  const router = new Router()
  if (scenario === 'mw10') {
    for (let i = 0; i < MIDDLEWARE; i++) {
      app.use(async (ctx, next) => {
        ctx.state.hits = (ctx.state.hits as number | undefined ?? 0) + 1
        await next()
      })
    }
  }
  if (scenario === 'routes100') {
    for (let i = 0; i < ROUTES; i++) router.get(`/r${i}/:id`, (ctx) => { ctx.body = ctx.params.id })
  }
  if (scenario === 'params') router.get('/user/:id', (ctx) => { ctx.body = ctx.params.id })
  if (scenario === 'json') router.get('/', (ctx) => { ctx.body = PAYLOAD })
  if (scenario === 'post-json') router.post('/echo', bodyParser(), (ctx) => { ctx.body = ctx.request.body })
  if (wantsHello(scenario)) router.get('/', (ctx) => { ctx.body = 'Hello World!' })
  app.use(router.routes())
  await listen(http.createServer(app.callback()), port)
}

const hono: Start = async (scenario, port) => {
  const app = new Hono<{ Variables: { hits: number } }>()
  if (scenario === 'mw10') {
    for (let i = 0; i < MIDDLEWARE; i++) {
      app.use('*', async (c, next) => {
        c.set('hits', (c.get('hits') ?? 0) + 1)
        await next()
      })
    }
  }
  if (scenario === 'routes100') {
    for (let i = 0; i < ROUTES; i++) app.get(`/r${i}/:id`, (c) => c.text(c.req.param('id')))
  }
  if (scenario === 'params') app.get('/user/:id', (c) => c.text(c.req.param('id')))
  if (scenario === 'json') app.get('/', (c) => c.json(PAYLOAD))
  if (scenario === 'post-json') app.post('/echo', async (c) => c.json(await c.req.json<unknown>()))
  if (wantsHello(scenario)) app.get('/', (c) => c.text('Hello World!'))
  await new Promise<void>((resolve) => { serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => resolve()) })
}

interface PolkaState { hits?: number }

const polka: Start = async (scenario, port) => {
  const app = polkaFactory()
  const send = (res: http.ServerResponse, text: string, type = 'text/plain'): void => {
    res.setHeader('Content-Type', type)
    res.end(text)
  }
  if (scenario === 'mw10') {
    const state = new WeakMap<http.IncomingMessage, PolkaState>()
    for (let i = 0; i < MIDDLEWARE; i++) {
      app.use((req, res, next) => {
        const s = state.get(req) ?? {}
        s.hits = (s.hits ?? 0) + 1
        state.set(req, s)
        next()
      })
    }
  }
  if (scenario === 'routes100') {
    for (let i = 0; i < ROUTES; i++) app.get(`/r${i}/:id`, (req, res) => send(res, String(req.params.id)))
  }
  if (scenario === 'params') app.get('/user/:id', (req, res) => send(res, String(req.params.id)))
  if (scenario === 'json') app.get('/', (req, res) => send(res, JSON.stringify(PAYLOAD), 'application/json'))
  if (scenario === 'post-json') {
    // polka has no body parser of its own; it is built to take Express middleware
    app.post('/echo', expressOriginal.json() as unknown as polkaFactory.Middleware, (req, res) => {
      send(res, JSON.stringify((req as unknown as { body: unknown }).body), 'application/json')
    })
  }
  if (wantsHello(scenario)) app.get('/', (req, res) => send(res, 'Hello World!'))
  await new Promise<void>((resolve) => { app.listen(port, '127.0.0.1', () => resolve()) })
}

// A reference point: plain node:http doing the same work by hand.
const nodeHttp: Start = async (scenario, port) => {
  const routes = scenario === 'routes100' ? Array.from({ length: ROUTES }, (_, i) => new RegExp(`^/r${i}/([^/]+)$`)) : []
  const middleware = scenario === 'mw10' ? MIDDLEWARE : 0
  const text = (res: http.ServerResponse, body: string, type = 'text/plain'): void => {
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body) })
    res.end(body)
  }
  const server = http.createServer((req, res) => {
    const url = req.url ?? '/'
    const state: PolkaState = {}
    for (let i = 0; i < middleware; i++) state.hits = (state.hits ?? 0) + 1
    if (scenario === 'post-json' && req.method === 'POST' && url === '/echo') {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => text(res, JSON.stringify(JSON.parse(Buffer.concat(chunks).toString('utf8'))), 'application/json'))
      return
    }
    for (const re of routes) {
      const m = re.exec(url)
      if (m?.[1] !== undefined) return text(res, m[1])
    }
    const param = scenario === 'params' ? /^\/user\/([^/]+)$/.exec(url) : null
    if (param?.[1] !== undefined) return text(res, param[1])
    if (url === '/' && scenario === 'json') return text(res, JSON.stringify(PAYLOAD), 'application/json')
    if (url === '/' && wantsHello(scenario)) return text(res, 'Hello World!')
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  })
  await listen(server, port)
}

export const FRAMEWORKS = { express, fastify, koa, hono, polka, 'node-http': nodeHttp } satisfies Record<string, Start>
export type Framework = keyof typeof FRAMEWORKS
