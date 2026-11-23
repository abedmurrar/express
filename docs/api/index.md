---
title: 5.x API Reference
description: API Reference for version 5.x
---

# 5.x API Reference

This section provides an overview of the modules and APIs available in Express 5.x for building web applications and HTTP services.

::: code-group

```js [index.cjs]
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('hello world');
});

app.listen(3000);
```

```js [index.mjs]
import express from 'express';

const app = express();

app.get('/', (req, res) => {
  res.send('hello world');
});

app.listen(3000);
```

```ts [index.ts]
import express, { type Express, type Request, type Response } from 'express';

const app: Express = express();

app.get('/', (req: Request, res: Response) => {
  res.send('hello world');
});

app.listen(3000);
```

:::

::: info

Express 5.x requires **Node.js 18 or higher**. This fork supports **Node.js 22, 24 and 26** only.

:::

With express v5.x, you can define routes, configure middleware, and start handling HTTP requests using the application instance created by the `express()` function. The API is organized into the following sections:

- [express()](/api/express): the `express()` function, which creates an Express application.
- [Application object](/api/application): the properties and methods of the Express 5.x application object.
- [Request object](/api/request): the properties and methods of the Express 5.x request object.
- [Response object](/api/response): the properties and methods of the Express 5.x response object.
- [Router](/api/router): the properties and methods of the Express 5.x router.
- [Error codes](/api/errors): the `code` on every error Express creates, and when each one is raised (a fork addition).
