/*!
 * Public types for Express, for `require('express')` and TypeScript's CommonJS
 * resolution. typings/index.d.mts gives the same types to `import`.
 *
 * Ported from @types/express 5.0.6 (DefinitelyTyped,
 * https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/express)
 * by Boris Yankov, Puneet Arora, Dylan Frankland, Sebastian Beltran and the
 * other DefinitelyTyped contributors, under the MIT licence below. The core
 * types are in typings/core.d.ts, ported from @types/express-serve-static-core.
 *
 * Changes from the original:
 * - No type dependencies besides @types/node. The options of `express.json`,
 *   `express.raw`, `express.text`, `express.urlencoded` and `express.static`
 *   are declared here instead of coming from @types/body-parser and
 *   @types/serve-static, and they describe the versions Express installs:
 *   body-parser 2 (`defaultCharset` for JSON and urlencoded bodies, and
 *   `charsetSentinel`, `interpretNumericEntities` and `depth` for urlencoded
 *   ones, which @types/body-parser 1.19 lacks) and serve-static 2.
 * - `express.Route`, which Express exports, is declared.
 * - The core types that apps import from express-serve-static-core
 *   (`ParamsDictionary`, `Query`, `RouteParameters` and the rest) are also
 *   exported here, so they can come from `express`.
 *
 * MIT License
 *
 * Copyright (c) Microsoft Corporation.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/// <reference types="node" />

import type { Buffer } from 'buffer'
import * as http from 'http'
import * as core from './core.js'

/**
 * Creates an Express application. The express() function is a top-level function exported by the express module.
 */
declare function e(): core.Express

declare namespace e {
  /**
   * This is a built-in middleware function in Express. It parses incoming requests with JSON payloads and is based on body-parser.
   * @since 4.16.0
   */
  var json: (options?: OptionsJson) => BodyParserHandler

  /**
   * This is a built-in middleware function in Express. It parses incoming requests with Buffer payloads and is based on body-parser.
   * @since 4.17.0
   */
  var raw: (options?: Options) => BodyParserHandler

  /**
   * This is a built-in middleware function in Express. It parses incoming requests with text payloads and is based on body-parser.
   * @since 4.17.0
   */
  var text: (options?: OptionsText) => BodyParserHandler

  /**
   * These are the exposed prototypes.
   */
  var application: Application
  var request: Request
  var response: Response

  /**
   * This is a built-in middleware function in Express. It serves static files and is based on serve-static.
   */
  var static: ServeStaticConstructor<Response>

  /**
   * This is a built-in middleware function in Express. It parses incoming requests with urlencoded payloads and is based on body-parser.
   * @since 4.16.0
   */
  var urlencoded: (options?: OptionsUrlencoded) => BodyParserHandler

  export function Router(options?: RouterOptions): core.Router

  /**
   * The route constructor that `router.route(path)` uses.
   */
  var Route: new (path: string) => core.IRoute

  interface RouterOptions {
    /**
     * Enable case sensitivity.
     */
    caseSensitive?: boolean | undefined

    /**
     * Preserve the req.params values from the parent router.
     * If the parent and the child have conflicting param names, the child’s value take precedence.
     *
     * @default false
     * @since 4.5.0
     */
    mergeParams?: boolean | undefined

    /**
     * Enable strict routing.
     */
    strict?: boolean | undefined
  }

  /** The middleware that `express.json()`, `raw()`, `text()` and `urlencoded()` return. */
  type BodyParserHandler = (req: http.IncomingMessage, res: http.ServerResponse, next: (err?: any) => void) => void

  /** Options for every body parser (`express.raw()` takes only these). */
  interface Options {
    /** When set to true, then deflated (compressed) bodies will be inflated; when false, deflated bodies are rejected. Defaults to true. */
    inflate?: boolean | undefined
    /**
     * Controls the maximum request body size. If this is a number,
     * then the value specifies the number of bytes; if it is a string,
     * the value is passed to the bytes library for parsing. Defaults to '100kb'.
     */
    limit?: number | string | undefined
    /**
     * The type option is used to determine what media type the middleware will parse.
     * A function is called as `fn(req)`, and the body is parsed when it returns a truthy value.
     */
    type?: string | string[] | ((req: http.IncomingMessage) => any) | undefined
    /**
     * The verify option, if supplied, is called as verify(req, res, buf, encoding),
     * where buf is a Buffer of the raw request body and encoding is the encoding of the request.
     */
    verify?(req: http.IncomingMessage, res: http.ServerResponse, buf: Buffer, encoding: string): void
  }

  /** Options for `express.json()`. */
  interface OptionsJson extends Options {
    /**
     * Specify the default character set for the JSON content if the charset
     * is not specified in the Content-Type header of the request.
     * Defaults to `utf-8`.
     */
    defaultCharset?: string | undefined
    /**
     * The reviver option is passed directly to JSON.parse as the second argument.
     */
    reviver?(key: string, value: any): any
    /**
     * When set to `true`, will only accept arrays and objects;
     * when `false` will accept anything JSON.parse accepts. Defaults to `true`.
     */
    strict?: boolean | undefined
  }

  /** Options for `express.text()`. */
  interface OptionsText extends Options {
    /**
     * Specify the default character set for the text content if the charset
     * is not specified in the Content-Type header of the request.
     * Defaults to `utf-8`.
     */
    defaultCharset?: string | undefined
  }

  /** Options for `express.urlencoded()`. */
  interface OptionsUrlencoded extends Options {
    /**
     * The extended option allows to choose between parsing the URL-encoded data
     * with the querystring library (when `false`) or the qs library (when `true`).
     */
    extended?: boolean | undefined
    /**
     * The parameterLimit option controls the maximum number of parameters
     * that are allowed in the URL-encoded data. If a request contains more parameters than this value,
     * a 413 will be returned to the client. Defaults to 1000.
     */
    parameterLimit?: number | undefined
    /**
     * The default charset to parse as, if not specified in the Content-Type header.
     * Must be either `utf-8` or `iso-8859-1`. Defaults to `utf-8`.
     */
    defaultCharset?: string | undefined
    /**
     * Whether to let the value of the `utf8` parameter take precedence as the charset selector.
     * It requires the form to contain a parameter named `utf8` with a value of `✓`. Defaults to `false`.
     */
    charsetSentinel?: boolean | undefined
    /**
     * Whether to decode numeric entities such as `&#9786;` when parsing an iso-8859-1 form. Defaults to `false`.
     */
    interpretNumericEntities?: boolean | undefined
    /**
     * The maximum depth of the `qs` library when `extended` is `true`. Defaults to `32`.
     */
    depth?: number | undefined
  }

  /** Options for `express.static()` (serve-static). */
  interface ServeStaticOptions<R extends http.ServerResponse = http.ServerResponse> {
    /**
     * Enable or disable accepting ranged requests, defaults to true.
     * Disabling this will not send Accept-Ranges and ignore the contents of the Range request header.
     */
    acceptRanges?: boolean | undefined

    /**
     * Enable or disable setting Cache-Control response header, defaults to true.
     * Disabling this will ignore the immutable and maxAge options.
     */
    cacheControl?: boolean | undefined

    /**
     * Set how "dotfiles" are treated when encountered. A dotfile is a file or directory that begins with a dot (".").
     * Note this check is done on the path itself without checking if the path actually exists on the disk.
     * If root is specified, only the dotfiles above the root are checked (i.e. the root itself can be within a dotfile when when set to "deny").
     * The default value is 'ignore'.
     * 'allow' No special treatment for dotfiles
     * 'deny' Send a 403 for any request for a dotfile
     * 'ignore' Pretend like the dotfile does not exist and call next()
     */
    dotfiles?: string | undefined

    /**
     * Enable or disable etag generation, defaults to true.
     */
    etag?: boolean | undefined

    /**
     * Set file extension fallbacks. When set, if a file is not found, the given extensions will be added to the file name and search for.
     * The first that exists will be served. Example: ['html', 'htm'].
     * The default value is false.
     */
    extensions?: string[] | false | undefined

    /**
     * Set the middleware to have client errors fall-through as just unhandled requests,
     * otherwise forward a client error.
     * The difference is that client errors like a bad request or a request to a non-existent file
     * will cause this middleware to simply next() to your next middleware when this value is true.
     * When this value is false, these errors (even 404s), will invoke next(err).
     *
     * The default value is true.
     */
    fallthrough?: boolean | undefined

    /**
     * Enable or disable the immutable directive in the Cache-Control response header.
     * If enabled, the maxAge option should also be specified to enable caching.
     */
    immutable?: boolean | undefined

    /**
     * By default this module will send "index.html" files in response to a request on a directory.
     * To disable this set false or to supply a new index pass a string or an array in preferred order.
     */
    index?: boolean | string | string[] | undefined

    /**
     * Enable or disable Last-Modified header, defaults to true. Uses the file system's last modified value.
     */
    lastModified?: boolean | undefined

    /**
     * Provide a max-age in milliseconds for http caching, defaults to 0. This can also be a string accepted by the ms module.
     */
    maxAge?: number | string | undefined

    /**
     * Redirect to trailing "/" when the pathname is a dir. Defaults to true.
     */
    redirect?: boolean | undefined

    /**
     * Function to set custom headers on response. Alterations to the headers need to occur synchronously.
     * The function is called as fn(res, path, stat), where the arguments are:
     * res the response object
     * path the file path that is being sent
     * stat the stat object of the file that is being sent
     */
    setHeaders?: ((res: R, path: string, stat: any) => any) | undefined
  }

  /** The middleware that `express.static()` returns. */
  interface ServeStaticHandler<R extends http.ServerResponse> {
    (request: http.IncomingMessage, response: R, next: (err?: any) => void): any
  }

  /** The type of `express.static`. */
  interface ServeStaticConstructor<R extends http.ServerResponse> {
    (root: string, options?: ServeStaticOptions<R>): ServeStaticHandler<R>
  }

  interface Application extends core.Application {}
  interface CookieOptions extends core.CookieOptions {}
  interface Errback extends core.Errback {}
  interface ErrorRequestHandler<
    P = core.ParamsDictionary,
    ResBody = any,
    ReqBody = any,
    ReqQuery = core.Query,
    Locals extends Record<string, any> = Record<string, any>
  > extends core.ErrorRequestHandler<P, ResBody, ReqBody, ReqQuery, Locals> {}
  interface Express extends core.Express {}
  interface Handler extends core.Handler {}
  interface IRoute extends core.IRoute {}
  interface IRouter extends core.IRouter {}
  interface IRouterHandler<T> extends core.IRouterHandler<T> {}
  interface IRouterMatcher<T> extends core.IRouterMatcher<T> {}
  interface MediaType extends core.MediaType {}
  interface NextFunction extends core.NextFunction {}
  interface Locals extends core.Locals {}
  interface Request<
    P = core.ParamsDictionary,
    ResBody = any,
    ReqBody = any,
    ReqQuery = core.Query,
    Locals extends Record<string, any> = Record<string, any>
  > extends core.Request<P, ResBody, ReqBody, ReqQuery, Locals> {}
  interface RequestHandler<
    P = core.ParamsDictionary,
    ResBody = any,
    ReqBody = any,
    ReqQuery = core.Query,
    Locals extends Record<string, any> = Record<string, any>
  > extends core.RequestHandler<P, ResBody, ReqBody, ReqQuery, Locals> {}
  interface RequestParamHandler extends core.RequestParamHandler {}
  interface Response<ResBody = any, Locals extends Record<string, any> = Record<string, any>>
    extends core.Response<ResBody, Locals> {}
  interface Router extends core.Router {}
  interface Send extends core.Send {}

  // The core types apps used to import from express-serve-static-core.
  type ParamsDictionary = core.ParamsDictionary
  type ParamsFlatDictionary = core.ParamsFlatDictionary
  type Query = core.Query
  type PathParams = core.PathParams
  type RouteParameters<Route extends string | RegExp> = core.RouteParameters<Route>
  type RequestHandlerParams<
    P = core.ParamsDictionary,
    ResBody = any,
    ReqBody = any,
    ReqQuery = core.Query,
    Locals extends Record<string, any> = Record<string, any>
  > = core.RequestHandlerParams<P, ResBody, ReqBody, ReqQuery, Locals>
  type SendFileOptions = core.SendFileOptions
  type DownloadOptions = core.DownloadOptions
}

export = e
