---
title: Installing
description: Learn how to install Express.js in your Node.js environment, including setting up your project directory, managing dependencies with npm, and configuring TypeScript.
---

# Installing

::: tip This fork
These steps install the official `express` package from npm. To use this fork instead, install it from GitHub with `npm install github:abedmurrar/express`. It installs under the name `express`, so the rest of this page applies unchanged. See [Install the fork](/fork/install).
:::

Before you begin, make sure you have [Node.js](https://nodejs.org/) 18 or higher installed (this fork needs Node.js 22, 24 or 26). Then, create a directory for your application and navigate into it.

```bash
mkdir myapp
cd myapp
```

Use the `npm init` command to create a `package.json` file for your application.
For more information on how `package.json` works, see [Specifics of npm's package.json handling](https://docs.npmjs.com/files/package.json).

```bash
npm init
```

This command prompts you for a number of things, such as the name and version of your application.
For now, you can simply hit RETURN to accept the defaults for most of them, with the following exception:

```
entry point: (index.js)
```

Enter `app.js`, or whatever you want the name of the main file to be. If you want it to be `index.js`, hit RETURN to accept the suggested default file name.

Now, install Express in the `myapp` directory and save it in the dependencies list. For example:

```bash
npm install express
```

To install Express temporarily and not add it to the dependencies list:

```bash
npm install express --no-save
```

## TypeScript

This fork bundles its own type definitions, ported from the community-maintained `@types/express`
(from [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)), so you don't need
`@types/express`. Install TypeScript and the Node.js types as development dependencies:

```bash
npm install --save-dev typescript @types/node
```

See [Install the fork](/fork/install#typescript) for moving an existing project off `@types/express`.

::: warning

Some middleware does not bundle its own type definitions. If you add an official middleware package
that TypeScript reports as untyped, also install its types from DefinitelyTyped as a dev dependency,
for example `@types/cors` alongside `cors`.

:::

Add a `tsconfig.json`. These options mirror how Node.js runs TypeScript and make the compiler reject
non-erasable syntax (such as `enum`s, namespaces, and parameter properties) that Node cannot strip:

::: code-group

```json [tsconfig.json]
{
  "compilerOptions": {
    "target": "esnext",
    "module": "nodenext",
    "rewriteRelativeImportExtensions": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true
  }
}
```

:::

Write your application in TypeScript, annotating the [request](/api/request) and [response](/api/response) objects:

::: code-group

```ts [src/app.ts]
import express, { type Express, type Request, type Response } from 'express';

const app: Express = express();

app.get('/', (req: Request, res: Response) => {
  res.send('Hello World!');
});

app.listen(3000);
```

:::

You do not need to annotate everything. When you pass a handler directly to a route method or to
`app.use()`, Express infers the types of `req`, `res`, and `next`, and it infers route parameters
from the path, so `req.params.id` is a `string` in `app.get('/users/:id', ...)`. Add explicit types
only where TypeScript has no context to infer from: error-handling middleware, whose
`(err, req, res, next)` signature is not inferred, and handlers you define separately from the route.
In those cases, annotate the parameters or type the whole function as `RequestHandler` or
`ErrorRequestHandler`.

Run the file directly with Node.js, which strips the TypeScript types and runs the result without a
build step:

```bash
node src/app.ts
```

::: info

Running `.ts` files directly requires Node.js >= 22.18.0 (or >= 23.6.0 on the v23 line) and
TypeScript >= 5.8. Node strips the types but does not type-check them, so run `npx tsc` to type-check
your project. For more details, see the Node.js guide on
[running TypeScript natively](https://nodejs.org/learn/typescript/run-natively).

:::
