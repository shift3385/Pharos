// The contract checker itself (BASE-05, ADR-0026). These assertions are
// compile-time: `tsc` (in `npm run verify`) fails if `Covers` stops catching
// what it should.
import { describe, expectTypeOf, it } from "vitest";
import type { Covers } from "./index";

type Status = "draft" | "approved";

describe("Covers", () => {
  it("passes a producer that sends every field the consumer needs", () => {
    expectTypeOf<Covers<{ a: string; extra: number }, { a: string; b?: number }>>().toEqualTypeOf<true>();
    // A narrower TS union against a Rust `String`, a typed `data` against `unknown`.
    expectTypeOf<Covers<{ status: string; data: unknown }, { status: Status; data: { x: 1 } }>>().toEqualTypeOf<true>();
    // Nullability is not checked.
    expectTypeOf<Covers<{ a: string | null }, { a: string }>>().toEqualTypeOf<true>();
  });

  it("names a missing or retyped field", () => {
    expectTypeOf<Covers<{ a: string }, { a: string; b: number }>>().toEqualTypeOf<{ broken: "b" }>();
    expectTypeOf<Covers<{ a: number }, { a: string }>>().toEqualTypeOf<{ broken: "a" }>();
  });

  it("requires the same values when both sides are enums", () => {
    expectTypeOf<Covers<{ s: Status }, { s: Status }>>().toEqualTypeOf<true>();
    expectTypeOf<Covers<{ s: Status | "obsolete" }, { s: Status }>>().toEqualTypeOf<{ broken: "s" }>();
    expectTypeOf<Covers<{ n: 1 | 2 }, { n: 1 | 3 }>>().toEqualTypeOf<{ broken: "n" }>();
  });
});
