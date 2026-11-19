import { test, expect } from "@playwright/test";
import * as allure from "allure-js-commons";

test.describe("Pagos", () => {
  test("paga con tarjeta @TC-001", async () => {
    await allure.tms("TC-001");
    await test.step("rellena la tarjeta", async () => {});
    await test.step("confirma el pago", async () => {
      expect(2 + 2).toBe(4);
    });
    await test.info().attach("recibo.txt", { body: "recibo 42", contentType: "text/plain" });
  });

  test("rechaza una tarjeta caducada", async () => {
    await allure.label("tag", "TC-002");
    expect(402, "status").toBe(200);
  });
});
