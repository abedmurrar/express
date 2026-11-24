// `exactly<T>()(value)` compiles only when the type of `value` is T itself, not
// merely assignable to it, so `any` doesn't pass for anything else.

type Identical<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Flat<T> = { [K in keyof T]: T[K] }

export function exactly<T>(): <U>(value: U & (Identical<T, U> extends true ? unknown : never)) => void {
  return () => {}
}

/** As `exactly`, for an object type that may be written as an intersection. */
export function sameMembers<T>(): <U>(value: U & (Identical<Flat<T>, Flat<U>> extends true ? unknown : never)) => void {
  return () => {}
}

// They have to be able to fail.
declare const anything: ReturnType<typeof JSON.parse>
declare const text: 'a'
exactly<'a'>()(text)
// @ts-expect-error narrower
exactly<string>()(text)
// @ts-expect-error any is only any
exactly<string>()(anything)
exactly<ReturnType<typeof JSON.parse>>()(anything)
sameMembers<{ a: string; b: string }>()({} as { a: string } & { b: string })
// @ts-expect-error a member too many
sameMembers<{ a: string }>()({} as { a: string } & { b: string })
// @ts-expect-error optional
sameMembers<{ a: string }>()({} as { a?: string })
// @ts-expect-error any is only any
sameMembers<{ a: string }>()({} as { a: ReturnType<typeof JSON.parse> })
