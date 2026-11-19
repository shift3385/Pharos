# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pagos.spec.mjs >> Pagos >> rechaza una tarjeta caducada
- Location: specs\pagos.spec.mjs:14:3

# Error details

```
Error: status

expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 402
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import * as allure from "allure-js-commons";
  3  | 
  4  | test.describe("Pagos", () => {
  5  |   test("paga con tarjeta @TC-001", async () => {
  6  |     await allure.tms("TC-001");
  7  |     await test.step("rellena la tarjeta", async () => {});
  8  |     await test.step("confirma el pago", async () => {
  9  |       expect(2 + 2).toBe(4);
  10 |     });
  11 |     await test.info().attach("recibo.txt", { body: "recibo 42", contentType: "text/plain" });
  12 |   });
  13 | 
  14 |   test("rechaza una tarjeta caducada", async () => {
  15 |     await allure.label("tag", "TC-002");
> 16 |     expect(402, "status").toBe(200);
     |                           ^ Error: status
  17 |   });
  18 | });
  19 | 
```