// Generated contracts (BASE-05, ADR-0026). `generated/` holds the TS form of
// the Rust types that cross the Tauri boundary and the sync wire, written by
// `cargo test` (ts-rs; regenerate with `npm run contracts`). The hand-written
// models stay: they are narrower than Rust (unions, typed `data`). Each model
// file asserts at compile time that it still fits its Rust type:
//
//   type _Reads = Assert<Covers<Contract.Project, Project>>;     // Rust → UI
//   type _Sends = Assert<Covers<ProjectInput, Contract.ProjectInput>>; // UI → Rust
//
// so a field renamed, dropped or retyped on one side breaks `tsc`.

export type * as Contract from "./contract";

/** Fields of `T` that are not optional. */
type RequiredKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? never : K;
}[keyof T];

/** A union of literal values (`"draft" | "approved"`, an enum), as opposed to a
 *  plain `string` or `number`. */
type IsLiteral<T> = [T] extends [string]
  ? string extends T
    ? false
    : true
  : [T] extends [number]
    ? number extends T
      ? false
      : true
    : false;

/** Two field types are compatible when one fits in the other (null and
 *  undefined aside): `"draft" | "approved"` against `string`, a typed `data`
 *  against `unknown`. A string against a number is not. When both sides are
 *  literal unions (an enum on both), they must be the same union: a value added
 *  or renamed on one side breaks the contract. Today Rust exports `String`
 *  for every such field, so only the field names and basic types are checked
 *  against Rust (ADR-0026). */
type Compatible<A, B> =
  IsLiteral<A> extends true
    ? IsLiteral<B> extends true
      ? [A] extends [B]
        ? [B] extends [A]
          ? true
          : false
        : false
      : OneFits<A, B>
    : OneFits<A, B>;
type OneFits<A, B> = [A] extends [B] ? true : [B] extends [A] ? true : false;

/** The fields that break the contract: required by the consumer but absent
 *  from the producer, or present in both with incompatible types. */
type Broken<Producer, Consumer> =
  | Exclude<RequiredKeys<Consumer>, keyof Producer>
  | {
      [K in keyof Consumer & keyof Producer]-?: Compatible<
        NonNullable<Producer[K]>,
        NonNullable<Consumer[K]>
      > extends true
        ? never
        : K;
    }[keyof Consumer & keyof Producer];

/** `true` when what `Producer` sends is enough for `Consumer`; otherwise
 *  `{ broken: <field names> }`, so the compiler error names them. */
export type Covers<Producer, Consumer> = [Broken<Producer, Consumer>] extends [
  never,
]
  ? true
  : { broken: Broken<Producer, Consumer> };

/** Compiles only when `T` is `true`. */
export type Assert<T extends true> = T;
