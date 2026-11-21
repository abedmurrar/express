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

The fork doesn't ship its own types yet, so keep using `@types/express` as described in [Installing](/starter/installing#typescript). Built-in types are on the [roadmap](./roadmap).
