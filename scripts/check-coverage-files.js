'use strict'

// Fails when a source file is missing from the coverage report, so a file
// can't drop out of the 100% gate unnoticed (for example through an include
// pattern that doesn't match its extension). Run after c8 writes lcov.

var fs = require('node:fs')
var path = require('node:path')

var root = path.join(__dirname, '..')
var lcov = fs.readFileSync(path.join(root, 'coverage', 'lcov.info'), 'utf8')
var covered = new Set(
  lcov
    .split('\n')
    .filter(function (line) {
      return line.startsWith('SF:')
    })
    .map(function (line) {
      return path
        .relative(root, path.resolve(root, line.slice(3)))
        .split(path.sep)
        .join('/')
    })
)

var sources = fs
  .readdirSync(path.join(root, 'src'), { recursive: true })
  .map(function (file) {
    return 'src/' + String(file).split(path.sep).join('/')
  })
  .filter(function (file) {
    return /\.(js|ts)$/.test(file) && !file.endsWith('.d.ts')
  })

var missing = sources.filter(function (file) {
  return !covered.has(file)
})

if (missing.length) {
  console.error('Missing from the coverage report: ' + missing.join(', '))
  process.exit(1)
}
console.log('Coverage report covers all ' + sources.length + ' source files.')
