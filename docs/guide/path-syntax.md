---
title: Express 5 path syntax
description: How to rewrite Express 4 route paths for Express 5, what each path error means, and the paths that still register but match something else.
---

# Express 5 path syntax

Express 5 reads path strings with [path-to-regexp](https://www.npmjs.com/package/path-to-regexp) 8, where Express 4 used 0.1. Most of the special characters changed, so many Express 4 paths throw when the route is added. This page is for moving those paths over. [Routing](/guide/routing) describes the syntax from the start, and [Migrating to Express 5](/guide/migrating-5) covers the rest of the upgrade.

It applies to every path given as a string: `app.get()` and the other methods, `app.all()`, `app.route()`, `app.use()`, `app.error()`, and the same methods on a router. A path given as a `RegExp` is not parsed and works as in Express 4.

## The error

```js
app.all('*', (req, res) => {
  res.status(404).send('Not found');
});
```

```
TypeError: Missing parameter name at index 1: *; visit https://git.new/pathToRegexpError for info
```

The message is path-to-regexp's: what it didn't expect, the index in the path where it stopped, and the path. Older releases of path-to-regexp 8 say the same without the path, for example `Missing parameter name at 1: https://git.new/pathToRegexpError`. The stack trace has the line of your code that added the route.

The route is added while the app starts, so the first bad path stops the process and the others show up one at a time. To find the candidates at once, search your code for route paths that contain `*`, `?`, `+`, `!`, `(`, `)`, `[`, `]`, `{` or `}`.

| Error | Cause | Fix |
|---|---|---|
| `Missing parameter name at index …` | A `*` or a `:` with no name after it, or a name that starts with a digit | [Name the wildcard](#wildcards) or [the parameter](#parameter-names) |
| `Unexpected ? at index …` | Express 4's optional character or parameter | [Braces](#optional-parts) |
| `Unexpected + at index …` | Express 4's repeat | [A wildcard](#repeated-parts), or `\\+` for a plain `+` |
| `Unexpected ( at index …`, `Unexpected [ at index …` | A regular expression inside the path | [A list of paths, a `RegExp`, or a check in the handler](#regular-expressions) |
| `Unexpected ! at index …`, `Unexpected ) at index …`, `Unexpected ] at index …`, `Unexpected } at index …` | A reserved character | [Escape it](#reserved-characters) |
| `Unexpected end at index …, expected }` | A `{` with no `}` | Close the group, or escape the brace |
| `Missing text before "…" param`, `Missing text before "…" wildcard` | Two parameters or wildcards with nothing between them, as in `/:a:b` | Put text between them, or use a `RegExp` |
| `Unexpected end after \ at index …` | A path that ends in a backslash | Remove it |
| `Unterminated quote at index …` | A quoted name with no closing `"` | Close the quote |

## Cheat sheet

| Express 4 | Express 5 | What changes in `req.params` |
|---|---|---|
| `*` | `/{*splat}` | `req.params[0]` becomes `req.params.splat`, an array |
| `/*` | `/{*splat}` | the same |
| `/api/*` | `/api/{*splat}` | the same |
| `/user/:id?` | `/user{/:id}` | none: a missing `id` is still `undefined` |
| `/:file.:ext?` | `/:file{.:ext}` | none |
| `/ab?cd` | `/a{b}cd` | none |
| `/a(bc)?d` | `/a{bc}d` | `req.params[0]` is gone |
| `/:ids+` | `/*ids` | `req.params.ids` becomes an array of all the parts |
| `/(discussion\|page)/:slug` | `['/discussion/:slug', '/page/:slug']` | none |
| `/user/:id(\\d+)` | `/^\/user\/(?<id>\d+)\/?$/i` (a `RegExp`) | none |
| `/a!b` | `/a\\!b` | none |

The Express 5 column is tested on this fork, and the Express 4 column was run on Express 4.22.3.

## Wildcards

A wildcard needs a name, as a parameter does. It matches one or more segments, so `/*splat` doesn't match `/`. Put it in braces to match nothing as well:

| Path | `/api` | `/api/` | `/api/a` | `/api/a/b` |
|---|---|---|---|---|
| `/api/*splat` | no | no | yes | yes |
| `/api/{*splat}` | no | yes | yes | yes |
| `/api{/*splat}` | yes | yes | yes | yes |

Express 4's `/api/*` is the second one.

The value is an array with one entry per segment, each decoded on its own, and it is missing when the wildcard matched nothing:

```js
app.get('/files/{*path}', (req, res) => {
  // GET /files/docs/a%2Fb.txt  => { path: [ 'docs', 'a/b.txt' ] }
  // GET /files/                => {}
  const path = (req.params.path ?? []).join('/');
  res.send(path);
});
```

Start the path with `/`. `*splat` also matches everything, but its first entry is then the empty string before the first `/`.

### For every request

A handler or middleware for every path doesn't need a path:

```js
app.all('*', (req, res) => { // [!code --]
app.use((req, res) => { // [!code ++]
  res.status(404).send('Not found');
});
```

The same goes for `app.use('*', fn)` and `app.use('/api/*', fn)`: `app.use()` matches every path that starts with its own, so `app.use(fn)` and `app.use('/api', fn)` do it. They're not quite the same: `app.use('/api', fn)` also runs for `/api` itself, and `req.baseUrl` is `/api`, where a wildcard makes `req.baseUrl` the whole path.

## Optional parts

`?` is gone. Put the optional part in braces, with the separator that goes with it:

```js
app.get('/user/:id?', handler); // [!code --]
app.get('/user{/:id}', handler); // [!code ++]
```

`/user{/:id}` matches `/user`, `/user/` and `/user/7`. `/user/{:id}` doesn't match `/user`, only `/user/` and `/user/7`.

## Repeated parts

`+` and `*` after a parameter are gone. A wildcard takes one or more segments:

```js
app.get('/:ids+', handler); // [!code --]
app.get('/*ids', handler); // [!code ++]
```

In Express 4 `req.params.ids` held only the last segment. In Express 5 it is an array of all of them.

## Regular expressions

A path string can't hold a regular expression any more. Use whichever fits:

```js
// a list of paths
app.get(['/discussion/:slug', '/page/:slug'], handler);

// a RegExp, with named groups for the parameters
app.get(/^\/user\/(?<id>\d+)\/?$/i, handler);

// a check in the handler
app.get('/user/:id', (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next('route');
  res.send(`user ${req.params.id}`);
});
```

A `RegExp` is used as written: the `case sensitive routing` and `strict routing` settings don't apply to it. The `i` flag and the `\/?` above give it what a string path has by default. Its `req.params` is a plain object, where a string path's has no prototype.

## Reserved characters

`(`, `)`, `[`, `]`, `{`, `}`, `?`, `+`, `!`, `:`, `*` and `\` have a meaning, or are kept for later. To match one of them, put a backslash before it, which is two in a JavaScript string:

```js
app.get('/price\\(usd\\)', handler); // GET /price(usd)
```

A `?` never reaches the router, escaped or not: it starts the query string.

## Parameter names

A name is any JavaScript identifier, such as `:id`, `:user_id` or `:$ref`. Quote anything else:

```js
app.get('/:"user-id"', (req, res) => {
  res.send(req.params['user-id']);
});
```

Without the quotes, `/:user-id` is a parameter called `user` followed by the text `-id`, as in Express 4. A name that starts with a digit, such as `/:1`, throws.

## Paths that don't throw

These Express 4 paths still register, and match something else:

| Path | Express 4 | Express 5 |
|---|---|---|
| `/ab*cd` | `/ab`, anything, then `cd` | `/ab`, then a wildcard called `cd`: it matches `/abxyz` |
| `/a{b}` | the text `/a{b}` | `/a`, then an optional `b` |

Search for a `*` followed by a letter, and for braces.
