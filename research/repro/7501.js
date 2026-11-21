// PR #7501 app.listen(port, cb) leaves its temporary "error" listener attached after a successful start
const { express } = require('./_req')
const app = express()
const server = app.listen(39223, '127.0.0.1', () => {
  const n = server.listenerCount('error')
  server.close()
  console.log('error listeners after successful listen:', n)
  console.log('VERDICT:', n > 0 ? 'reproduced (a later server error is swallowed instead of being thrown)' : 'not reproduced')
})
