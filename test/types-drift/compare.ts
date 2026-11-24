// The comparison behind drift.ts: what differs between an interface in
// typings/, the interface in src/ it describes, and the members the running
// code has. All of it is done by tsc; there is nothing to run.

import type * as core from '../../typings/core.js'
import type * as express from '../../typings/index.js'
import type { Application } from '../../src/application'
import type { JsonOptions, RawOptions, TextOptions, UrlencodedOptions } from '../../src/body-parser'
import type { Request } from '../../src/request'
import type { CookieOptions, ExpressResponse, SendFileOptions } from '../../src/response'
import type { HandlerList, LayerHandler, Router } from '../../src/router'
import type { Layer } from '../../src/router/lib/layer'
import type { Route } from '../../src/router/lib/route'
import type { ServeStaticOptions } from '../../src/serve-static'

/** Whether two types are the same type, not merely assignable to each other. */
export type Identical<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type IsAny<T> = 0 extends 1 & T ? true : false

type Fn = (...args: never) => unknown

/**
 * The types that refer to one another (a request has an app, whose handlers
 * take a request), src's first. Each pair is compared on its own in drift.ts,
 * so inside any other type the two count as the same one. Without that, one
 * difference anywhere would be a difference in every member that mentions it.
 */
type Pairs =
  | [Request, core.Request]
  | [ExpressResponse, core.Response]
  | [Application, core.Express]
  | [Router, core.RouterWithErrorHandlers]
  | [Route, core.IRoute]
  | [Layer, core.ILayer]
  | [SendFileOptions, core.SendFileOptions]
  | [CookieOptions, core.CookieOptions]
  | [JsonOptions, express.OptionsJson]
  | [RawOptions, express.Options]
  | [TextOptions, express.OptionsText]
  | [UrlencodedOptions, express.OptionsUrlencoded]
  | [ServeStaticOptions, express.ServeStaticOptions<core.Response>]

type PublicOf<T, P = Pairs> = P extends [infer Src, infer Public]
  ? Identical<T, Src> extends true
    ? Public
    : never
  : never

/**
 * Handlers, as the router takes them: functions, in arrays nested to any
 * depth. Which requests and responses they are called with is compared on
 * Request and Response.
 */
type Handlers = Fn | Handlers[]

/** A src type, with the public type in place of each src one it mentions. */
type AsPublic<T> =
  IsAny<T> extends true
    ? T
    : Identical<T, HandlerList> extends true
      ? Handlers
      : Identical<T, LayerHandler> extends true
        ? Fn
        : T extends unknown
          ? [PublicOf<T>] extends [never]
            ? AsPublicShape<T>
            : PublicOf<T>
          : never
type AsPublicShape<T> = T extends Fn
  ? Intersection<SignatureAsPublic<Signatures<T>>>
  : T extends abstract new (
        ...args: infer A
      ) => infer R
    ? new (
        ...args: ElementsAsPublic<A>
      ) => AsPublic<R>
    : T extends readonly unknown[]
      ? // a plain array or tuple: req.range()'s array has a `type`, and no elements to replace
        [Exclude<Members<T>, keyof unknown[] | `${number}`>] extends [never]
        ? ElementsAsPublic<T>
        : T
      : T
type ElementsAsPublic<T extends readonly unknown[]> = { [I in keyof T]: AsPublic<T[I]> }
type SignatureAsPublic<S> = S extends (...args: infer A) => infer R
  ? (...args: ElementsAsPublic<A>) => AsPublic<R>
  : never
type Intersection<U> = (U extends unknown ? (u: U) => void : never) extends (u: infer I) => void ? I : never

/**
 * A function's overloads, as a union of plain functions. Comparing those is
 * stricter than comparing methods, whose parameters may be wider or narrower.
 * `infer` reads the last signatures of a type, so it is padded up to the 12
 * read here: `app.use` has 12, and a method with more needs more of them.
 */
export type Signatures<T extends Fn> = Padding & T extends {
  (...args: infer A0): infer R0
  (...args: infer A1): infer R1
  (...args: infer A2): infer R2
  (...args: infer A3): infer R3
  (...args: infer A4): infer R4
  (...args: infer A5): infer R5
  (...args: infer A6): infer R6
  (...args: infer A7): infer R7
  (...args: infer A8): infer R8
  (...args: infer A9): infer R9
  (...args: infer A10): infer R10
  (...args: infer A11): infer R11
}
  ?
      | Signature<A0, R0>
      | Signature<A1, R1>
      | Signature<A2, R2>
      | Signature<A3, R3>
      | Signature<A4, R4>
      | Signature<A5, R5>
      | Signature<A6, R6>
      | Signature<A7, R7>
      | Signature<A8, R8>
      | Signature<A9, R9>
      | Signature<A10, R10>
      | Signature<A11, R11>
  : never
type Signature<A extends readonly unknown[], R> = Identical<R, Pad> extends true ? never : (...args: A) => R
declare const pad: unique symbol
type Pad = typeof pad
type Padding = {
  (pad: 0): Pad
  (pad: 1): Pad
  (pad: 2): Pad
  (pad: 3): Pad
  (pad: 4): Pad
  (pad: 5): Pad
  (pad: 6): Pad
  (pad: 7): Pad
  (pad: 8): Pad
  (pad: 9): Pad
  (pad: 10): Pad
  (pad: 11): Pad
}

/** The overloads of the public function that the src one doesn't cover. */
type Uncovered<Src, Overload> = Overload extends unknown ? (Src extends Overload ? never : Overload) : never
type WithoutResult<S> = S extends (...args: infer A) => unknown ? (...args: A) => unknown : never

/** What differs between what src gives and what the typings say, or never. */
type OutputDifference<Src, Public> =
  IsAny<Public> extends true
    ? never
    : [Public] extends [Fn]
      ? [Src] extends [Fn]
        ? [Uncovered<Src, WithoutResult<Signatures<Public>>>] extends [never]
          ? [Uncovered<Src, Signatures<Public>>] extends [never]
            ? never
            : 'other result'
          : 'other parameters'
        : 'other type'
      : [Src] extends [Public]
        ? never
        : 'other type'

/** An option's type: src must accept every value the typings do, and the other way round. */
type InputDifference<Src, Public> =
  IsAny<Public> extends true
    ? never
    : [Public] extends [Src]
      ? [Src] extends [Public]
        ? never
        : 'narrower in typings'
      : 'other type'

type TypeDifference<Src, Public, Direction> =
  IsAny<Src> extends true
    ? 'any in src'
    : Direction extends 'input'
      ? InputDifference<Src, Public>
      : OutputDifference<AsPublic<Src>, Public>

/** The declared members of a type, without an index signature's. */
type Members<T> = keyof {
  [K in keyof T as string extends K ? never : number extends K ? never : symbol extends K ? never : K]: unknown
}

type Difference<Public, Src, Runtime, Inherited, Direction, K> =
  K extends Members<Public>
    ? K extends Members<Src>
      ? K extends keyof Runtime | Members<Inherited>
        ? TypeDifference<Src[K], Public[K], Direction>
        : 'not at runtime'
      : K extends keyof Runtime
        ? 'not typed in src'
        : 'only in typings'
    : 'not in typings'

/**
 * The differences between three descriptions of the same thing: `Public` (the
 * interface in typings/), `Src` (the interface in src/) and `Runtime` (an
 * object type whose keys are the members the running code has; see
 * scripts/check-types-drift.js). `Inherited` is a Node type behind all three,
 * such as IncomingMessage. Names that start with an underscore are private
 * unless `Public` has them.
 *
 * The result has one property for each member that differs, whose type is the
 * kind of difference followed by a reason:
 * - `only in typings`: neither src's interface nor the running code has it.
 * - `not typed in src`: only src's interface lacks it, so its type is not
 *   checked.
 * - `not at runtime`: only the running code lacks it.
 * - `not in typings`: src's interface or the running code has it.
 * - `other parameters`: the typings accept calls that src's type doesn't.
 * - `other result`: src's type returns something the typings don't.
 * - `other type`: src's value doesn't fit the typings or, for an option, the
 *   typings accept a value that src's type doesn't.
 * - `narrower in typings`: an option for which src's type accepts more.
 * - `any in src`: nothing to compare with.
 *
 * drift.ts declares one object of it per interface. tsc then reports a
 * difference that isn't listed there (a missing property), one listed there
 * that no longer exists (an unknown property) and one that is now of another
 * kind.
 */
export type Differences<Public, Src, Runtime, Inherited = unknown, Direction extends 'output' | 'input' = 'output'> = {
  [K in Members<Public> | Exclude<Members<Src> | keyof Runtime, Members<Inherited> | `_${string}`> as [
    Difference<Public, Src, Runtime, Inherited, Direction, K>
  ] extends [never]
    ? never
    : K]: `${Difference<Public, Src, Runtime, Inherited, Direction, K>}: ${string}`
} & Listing

declare const listing: unique symbol

/** Keeps a type with nothing to list from being `{}`, which takes any property. */
export interface Listing {
  [listing]?: never
}

/** The same, for options: the values the typings accept must be ones src does. */
export type OptionDifferences<Public, Src, Runtime, Inherited = unknown> = Differences<
  Public,
  Src,
  Runtime,
  Inherited,
  'input'
>
