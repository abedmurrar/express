// Calls only strict mode rejects (left out of tsconfig.loose.json).

import express from 'express'

const app = express()

app.get('/', (req, res) => {
  // @ts-expect-error req.ip is undefined once the socket is gone
  const ip: string = req.ip
  // @ts-expect-error a header may be missing
  const length: number = req.get('content-length').length
  // @ts-expect-error a route parameter from a regular expression may be missing
  const first: string = req.params[0]
  // @ts-expect-error req.originalRoute is undefined until a route matches
  const route: string = req.originalRoute
  res.send(ip + length + first + route)
})
app.get(/^\/(\d+)$/, (req, res) => {
  // @ts-expect-error a RegExp route's parameters are indexed, so each may be missing
  const id: string = req.params[1]
  res.send(id)
})

// app.listRoutes() (a fork addition): an entry is a route or something mounted.
for (const route of app.listRoutes()) {
  // @ts-expect-error a mounted router or app has no methods
  void route.methods.length
  // @ts-expect-error a route has no router
  void route.router.listRoutes
  if (route.router !== undefined) {
    const methods: undefined = route.methods
    // @ts-expect-error one of another package may not have listRoutes()
    route.router.listRoutes()
    void methods
  }
}
