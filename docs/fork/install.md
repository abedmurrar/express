---
title: Install the fork
description: How to install abedmurrar/express from GitHub in place of Express 5.
---

# Install the fork

The fork needs **Node.js 22, 24 or 26**. Older versions are not supported.

It isn't on npm yet. Install it from GitHub:

```bash
npm install github:abedmurrar/express
```

It installs under the name `express`, so your code doesn't change:

::: code-group

```js [index.cjs]
const express = require('express')
const app = express()

app.get('/', (req, res) => {
  res.send('Hello World')
})

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000')
})
```

```js [index.mjs]
import express from 'express'

const app = express()

app.get('/', (req, res) => {
  res.send('Hello World')
})

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000')
})
```

:::

In `package.json` the dependency looks like this:

```json
{
  "dependencies": {
    "express": "github:abedmurrar/express"
  }
}
```

## Moving from Express 5

If your app runs on Express 5.3.0, replace the `express` dependency as shown above and run your tests. Nothing else should change (see the [compatibility promise](./compatibility)). If your app is still on Express 4, first follow [Migrating to Express 5](/guide/migrating-5).

## Going back

To return to the official package:

```bash
npm install express@5
```

## TypeScript

The fork ships its own types, ported from `@types/express` 5.0.6 and `@types/express-serve-static-core` 5.1.3 (DefinitelyTyped, MIT, credited in each file). Remove the DefinitelyTyped packages and keep `@types/node`:

```bash
npm uninstall @types/express @types/express-serve-static-core
npm install --save-dev typescript @types/node
```

Code written for `@types/express` compiles unchanged: the same type names and generics (`Request<P, ResBody, ReqBody, ReqQuery, Locals>`, `Response<ResBody, Locals>`, `RequestHandler`, `ErrorRequestHandler`, `NextFunction`, `Router`, `Application`, `Express`), route parameters inferred from the path, and the global `Express` namespace that middleware types add to (for example `req.user` from passport and `req.file` from multer). Other `@types` packages for middleware keep working; they pick up these types.

The types are tested on TypeScript 7, 5.9 and 5.2, the oldest version that `@types/node` 22 supports.

If your code imports from `express-serve-static-core`, those imports keep working while another `@types` package still installs it. To point them at the fork's types instead, add a `paths` entry to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": { "express-serve-static-core": ["./node_modules/express/typings/core.d.ts"] }
  }
}
```

The names usually imported from there, such as `ParamsDictionary`, `Query`, `RouteParameters` and `PathParams`, are also exported by `express`.

## ES modules

`import express from 'express'` and named imports such as `import { Router, json, static as serveStatic } from 'express'` load `index.mjs`, a thin ES module wrapper over the CommonJS build. Both entries give the same objects, so an app that mixes `import` and `require` still has one copy of Express. `require('express')` keeps the export shape of Express 5.3.0, and deep requires such as `require('express/lib/express')` still work.
