---
title: Diagnostics channels
description: The diagnostics_channel events Express publishes, when each fires, and what it carries.
---

# Diagnostics channels

Express publishes events on Node.js [`diagnostics_channel`](https://nodejs.org/api/diagnostics_channel.html),
so APMs, tracers and loggers can observe an app without patching it. This is a fork addition, not in
Express 5.3.0.

| Channel | Kind | Fires | Payload |
|---|---|---|---|
| `express.router.request` | [`TracingChannel`](https://nodejs.org/api/diagnostics_channel.html#class-tracingchannel) | for every middleware, route handler, error handler and `app.param()` callback the router runs | [the trace context](#the-trace-context) |
| `express.initialization` | channel | once per `express()` call, sub-apps included, after the app is set up and before it is returned | `{ app }` |

Nothing is published, and no payload is built, unless the channel has subscribers: with none, each
handler costs one `hasSubscribers` check. A subscriber that throws doesn't break the request:
`diagnostics_channel` calls each subscriber in a `try`/`catch` and rethrows its error on the next tick,
as an uncaught exception, while the app answers as it would without it.

The start and end of the whole request are Node's own channels, `http.server.request.start` and
`http.server.response.finish` (with `request`, `response`, `socket` and `server`), so Express doesn't
publish them again.

## express.router.request

The same `TracingChannel`, with the same context, as router 2.3.0 (pillarjs/router#196 and the
releases after it), so a subscriber written for Express 5 with router 2.3.0 works unchanged. Subscribe
with `tracingChannel('express.router.request')`; the channel names are
`tracing:express.router.request:start`, `:end`, `:asyncStart`, `:asyncEnd` and `:error`.

::: code-group

```js [index.cjs]
const dc = require('node:diagnostics_channel');

dc.tracingChannel('express.router.request').subscribe({
  start(ctx) {
    ctx.startTime = process.hrtime.bigint();
  },
  end(ctx) {},
  asyncStart(ctx) {},
  asyncEnd(ctx) {},
  error(ctx) {
    console.error('%s failed in %s:', ctx.req.originalUrl, ctx.handler.name || '<anonymous>', ctx.error);
  }
});
```

```ts [index.ts]
import dc from 'node:diagnostics_channel';
import type { RouterTraceContext } from 'express';

dc.tracingChannel<unknown, RouterTraceContext>('express.router.request').subscribe({
  start(ctx) {},
  end(ctx) {},
  asyncStart(ctx) {},
  asyncEnd(ctx) {
    console.log('%s %s -> %d', ctx.req.method, ctx.req.originalRoute ?? ctx.req.originalUrl, ctx.res.statusCode);
  },
  error(ctx) {}
});
```

:::

### The events

Each handler the router runs is one trace, and each trace publishes, on the same context object:

| Event | When |
|---|---|
| `start` | right before the handler is called. Stores bound with `start.bindStore()` are active while it runs, and in everything it calls, `next()` included. |
| `end` | when the handler returns or throws. For a handler that doesn't return a promise, this is the last event (`result` or `error` is set). |
| `asyncStart` | when the promise the handler returned settles. `result` is set if it resolved. |
| `asyncEnd` | right after `asyncStart`, with the stores bound with `asyncStart.bindStore()` active. |
| `error` | when the handler reports an error: it calls `next(err)`, throws, or its promise rejects. Published as soon as it happens, so `next(err)` publishes it before `end`, and before the error handler it leads to runs. |

`next()` usually runs the next handler before the current one returns, so traces nest: for
`app.use(logger)` and `app.get('/', show)`, a request publishes `start logger`, `start show`,
`end show`, `end logger`. A promise-returning handler publishes `start`, `end`, then `asyncStart` and
`asyncEnd` once its promise settles.

What runs is traced:

- middleware (`app.use(fn)`, `router.use(fn)`), with `route` the path it was mounted with (`'/'` by default);
- each handler of a route (`app.get('/users/:id', a, b)` is two traces), with `route` the route's path;
- error handlers (four arguments), with `errorHandler: true` and the error they received in `incomingError`;
- `app.param()` and `router.param()` callbacks, with `param` the parameter's name and `route` the path of the
  route or middleware whose parameter it is. A parameter whose callbacks already ran for the same value is
  not traced again;
- a mounted router or sub-app is middleware: its mount is one trace (`layer.name` is `'router'` for a
  router and `'mounted_app'` for an app, `route` the mount path), and the handlers inside it are traced
  inside it.

What doesn't run isn't traced: a layer whose path doesn't match, a route whose method doesn't, a normal
handler while an error is pending, or an error handler while none is. A request no handler matches (a
404 from an app with no middleware) publishes nothing.

### The trace context

| Property | Value |
|---|---|
| `req` | the request, as the handler gets it (`req.baseUrl`, `req.params` and `req.route` are the handler's). |
| `res` | the response. |
| `handler` | the function called: the middleware, route handler, error handler, or the `app.param()` callback. |
| `layer` | the router's layer for it (`layer.name` is the handler's name, or `'<anonymous>'`). For a parameter callback, the layer of the route or middleware whose parameter it is. The layer is internal: its other properties may change between releases, so read them defensively. |
| `route` | the path pattern that matched: `'/users/:id'` for a route handler, the mount path for middleware, a router or a sub-app. For a path array, the entry that matched; for a RegExp path, the RegExp. Each pattern is relative to the router it was registered on; `req.originalRoute` (a fork addition) is the whole pattern, mount paths included, such as `'/api/users/:id'`, for an OpenTelemetry `http.route`. |
| `param` | the parameter's name (`'id'`), for `app.param()` callbacks only. |
| `errorHandler` | `true` for error handlers, absent otherwise. |
| `incomingError` | the error an error handler received, for error handlers only. |
| `error` | the error the handler reported: set before the `error` event, and present at the trace's last event (`end`, or `asyncEnd` for a promise) when it failed. A throw or a rejection always sets it, even for an error already reported upstream. |
| `result` | what the handler returned (before `end`), or what its promise resolved to (before `asyncStart`). Not set when it threw or rejected. |

Subscribers may add their own properties (a span, a start time): every event of one trace gets the
same object.

### Errors

The `error` event is published once per error, by the handler where it starts: a handler that calls
`next(err)`, throws, or rejects. An error passed on by routers, sub-apps and error handlers that
forward it (`next(err)` with the error they got, or rethrowing it) isn't published again, but a throw or
rejection still sets `error` on that handler's own context. An error handler that passes on a
different error starts a new one, which is published. An error raised while matching, such as a
parameter that can't be decoded (`/users/%ZZ`), is not blamed on the handlers that forward it: it
reaches the error handlers' `incomingError` only.

`next('route')` and `next('router')` (or throwing those strings) are not errors.

| Request | Events |
|---|---|
| `boom` throws, `recover(err, req, res, next)` answers | `start boom`, `error boom`, `start recover`, `end recover`, `end boom` |
| `fail` calls `next(err)`, `recover` answers | `start fail`, `error fail`, `start recover`, `end recover`, `end fail` |
| async `reject` rejects, `recover` answers | `start reject`, `end reject`, `error reject`, `start recover`, `end recover`, `asyncStart reject`, `asyncEnd reject` |
| a route in a nested router calls `next(err)`, nothing handles it | `error` once, for that handler; Express's final handler answers 500 |

## express.initialization

Published with `{ app }` by every `express()` call, sub-apps included, once the app's settings and
router are set up and before `express()` returns, so instrumentation can reach an app before any
request does. The counterpart of Fastify's `fastify.initialization`.

::: code-group

```js [index.cjs]
const dc = require('node:diagnostics_channel');

dc.subscribe('express.initialization', ({ app }) => {
  app.disable('x-powered-by');
});
```

```ts [index.ts]
import dc from 'node:diagnostics_channel';
import type { InitializationMessage } from 'express';

dc.subscribe('express.initialization', (message) => {
  const { app } = message as InitializationMessage;
  app.disable('x-powered-by');
});
```

:::

Subscribe before the app is created: an app created earlier isn't published again.
