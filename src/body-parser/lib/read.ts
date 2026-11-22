/*!
 * body-parser
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * Module dependencies.
 *
 * Loaded with `require` and typed with `typeof import(...)`, so the compiled
 * output calls them directly, with no interop helpers in between.
 * @private
 */

const createError = require('http-errors') as typeof import('http-errors')
const getBody = require('raw-body') as typeof import('raw-body')
const iconv = require('iconv-lite') as typeof import('iconv-lite')
const onFinished = require('on-finished') as typeof import('on-finished')
const zlib = require('node:zlib') as typeof import('node:zlib')
const hasBody = (require('type-is') as typeof import('type-is')).hasBody
const contentType = require('content-type') as typeof import('content-type')

import type { Buffer } from 'node:buffer'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Transform } from 'node:stream'
import type { Debugger } from 'debug'
import type { HttpError } from 'http-errors'
import type { Options as RawBodyOptions } from 'raw-body'
import type { NormalizedOptions } from './utils'

/** The request a parser reads: `req.body` is what it parsed. */
export type BodyParserRequest = IncomingMessage & { body?: unknown }

/** The `next` a parser calls, with an `http-errors` error when the body can't be read or parsed. */
export type BodyParserNext = (err?: unknown) => void

/** The middleware each parser returns. */
export type BodyParserHandler = (req: BodyParserRequest, res: ServerResponse, next: BodyParserNext) => void

/**
 * A parser's parse step, called with the body (a string once decoded, or the
 * Buffer when there is no charset) and the charset. Each parser declares the
 * body type it is given, so this takes `never`.
 */
export type ParseStep = (body: never, encoding: never) => unknown

/** The options `read` takes: the normalized ones, plus the parser's charset rules. */
export interface ReadOptions extends NormalizedOptions {
  /** check the charset (json and urlencoded) */
  isValidCharset?: ((charset: string) => boolean) | undefined
  /** read the body as a Buffer, ignoring the charset (raw) */
  skipCharset?: boolean | undefined
}

/** What `require('./read')` returns. */
export type ReadFunction = typeof read

/**
 * Module exports.
 */

module.exports = read

/**
 * @const
 * whether current node version has zstandard support
 */
const hasZstandardSupport = 'createZstdDecompress' in zlib

/**
 * Read a request into a buffer and parse.
 *
 * @param {Object} req
 * @param {Object} res
 * @param {Function} next
 * @param {Function} parse
 * @param {Function} debug
 * @param {Object} options
 * @private
 */
function read(
  req: BodyParserRequest,
  res: ServerResponse,
  next: BodyParserNext,
  parse: ParseStep,
  debug: Debugger,
  options: ReadOptions
): void {
  if (onFinished.isFinished(req)) {
    debug('body already parsed')
    next()
    return
  }

  if (!('body' in req)) {
    req.body = undefined
  }

  // skip requests without bodies
  if (!hasBody(req)) {
    debug('skip empty body')
    next()
    return
  }

  debug('content-type %j', req.headers['content-type'])

  // determine if request should be parsed
  if (!options.shouldParse(req)) {
    debug('skip parsing')
    next()
    return
  }

  let encoding: string | null = null
  if (options?.skipCharset !== true) {
    encoding = getCharset(req) || options.defaultCharset

    // validate charset
    if (!!options?.isValidCharset && !options.isValidCharset(encoding)) {
      debug('invalid charset')
      next(
        createError(415, 'unsupported charset "' + encoding.toUpperCase() + '"', {
          charset: encoding,
          type: 'charset.unsupported'
        })
      )
      return
    }
  }

  let length: string | undefined
  let stream: BodyParserRequest | Transform

  const verify = options.verify

  // assert charset is supported before creating the decompression stream, so an
  // unsupported charset cannot leave a decoder piped with no error listener
  if (verify && encoding !== null && !iconv.encodingExists(encoding)) {
    return next(
      createError(415, 'unsupported charset "' + (encoding as string).toUpperCase() + '"', {
        charset: (encoding as string).toLowerCase(),
        type: 'charset.unsupported'
      })
    )
  }

  try {
    const contentEncoding = (req.headers['content-encoding'] || 'identity').toLowerCase()

    debug('content-encoding "%s"', contentEncoding)

    if (options.inflate === false && contentEncoding !== 'identity') {
      throw createError(415, 'content encoding unsupported', {
        encoding: contentEncoding,
        type: 'encoding.unsupported'
      })
    }

    // get the content stream
    if (contentEncoding === 'identity') {
      length = req.headers['content-length']
      stream = req
    } else {
      stream = createDecompressionStream(contentEncoding, debug)
      req.pipe(stream)
    }
  } catch (err) {
    return next(err)
  }

  // set raw-body options
  const rawBodyOptions = {
    length,
    encoding: verify ? null : encoding,
    limit: options.limit
  } as RawBodyOptions

  // read body
  debug('read body')
  getBody(stream, rawBodyOptions, function (error, body: Buffer | string) {
    if (error) {
      let _error: HttpError

      if (error.type === 'encoding.unsupported') {
        // echo back charset
        _error = createError(415, 'unsupported charset "' + (encoding as string).toUpperCase() + '"', {
          charset: (encoding as string).toLowerCase(),
          type: 'charset.unsupported'
        })
      } else {
        // set status code on error
        _error = createError(400, error)
      }

      // unpipe from stream and destroy
      if (stream !== req) {
        req.unpipe()
        stream.destroy()
      }

      // read off entire request
      dump(req, function onfinished() {
        next(createError(400, _error))
      })
      return
    }

    // detach and destroy the decompression stream to
    // avoid decompression errors on the finished stream
    if (stream !== req) {
      req.unpipe(stream as Transform)
      stream.on('error', () => {})
      stream.destroy()

      // consume any remaining bytes so the HTTP request can finish
      req.resume()
    }

    // verify
    if (verify) {
      try {
        debug('verify body')
        verify(req, res, body as Buffer, encoding)
      } catch (err) {
        next(
          createError(403, err as Error, {
            body,
            type: (err as { type?: unknown }).type || 'entity.verify.failed'
          })
        )
        return
      }
    }

    // parse
    let str = body
    try {
      debug('parse body')
      str = typeof body !== 'string' && encoding !== null ? iconv.decode(body, encoding) : body
      req.body = parse(str as never, encoding as never)
    } catch (err) {
      next(
        createError(400, err as Error, {
          body: str,
          type: (err as { type?: unknown }).type || 'entity.parse.failed'
        })
      )
      return
    }

    next()
  })
}

/**
 * Create a decompression stream for the given encoding.
 * @param {string} encoding
 * @param {Function} debug
 * @returns {Object}
 * @private
 */
function createDecompressionStream(encoding: string, debug: Debugger): Transform {
  switch (encoding) {
    case 'deflate':
      debug('inflate body')
      return zlib.createInflate()
    case 'gzip':
      debug('gunzip body')
      return zlib.createGunzip()
    case 'br':
      debug('brotli decompress body')
      return zlib.createBrotliDecompress()
    case 'zstd':
      if (hasZstandardSupport) {
        debug('zstd decompress body')
        return zlib.createZstdDecompress()
      }
  }
  throw createError(415, 'unsupported content encoding "' + encoding + '"', {
    encoding,
    type: 'encoding.unsupported'
  })
}

/**
 * Dump the contents of a request.
 *
 * @param {Object} req
 * @param {Function} callback
 * @private
 */
function dump(req: IncomingMessage, callback: (err: Error | null) => void): void {
  if (onFinished.isFinished(req)) {
    callback(null)
  } else {
    onFinished(req, callback)
    req.resume()
  }
}

/**
 * Get the charset of a request.
 *
 * @param {Object} req
 * @returns {string | undefined}
 * @private
 */
function getCharset(req: IncomingMessage): string | undefined {
  const header = req.headers['content-type']
  if (!header) return undefined
  return contentType.parse(header).parameters.charset?.toLowerCase()
}
