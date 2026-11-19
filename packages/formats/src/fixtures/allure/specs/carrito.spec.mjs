import { test, expect } from "@playwright/test";
import * as allure from "allure-js-commons";


test("añade al carrito tras un reintento", async () => {
  expect(test.info().retry, "falla la primera vez").toBeGreaterThan(0);
});

for (const qty of [1, 3]) {
  test(`calcula el total con ${qty} unidades`, async () => {
    await allure.parameter("qty", String(qty));
    expect(qty * 10).toBeGreaterThan(0);
  });
}
