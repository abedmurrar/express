'use strict'

// Runs the type tests (test/types) on TypeScript 5.x. `npm run test:types`
// runs them on 7, the root install's version. The 5.x compilers are in
// test/types/ts5, with an install of their own
// (`npm run test:types:ts5:install`).
//
// The versions:
// - 5.2, the oldest that the @types/node release our declarations are tested
//   with supports (its package.json `typeScriptVersion`). The declarations
//   depend on nothing else. TypeScript up to 5.6 also reads @types/node
//   through its `typesVersions`, so this covers that copy too.
// - 5.9, the last 5.x.
// When @types/node drops 5.2, move the first one up to its new minimum.

var { spawnSync } = require('node:child_process')
var fs = require('node:fs')
var path = require('node:path')

var tests = path.join(__dirname, '..', 'test', 'types')
var install = path.join(tests, 'ts5')

var runs = {
  // The loose config needs `module: preserve`, which TypeScript 5.4 added, so
  // on 5.2 the loose tests run under the node10 config alone.
  'typescript-5.2': ['tsconfig.json', 'tsconfig.node10.json', 'tsconfig.dt.json'],
  'typescript-5.9': ['tsconfig.json', 'tsconfig.loose.json', 'tsconfig.node10.json', 'tsconfig.dt.json']
}

Object.keys(runs).forEach(function (name) {
  var compiler = path.join(install, 'node_modules', name)

  if (!fs.existsSync(compiler)) {
    console.error(name + ' is not installed: run `npm run test:types:ts5:install`')
    process.exitCode = 1
    return
  }

  var version = require(path.join(compiler, 'package.json')).version

  runs[name].forEach(function (config) {
    var tsc = spawnSync(process.execPath, [path.join(compiler, 'bin', 'tsc'), '-p', path.join(tests, config)], {
      stdio: 'inherit'
    })
    var ok = tsc.status === 0

    console.log((ok ? 'ok    ' : 'FAIL  ') + 'TypeScript ' + version + '  ' + config)
    if (!ok) process.exitCode = 1
  })
})
