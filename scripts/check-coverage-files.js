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

// lcov (used by CI to merge the per-platform reports) rejects a file that
// lists two functions under the same name, which happens when V8 infers the
// same name for two anonymous functions.
var duplicates = []
lcov.split('end_of_record').forEach(function (record) {
  var file = /^SF:(.*)$/m.exec(record)
  var seen = new Set()
  record.split('\n').forEach(function (line) {
    var m = /^FN:\d+,(.*)$/.exec(line)
    if (!m) return
    if (seen.has(m[1])) duplicates.push(file[1] + ' ' + m[1])
    seen.add(m[1])
  })
})

if (duplicates.length) {
  console.error('Duplicate function names in the coverage report (lcov rejects these): ' + duplicates.join(', '))
  process.exit(1)
}

if (missing.length) {
  console.error('Missing from the coverage report: ' + missing.join(', '))
  process.exit(1)
}
console.log('Coverage report covers all ' + sources.length + ' source files.')
