// PR #7501 follow-up: does a later server 'error' get swallowed by the leftover listener?
const { express } = require('./_req')
const app = express()
const server = app.listen(39226, '127.0.0.1', () => {
  let threw = false
  try { server.emit('error', new Error('later failure')) } catch (e) { threw = true }
  server.close()
  console.log('later error thrown/visible:', threw)
  console.log('VERDICT:', threw ? 'not reproduced' : 'reproduced (later error silently swallowed)')
})
