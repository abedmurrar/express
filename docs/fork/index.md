---
title: The fork
description: What abedmurrar/express is, how it relates to Express, and where to find what it changes.
---

# The fork

[abedmurrar/express](https://github.com/abedmurrar/express) is an unofficial fork of [Express](https://expressjs.com), the web framework for Node.js. It is not the official Express project, and it isn't published to npm yet.

The `master` branch is a drop-in replacement for **Express 5.3.0** on **Node.js 22, 24 and 26**. It gives the same responses byte for byte, except for bug fixes, and community middleware written for Express keeps working unchanged. Breaking changes go to a separate `6.x` line.

The rest of this site is the Express 5.x documentation from [expressjs.com](https://expressjs.com), and it applies to the fork as written. This section covers only what the fork adds:

- [Differences from Express 5.3.0](./differences): everything the fork has changed so far.
- [Compatibility promise](./compatibility): what "drop-in" means and how each change is checked.
- [Benchmarks](./benchmarks): how fast the fork is compared with Express 5.3.0 and other frameworks.
- [Roadmap](./roadmap): what comes next.
- [Install the fork](./install): how to try it in your app.

## Credit

Express was created by [TJ Holowaychuk](https://github.com/tj) and is maintained by the [Express team and its contributors](https://github.com/expressjs/express/graphs/contributors). Everything here builds on their work. The documentation outside this section is adapted from [expressjs.com](https://github.com/expressjs/expressjs.com) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); see the [licence page](/LICENSE) for what was changed.

To report a problem with the fork, open an issue at [abedmurrar/express](https://github.com/abedmurrar/express/issues), not on the Express project. Security reports follow the fork's [security policy](https://github.com/abedmurrar/express/blob/master/SECURITY.md).
