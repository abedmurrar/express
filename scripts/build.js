'use strict'

// Compiles src/ into lib/ (what is published and what the tests run against),
// and copies the vendored packages' licences next to their code. Plain Node,
// so it works on Windows too.

var { execFileSync } = require('node:child_process')
var fs = require('node:fs')
var path = require('node:path')

var root = path.join(__dirname, '..')
var lib = path.join(root, 'lib')

fs.rmSync(lib, { recursive: true, force: true })
execFileSync(
  process.execPath,
  [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.build.json'],
  { cwd: root, stdio: 'inherit' }
)

for (var dir of ['accepts', 'body-parser', 'negotiator', 'qs', 'router', 'send', 'serve-static']) {
  fs.copyFileSync(path.join(root, 'src', dir, 'LICENSE'), path.join(lib, dir, 'LICENSE'))
}
