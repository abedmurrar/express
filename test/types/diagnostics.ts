// The diagnostics_channel payloads (a fork addition): subscribers typed with
// express.RouterTraceContext and express.InitializationMessage, the way
// docs/api/diagnostics.md uses them.

import dc from 'node:diagnostics_channel'
import express, { type Express, type Request, type Response } from 'express'

const channel = dc.tracingChannel<unknown, express.RouterTraceContext>('express.router.request')

channel.subscribe({
  start(ctx) {
    const req: Request = ctx.req
    const res: Response = ctx.res
    const name: string = ctx.layer.name
    const route: string | RegExp | undefined = ctx.route
    const param: string | undefined = ctx.param
    const handlerName: string = ctx.handler.name
    const errorHandler: true | undefined = ctx.errorHandler
    const incoming: unknown = ctx.incomingError
    void [req, res, name, route, param, handlerName, errorHandler, incoming]
  },
  end(ctx) {
    const result: unknown = ctx.result
    void result
  },
  asyncStart() {},
  asyncEnd(ctx) {
    const status: number = ctx.res.statusCode
    const pattern: string | undefined = ctx.req.originalRoute
    void [status, pattern]
  },
  error(ctx) {
    const error: unknown = ctx.error
    void error
  }
})

dc.subscribe('express.initialization', (message) => {
  const { app } = message as express.InitializationMessage
  const typed: Express = app
  typed.disable('x-powered-by')
})

function onStart(ctx: express.RouterTraceContext): void {
  // @ts-expect-error the context's request is read, not replaced with something else
  ctx.req = 42
  // @ts-expect-error errorHandler is only ever true
  ctx.errorHandler = false
  // @ts-expect-error route is a pattern, not a number
  const route: number = ctx.route
  void route
}
void onStart

// @ts-expect-error an initialization message carries the app
const empty: express.InitializationMessage = {}
void empty
