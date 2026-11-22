'use strict'

// Fails when the published type declarations grow past a budget, so they
// can't bloat unnoticed. It counts what `npm pack` would publish, so a new
// declaration file counts as soon as package.json `files` lets it in.
//
// The budget is about 20% above the size when it was set (62,551 bytes). Raise
// it on purpose, in the same PR as the growth, and say why.

var { execFileSync } = require('node:child_process')
var path = require('node:path')

var LIMIT = 75000

var root = path.join(__dirname, '..')
var npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
var pack = JSON.parse(
  execFileSync(npm, ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32'
  })
)
var files = pack[0].files.filter(function (file) {
  return /\.d\.[cm]?ts$/.test(file.path)
})
var total = files.reduce(function (sum, file) {
  return sum + file.size
}, 0)

files.forEach(function (file) {
  console.log(String(file.size).padStart(8) + '  ' + file.path)
})
console.log(String(total).padStart(8) + '  total (budget ' + LIMIT + ' bytes)')

if (files.length === 0) {
  console.error('no type declarations in the package')
  process.exitCode = 1
} else if (total > LIMIT) {
  console.error('the type declarations are ' + (total - LIMIT) + ' bytes over budget')
  process.exitCode = 1
}
