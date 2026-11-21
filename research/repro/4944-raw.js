// #4944 raw view: what bytes go on the wire for sendFile('/proc/cpuinfo')
const net = require('node:net')
const { express } = require('./_req')
const app = express()
app.get('/', (req, res) => res.sendFile('/proc/cpuinfo'))
const server = app.listen(39227, '127.0.0.1', () => {
  const s = net.connect(39227, '127.0.0.1', () => s.write('GET / HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'))
  let buf = ''
  s.on('data', (d) => { buf += d })
  s.on('close', () => {
    server.close()
    const [head, ...rest] = buf.split('\r\n\r\n')
    console.log(head.split('\r\n').filter((l) => /^(HTTP|Content-Length|Transfer)/i.test(l)).join(' | '))
    console.log('bytes after headers:', rest.join('\r\n\r\n').length)
  })
})
setTimeout(() => { server.close(); process.exit(0) }, 4000).unref()
