---
title: Licence and credit
description: The licences of the abedmurrar/express docs, and credit to the Express documentation authors.
---

# Licence and credit

## The Express documentation

The pages under Getting started, Guide, API reference (5.x) and Advanced topics are adapted from the [Express website](https://expressjs.com), whose source is [expressjs/expressjs.com](https://github.com/expressjs/expressjs.com).

- **Authors:** © The Express Contributors.
- **Licence:** [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). The full licence text is in the source repository's [LICENSE.md](https://github.com/expressjs/expressjs.com/blob/main/LICENSE.md).
- **Source version:** commit [`14b435df`](https://github.com/expressjs/expressjs.com/tree/14b435df23ad5a6117030e9eda13286efae87b8f) of 2026-11-20, English content only.

These pages are not endorsed by the Express project or the OpenJS Foundation.

### What we changed

- Converted the pages from Astro MDX to VitePress Markdown. Notes and warnings became VitePress callouts; the function signature boxes became parameter lists; the CommonJS, ESM and TypeScript variants of an example became tabs; the package manager command boxes became plain `npm` commands; one HTML table and one HTML list became Markdown.
- Links to pages that this site doesn't include (other Express versions, the middleware pages, community, support and security updates) now go to expressjs.com. Links to the Express examples go to the copy of the examples in this fork.
- Added notes for this fork: the supported Node.js versions (22, 24 and 26) and how to install the fork, on the Installing, FAQ, Migrating to Express 5 and API overview pages.
- Left out: other languages, the blog, the 3.x and 4.x documentation, Moving to Express 4, Security updates, and the resources pages.

## The fork's own pages

The home page and the pages in the [Fork](/fork/) section are © 2026-present Abed Murrar, and are also available under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## The code

Express and this fork are released under the [MIT licence](https://github.com/abedmurrar/express/blob/master/LICENSE). The vendored copies of `router` and `send` keep their original licences.

The Express name belongs to its owners. This site doesn't use the Express logo, and nothing on it is meant to look like the official project.
