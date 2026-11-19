// Contract tests of the Allure importer (ING-07): a real allure-playwright
// folder (fixtures/allure/README.md) against its committed normalized
// snapshot, and small folders for what it lacks (containers, rows, labels).
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePharosRun } from "../schema.js";
import { type AllureFile, type ParsedReport, ReportError, isAllureResults, parseAllureResults } from "./index.js";

const FIXTURES = resolve(process.cwd(), "packages/formats/src/fixtures");
const folder = (dir: string): AllureFile[] =>
  readdirSync(join(FIXTURES, dir))
    .sort()
    .map((name) => ({ name: `allure-results/${name}`, text: readFileSync(join(FIXTURES, dir, name), "utf8") }));

/** The same projection as importers.test.ts. */
const snapshot = (r: ParsedReport) =>
  JSON.stringify(
    {
      format: r.format,
      warnings: r.warnings,
      inline: Object.fromEntries([...r.inline].map(([k, v]) => [k, { encoding: v.encoding, length: v.data.length }])),
      doc: r.doc,
    },
    null,
    2,
  ) + "\n";

const result = (over: Record<string, unknown>) => ({
  name: "paga",
  fullName: "com.acme.PayTest.paga",
  status: "passed",
  start: 1_795_000_000_000,
  stop: 1_795_000_000_500,
  labels: [
    { name: "package", value: "com.acme.PayTest" },
    { name: "suite", value: "Pagos" },
    { name: "framework", value: "junit5" },
  ],
  ...over,
});
const files = (...docs: [string, unknown][]): AllureFile[] =>
  docs.map(([name, d]) => ({ name, text: typeof d === "string" ? d : JSON.stringify(d) }));

describe("Allure results → results", () => {
  it("the allure-playwright folder matches its snapshot", async () => {
    const r = parseAllureResults(folder("allure/playwright"));
    expect(r.format).toBe("allure");
    expect(r.doc.schemaVersion).toBe("1.1.0");
    expect(parsePharosRun(r.doc).ok).toBe(true);
    await expect(snapshot(r)).toMatchFileSnapshot(join(FIXTURES, "allure/normalized/playwright.json"));
  });

  it("keys like the Playwright reporter, with attempts, flaky retries and tags", () => {
    const r = parseAllureResults(folder("allure/playwright"));
    expect(r.doc.run).toMatchObject({ sourceTool: "playwright", context: { environment: { os: "ci", app: "pharos-sample" } } });
    const of = (key: string) => r.doc.results.filter((x) => x.testKey === key);
    const pay = of("pagos.spec.mjs::Pagos › paga con tarjeta @TC-001");
    expect(pay.map((x) => [x.status, x.attempt, x.tags])).toEqual([["passed", 0, ["@TC-001"]]]);
    expect(pay[0].steps?.map((s) => s.text)).toEqual(["rellena la tarjeta", "confirma el pago"]);
    const receipt = r.doc.attachments.find((a) => a.name === "recibo.txt")!;
    expect(pay[0].attachments).toContain(receipt.ref);
    expect(r.inline.get(receipt.ref)).toEqual({ data: "recibo 42", encoding: "text" });
    const declined = of("pagos.spec.mjs::Pagos › rechaza una tarjeta caducada");
    expect(declined.map((x) => [x.status, x.attempt, x.tags])).toEqual([
      ["failed", 0, ["@TC-002"]],
      ["failed", 1, ["@TC-002"]],
    ]);
    expect(declined[1].message).toMatch(/^Error: status/);
    const retried = of("carrito.spec.mjs::añade al carrito tras un reintento");
    expect(retried.map((x) => [x.status, x.attempt, x.attributes?.flaky ?? false])).toEqual([
      ["failed", 0, false],
      ["passed", 1, true],
    ]);
    expect(of("carrito.spec.mjs::calcula el total con 3 unidades")[0].attributes).toMatchObject({ parameters: { qty: "3" } });
    expect(of("perfil.spec.mjs::exporta el perfil (pendiente)")[0].status).toBe("skipped");
  });

  it("detects a folder by its result files", () => {
    expect(isAllureResults(folder("allure/playwright"))).toBe(true);
    expect(isAllureResults(files(["junit.xml", "<testsuites/>"]))).toBe(false);
    expect(() => parseAllureResults(files(["environment.properties", "a=b"]))).toThrow(ReportError);
  });

  it("keys a Java test by its package, makes rows of parameters and fails the children of a failed fixture", () => {
    const r = parseAllureResults(
      files(
        ["r/a-result.json", result({ uuid: "a", historyId: "h1", testCaseId: "t1", parameters: [{ name: "card", value: "visa" }] })],
        ["r/b-result.json", result({ uuid: "b", historyId: "h2", testCaseId: "t1", start: 1_795_000_001_000, stop: 1_795_000_001_100, parameters: [{ name: "card", value: "amex" }] })],
        [
          "r/c-result.json",
          result({
            uuid: "c",
            name: "reembolsa",
            fullName: "com.acme.PayTest.reembolsa",
            historyId: "h3",
            testCaseId: "t3",
            status: "broken",
            labels: [{ name: "package", value: "com.acme.PayTest" }, { name: "AS_ID", value: "TC-9" }],
            links: [{ type: "tms", name: "TC-10", url: "https://tms.example/TC-10" }, { type: "issue", name: "BUG-1" }],
          }),
        ],
        ["r/x-container.json", { children: ["a"], befores: [{ name: "abre sesión", status: "broken", statusDetails: { message: "login caído" } }] }],
        ["r/executor.json", { name: "GitHub Actions", buildName: "PR #42", buildUrl: "https://ci.example/42" }],
      ),
    );
    expect(r.doc.run).toMatchObject({
      sourceTool: "junit5",
      context: { executorName: "GitHub Actions", executorBuildName: "PR #42", executorBuildUrl: "https://ci.example/42" },
    });
    expect(r.doc.results.map((x) => [x.testKey, x.exampleRow ?? null, x.status, x.rawStatus])).toEqual([
      // Ordered by start; the rows by their values (amex, visa).
      ["com/acme/PayTest::Pagos › paga[2]", 1, "failed", "passed"],
      ["com/acme/PayTest::reembolsa", null, "failed", "broken"],
      ["com/acme/PayTest::Pagos › paga[1]", 0, "passed", "passed"],
    ]);
    expect(r.doc.results[0]).toMatchObject({ message: "login caído", attributes: { failedFixture: "abre sesión" } });
    expect(r.doc.results[1].tags).toEqual(["@TC-9", "@TC-10"]);
  });
});
