// FIX-45: the labels the runs screens derive (example key, run title from a
// report, the time of a pasted capture).
import { describe, expect, it } from "vitest";
import { exampleCaseKey, localStamp, runTitleOf, toolName } from "./runLabels";

describe("exampleCaseKey", () => {
  it("is a key of the project, with its digits", () => {
    expect(exampleCaseKey("PH-", 3)).toBe("PH-001");
    expect(exampleCaseKey("ATS_", 4)).toBe("ATS_0001");
    expect(exampleCaseKey("", 3)).toBe("PH-001");
  });
});

describe("runTitleOf", () => {
  it("names the tool as it spells itself, not by its lowercase id", () => {
    expect(runTitleOf("playwright", "allure-acceso.zip")).toBe("Playwright · allure-acceso.zip");
    expect(runTitleOf("mstest", "api-v1-dotnet.trx")).toBe("MSTest · api-v1-dotnet.trx");
    expect(runTitleOf("xcode", "r.json")).toBe("Xcode · r.json");
    expect(runTitleOf("axe-core", "a.json")).toBe("axe-core · a.json");
    expect(runTitleOf("Semgrep, CodeQL", "s.sarif")).toBe("Semgrep, CodeQL · s.sarif");
    expect(runTitleOf(undefined, "pw-junit.xml")).toBe("pw-junit.xml");
  });

  it("capitalises an unknown all-lowercase tool and keeps any other as written", () => {
    expect(toolName("behave")).toBe("Behave");
    expect(toolName("SpecFlow")).toBe("SpecFlow");
    expect(toolName("pytest")).toBe("pytest");
  });
});

describe("localStamp", () => {
  it("is the local time of the clock, not UTC", () => {
    const d = new Date(2026, 10, 20, 11, 5, 1);
    expect(localStamp(d)).toBe("2026-11-20-11-05-01");
  });
});
