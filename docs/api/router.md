---
title: Router
description: A router object is an isolated instance of middleware and routes in Express 5.x.
---

# Router

A `router` object is an instance of middleware and routes. You can think of it
as a "mini-application," capable only of performing middleware and routing
functions. Every Express application has a built-in app router.

A router behaves like middleware itself, so you can use it as an argument to
[app.use()](/api/application#appuse) or as the argument to another router's [use()](#routeruse) method.

The top-level `express` object has a [Router()](/api/express#expressrouter) method that creates a new `router` object.

Once you've created a router object, you can add middleware and HTTP method routes (such as `get`, `put`, `post`,
and so on) to it just like an application. For example:

::: code-group

```js [JavaScript]
// invoked for any requests passed to this router
router.use((req, res, next) => {
  // .. some logic here .. like any other middleware
  next();
});

// will handle any request that ends in /events
// depends on where the router is "use()'d"
router.get('/events', (req, res, next) => {
  // ..
});
```

```ts [TypeScript]
import { type Request, type Response, type NextFunction } from 'express';

// invoked for any requests passed to this router
router.use((req: Request, res: Response, next: NextFunction) => {
  // .. some logic here .. like any other middleware
  next();
});

// will handle any request that ends in /events
// depends on where the router is "use()'d"
router.get('/events', (req: Request, res: Response, next: NextFunction) => {
  // ..
});
```

:::

You can then use a router for a particular root URL in this way separating your routes into files or even mini-apps.

```js
// only requests to /calendar/* will be sent to our "router"
app.use('/calendar', router);
```

## Methods

### Router()

**Parameters**

- **`options`** · `Object` · optional

  Options that configure the router's behavior.

  - **`caseSensitive`** · `Boolean` · default: `false`

    Enable case sensitivity. Disabled by default, treating `/Foo` and `/foo` as the same.

  - **`mergeParams`** · `Boolean` · default: `false`

    Preserve the `req.params` values from the parent router. If the parent and the child have conflicting param names, the child's value takes precedence.

  - **`strict`** · `Boolean` · default: `false`

    Enable strict routing. Disabled by default, `/foo` and `/foo/` are treated the same by the router.

  - **`strictMount`** · `Boolean` · default: `false`

    With `strict`, be strict about the mount path too. Mounted with `app.use('/dir', router)`, a request for `/dir` (nothing after the mount path) matches only the router's routes for `''`, so `router.get('/')` answers `/dir/` and not `/dir`. Without it, a strict router's `/` route answers both, as in Express 5.3.0 ([#2281](https://github.com/expressjs/express/issues/2281)). Middleware added with `router.use()` matches both either way. Without `strict` this option does nothing. Not in Express 5.3.0.

    ```js
    const docs = express.Router({ strict: true, strictMount: true });
    docs.get('', (req, res) => res.redirect('/docs/')); // GET /docs
    docs.get('/', (req, res) => res.send('index'));      // GET /docs/
    app.use('/docs', docs);
    ```

**Returns:** `Router`

Creates a new router object.

::: code-group

```js [index.cjs]
const express = require('express');
const router = express.Router({ caseSensitive: true, strict: true }); // [!code ++]

router.get('/events', (req, res) => {
  res.send('events');
});

// mount the router on an app
app.use('/calendar', router);
```

```js [index.mjs]
import express from 'express';

const router = express.Router({ caseSensitive: true, strict: true }); // [!code ++]

router.get('/events', (req, res) => {
  res.send('events');
});

// mount the router on an app
app.use('/calendar', router);
```

```ts [index.ts]
import express, { type Request, type Response } from 'express';

const router = express.Router({ caseSensitive: true, strict: true });

router.get('/events', (req: Request, res: Response) => {
  res.send('events');
});

// mount the router on an app
app.use('/calendar', router);
```

:::

### router.all()

**Parameters**

- **`path`** · `String | RegExp | Array`

  The path for which the route callbacks are invoked.

- **`callback`** · `Function | Function[]`

  One or more middleware/handler functions. Each may call `next('route')` to skip the remaining
  callbacks.

**Returns:** `Router`

This method is just like the `router.METHOD()` methods, except that it matches all HTTP methods (verbs).

This method is extremely useful for
mapping "global" logic for specific path prefixes or arbitrary matches.
For example, if you placed the following route at the top of all other
route definitions, it would require that all routes from that point on
would require authentication, and automatically load a user. Keep in mind
that these callbacks do not have to act as end points; `loadUser`
can perform a task, then call `next()` to continue matching subsequent
routes.

```js
router.all('{*splat}', requireAuthentication, loadUser);
```

Or the equivalent:

```js
router.all('{*splat}', requireAuthentication);
router.all('{*splat}', loadUser);
```

Another example of this is white-listed "global" functionality. Here,
the example is much like before, but it only restricts paths prefixed with
"/api":

```js
router.all('/api/{*splat}', requireAuthentication);
```

### router.error()

**Parameters**

- **`path`** · `String | RegExp | Array` · _optional_, default `'/'`

  The path the error handlers are mounted at, as for [`router.use()`](#routeruse).

- **`callback`** · `Function | Function[]`

  One or more error handlers, called as `(err, req, res, next)`.

**Returns:** `Router`

This is a fork addition; Express 5.3.0 has no `router.error()`.

Adds error handlers to the router, as [`app.error()`](/api/application#apperror) adds them to an
app: mounted at `path` as `router.use()` mounts middleware, and run only when there is an error,
whatever the number of parameters the function declares. An error the router's handlers don't
handle leaves the router, to the error handlers of the app or router it is mounted on.

```js
const api = express.Router();

api.get('/users/:id', loadUser);

api.error((err, req, res, next) => {
  if (err.code !== 'USER_NOT_FOUND') return next(err);
  res.status(404).json({ error: 'not found' });
});

app.use('/api', api);
```

The layers it adds have `errorOnly` set to `true` in `router.stack`.

In TypeScript, `express.Router()` returns a `RouterWithErrorHandlers`: a `Router` with `error()`,
kept through chaining. The `Router` type itself has no `error()`, so that a router typed with
`@types/express-serve-static-core` stays assignable to it. A variable annotated `express.Router`
therefore doesn't show `error()`; let the type be inferred, or annotate it
`express.RouterWithErrorHandlers`:

```ts
const api = express.Router(); // RouterWithErrorHandlers
api.error(onError);

const typed: express.Router = express.Router();
typed.error(onError); // type error: express.Router has no error()
```

### router.listRoutes()

**Returns:** `Array`

This is a fork addition; Express 5.3.0 has no `router.listRoutes()` (with router 2.3.0 it has, but
it doesn't list mounted apps).

Lists the routes registered on the router, and the routers and apps mounted on it, in the order they
were added: one `{ path, methods, router }` object per path, so an array of paths gives one for each,
nested arrays included.

- `path` is the path as it was registered: a string, or a copy of the regular expression. A route
  matches the full path; a mounted router matches it as a prefix.
- `methods` is the route's HTTP methods in uppercase, in the order they were first added. `.all()`
  is `'*'`, and `HEAD` comes last for a route with `GET` and no `HEAD` of its own. It is empty for a
  route with no handlers yet, and `undefined` for a mounted router or app.
- `router` is the router or app that was passed to `use()`, and `undefined` for a route. It is not
  expanded: call its `listRoutes()`. A router or an app of another package, such as one made with
  Express 5.3.0, may have none.

```js
const router = express.Router();
const users = express.Router();

users.get('/:id', loadUser);
router.use('/users', users);
router.route('/status').all(logRequest).get(status);

console.log(router.listRoutes());
// [
//   { path: '/users', methods: undefined, router: users },
//   { path: '/status', methods: ['*', 'GET', 'HEAD'], router: undefined }
// ]
```

Middleware and error handlers are not listed. Anything else with a `stack` array is taken for a
router, whatever made it. An empty array in a path array has no path to list.

Listing changes nothing: the array, its objects and their `methods` and regular expressions are
copies, so changing them doesn't change how the router routes. Only `router` is the real one.

In TypeScript the entries are `express.RouteInfo`. As with [`router.error()`](#routererror), the
method is on what `express.Router()` returns, not on the `express.Router` type.

### router.METHOD()

**Parameters**

- **`path`** · `String | RegExp | Array`

  The path for which the route callbacks are invoked.

- **`callback`** · `Function | Function[]`

  One or more middleware/handler functions. Each may call `next('route')` to skip the remaining
  callbacks.

**Returns:** `Router`

The `router.METHOD()` methods provide the routing functionality in Express,
where METHOD is one of the HTTP methods, such as GET, PUT, POST, and so on,
in lowercase. Thus, the actual methods are `router.get()`, `router.post()`,
`router.put()`, and so on.

::: info

The `router.get()` function is automatically called for the HTTP `HEAD` method in addition to the
`GET` method if `router.head()` was not called for the path before `router.get()`.

:::

::: info

`router.query()` routes HTTP `QUERY` requests, mirroring [`app.query()`](/api/application#appquery). The `QUERY` method is gated by the runtime and requires Node.js `>=20.19.3 <21 || >=22.2.0`.

:::

You can provide multiple callbacks, and all are treated equally, and behave just
like middleware, except that these callbacks may invoke `next('route')`
to bypass the remaining route callback(s). You can use this mechanism to perform
pre-conditions on a route then pass control to subsequent routes when there is no
reason to proceed with the route matched.

The following snippet illustrates the most simple route definition possible.
Express translates the path strings to regular expressions, used internally
to match incoming requests. Query strings are _not_ considered when performing
these matches, for example "GET /" would match the following route, as would
"GET /?name=tobi".

::: code-group

```js [JavaScript]
router.get('/', (req, res) => {
  res.send('hello world');
});
```

```ts [TypeScript]
import { type Request, type Response } from 'express';

router.get('/', (req: Request, res: Response) => {
  res.send('hello world');
});
```

:::

You can also use regular expressions&mdash;useful if you have very specific
constraints, for example the following would match "GET /commits/71dbb9c" as well
as "GET /commits/71dbb9c..4c084f9".

::: code-group

```js [JavaScript]
router.get(/^\/commits\/(\w+)(?:\.\.(\w+))?$/, (req, res) => {
  const from = req.params[0];
  const to = req.params[1] || 'HEAD';
  res.send(`commit range ${from}..${to}`);
});
```

```ts [TypeScript]
import { type Request, type Response } from 'express';

router.get(/^\/commits\/(\w+)(?:\.\.(\w+))?$/, (req: Request, res: Response) => {
  const from = req.params[0];
  const to = req.params[1] || 'HEAD';
  res.send(`commit range ${from}..${to}`);
});
```

:::

You can use `next` primitive to implement a flow control between different
middleware functions, based on a specific program state. Invoking `next` with
the string `'router'` will cause all the remaining route callbacks on that router
to be bypassed.

The following example illustrates `next('router')` usage.

::: code-group

```js [JavaScript]
function fn(req, res, next) {
  console.log('I come here');
  next('router');
}
router.get('/foo', fn, (req, res, next) => {
  console.log("I don't come here");
});
router.get('/foo', (req, res, next) => {
  console.log("I don't come here");
});
app.get('/foo', (req, res) => {
  console.log(' I come here too');
  res.end('good');
});
```

```ts [TypeScript]
import { type Request, type Response, type NextFunction } from 'express';

function fn(req: Request, res: Response, next: NextFunction) {
  console.log('I come here');
  next('router');
}
router.get('/foo', fn, (req: Request, res: Response, next: NextFunction) => {
  console.log("I don't come here");
});
router.get('/foo', (req: Request, res: Response, next: NextFunction) => {
  console.log("I don't come here");
});
app.get('/foo', (req: Request, res: Response) => {
  console.log(' I come here too');
  res.end('good');
});
```

:::

### router.param()

**Parameters**

- **`name`** · `String`

  The name of the route parameter to attach the trigger to. Unlike `app.param()`, this does not
  accept an array.

- **`callback`** · `Function`

  The trigger called as `callback(req, res, next, value, name)`.

**Returns:** `Router`

Adds callback triggers to route parameters, where `name` is the name of the parameter and `callback` is the callback function. The `name` parameter is required.

The parameters of the callback function are:

- `req`, the request object.
- `res`, the response object.
- `next`, indicating the next middleware function.
- The value of the `name` parameter.
- The name of the parameter.

::: info

Unlike `app.param()`, `router.param()` does not accept an array of route parameters.

:::

For example, when `:user` is present in a route path, you may map user loading logic to automatically provide `req.user` to the route, or perform validations on the parameter input.

::: code-group

```js [JavaScript]
router.param('user', (req, res, next, id) => {
  // try to get the user details from the User model and attach it to the request object
  User.find(id, (err, user) => {
    if (err) {
      next(err);
    } else if (user) {
      req.user = user;
      next();
    } else {
      next(new Error('failed to load user'));
    }
  });
});
```

```ts [TypeScript]
import { type Request, type Response, type NextFunction } from 'express';

router.param('user', (req: Request, res: Response, next: NextFunction, id: string) => {
  // try to get the user details from the User model and attach it to the request object
  User.find(id, (err, user) => {
    if (err) {
      next(err);
    } else if (user) {
      req.user = user;
      next();
    } else {
      next(new Error('failed to load user'));
    }
  });
});
```

:::

Param callback functions are local to the router on which they are defined. They are not inherited by mounted apps or routers, nor are they triggered for route parameters inherited from parent routers. Hence, param callbacks defined on `router` will be triggered only by route parameters defined on `router` routes.

A param callback will be called only once in a request-response cycle, even if the parameter is matched in multiple routes, as shown in the following examples.

::: code-group

```js [JavaScript]
router.param('id', (req, res, next, id) => {
  console.log('CALLED ONLY ONCE');
  next();
});

router.get('/user/:id', (req, res, next) => {
  console.log('although this matches');
  next();
});

router.get('/user/:id', (req, res) => {
  console.log('and this matches too');
  res.end();
});
```

```ts [TypeScript]
import { type Request, type Response, type NextFunction } from 'express';

router.param('id', (req: Request, res: Response, next: NextFunction, id: string) => {
  console.log('CALLED ONLY ONCE');
  next();
});

router.get('/user/:id', (req: Request, res: Response, next: NextFunction) => {
  console.log('although this matches');
  next();
});

router.get('/user/:id', (req: Request, res: Response) => {
  console.log('and this matches too');
  res.end();
});
```

:::

On `GET /user/42`, the following is printed:

```
CALLED ONLY ONCE
although this matches
and this matches too
```

### router.route()

**Parameters**

- **`path`** · `String`

  The path of the route to create.

**Returns:** `Route`

Returns an instance of a single route which you can then use to handle HTTP verbs
with optional middleware. Use `router.route()` to avoid duplicate route naming and
thus typing errors.

Building on the `router.param()` example above, the following code shows how to use
`router.route()` to specify various HTTP method handlers.

::: code-group

```js [JavaScript]
const router = express.Router();

router.param('user_id', (req, res, next, id) => {
  // sample user, would actually fetch from DB, etc...
  req.user = {
    id,
    name: 'TJ',
  };
  next();
});

router
  .route('/users/:user_id')
  .all((req, res, next) => {
    // runs for all HTTP verbs first
    // think of it as route specific middleware!
    next();
  })
  .get((req, res, next) => {
    res.json(req.user);
  })
  .put((req, res, next) => {
    // just an example of maybe updating the user
    req.user.name = req.params.name;
    // save user ... etc
    res.json(req.user);
  })
  .post((req, res, next) => {
    next(new Error('not implemented'));
  })
  .delete((req, res, next) => {
    next(new Error('not implemented'));
  });
```

```ts [index.ts]
import express, { type Request, type Response, type NextFunction } from 'express';

const router = express.Router();

router.param('user_id', (req: Request, res: Response, next: NextFunction, id: string) => {
  // sample user, would actually fetch from DB, etc...
  req.user = {
    id,
    name: 'TJ',
  };
  next();
});

router
  .route('/users/:user_id')
  .all((req: Request, res: Response, next: NextFunction) => {
    // runs for all HTTP verbs first
    // think of it as route specific middleware!
    next();
  })
  .get((req: Request, res: Response, next: NextFunction) => {
    res.json(req.user);
  })
  .put((req: Request, res: Response, next: NextFunction) => {
    // just an example of maybe updating the user
    req.user.name = req.params.name;
    // save user ... etc
    res.json(req.user);
  })
  .post((req: Request, res: Response, next: NextFunction) => {
    next(new Error('not implemented'));
  })
  .delete((req: Request, res: Response, next: NextFunction) => {
    next(new Error('not implemented'));
  });
```

:::

This approach re-uses the single `/users/:user_id` path and adds handlers for
various HTTP methods.

::: info

When you use `router.route()`, middleware ordering is based on when the _route_ is created, not
when method handlers are added to the route. For this purpose, you can consider method handlers to
belong to the route to which they were added.

:::

### router.use()

**Parameters**

- **`path`** · `String | RegExp | Array` · optional

  The mount path for the middleware. Defaults to `/`.

- **`callback`** · `Function | Function[]`

  One or more middleware functions to mount.

**Returns:** `Router`

Uses the specified middleware function or functions, with optional mount path `path`, that defaults to "/".

This method is similar to [app.use()](/api/application#appuse). A simple example and use case is described below.
See [app.use()](/api/application#appuse) for more information.

Middleware is like a plumbing pipe: requests start at the first middleware function defined
and work their way "down" the middleware stack processing for each path they match.

::: code-group

```js [index.cjs]
const express = require('express');
const app = express();
const router = express.Router();

// simple logger for this router's requests
// all requests to this router will first hit this middleware
router.use((req, res, next) => {
  console.log('%s %s %s', req.method, req.url, req.path);
  next();
});

// this will only be invoked if the path starts with /bar from the mount point
router.use('/bar', (req, res, next) => {
  // ... maybe some additional /bar logging ...
  next();
});

// always invoked
router.use((req, res, next) => {
  res.send('Hello World');
});

app.use('/foo', router);

app.listen(3000);
```

```js [index.mjs]
import express from 'express';

const app = express();
const router = express.Router();

// simple logger for this router's requests
// all requests to this router will first hit this middleware
router.use((req, res, next) => {
  console.log('%s %s %s', req.method, req.url, req.path);
  next();
});

// this will only be invoked if the path starts with /bar from the mount point
router.use('/bar', (req, res, next) => {
  // ... maybe some additional /bar logging ...
  next();
});

// always invoked
router.use((req, res, next) => {
  res.send('Hello World');
});

app.use('/foo', router);

app.listen(3000);
```

```ts [index.ts]
import express, { type Request, type Response, type NextFunction } from 'express';

const app = express();
const router = express.Router();

// simple logger for this router's requests
// all requests to this router will first hit this middleware
router.use((req: Request, res: Response, next: NextFunction) => {
  console.log('%s %s %s', req.method, req.url, req.path);
  next();
});

// this will only be invoked if the path starts with /bar from the mount point
router.use('/bar', (req: Request, res: Response, next: NextFunction) => {
  // ... maybe some additional /bar logging ...
  next();
});

// always invoked
router.use((req: Request, res: Response, next: NextFunction) => {
  res.send('Hello World');
});

app.use('/foo', router);

app.listen(3000);
```

:::

The "mount" path is stripped and is _not_ visible to the middleware function.
The main effect of this feature is that a mounted middleware function may operate without
code changes regardless of its "prefix" pathname.

The stripped path is added back to `req.url` when the middleware calls `next()`. A `req.url` rewritten
by the middleware is treated as relative to the mount path, so rewriting it to `/index.html` inside a
router mounted at `/app` gives `/app/index.html` to what comes after.

The order in which you define middleware with `router.use()` is very important.
They are invoked sequentially, thus the order defines middleware precedence. For example,
usually a logger is the very first middleware you would use, so that every request gets logged.

::: code-group

```js [index.cjs]
const logger = require('morgan');

router.use(logger());
router.use(express.static(path.join(__dirname, 'public')));
router.use((req, res) => {
  res.send('Hello');
});
```

```js [index.mjs]
import logger from 'morgan';

router.use(logger());
router.use(express.static(path.join(__dirname, 'public')));
router.use((req, res) => {
  res.send('Hello');
});
```

```ts [index.ts]
import logger from 'morgan';
import { type Request, type Response } from 'express';

router.use(logger());
router.use(express.static(path.join(__dirname, 'public')));
router.use((req: Request, res: Response) => {
  res.send('Hello');
});
```

:::

Now suppose you wanted to ignore logging requests for static files, but to continue
logging routes and middleware defined after `logger()`. You would simply move the call to `express.static()` to the top,
before adding the logger middleware:

::: code-group

```js [JavaScript]
router.use(express.static(path.join(__dirname, 'public')));
router.use(logger());
router.use((req, res) => {
  res.send('Hello');
});
```

```ts [TypeScript]
import { type Request, type Response } from 'express';

router.use(express.static(path.join(__dirname, 'public')));
router.use(logger());
router.use((req: Request, res: Response) => {
  res.send('Hello');
});
```

:::

Another example is serving files from multiple directories,
giving precedence to "./public" over the others:

```js
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'files')));
app.use(express.static(path.join(__dirname, 'uploads')));
```

The `router.use()` method also supports named parameters so that your mount points
for other routers can benefit from preloading using named parameters.

::: info

Although these middleware functions are added via a particular router, _when_
they run is defined by the path they are attached to (not the router). Therefore,
middleware added via one router may run for other routers if its routes
match.

:::

For example, this code shows two different routers mounted on the same path:

::: code-group

```js [JavaScript]
const authRouter = express.Router();
const openRouter = express.Router();

authRouter.use(require('./authenticate').basic(usersdb));

authRouter.get('/:user_id/edit', (req, res, next) => {
  // ... Edit user UI ...
});
openRouter.get('/', (req, res, next) => {
  // ... List users ...
});
openRouter.get('/:user_id', (req, res, next) => {
  // ... View user ...
});

app.use('/users', authRouter);
app.use('/users', openRouter);
```

```ts [TypeScript]
import express, { type Request, type Response, type NextFunction } from 'express';
import { basic } from './authenticate';

const authRouter = express.Router();
const openRouter = express.Router();

authRouter.use(basic(usersdb));

authRouter.get('/:user_id/edit', (req: Request, res: Response, next: NextFunction) => {
  // ... Edit user UI ...
});
openRouter.get('/', (req: Request, res: Response, next: NextFunction) => {
  // ... List users ...
});
openRouter.get('/:user_id', (req: Request, res: Response, next: NextFunction) => {
  // ... View user ...
});

app.use('/users', authRouter);
app.use('/users', openRouter);
```

:::

Even though the authentication middleware was added via the `authRouter` it will run on the routes defined by the `openRouter` as well since both routers were mounted on `/users`. To avoid this behavior, use different paths for each router.
