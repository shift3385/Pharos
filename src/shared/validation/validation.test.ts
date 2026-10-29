import { describe, it, expect } from "vitest";
import {
  compact,
  dateOrder,
  duplicateRow,
  duplicateRows,
  format,
  hasBlocking,
  numberInRange,
  required,
} from ".";

describe("validation rules", () => {
  it("required catches blank and whitespace-only values", () => {
    expect(required("")?.code).toBe("required");
    expect(required("   ")?.code).toBe("required");
    expect(required(undefined)?.severity).toBe("error");
    expect(required("x")).toBeNull();
    expect(required("", "warning")?.severity).toBe("warning");
  });

  it("numberInRange rejects blanks, text, decimals and out-of-range values", () => {
    const opts = { min: 1, max: 8, integer: true };
    expect(numberInRange("", opts)?.code).toBe("number");
    expect(numberInRange("abc", opts)?.code).toBe("number");
    expect(numberInRange("2.5", opts)?.code).toBe("integer");
    expect(numberInRange(0, opts)).toEqual({ code: "min", severity: "error", params: { min: 1 } });
    expect(numberInRange("9", opts)).toEqual({ code: "max", severity: "error", params: { max: 8 } });
    expect(numberInRange("4", opts)).toBeNull();
    expect(numberInRange("2.5", { min: 0 })).toBeNull();
  });

  it("dateOrder flags an end before its start and ignores blank dates", () => {
    expect(dateOrder("2026-05-10", "2026-05-01")?.code).toBe("dateOrder");
    expect(dateOrder("2026-05-10", "2026-05-01")?.severity).toBe("warning");
    expect(dateOrder("2026-05-01", "2026-05-01")).toBeNull();
    expect(dateOrder("", "2026-05-01")).toBeNull();
  });

  it("format checks only non-blank values and carries the example", () => {
    const re = /^REQ-\d+$/;
    expect(format("REQ-1", re, "REQ-001")).toBeNull();
    expect(format("", re, "REQ-001")).toBeNull();
    expect(format("foo", re, "REQ-001")).toEqual({
      code: "format",
      severity: "error",
      params: { example: "REQ-001" },
    });
  });

  it("duplicateRows marks later repeats, trimmed and case-insensitive", () => {
    const rows = ["Login", "logout", " login ", "", "", "LOGOUT", "x"];
    const dupes = duplicateRows(rows, (r) => r);
    expect([...dupes]).toEqual([2, 5]);
    expect(duplicateRow(dupes, 2)?.code).toBe("duplicateRow");
    expect(duplicateRow(dupes, 0)).toBeNull();
  });

  it("only errors block saving", () => {
    expect(hasBlocking([null, dateOrder("2026-02-01", "2026-01-01")])).toBe(false);
    expect(hasBlocking([required("")])).toBe(true);
    expect(compact([null, required(""), undefined])).toHaveLength(1);
  });
});
