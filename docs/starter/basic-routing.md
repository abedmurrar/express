---
title: Basic routing
description: Learn the fundamentals of routing in Express.js applications, including how to define routes, handle HTTP methods, and create route handlers for your web server.
---

# Basic routing

_Routing_ refers to determining how an application responds to a client request to a particular endpoint, which is a URI (or path) and a specific HTTP request method (GET, POST, and so on).

Each route can have one or more handler functions, which are executed when the route is matched.

Route definition takes the following structure:

```js
app.METHOD(PATH, HANDLER);
```

Where:

- `app` is an instance of `express`.
- `METHOD` is an [HTTP request method](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods), in lowercase.
- `PATH` is a path on the server.
- `HANDLER` is the function executed when the route is matched.

::: danger

This tutorial assumes that an instance of `express` named `app` is created and the server is
running. If you are not familiar with creating an app and starting it, see the [Hello world
example](/starter/hello-world).

:::

The following examples illustrate defining simple routes.

Respond with `Hello World!` on the homepage:

::: code-group

```js [JavaScript]
app.get('/', (req, res) => {
  res.send('Hello World!');
});
```

```ts [TypeScript]
import { type Request, type Response } from 'express';

app.get('/', (req: Request, res: Response) => {
  res.send('Hello World!');
});
```

:::

Respond to a POST request on the root route (`/`), the application's home page:

::: code-group

```js [JavaScript]
app.post('/', (req, res) => {
  res.send('Got a POST request');
});
```

```ts [TypeScript]
import { type Request, type Response } from 'express';

app.post('/', (req: Request, res: Response) => {
  res.send('Got a POST request');
});
```

:::

Respond to a PUT request to the `/user` route:

::: code-group

```js [JavaScript]
app.put('/user', (req, res) => {
  res.send('Got a PUT request at /user');
});
```

```ts [TypeScript]
import { type Request, type Response } from 'express';

app.put('/user', (req: Request, res: Response) => {
  res.send('Got a PUT request at /user');
});
```

:::

Respond to a DELETE request to the `/user` route:

::: code-group

```js [JavaScript]
app.delete('/user', (req, res) => {
  res.send('Got a DELETE request at /user');
});
```

```ts [TypeScript]
import { type Request, type Response } from 'express';

app.delete('/user', (req: Request, res: Response) => {
  res.send('Got a DELETE request at /user');
});
```

:::

::: tip Read more

For more details about routing, see the [Routing](/guide/routing) guide.

:::
