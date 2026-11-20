// FIX-46: a webhook delivery that failed showed «324 ms · ENOTFOUND».
import { describe, expect, it } from "vitest";
import { i18n } from "@test/utils";
import { deliveryFailure } from "./failure";

describe("deliveryFailure", () => {
  it("says what happened, with the raw code after it", async () => {
    await i18n.changeLanguage("es");
    const t = i18n.t.bind(i18n);
    expect(deliveryFailure(t, "ENOTFOUND")).toBe("No se encontró el servidor de destino (ENOTFOUND)");
    expect(deliveryFailure(t, "connect ECONNREFUSED 127.0.0.1:9")).toBe(
      "El servidor de destino rechazó la conexión (connect ECONNREFUSED 127.0.0.1:9)",
    );
    expect(deliveryFailure(t, "something else")).toBe("something else");
  });
});
