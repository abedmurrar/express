// Calls the types must reject, in strict and in loose mode. tsc fails if the
// line after an expected-error comment is not an error.

import express, { type Request, type Response } from 'express'

const app = express()

// @ts-expect-error a status code is a number
app.get('/', (_req, res) => res.status('200'))
// @ts-expect-error a redirect needs a URL
app.get('/', (_req, res) => res.redirect(301))
// @ts-expect-error a cookie's sameSite is a boolean or 'lax', 'strict' or 'none'
app.get('/', (_req, res) => res.cookie('a', 'b', { sameSite: 'sometimes' }))
// @ts-expect-error dotfiles is 'allow', 'deny' or 'ignore'
app.get('/', (_req, res) => res.sendFile('/x', { dotfiles: 'maybe' }))
// @ts-expect-error a body size limit is a number or a string
app.use(express.json({ limit: true }))
// @ts-expect-error depth is a number
app.use(express.urlencoded({ depth: '3' }))
// @ts-expect-error express.static needs a root
app.use(express.static())
// @ts-expect-error caseSensitive is a boolean
express.Router({ caseSensitive: 'yes' })
// @ts-expect-error a route needs its path
new express.Route()
// @ts-expect-error a number is not middleware
app.use(42)
// @ts-expect-error req.get needs a header name
app.get('/', (req) => req.get())
// @ts-expect-error a path parameter is a string
app.get('/users/:id', (req) => req.params.id.toFixed())
// @ts-expect-error the path has no :name parameter
app.get('/users/:id', (req) => req.params.name)

function typed(
  req: Request<{ id: string }, { ok: boolean }, { name: string }>,
  res: Response<{ ok: boolean }, { user: string }>
) {
  // @ts-expect-error the typed body has no age
  void req.body.age
  // @ts-expect-error locals.user is a string
  res.locals.user.toFixed()
  // @ts-expect-error the response body is { ok: boolean }
  res.json({ ok: 'yes' })
}
void typed
