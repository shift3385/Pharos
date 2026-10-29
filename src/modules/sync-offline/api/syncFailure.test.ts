import { describe, expect, it } from "vitest";
import { recentClientErrors } from "@shared/diagnostics";
import {
  SyncFailureLog,
  logRefusedChanges,
  logSyncFailure,
} from "./syncFailure";
import { SyncHttpError } from "./transport";

const last = () => recentClientErrors().at(-1);

describe("sync failures in the log (BASE-08)", () => {
  it("keeps the status and code of an HTTP failure, never the server's text", () => {
    const server = new SyncHttpError(
      400,
      "client_error",
      `Unexpected token in JSON: {"name":"Proyecto Zafiro","owner":"ana@cliente.example"}`,
    );
    logSyncFailure(server, "manual");
    expect(last()).toBe("SyncHttpError: HTTP 400 client_error\nsync: manual");
    logSyncFailure(new SyncHttpError(503, "", "busy"), "auto");
    expect(last()).toBe("SyncHttpError: HTTP 503\nsync: auto");
  });

  it("keeps only the type of a native rejection, which may quote stored data", () => {
    logSyncFailure("invalid type: string \"Caso secreto\"", "conflict-resolve");
    expect(last()).toBe("Non-Error value (string)\nsync: conflict-resolve");
  });

  it("logs other errors redacted, with their stack", () => {
    logSyncFailure(new TypeError("Failed to fetch for ana@cliente.example"), "auto");
    expect(last()).toMatch(/^TypeError: Failed to fetch for <email>\n/);
    expect(last()).toMatch(/sync: auto$/);
    expect(last()).not.toContain("ana@cliente.example");
  });

  it("logs refused changes by entity and id, without payloads", () => {
    logRefusedChanges([]);
    const before = recentClientErrors().length;
    logRefusedChanges([
      { entity: "test_case", entityId: "6f1c2a9e-0b7d-4c1e-9a55-2d4f8b3c7e10" },
      { entity: "project", entityId: "p1" },
    ]);
    expect(recentClientErrors().length).toBe(before + 1);
    expect(last()).toBe(
      "SyncRefused: 2 change(s) refused: test_case:6f1c2a9e-0b7d-4c1e-9a55-2d4f8b3c7e10, project:p1\nsync: push-refused",
    );
  });

  it("logs a repeated background failure once, until it changes or succeeds", () => {
    const log = new SyncFailureLog();
    const count = () => recentClientErrors().length;
    const start = count();
    const down = () => new TypeError("Failed to fetch");
    log.report(down(), "auto");
    log.report(down(), "auto");
    log.report(down(), "auto");
    expect(count()).toBe(start + 1);
    // Each action keeps its own state.
    log.report(down(), "state");
    expect(count()).toBe(start + 2);
    // A different failure is logged…
    log.report(new SyncHttpError(401, "unauthorized", "x"), "auto");
    expect(count()).toBe(start + 3);
    // …and after a success the same failure is logged again.
    log.clear("auto");
    log.report(new SyncHttpError(401, "unauthorized", "x"), "auto");
    expect(count()).toBe(start + 4);
  });
});
