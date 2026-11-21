// #7350 app.render() with a view name ending in "." throws an opaque TypeError synchronously instead of calling back
const { express } = require('./_req')
const app = express()
app.set('view engine', 'ejs')
let how
try {
  app.render('index.', (err) => { how = 'callback err: ' + (err && err.message) })
} catch (e) { how = 'THROWN synchronously: ' + e.code + ' ' + e.message.split('\n')[0] }
setTimeout(() => {
  console.log(how)
  console.log('VERDICT:', /THROWN.*ERR_INVALID_ARG_VALUE/.test(how) ? 'reproduced (require("") throws, callback never runs)' : 'not reproduced')
}, 100)
