---
title: Debugging Express
description: Learn how to enable and use debugging logs in Express.js applications by setting the DEBUG environment variable for enhanced troubleshooting.
---

# Debugging Express

To see all the internal logs used in Express, set the `DEBUG` environment variable to `express:*,router,router:*` when launching your app. Routing is handled by the separate [router](https://github.com/pillarjs/router) package, so its logs live under the `router` namespace and are not included in `express:*`.

```bash
$ DEBUG=express:*,router,router:* node index.js
```

On Windows, use the corresponding command.

```bash
> $env:DEBUG = "express:*,router,router:*"; node index.js
```

Running this command on a small app with a JSON body parser and a mounted router prints the following output:

::: code-group

```js [index.cjs]
const express = require('express');

const app = express();

app.use(express.json());

const users = express.Router();
users.get('/', (req, res) => {
  res.json([]);
});

app.use('/users', users);

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(3000);
```

```js [index.mjs]
import express from 'express';

const app = express();

app.use(express.json());

const users = express.Router();
users.get('/', (req, res) => {
  res.json([]);
});

app.use('/users', users);

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(3000);
```

:::

```bash
$ DEBUG=express:*,router,router:* node index.js
  express:application set "x-powered-by" to true +0ms
  express:application set "etag" to 'weak' +3ms
  express:application set "etag fn" to [Function: generateETag] +0ms
  express:application set "env" to 'development' +1ms
  express:application set "query parser" to 'simple' +0ms
  express:application set "query parser fn" to [Function: parse] +0ms
  express:application set "subdomain offset" to 2 +1ms
  express:application set "trust proxy" to false +0ms
  express:application set "trust proxy fn" to [Function: trustNone] +1ms
  express:application booting in development mode +0ms
  express:application set "view" to [Function: View] +0ms
  express:application set "views" to '/projects/example/views' +1ms
  express:application set "jsonp callback name" to 'callback' +0ms
  router use '/' jsonParser +0ms
  router:layer new '/' +0ms
  router:route new '/' +0ms
  router:layer new '/' +3ms
  router:route get / +0ms
  router:layer new '/' +1ms
  router use '/users' router +4ms
  router:layer new '/users' +0ms
  router:route new '/' +1ms
  router:layer new '/' +0ms
  router:route get / +1ms
  router:layer new '/' +1ms
```

When a request is then made to the app, you will see the logs specified in the Express code:

```bash
  router dispatching GET /users +712ms
  router jsonParser  : /users +1ms
  router trim prefix (/users) from url /users +2ms
  router router /users : /users +0ms
  router dispatching GET / +0ms
```

To see the logs only from the router implementation, set the value of `DEBUG` to `router,router:*`. Likewise, to see logs only from the application implementation, set the value of `DEBUG` to `express:application`, and so on.

## Route warnings

This is a fork addition; Express 5.3.0 has no `express:router` namespace.

With `express:router` enabled (`DEBUG=express:router`, or `DEBUG=express:*`), the router warns when a
path or route is registered and can't work as written. Nothing is printed otherwise, and the checks
run only while the namespace is enabled, so they cost nothing per request, or at startup when it is
off.

- **A path no request can match** (expressjs/express#2511): the router matches the path of
  `req.url` as Node's HTTP server gives it, still percent-encoded. So a path whose literal text has
  a space, a control character or a non-ASCII character (clients send those percent-encoded, and
  Node rejects them raw), a `?` (it starts the query string) or a `#` (it starts the fragment), or
  that doesn't start with `/`, never matches. The warning names the character and its encoded form.
  Text inside an optional `{...}` group isn't checked, since a request can match without it.
- **A duplicate route**: the same method and the same path registered twice on the same router. The
  warning names both, by their index in the router's stack and their handler's name. The second only
  runs when the first calls `next()`, which may be what you want, so it is a warning.

```bash
$ DEBUG=express:router node index.js
  express:router route path '/foo bar' can never match: " " (U+0020) is never sent unencoded: clients percent-encode it and Node rejects it raw; write "%20" +0ms
  express:router duplicate route GET '/users/:id': registered at stack index 1 (getUser) and again at stack index 3 (getUserAgain); the second runs only when the first calls next() +1ms
```

Only routes registered while the namespace is enabled are compared.

## Using `debug` in your own code

The same [debug](https://www.npmjs.com/package/debug) module that Express uses internally is available for your application code. Install it, create one or more loggers scoped to a namespace of your choosing, and call them wherever you would otherwise use `console.log`:

```bash
npm install debug
```

::: code-group

```js [index.cjs]
const express = require('express');
const debug = require('debug')('myapp:server');

const app = express();

app.get('/', (req, res) => {
  debug('handling request from %s', req.ip);
  res.send('Hello World!');
});

app.listen(3000, () => {
  debug('listening on port 3000');
});
```

```js [index.mjs]
import express from 'express';
import debugModule from 'debug';

const debug = debugModule('myapp:server');
const app = express();

app.get('/', (req, res) => {
  debug('handling request from %s', req.ip);
  res.send('Hello World!');
});

app.listen(3000, () => {
  debug('listening on port 3000');
});
```

:::

These statements print nothing by default. Enable them through the same `DEBUG` environment variable, using your own namespace:

```bash
$ DEBUG=myapp:* node index.js
```

You can specify more than one debug namespace by assigning a comma-separated list of names:

```bash
$ DEBUG=myapp:*,router node index.js
```

## Setting DEBUG in your IDE

The `DEBUG` environment variable can be set by any process launcher that supports environment variables, including the run and debug configurations of your IDE. For example, in VS Code you can set it in the `env` property of a launch configuration:

::: code-group

```json [.vscode/launch.json]
{
  "type": "node",
  "request": "launch",
  "name": "Launch Express app",
  "program": "${workspaceFolder}/index.js",
  "env": { "DEBUG": "express:*,router,router:*" }
}
```

:::

See [Node.js debugging in VS Code](https://code.visualstudio.com/docs/nodejs/nodejs-debugging) for the full list of launch options.

## Using the Node.js inspector

Debug logs show what the app did; for stepping through your code with breakpoints, use the built-in Node.js inspector. Start your app with the `--inspect` flag:

```bash
$ node --inspect index.js
```

Then attach a debugging client, such as Chrome DevTools (open `chrome://inspect`), VS Code, or any other inspector-capable tool, to set breakpoints in your route handlers and middleware, step through code, and inspect variables.

If you need to debug something that happens during startup, use `--inspect-brk` instead, which pauses execution on the first line until a debugger attaches. See the [Node.js debugging guide](https://nodejs.org/learn/getting-started/debugging) for details.

## Debugging the HTTP layer

Express runs on top of the Node.js `http` module, which has its own debugging facilities that work with any Express app.

Setting the `NODE_DEBUG` environment variable to `http` makes Node.js print internal logs from the HTTP layer, such as connection handling and socket events:

```bash
$ NODE_DEBUG=http node index.js
```

You can combine it with other subsystems, such as `net` or `stream`, in a comma-separated list. Be aware that this output can expose sensitive data such as authentication headers, so use it only in development.

## Diagnostics channels

Node.js publishes an event for every HTTP request through the [diagnostics_channel](https://nodejs.org/api/diagnostics_channel.html#http) module, which you can subscribe to without patching Express or adding middleware:

::: code-group

```js [index.cjs]
const { subscribe } = require('node:diagnostics_channel');

subscribe('http.server.request.start', ({ request }) => {
  console.log(`${request.method} ${request.url}`);
});
```

```js [index.mjs]
import { subscribe } from 'node:diagnostics_channel';

subscribe('http.server.request.start', ({ request }) => {
  console.log(`${request.method} ${request.url}`);
});
```

:::

Other built-in channels cover the rest of the request lifecycle, such as `http.server.response.finish`, and the client side of `http.request` calls. See the [diagnostics_channel documentation](https://nodejs.org/api/diagnostics_channel.html#http) for the full list.

## Advanced options

When running through Node.js, you can set a few environment variables that will change the behavior of the debug logging:

| Name                | Purpose                                           |
| ------------------- | ------------------------------------------------- |
| `DEBUG`             | Enables/disables specific debugging namespaces.   |
| `DEBUG_COLORS`      | Whether or not to use colors in the debug output. |
| `DEBUG_DEPTH`       | Object inspection depth.                          |
| `DEBUG_FD`          | File descriptor to write debug output to.         |
| `DEBUG_SHOW_HIDDEN` | Shows hidden properties on inspected objects.     |

::: info

The environment variables beginning with `DEBUG_` end up being converted into an Options object
that gets used with `%o`/`%O` formatters. See the Node.js documentation for
[`util.inspect()`](https://nodejs.org/api/util.html#utilinspectobject-options) for the complete
list.

:::
