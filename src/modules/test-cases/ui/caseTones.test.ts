import { describe, expect, it } from "vitest";
import { editedLabel, stampLabel } from "./caseTones";

describe("case dates read stored UTC stamps (RED-V3l)", () => {
  it("«Hoy» / «Ayer» compare the stamp as UTC, not as local time", () => {
    // 23:30 UTC on 30 Oct is 30 Oct in UTC-5 (18:30) and 31 Oct in UTC+1.
    const stamp = "2026-10-30 23:30:00";
    const asUtc = new Date("2026-10-30T23:30:00Z");
    const sameLocalDay = new Date(asUtc.getFullYear(), asUtc.getMonth(), asUtc.getDate(), 12);
    expect(editedLabel(stamp, "es", "Hoy", "Ayer", sameLocalDay)).toBe("Hoy");
    const nextLocalDay = new Date(sameLocalDay.getTime() + 86_400_000);
    expect(editedLabel(stamp, "es", "Hoy", "Ayer", nextLocalDay)).toBe("Ayer");
  });

  it("the full label shows the stamp in local time; a stamp with a zone is kept as is", () => {
    const fmt = (d: Date) => new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(d);
    expect(stampLabel("2026-10-30 18:05:00", "es")).toBe(fmt(new Date("2026-10-30T18:05:00Z")));
    expect(stampLabel("2026-10-30T18:05:00+02:00", "es")).toBe(fmt(new Date("2026-10-30T16:05:00Z")));
    expect(stampLabel("no es una fecha", "es")).toBe("no es una fecha");
  });
});
