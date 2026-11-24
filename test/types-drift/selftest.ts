// The comparison has to be able to fail: each mismatch it exists to catch, in
// small types. tsc fails if one of them stops being reported.

import type { Differences, OptionDifferences } from './compare'

interface Src {
  same(value: string): number
  removed(): void
  overloaded(value: string): number
  overloaded(value: string[], more: boolean): number
  property: string | undefined
  callback(fn: (err: Error | null) => void): void
}
interface Runtime {
  same: true
  removed: true
  overloaded: true
  property: true
  callback: true
  onlyAtRuntime: true
}
interface Public {
  same(value: string): number
  overloaded(value: string): string
  overloaded(value: string[], more: boolean): number
  property: string
  callback(fn: (err: Error) => void): void
  notInSrc(): void
}

type Equal<A, B> = {
  [K in keyof A | keyof B]: K extends keyof A & keyof B ? ([A[K], B[K]] extends [B[K], A[K]] ? never : K) : K
}[keyof A | keyof B]
type Same<A, B> = [Equal<A, B>] extends [never] ? true : Equal<A, B>

/** A method the typings lost, one src doesn't have, a runtime member nobody typed, and other types. */
export const members: Same<
  Differences<Public, Src, Runtime>,
  {
    removed: `not in typings: ${string}`
    onlyAtRuntime: `not in typings: ${string}`
    notInSrc: `only in typings: ${string}`
    overloaded: `other result: ${string}`
    property: `other type: ${string}`
    callback: `other parameters: ${string}`
  }
> = true

/** A method whose declared parameter is wider than src's, which TypeScript itself lets through. */
export const parameters: Same<
  Differences<{ vary(field: string | number): void }, { vary(field: string | string[]): void }, { vary: true }>,
  { vary: `other parameters: ${string}` }
> = true

/** A member gone from the running code, with its types still there. */
export const removed: Same<
  Differences<{ status(): void }, { status(): void }, object>,
  { status: `not at runtime: ${string}` }
> = true

type ParsedJson = ReturnType<typeof JSON.parse>

/** A renamed option, an option of another type (wider or narrower), and one src types as any. */
export const options: Same<
  OptionDifferences<
    { caseInsensitive?: boolean; strict?: string; index?: boolean; extensions?: string[]; limit?: number },
    { caseSensitive?: boolean; strict?: boolean; index?: false; extensions?: string | string[]; limit?: ParsedJson },
    { caseSensitive: true; strict: true; index: true; extensions: true; limit: true }
  >,
  {
    caseInsensitive: `only in typings: ${string}`
    caseSensitive: `not in typings: ${string}`
    strict: `other type: ${string}`
    index: `other type: ${string}`
    extensions: `narrower in typings: ${string}`
    limit: `any in src: ${string}`
  }
> = true

/** Private and inherited members are not differences, unless the typings redeclare one with another type. */
export const ignored: Same<
  Differences<
    { method: string; url: string },
    { _private(): void; method: string | undefined; url: string; headers: object },
    { _state: true },
    { method?: string; url?: string; headers: object }
  >,
  { method: `other type: ${string}` }
> = true

type OneDifference = Differences<{ accepted: string }, object, object>

// @ts-expect-error the difference has to be listed
export const missing: OneDifference = {}
// @ts-expect-error `accept` doesn't differ, so it can't be listed
export const stale: OneDifference = { accepted: 'only in typings: a reason', accept: 'only in typings: a reason' }
// @ts-expect-error it is of another kind
export const otherKind: OneDifference = { accepted: 'other type: a reason' }
