'use strict'

// Reads and updates History.md, which uses Express's setext headings:
//
//   Unreleased (fork)
//   =================
//
//   5.3.0 / 2026-10-09
//   ==================
//
// The notes of the next release are collected under "Unreleased (fork)".
// scripts/release.js moves them under "<version> / <date>".
//
//   node scripts/changelog.js notes <version>   print the notes of a version
//
// Adapted from the objection fork (abedmurrar/objection.js, scripts/changelog.js).

var fs = require('node:fs')
var path = require('node:path')

var historyPath = path.join(__dirname, '..', 'History.md')
var UNRELEASED = 'Unreleased (fork)'

function read() {
  return fs.readFileSync(historyPath, 'utf8')
}

// Indexes of setext headings: a non-empty line followed by a line of `=`.
function headings(lines) {
  var out = []
  for (var i = 0; i + 1 < lines.length; i++) {
    if (lines[i].trim() !== '' && /^=+$/.test(lines[i + 1])) out.push(i)
  }
  return out
}

// The text under the heading whose title is `title` (exactly, or followed by
// " / <date>"), up to the next heading.
function section(history, title) {
  var lines = history.split('\n')
  var heads = headings(lines)
  var start = heads.find(function (i) {
    return lines[i] === title || lines[i].startsWith(title + ' / ')
  })
  if (start === undefined) return null
  var next = heads.find(function (i) {
    return i > start
  })
  return lines
    .slice(start + 2, next === undefined ? lines.length : next)
    .join('\n')
    .trim()
}

function unreleasedNotes(history) {
  return section(history, UNRELEASED)
}

// Moves the unreleased notes under a heading for `version`, and leaves an
// empty "Unreleased (fork)" section above it.
function release(history, version, date) {
  var heading = UNRELEASED + '\n' + '='.repeat(UNRELEASED.length) + '\n'
  if (!history.startsWith(heading)) {
    throw new Error('History.md does not start with the "' + UNRELEASED + '" section')
  }
  if (section(history, version) !== null) {
    throw new Error('History.md already has a section for ' + version)
  }
  var title = version + ' / ' + date
  return heading + '\n' + title + '\n' + '='.repeat(title.length) + '\n' + history.slice(heading.length)
}

function write(history) {
  fs.writeFileSync(historyPath, history)
}

module.exports = { historyPath, read, section, unreleasedNotes, release, write }

if (require.main === module) {
  var command = process.argv[2]
  var version = process.argv[3]
  if (command !== 'notes' || !version) {
    console.error('usage: node scripts/changelog.js notes <version>')
    process.exit(1)
  }
  var notes = section(read(), version)
  if (notes === null) {
    console.error('No section for ' + version + ' in History.md')
    process.exit(1)
  }
  console.log(notes)
}
