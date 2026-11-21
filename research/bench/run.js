// Runs every target x scenario, ROUNDS times, rotating order; prints median req/s and p99 latency.
const { fork } = require('child_process'); const autocannon = require('autocannon')
const targets = ['e530', 'master', 'pr7555', 'fastify']
const scenarios = ['hello', 'json', 'mw10', 'routes100']
const ROUNDS = Number(process.env.ROUNDS || 3), DUR = Number(process.env.DUR || 10), PORT = 39181
const res = {}
const once = (t, s) => new Promise((resolve) => {
  const srv = fork(__dirname + '/server.js', [t, s, PORT], { execArgv: ['--max-old-space-size=256'] })
  srv.on('message', async () => {
    const url = `http://127.0.0.1:${PORT}` + (s === 'routes100' ? '/r99/abc' : '/')
    await autocannon({ url, connections: 50, duration: 3 }) // warmup
    const r = await autocannon({ url, connections: 50, pipelining: 1, duration: DUR })
    srv.kill(); srv.on('exit', () => resolve(r))
  })
})
;(async () => {
  for (let round = 0; round < ROUNDS; round++)
    for (const s of scenarios) {
      const order = targets.slice(round % targets.length).concat(targets.slice(0, round % targets.length))
      for (const t of order) {
        const r = await once(t, s)
        if (r.non2xx || r.errors) console.error('bad run', t, s, r.non2xx, r.errors)
        ;(res[s + '|' + t] ||= []).push({ rps: r.requests.average, p99: r.latency.p99 })
        console.error(`round ${round} ${s} ${t} ${Math.round(r.requests.average)} req/s p99 ${r.latency.p99}ms`)
      }
    }
  const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)]
  const out = []
  for (const s of scenarios) for (const t of targets) { const a = res[s + '|' + t]; out.push({ scenario: s, target: t, rps_median: Math.round(med(a.map(x => x.rps))), p99_median_ms: med(a.map(x => x.p99)), runs: a.map(x => Math.round(x.rps)) }) }
  console.log(JSON.stringify({ node: process.version, rounds: ROUNDS, duration_s: DUR, connections: 50, results: out }, null, 2))
})()
