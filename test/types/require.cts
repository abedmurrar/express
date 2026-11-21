// `import express = require('express')`, as @types/express documents it. The
// types are members of the `express` namespace.

import express = require('express')

const app: express.Express = express()

app.get('/user/:id', (req: express.Request<{ id: string }>, res: express.Response, next: express.NextFunction) => {
  if (!req.params.id) return next()
  res.send(req.params.id)
})

const handler: express.RequestHandler = (_req, _res, next) => next()
const onError: express.ErrorRequestHandler = (err, _req, res, _next) => {
  res.status(500).send(String(err))
}
const router: express.Router = express.Router()
const options: express.RouterOptions = { strict: true }
const cookie: express.CookieOptions = { httpOnly: true }
const parsers: express.BodyParserHandler[] = [express.json(), express.raw(), express.text(), express.urlencoded()]
const jsonOptions: express.OptionsJson = { strict: true }
const staticOptions: express.ServeStaticOptions = { index: ['index.html'] }
const sendOptions: express.SendFileOptions = { root: '/srv', headers: { 'x-a': 1 } }
const downloadOptions: express.DownloadOptions = { maxAge: '1h' }
const params: express.ParamsDictionary = { id: '1' }
const query: express.Query = { a: 'b', list: ['c', 'd'], nested: { e: 'f' } }
const pathParams: express.PathParams = ['/a', /b/]
const routeParams: express.RouteParameters<'/a/:b/*c'> = { b: 'x', c: ['y', 'z'] }
const mediaTypes: express.MediaType[] = express.request.accepted

app.use(handler, router, onError)

void [options, cookie, parsers, jsonOptions, staticOptions, sendOptions, downloadOptions, params, query]
void [pathParams, routeParams, mediaTypes]
