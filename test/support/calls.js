'use strict'

var timers = require('node:timers/promises')

// An array that records calls: `record(value)` adds one, and `settled()`
// resolves once there is one, plus a little longer so that a second call would
// be seen too. For something that happens on its own time, such as a view
// engine reading its file, where a fixed wait can be too short on a busy
// machine.
module.exports = function recordCalls() {
  var calls = []
  var first
  var called = new Promise(function (resolve) {
    first = resolve
  })
  return {
    calls: calls,
    record: function (value) {
      calls.push(value)
      first()
    },
    settled: async function () {
      await called
      await timers.setTimeout(20)
    }
  }
}
