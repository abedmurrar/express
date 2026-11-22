'use strict'

// Ours, not upstream's: cases upstream's suite doesn't reach, which the
// coverage gate needs. Each one checks upstream's behaviour, and passes on the
// npm body-parser 2.4.0 too (with its own qs in place of ours).

const http = require('node:http')
const request = require('supertest')

const bodyParser = require('../../lib/body-parser')
const qs = require('../../lib/qs')

describe('body-parser fork additions', function () {
  describe('json({ strict: false })', function () {
    it('should parse an empty body as {}', function (done) {
      request(createServer(bodyParser.json({ strict: false })))
        .post('/')
        .set('Content-Type', 'application/json')
        .send('')
        .expect(200, '{}', done)
    })

    it('should 400 on malformed JSON with the native message', function (done) {
      request(createServer(bodyParser.json({ strict: false })))
        .post('/')
        .set('Content-Type', 'application/json')
        .send('{"a":')
        .expect(400, /^\[entity\.parse\.failed\] /, done)
    })
  })

  describe('json({ reviver }) throwing', function () {
    it('should keep only the message and stack of the thrown error', function (done) {
      const server = createServer(
        bodyParser.json({
          reviver: function () {
            throw Object.assign(new SyntaxError('reviver failed'), { code: 'E_REVIVER', detail: 1 })
          }
        })
      )

      request(server)
        .post('/')
        .set('Content-Type', 'application/json')
        .send('{"a":1}')
        .expect(400, '[entity.parse.failed] reviver failed|code:undefined|detail:undefined', done)
    })
  })

  describe('urlencoded() when qs throws something other than a RangeError', function () {
    let parse

    beforeEach(function () {
      parse = qs.parse
      qs.parse = function () {
        throw new TypeError('qs failed')
      }
    })

    afterEach(function () {
      qs.parse = parse
    })

    it('should pass the error on as a 400', function (done) {
      request(createServer(bodyParser.urlencoded({ extended: true })))
        .post('/')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('a=1')
        .expect(400, '[entity.parse.failed] qs failed|code:undefined|detail:undefined', done)
    })
  })
})

function createServer(parser) {
  return http.createServer(function (req, res) {
    parser(req, res, function (err) {
      if (err) {
        res.statusCode = err.status
        res.end('[' + err.type + '] ' + err.message + '|code:' + err.code + '|detail:' + err.detail)
        return
      }

      res.statusCode = 200
      res.end(JSON.stringify(req.body))
    })
  })
}
