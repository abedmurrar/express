// The global `Express` namespace: middleware and apps add members to
// Express.Request, Express.Response, Express.Locals and Express.Application,
// and every request, response and app type picks them up.

import express, { type Request, type RequestHandler, type Response } from 'express'

declare global {
  namespace Express {
    interface Request {
      requestId: string
    }
    interface Response {
      sendError(status: number, message: string): this
    }
    interface Locals {
      csrfToken?: string
    }
    interface Application {
      startedAt: Date
    }
  }
}

const app = express()
app.startedAt = new Date()

const tagRequests: RequestHandler = (req, res, next) => {
  req.requestId = 'abc'
  res.locals.csrfToken = 'token'
  next()
}
app.use(tagRequests)

app.get('/whoami/:id', (req, res) => {
  const id: string = req.requestId
  const token: string | undefined = res.locals.csrfToken
  res.sendError(404, id + token + req.params.id)
})

function plain(req: Request, res: Response) {
  return req.requestId + res.locals.csrfToken + req.app.startedAt.toISOString()
}
void plain
