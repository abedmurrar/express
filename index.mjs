/*!
 * express
 * MIT Licensed
 */

// The ES module entry. It re-exports the CommonJS build, so `import` and
// `require` share one copy of Express (no dual-package hazard), and lists the
// same named exports Node gives a CommonJS module.

import express from './index.js'

export default express

export const { application, request, response, Route, Router, json, raw, text, urlencoded } = express

const serveStatic = express.static

// Node 24 gives every CommonJS module a 'module.exports' export too.
export { serveStatic as static, express as 'module.exports' }
