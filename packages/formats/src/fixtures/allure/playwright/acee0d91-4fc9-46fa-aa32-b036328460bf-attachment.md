# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: carrito.spec.mjs >> añade al carrito tras un reintento
- Location: specs\carrito.spec.mjs:5:1

# Error details

```
Error: falla la primera vez

expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import * as allure from "allure-js-commons";
  3  | 
  4  | 
  5  | test("añade al carrito tras un reintento", async () => {
> 6  |   expect(test.info().retry, "falla la primera vez").toBeGreaterThan(0);
     |                                                     ^ Error: falla la primera vez
  7  | });
  8  | 
  9  | for (const qty of [1, 3]) {
  10 |   test(`calcula el total con ${qty} unidades`, async () => {
  11 |     await allure.parameter("qty", String(qty));
  12 |     expect(qty * 10).toBeGreaterThan(0);
  13 |   });
  14 | }
  15 | 
```