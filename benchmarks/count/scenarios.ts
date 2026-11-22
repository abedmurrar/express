// The Express apps that the instruction counter drives, one per scenario.
// They match the Express servers in benchmarks/compare/servers.ts, so both
// benchmarks measure the same work: the throughput one over real sockets,
// this one in-process (see worker.ts).

import type { IncomingMessage, ServerResponse } from 'node:http'

export type Scenario = 'hello' | 'json' | 'params' | 'mw10' | 'routes100' | 'post-json' | 'not-found' | 'query'

export const SCENARIOS: readonly Scenario[] = [
  'hello',
  'json',
  'params',
  'mw10',
  'routes100',
  'post-json',
  'not-found',
  'query'
]

export interface Request {
  method: 'GET' | 'POST'
  path: string
  body?: string
  // what the first response must look like, so a scenario that answers
  // differently fails instead of measuring something else
  status: number
  text?: string
}

export const PAYLOAD = { hello: 'world', n: 42, list: [1, 2, 3], nested: { a: true, b: 'x' } }
const POST_BODY = JSON.stringify({ user: 'tobi', tags: ['a', 'b'], n: 7 })
// a flat query string, read with the extended ("qs") query parser
export const QUERY = 'q=express+router&page=2&sort=desc&limit=20&tag=a&tag=b'
export const QUERY_RESULT = { q: 'express router', page: '2', sort: 'desc', limit: '20', tag: ['a', 'b'] }

export const REQUESTS: Record<Scenario, Request> = {
  hello: { method: 'GET', path: '/', status: 200, text: 'Hello World!' },
  json: { method: 'GET', path: '/', status: 200, text: JSON.stringify(PAYLOAD) },
  params: { method: 'GET', path: '/user/abc', status: 200, text: 'abc' },
  mw10: { method: 'GET', path: '/', status: 200, text: 'Hello World!' },
  routes100: { method: 'GET', path: '/r99/abc', status: 200, text: 'abc' },
  'post-json': { method: 'POST', path: '/echo', body: POST_BODY, status: 200, text: POST_BODY },
  'not-found': { method: 'GET', path: '/nope', status: 404 },
  query: { method: 'GET', path: `/search?${QUERY}`, status: 200, text: JSON.stringify(QUERY_RESULT) }
}

// The parts of Express these apps use. The harness loads Express from a
// directory at run time, so it has no type package to import.
export interface ExpressRequest extends IncomingMessage {
  params: Record<string, string>
  body: unknown
  query: unknown
}

export interface ExpressResponse extends ServerResponse {
  locals: Record<string, unknown>
  send(body: string): void
  json(body: unknown): void
}

type Handler = (req: ExpressRequest, res: ExpressResponse, next: () => void) => void

export interface App {
  (req: IncomingMessage, res: ServerResponse): void
  set(setting: string, value: unknown): void
  use(handler: Handler): void
  get(path: string, ...handlers: Handler[]): void
  post(path: string, ...handlers: Handler[]): void
}

export interface ExpressModule {
  (): App
  json(): Handler
}

const MIDDLEWARE = 10
const ROUTES = 100

export function createApp(express: ExpressModule, scenario: Scenario): App {
  const app = express()
  if (scenario === 'mw10') {
    for (let i = 0; i < MIDDLEWARE; i++) {
      app.use((req, res, next) => {
        res.locals.hits = ((res.locals.hits as number | undefined) ?? 0) + 1
        next()
      })
    }
  }
  if (scenario === 'routes100') {
    for (let i = 0; i < ROUTES; i++) {
      app.get(`/r${i}/:id`, (req, res) => {
        res.send(req.params.id as string)
      })
    }
  }
  if (scenario === 'params') {
    app.get('/user/:id', (req, res) => {
      res.send(req.params.id as string)
    })
  }
  if (scenario === 'json') {
    app.get('/', (req, res) => {
      res.json(PAYLOAD)
    })
  }
  if (scenario === 'post-json') {
    app.post('/echo', express.json(), (req, res) => {
      res.json(req.body)
    })
  }
  if (scenario === 'query') {
    app.set('query parser', 'extended')
    app.get('/search', (req, res) => {
      res.json(req.query)
    })
  }
  if (scenario === 'hello' || scenario === 'mw10') {
    app.get('/', (req, res) => {
      res.send('Hello World!')
    })
  }
  return app
}
