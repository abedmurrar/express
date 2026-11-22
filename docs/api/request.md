---
title: Request Object
description: The req object represents the HTTP request and has properties for the request query string, parameters, body, HTTP headers, and so on.
---

# Request Object

The `req` object represents the HTTP request and has properties for the
request query string, parameters, body, HTTP headers, and so on. In this documentation and by convention,
the object is always referred to as `req` (and the HTTP response is `res`) but its actual name is determined
by the parameters to the callback function in which you're working.

For example:

::: code-group

```js [JavaScript]
app.get('/user/:id', (req, res) => {
  res.send(`user ${req.params.id}`);
});
```

```ts [TypeScript]
import { type Request, type Response } from 'express';

app.get('/user/:id', (req: Request, res: Response) => {
  res.send(`user ${req.params.id}`);
});
```

:::

But you could just as well have:

::: code-group

```js [JavaScript]
app.get('/user/:id', (request, response) => {
  response.send(`user ${request.params.id}`);
});
```

```ts [TypeScript]
import { type Request, type Response } from 'express';

app.get('/user/:id', (request: Request, response: Response) => {
  response.send(`user ${request.params.id}`);
});
```

:::

The `req` object is an enhanced version of Node's own request object
and supports all [built-in fields and methods](https://nodejs.org/api/http.html#class-httpincomingmessage).

## Properties

The `req` object contains a number of properties that provide information about the HTTP request, such as headers, query parameters, and more.

### req.app

**Type:** `Application`

This property holds a reference to the instance of the Express application that is using the middleware.

If you follow the pattern in which you create a module that just exports a middleware function
and `require()` it in your main file, then the middleware can access the Express instance via `req.app`

For example:

::: code-group

```js [index.cjs]
app.get('/viewdirectory', require('./mymiddleware.cjs'));
```

```js [index.mjs]
import mymiddleware from './mymiddleware.mjs';

app.get('/viewdirectory', mymiddleware);
```

:::

And the middleware module itself:

::: code-group

```js [mymiddleware.cjs]
module.exports = (req, res) => {
  res.send(`The views directory is ${req.app.get('views')}`);
};
```

```js [mymiddleware.mjs]
export default (req, res) => {
  res.send(`The views directory is ${req.app.get('views')}`);
};
```

```ts [mymiddleware.ts]
import { type Request, type Response } from 'express';

export default (req: Request, res: Response) => {
  res.send(`The views directory is ${req.app.get('views')}`);
};
```

:::

### req.baseUrl

**Type:** `String`

The URL path on which a router instance was mounted.

The `req.baseUrl` property is similar to the [mountpath](/api/application#appmountpath) property of the `app` object,
except `app.mountpath` returns the matched path pattern(s).

For example:

::: code-group

```js [JavaScript]
const greet = express.Router();

greet.get('/jp', (req, res) => {
  console.log(req.baseUrl); // /greet
  res.send('Konnichiwa!');
});

app.use('/greet', greet); // load the router on '/greet'
```

```ts [TypeScript]
import express, { type Request, type Response } from 'express';

const greet = express.Router();

greet.get('/jp', (req: Request, res: Response) => {
  console.log(req.baseUrl); // /greet
  res.send('Konnichiwa!');
});

app.use('/greet', greet); // load the router on '/greet'
```

:::

Even if you use a path pattern or a set of path patterns to load the router,
the `baseUrl` property returns the matched string, not the pattern(s). In the
following example, the `greet` router is loaded on two path patterns.

```js
app.use(['/gre:"param"t', '/hel{l}o'], greet); // load the router on '/gre:"param"t' and '/hel{l}o'
```

When a request is made to `/greet/jp`, `req.baseUrl` is "/greet". When a request is
made to `/hello/jp`, `req.baseUrl` is "/hello".

### req.body

**Type:** `Object`

Contains key-value pairs of data submitted in the request body.
By default, it is `undefined`, and is populated when you use body-parsing middleware such
as [`express.json()`](/api/express#expressjson) or [`express.urlencoded()`](/api/express#expressurlencoded).

::: warning

As `req.body`'s shape is based on user-controlled input, all properties and values in this object
are untrusted and should be validated before trusting. For example, `req.body.foo.toString()` may
fail in multiple ways, for example `foo` may not be there or may not be a string, and `toString`
may not be a function and instead a string or other user-input.

:::

The following example shows how to use body-parsing middleware to populate `req.body`.

::: code-group

```js [index.cjs]
const express = require('express');

const app = express();

app.use(express.json()); // for parsing application/json
app.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

app.post('/profile', (req, res, next) => {
  console.log(req.body);
  res.json(req.body);
});
```

```js [index.mjs]
import express from 'express';

const app = express();

app.use(express.json()); // for parsing application/json
app.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

app.post('/profile', (req, res, next) => {
  console.log(req.body);
  res.json(req.body);
});
```

```ts [index.ts]
import express, { type Express, type Request, type Response, type NextFunction } from 'express';

const app: Express = express();

app.use(express.json()); // for parsing application/json
app.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

app.post('/profile', (req: Request, res: Response, next: NextFunction) => {
  console.log(req.body);
  res.json(req.body);
});
```

:::

### req.cookies

**Type:** `Object`

When using [cookie-parser](https://www.npmjs.com/package/cookie-parser) middleware, this property is an object that
contains cookies sent by the request. If the request contains no cookies, it defaults to `{}`.

```js
// Cookie: name=tj
console.dir(req.cookies.name);
// => 'tj'
```

If the cookie has been signed, you have to use [req.signedCookies](#reqsignedcookies).

For more information, issues, or concerns, see [cookie-parser](https://github.com/expressjs/cookie-parser).

### req.fresh

**Type:** `Boolean`

When the response is still "fresh" in the client's cache `true` is returned, otherwise `false` is returned to indicate that the client cache is now stale and the full response should be sent.

When a client sends the `Cache-Control: no-cache` request header to indicate an end-to-end reload request, this module will return `false` to make handling these requests transparent.

Further details for how cache validation works can be found in the
[HTTP/1.1 Caching Specification](https://tools.ietf.org/html/rfc7234).

```js
console.dir(req.fresh);
// => true
```

### req.hostname

**Type:** `String`

Contains the hostname derived from the `Host` HTTP header.

When the [`trust proxy` setting](/api/application#options-for-trust-proxy-setting)
does not evaluate to `false`, this property will instead get the value
from the `X-Forwarded-Host` header field. This header can be set by
the client or by the proxy.

If there is more than one `X-Forwarded-Host` header in the request, the
value of the first header is used. This includes a single header with
comma-separated values, in which the first value is used.

Userinfo before an `@` is not part of the host, so it's dropped. A value
whose port is not all digits is not a host, and gives `undefined`. Express
5.3.0 kept both, so `Host: evil.example:x@good.example` gave the hostname
`evil.example`.

```js
// Host: "example.com:3000"
console.dir(req.hostname);
// => 'example.com'

// Host: "user:pass@example.com:3000"
console.dir(req.hostname);
// => 'example.com'
```

### req.host

**Type:** `String`

Contains the host derived from the `Host` HTTP header.

When the [`trust proxy` setting](/api/application#options-for-trust-proxy-setting)
does not evaluate to `false`, this property will instead get the value
from the `X-Forwarded-Host` header field. This header can be set by
the client or by the proxy.

If there is more than one `X-Forwarded-Host` header in the request, the
value of the first header is used. This includes a single header with
comma-separated values, in which the first value is used.

```js
// Host: "example.com:3000"
console.dir(req.host);
// => 'example.com:3000'

// Host: "[::1]:3000"
console.dir(req.host);
// => '[::1]:3000'
```

Userinfo and non-numeric ports are handled as for [`req.hostname`](#reqhostname).

### req.ip

**Type:** `String`

Contains the remote IP address of the request.

When the [`trust proxy` setting](/api/application#options-for-trust-proxy-setting) does not evaluate to `false`,
the value of this property is derived from the left-most entry in the
`X-Forwarded-For` header. This header can be set by the client or by the proxy.

```js
console.dir(req.ip);
// => '127.0.0.1'
```

### req.ips

**Type:** `String[]`

When the [`trust proxy` setting](/api/application#options-for-trust-proxy-setting) does not evaluate to `false`,
this property contains an array of IP addresses
specified in the `X-Forwarded-For` request header. Otherwise, it contains an
empty array. This header can be set by the client or by the proxy.

For example, if `X-Forwarded-For` is `client, proxy1, proxy2`, `req.ips` would be
`["client", "proxy1", "proxy2"]`, where `proxy2` is the furthest downstream.

```js
// normal request, or `trust proxy` disabled (the default)
console.dir(req.ips);
// => []

// app.set('trust proxy', true) and
// request header `X-Forwarded-For: client, proxy1, proxy2`
console.dir(req.ips);
// => ['client', 'proxy1', 'proxy2']
```

### req.method

**Type:** `String`

Contains a string corresponding to the HTTP method of the request:
`GET`, `POST`, `PUT`, and so on.

::: code-group

```js [JavaScript]
app.use((req, res, next) => {
  console.dir(req.method);
  // => 'GET'
  next();
});
```

```ts [TypeScript]
import { type Request, type Response, type NextFunction } from 'express';

app.use((req: Request, res: Response, next: NextFunction) => {
  console.dir(req.method);
  // => 'GET'
  next();
});
```

:::

### req.originalRoute

**Type:** `String | undefined`

This is a fork addition; Express 5.3.0 has no `req.originalRoute` (expressjs/express#2501).

The full path pattern of the route that matched: the path of every router and sub-app the route is
mounted under, followed by the route's own path. It is to [`req.route`](#reqroute) what
[`req.originalUrl`](#reqoriginalurl) is to `req.url`: `req.route.path` is the route's path inside its
router, and `req.originalRoute` is the whole pattern, which suits logs and metrics, where the URL
itself would give one entry per user ID.

::: code-group

```js [JavaScript]
const api = express.Router();

api.get('/users/:id', (req, res) => {
  console.dir(req.route.path); // '/users/:id'
  console.dir(req.originalRoute); // '/api/users/:id'
  res.end();
});

// GET /api/users/7
app.use('/api', api);
```

```ts [TypeScript]
import { type Request, type Response } from 'express';

const api = express.Router();

api.get('/users/:id', (req: Request, res: Response) => {
  console.dir(req.route.path); // '/users/:id'
  console.dir(req.originalRoute); // '/api/users/:id'
  res.end();
});

// GET /api/users/7
app.use('/api', api);
```

:::

It is built when you read it, from what the router keeps while it routes, so an app that doesn't
read it doesn't pay for it.

- **Mount paths** are joined as `req.baseUrl` joins them: without a trailing slash, and a router or
  sub-app used without a path adds nothing. Routers and sub-apps nested at any depth all add their
  paths, so `app.use('/api', api)`, `api.use('/v1', v1)` and `v1.get('/users/:id')` give
  `'/api/v1/users/:id'`. The route's own path is kept as it is, so `api.get('/')` under `'/api'`
  gives `'/api/'`.
- **Patterns** are the strings you registered, with their parameters, wildcards and optional
  groups: `'/t/:tenant{/:region}/files/*path'`.
- **Path arrays** contribute the entry that matched, the first one in order (nested arrays
  included): `app.get(['/a', '/b/:id'])` gives `'/b/:id'` for `GET /b/1`.
- **RegExp paths** have no string form that is a route pattern, so when the route, or any mount
  above it, matched with a RegExp, `req.originalRoute` is `undefined`. `String(regexp)` joined with
  paths would be neither a path nor a RegExp, and the text the RegExp matched would put user IDs
  back into metric names. `req.route.path` still has the RegExp.
- **`router.route()` and `app.route()`** routes, and `router.param()` callbacks of a route, see
  it as `app.get()` routes do.
- **Middleware** (`app.use()`) is not a route: before any route has matched, `req.originalRoute`
  is `undefined`.
- **Error handlers** see the route that failed (it stays set when a route calls `next(err)` or
  throws), or `undefined` when the error came before any route matched.
- **404 handlers** see `undefined` when no route matched. It is set and kept exactly as long as
  `req.route` is: when a route matched and passed the request on with `next()`, a later handler,
  404 handlers included, sees that route, as `req.route` does.
- It can be read after the response is sent, for example in a `res.on('finish')` listener.

`req.originalRoute` is a getter on the request prototype, and not an enumerable one, so
`Object.keys(express.request)` lists the same names as Express 5.3.0.

### req.originalUrl

**Type:** `String`

::: danger

`req.url` is not a native Express property, it is inherited from Node's [http
module](https://nodejs.org/api/http.html#messageurl).

:::

This property is much like `req.url`; however, it retains the original request URL,
allowing you to rewrite `req.url` freely for internal routing purposes. For example,
the "mounting" feature of [app.use()](/api/application#appuse) will rewrite `req.url` to strip the mount point.

```js
// GET /search?q=something
console.dir(req.originalUrl);
// => '/search?q=something'
```

`req.originalUrl` is available both in middleware and router objects, and is a
combination of `req.baseUrl` and `req.url`. Consider following example:

::: code-group

```js [JavaScript]
// GET 'http://www.example.com/admin/new?sort=desc'
app.use('/admin', (req, res, next) => {
  console.dir(req.originalUrl); // '/admin/new?sort=desc'
  console.dir(req.baseUrl); // '/admin'
  console.dir(req.path); // '/new'
  next();
});
```

```ts [TypeScript]
import { type Request, type Response, type NextFunction } from 'express';

// GET 'http://www.example.com/admin/new?sort=desc'
app.use('/admin', (req: Request, res: Response, next: NextFunction) => {
  console.dir(req.originalUrl); // '/admin/new?sort=desc'
  console.dir(req.baseUrl); // '/admin'
  console.dir(req.path); // '/new'
  next();
});
```

:::

### req.params

**Type:** `Object`

This property is an object containing properties mapped to the [named route "parameters"](/guide/routing#route-parameters). For example, if you have the route `/user/:name`, then the "name" property is available as `req.params.name`. This object defaults to `Object.create(null)` when using string paths, but remains a standard object with a normal prototype when the path is defined with a regular expression.

```js
// GET /user/tj
console.dir(req.params.name);
// => 'tj'
```

Properties corresponding to wildcard parameters are arrays containing separate path segments split on `/`:

::: code-group

```js [JavaScript]
app.get('/files/*file', (req, res) => {
  console.dir(req.params.file);
  // GET /files/note.txt
  // => [ 'note.txt' ]
  // GET /files/images/image.png
  // => [ 'images', 'image.png' ]
});
```

```ts [TypeScript]
import { type Request, type Response } from 'express';

app.get('/files/*file', (req: Request, res: Response) => {
  console.dir(req.params.file);
  // GET /files/note.txt
  // => [ 'note.txt' ]
  // GET /files/images/image.png
  // => [ 'images', 'image.png' ]
});
```

:::

Parameters defined in [optional segments](/guide/routing#optional-segments) that are not present in the request URL are omitted from `req.params` entirely.

When you use a regular expression for the route definition, capture groups are provided as integer keys using `req.params[n]`, where `n` is the n<sup>th</sup> capture group.

::: code-group

```js [JavaScript]
app.use(/^\/file\/(.*)$/, (req, res) => {
  // GET /file/javascripts/jquery.js
  console.dir(req.params[0]);
  // => 'javascripts/jquery.js'
});
```

```ts [TypeScript]
import { type Request, type Response } from 'express';

app.use(/^\/file\/(.*)$/, (req: Request, res: Response) => {
  // GET /file/javascripts/jquery.js
  console.dir(req.params[0]);
  // => 'javascripts/jquery.js'
});
```

:::

Named capturing groups in regular expressions behave like named route parameters. For example the group from `/^\/file\/(?<path>.*)$/` expression is available as `req.params.path`.

If you need to make changes to a key in `req.params`, use the [app.param](/api/application#appparam) handler. Changes are applicable only to [parameters](/guide/routing#route-parameters) already defined in the route path.

Any changes made to the `req.params` object in a middleware or route handler will be reset.

::: info

Express automatically decodes the values in `req.params` (using `decodeURIComponent`).

:::

### req.path

**Type:** `String`

Contains the path part of the request URL.

```js
// example.com/users?sort=desc
console.dir(req.path);
// => '/users'
```

::: info

When called from a middleware, the mount point is not included in `req.path`. See
[app.use()](/api/application#appuse) for more details.

:::

### req.protocol

**Type:** `String`

Contains the request protocol string: either `http` or (for TLS requests) `https`.

When the [`trust proxy` setting](/api/application#options-for-trust-proxy-setting) does not evaluate to `false`,
this property will use the value of the `X-Forwarded-Proto` header field if present.
This header can be set by the client or by the proxy. The value is lowercased, since a
scheme is case-insensitive, so `X-Forwarded-Proto: HTTPS` gives `https` (and
[`req.secure`](#reqsecure) is `true`). Express 5.3.0 kept the case.

```js
console.dir(req.protocol);
// => 'http'
```

### req.query

**Type:** `Object`

This property is an object containing a property for each query string parameter in the route.
When [query parser](/api/application#application-settings) is set to disabled, it is an empty object `{}`, otherwise it is the result of the configured query parser.

::: warning

As `req.query`'s shape is based on user-controlled input, all properties and values in this object
are untrusted and should be validated before trusting. For example, `req.query.foo.toString()` may
fail in multiple ways, for example `foo` may not be there or may not be a string, and `toString`
may not be a function and instead a string or other user-input.

:::

The value of this property can be configured with the [query parser application setting](/api/application#application-settings) to work how your application needs it. A very popular query string parser is the [`qs` module](https://www.npmjs.com/package/qs), and this is used by default. The `qs` module is very configurable with many settings, and it may be desirable to use different settings than the default to populate `req.query`:

::: code-group

```js [index.cjs]
const qs = require('qs');
app.set('query parser', (str) =>
  qs.parse(str, {
    /* custom options */
  })
);
```

```js [index.mjs]
import qs from 'qs';

app.set('query parser', (str) =>
  qs.parse(str, {
    /* custom options */
  })
);
```

```ts [index.ts]
import qs from 'qs';

app.set('query parser', (str: string) =>
  qs.parse(str, {
    /* custom options */
  })
);
```

:::

Check out the [query parser application setting](/api/application#application-settings) documentation for other customization options.

### req.res

**Type:** `Response`

This property holds a reference to the [response object](/api/response)
that relates to this request object.

::: code-group

```js [JavaScript]
app.get('/', (req, res) => {
  console.dir(req.res === res);
  // => true
  res.send('OK');
});
```

```ts [TypeScript]
import { type Request, type Response } from 'express';

app.get('/', (req: Request, res: Response) => {
  console.dir(req.res === res);
  // => true
  res.send('OK');
});
```

:::

### req.route

**Type:** `Route`

Contains the currently-matched route (a `Route` object). For example:

::: code-group

```js [JavaScript]
app.get('/user/{:id}', (req, res) => {
  console.dir(req.route, { depth: null });
  res.send('GET');
});
```

```ts [TypeScript]
import { type Request, type Response } from 'express';

app.get('/user/{:id}', (req: Request, res: Response) => {
  console.dir(req.route, { depth: null });
  res.send('GET');
});
```

:::

Example output from the previous snippet:

```
Route {
  path: '/user/{:id}',
  stack: [
    Layer {
      handle: [Function (anonymous)],
      keys: [],
      name: '<anonymous>',
      params: undefined,
      path: undefined,
      slash: false,
      matchers: [ [Function: match] ],
      rawPath: '/',
      rawMatchers: [ [Function: match] ],
      method: 'get'
    }
  ],
  methods: [Object: null prototype] { get: true }
}
```

In this fork, each `Layer` also has `rawPath` (the path it was registered with, from router 2.3.0)
and `rawMatchers`, which [`req.originalRoute`](#reqoriginalroute) reads.

### req.secure

**Type:** `Boolean`

A Boolean property that is true if a TLS connection is established. Equivalent to the following:

```js
req.protocol === 'https';
```

### req.signal

**Type:** `AbortSignal`

An [`AbortSignal`](https://nodejs.org/api/globals.html#class-abortsignal) that aborts when the
client goes away before the response has finished. Pass it to work that should stop when nobody
is waiting for the answer any more, such as `fetch`, a database query or a timer.

```js
app.get('/report', async (req, res, next) => {
  try {
    const upstream = await fetch('https://api.example.com/report', { signal: req.signal });
    res.json(await upstream.json());
  } catch (err) {
    if (err.name === 'AbortError') return; // the client has gone, nobody to answer
    next(err);
  }
});
```

- **It aborts** when the connection closes before the response has finished: the client
  disconnected or gave up, or the response was destroyed (`res.destroy()`). A pipelined request
  whose response is still waiting its turn aborts too.
- **It never aborts once the response has finished**, even when the connection closes
  afterwards, and its listeners go away with the request, so nothing builds up on a keep-alive
  connection.
- **The reason** (`req.signal.reason`) is the default `AbortError` `DOMException`, the one Node's
  own `IncomingMessage#signal`, Fastify's `request.signal` and `AbortController#abort()` use, so
  `err.name === 'AbortError'` checks work.
- **It is created on first read.** A request that never reads it gets no signal and no listener.
- **Read late, it is still right:** read after the client has gone it is already aborted, and
  read after the response has finished it never aborts.
- **It is the same signal in every app** the request goes through, including a mounted sub-app.
- **It is read-only**, like Node's own `IncomingMessage#signal`: `req.signal = mySignal` throws a
  `TypeError` in strict mode code (and is ignored otherwise). To give one request another signal,
  use `Object.defineProperty(req, 'signal', { value: mySignal })`.

::: info

Not in Express 5.3.0. Node.js 24.16 and 26.1 added `IncomingMessage#signal`, but up to Node.js
24.19 and 26.6 it also aborts after every response that finished normally
([nodejs/node#64390](https://github.com/nodejs/node/issues/64390)), and Node.js 22 has none. The
fork defines `req.signal` itself, so it behaves the same on every supported Node.js version. Before
an Express app has handled the request (in an `upgrade` or `checkContinue` listener, for example)
`req.signal` is Node's own, or `undefined` on Node.js 22, as with Express 5.3.0.

:::

### req.signedCookies

**Type:** `Object`

When using [cookie-parser](https://www.npmjs.com/package/cookie-parser) middleware, this property
contains signed cookies sent by the request, unsigned and ready for use. Signed cookies reside
in a different object to show developer intent; otherwise, a malicious attack could be placed on
`req.cookie` values (which are easy to spoof). Note that signing a cookie does not make it "hidden"
or encrypted; but simply prevents tampering (because the secret used to sign is private).

If no signed cookies are sent, the property defaults to `{}`.

```js
// Cookie: user=tobi.CP7AWaXDfAKIRfH49dQzKJx7sKzzSoPq7/AcBBRVwlI3
console.dir(req.signedCookies.user);
// => 'tobi'
```

For more information, issues, or concerns, see [cookie-parser](https://github.com/expressjs/cookie-parser).

### req.stale

**Type:** `Boolean`

Indicates whether the request is "stale," and is the opposite of `req.fresh`.
For more information, see [req.fresh](#reqfresh).

```js
console.dir(req.stale);
// => true
```

### req.subdomains

**Type:** `String[]`

An array of subdomains in the domain name of the request.

```js
// Host: "tobi.ferrets.example.com"
console.dir(req.subdomains);
// => ['ferrets', 'tobi']
```

The application property `subdomain offset`, which defaults to 2, is used for determining the
beginning of the subdomain segments. To change this behavior, change its value
using [app.set](/api/application#appset).

An IP address host has no subdomains: `Host: [::ffff:127.0.0.1]` gives `[]` (and
`['[::ffff:127.0.0.1]']` with `subdomain offset` set to 0). Express 5.3.0 split an
IPv6 address on its dots.

A trailing root dot is not a part: `Host: tobi.ferrets.example.com.` gives
`['ferrets', 'tobi']`, as without the dot (`req.hostname` keeps it). Express 5.3.0
counted the empty label after the dot and gave `['example', 'ferrets', 'tobi']`.

### req.xhr

**Type:** `Boolean`

A Boolean property that is `true` if the request's `X-Requested-With` header field is
"XMLHttpRequest", indicating that the request was issued by a client library such as jQuery.

```js
console.dir(req.xhr);
// => true
```

## Methods

The `req` object also contains a number of methods that can be used to perform various tasks related to the HTTP request, such as checking the content type, retrieving header values, and more.

### req.accepts()

**Parameters**

- **`types`** · `String | String[]`

  The content type(s) to check: a MIME type (such as `application/json`), an extension name
  (such as `json`), a comma-delimited list, or an array.

**Returns:** `String | false`

Checks if the specified content types are acceptable, based on the request's `Accept` HTTP header field.
The method returns the best match, or if none of the specified content types is acceptable, returns
`false` (in which case, the application should respond with `406 "Not Acceptable"`).

The `type` value may be a single MIME type string (such as "application/json"),
an extension name such as "json", a comma-delimited list, or an array. For a
list or array, the method returns the _best_ match (if any).

```js
// Accept: text/html
req.accepts('html');
// => 'html'

// Accept: text/*, application/json
req.accepts('html');
// => 'html'
req.accepts('text/html');
// => 'text/html'
req.accepts(['json', 'text']);
// => 'json'
req.accepts('application/json');
// => 'application/json'

// Accept: text/*, application/json
req.accepts('image/png');
req.accepts('png');
// => false

// Accept: text/*;q=.5, application/json
req.accepts(['html', 'json']);
// => 'json'
```

For more information, or if you have issues or concerns, see [accepts](https://github.com/expressjs/accepts).

### req.acceptsCharsets()

**Parameters**

- **`charset`** · `String | String[]`

  One or more character sets to test against the request's `Accept-Charset` header.

**Returns:** `String | false`

Returns the first accepted charset of the specified character sets,
based on the request's `Accept-Charset` HTTP header field.
If none of the specified charsets is accepted, returns `false`.

```js
// Accept-Charset: utf-8, iso-8859-1;q=0.5
req.acceptsCharsets('utf-8', 'iso-8859-1');
// => 'utf-8'

req.acceptsCharsets('us-ascii');
// => false
```

For more information, or if you have issues or concerns, see [accepts](https://github.com/expressjs/accepts).

### req.acceptsEncodings()

**Parameters**

- **`encoding`** · `String | String[]`

  One or more encodings to test against the request's `Accept-Encoding` header.

**Returns:** `String | false`

Returns the first accepted encoding of the specified encodings,
based on the request's `Accept-Encoding` HTTP header field.
If none of the specified encodings is accepted, returns `false`.

```js
// Accept-Encoding: gzip, deflate
req.acceptsEncodings('gzip', 'deflate');
// => 'gzip'

req.acceptsEncodings('br');
// => false
```

For more information, or if you have issues or concerns, see [accepts](https://github.com/expressjs/accepts).

### req.acceptsLanguages()

**Parameters**

- **`lang`** · `String | String[]` · optional

  One or more languages to test against the request's `Accept-Language` header. If omitted, all
  accepted languages are returned as an array.

**Returns:** `String | String[] | false`

Returns the first accepted language of the specified languages,
based on the request's `Accept-Language` HTTP header field.
If none of the specified languages is accepted, returns `false`.

If no `lang` argument is given, then `req.acceptsLanguages()`
returns all languages from the HTTP `Accept-Language` header
as an `Array`.

```js
// Accept-Language: en;q=0.8, es
req.acceptsLanguages('en', 'es');
// => 'es'

req.acceptsLanguages();
// => ['es', 'en']
```

For more information, or if you have issues or concerns, see [accepts](https://github.com/expressjs/accepts).

Express (5.x) source: [request.js line 172](https://github.com/expressjs/express/blob/v5.1.0/lib/request.js#L172)

Accepts (2.0) source: [index.js line 195](https://github.com/jshttp/accepts/blob/2.0.0/index.js#L195)

### req.get()

**Parameters**

- **`field`** · `String`

  The name of the HTTP request header to read (case-insensitive). `Referrer` and `Referer` are
  interchangeable.

**Returns:** `String | undefined`

Returns the specified HTTP request header field (case-insensitive match).
The `Referrer` and `Referer` fields are interchangeable.

```js
req.get('Content-Type');
// => 'text/plain'

req.get('content-type');
// => 'text/plain'

req.get('Something');
// => undefined
```

Aliased as `req.header(field)`.

### req.is()

**Parameters**

- **`type`** · `String | String[]`

  The MIME type(s) or extension name(s) to match against the request's `Content-Type` header.

**Returns:** `String | false | null`

Returns the matching content type if the incoming request's "Content-Type" HTTP header field
matches the MIME type specified by the `type` parameter. If the request has no body, returns `null`.
Returns `false` otherwise.

```js
// With Content-Type: text/html; charset=utf-8
req.is('html'); // => 'html'
req.is('text/html'); // => 'text/html'
req.is('text/*'); // => 'text/*'

// When Content-Type is application/json
req.is('json'); // => 'json'
req.is('application/json'); // => 'application/json'
req.is('application/*'); // => 'application/*'

// Using arrays
// When Content-Type is application/json
req.is(['json', 'html']); // => 'json'

// Using multiple arguments
// When Content-Type is application/json
req.is('json', 'html'); // => 'json'

req.is('html'); // => false
req.is(['xml', 'yaml']); // => false
req.is('xml', 'yaml'); // => false
```

For more information, or if you have issues or concerns, see [type-is](https://github.com/expressjs/type-is).

### req.range()

**Parameters**

- **`size`** · `Number`

  The maximum size of the resource.

- **`options`** · `Object` · optional

  Options for parsing the `Range` header.

  - **`combine`** · `Boolean` · default: `false`

    Specify if overlapping and adjacent ranges should be combined. When `true`, ranges are
    combined and returned as if they were specified that way in the header.

    ```js
    // Range: bytes=0-99,50-149
    const separate = req.range(1000, { combine: false });
    console.log(separate[0]); // => { start: 0, end: 99 }
    console.log(separate[1]); // => { start: 50, end: 149 }

    const combined = req.range(1000, { combine: true });
    console.log(combined[0]); // => { start: 0, end: 149 }
    ```

**Returns:** `Array | Number`

`Range` header parser.

An array of ranges will be returned or negative numbers indicating an error parsing.

- `-2` signals a malformed header string
- `-1` signals an unsatisfiable range

```js
// parse header from request
const range = req.range(1000);

// the type of the range
if (range.type === 'bytes') {
  // the ranges
  range.forEach((r) => {
    // do something with r.start and r.end
  });
}
```
