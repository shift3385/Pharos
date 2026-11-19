import { describe, expect, it } from "vitest";
import { MAX_ZIP_ENTRIES, ZipError, isZip, readZip } from "../src/modules/api/zip.js";
import { zipOf } from "./zipOf.js";

describe("the bounded zip reader (ING-07)", () => {
  it("reads stored and deflated entries and leaves folders out", () => {
    const zip = zipOf([
      { name: "allure-results/", data: "" },
      { name: "allure-results/a-result.json", data: '{"name":"a"}', deflate: true },
      { name: "allure-results/environment.properties", data: "os=ci" },
    ]);
    expect(isZip(zip)).toBe(true);
    expect(isZip(Buffer.from("<testsuites/>"))).toBe(false);
    expect(readZip(zip, 1024).map((e) => [e.name, e.data.toString()])).toEqual([
      ["allure-results/a-result.json", '{"name":"a"}'],
      ["allure-results/environment.properties", "os=ci"],
    ]);
  });

  it("stops a bomb at the ceiling, even when it lies about its size", () => {
    const zeros = Buffer.alloc(5 * 1024 * 1024);
    const honest = zipOf([{ name: "big.txt", data: zeros, deflate: true }]);
    expect(() => readZip(honest, 1024 * 1024)).toThrow(ZipError);
    const lying = zipOf([{ name: "big.txt", data: zeros, deflate: true, declaredSize: 10 }]);
    try {
      readZip(lying, 1024 * 1024);
      expect.unreachable();
    } catch (e) {
      expect((e as ZipError).reason).toBe("too-large");
    }
  });

  it("refuses what it cannot read", () => {
    expect(() => readZip(Buffer.from("PK\u0003\u0004 not a zip"), 1024)).toThrow(/invalid-zip/);
    const many = zipOf(Array.from({ length: MAX_ZIP_ENTRIES + 1 }, (_, i) => ({ name: `f${i}`, data: "" })));
    expect(() => readZip(many, 1024)).toThrow(/too-large/);
  });
});
