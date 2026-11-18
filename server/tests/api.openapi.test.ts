// The OpenAPI contract of /api/v1 (INT-02, ADR-0052 §1) is versioned in
// docs/formats/openapi-v1.json. This test fails when the routes' schemas and
// that file drift. To regenerate it after a deliberate change:
//     UPDATE_OPENAPI=1 npx vitest run tests/api.openapi.test.ts
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildOpenApi } from "../src/modules/api/openapi";

const FILE = new URL("../../docs/formats/openapi-v1.json", import.meta.url);

describe("OpenAPI v1", () => {
  it("matches docs/formats/openapi-v1.json", () => {
    const text = `${JSON.stringify(buildOpenApi(), null, 2)}\n`;
    if (process.env.UPDATE_OPENAPI) writeFileSync(FILE, text);
    expect(readFileSync(FILE, "utf8").replace(/\r\n/g, "\n")).toBe(text);
  });

  it("documents every route with its errors, and leaves objects open", () => {
    const doc = buildOpenApi();
    expect(Object.keys(doc.paths)).toEqual(["/me", "/projects", "/projects/{projectId}"]);
    expect(JSON.stringify(doc)).not.toContain('"additionalProperties":false');
    for (const path of Object.values(doc.paths)) expect(Object.keys(path.get.responses)).toContain("401");
  });
});
