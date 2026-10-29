import { afterEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { invoke } from "@tauri-apps/api/core";
import pkg from "../../../package.json";
import {
  buildDiagnosticZip,
  describeError,
  diagnosticFileName,
  logClientError,
  recentClientErrors,
} from "./diagnostics";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);

async function unzip(blob: Blob) {
  // jsdom's Blob has no arrayBuffer(); read it through a FileReader.
  const buffer = await new Promise<ArrayBuffer>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
  return JSZip.loadAsync(buffer);
}

function asDesktop() {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  mockedInvoke.mockReset();
});

describe("client diagnostics", () => {
  it("describes errors redacted and truncated", () => {
    const text = describeError(
      new Error("login failed for ana@cliente.example"),
      "ctx",
    );
    expect(text).toContain("Error: login failed for <email>");
    expect(text).not.toContain("ana@cliente.example");
    expect(describeError("x".repeat(5000)).length).toBe(2000);
  });

  it("buffers errors in the web preview without calling Rust", () => {
    logClientError(new Error("boom in web"));
    expect(recentClientErrors().at(-1)).toContain("boom in web");
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("sends errors to the desktop log through diag_log", () => {
    asDesktop();
    mockedInvoke.mockResolvedValue(undefined);
    logClientError(new Error("token=abc123secret"));
    expect(mockedInvoke).toHaveBeenCalledWith("diag_log", {
      level: "error",
      message: expect.stringContaining("token=<redacted>"),
    });
  });

  it("names the bundle after the version and the export time", () => {
    const name = diagnosticFileName(new Date(2026, 9, 28, 9, 5));
    expect(name).toBe(`pharos-diagnostic-${pkg.version}-20261028-0905.zip`);
  });

  it("web bundle holds only frontend facts", async () => {
    localStorage.setItem(
      "pharos.session",
      JSON.stringify({ accessToken: "secret-token" }),
    );
    const zip = await unzip(
      await buildDiagnosticZip(new Date("2026-10-28T10:00:00Z")),
    );
    expect(Object.keys(zip.files)).toEqual(["diagnostic.json"]);
    const text = await zip.file("diagnostic.json")!.async("string");
    const json = JSON.parse(text);
    expect(json).toMatchObject({
      format: "pharos-diagnostic/1",
      platform: "web",
      app: { version: pkg.version },
    });
    expect(text).not.toContain("secret-token");
    localStorage.removeItem("pharos.session");
  });

  it("desktop bundle zips the manifest and the logs from diag_export", async () => {
    asDesktop();
    mockedInvoke.mockResolvedValue({
      manifest: { app: { version: pkg.version }, database: { migrations: [] } },
      logs: [{ name: "pharos.2026-10-28.log", content: '{"level":"INFO"}' }],
    });
    const zip = await unzip(await buildDiagnosticZip());
    expect(mockedInvoke).toHaveBeenCalledWith("diag_export", {
      client: expect.objectContaining({ language: expect.any(String) }),
    });
    expect(Object.keys(zip.files).sort()).toEqual([
      "diagnostic.json",
      "logs/",
      "logs/pharos.2026-10-28.log",
    ]);
    const json = JSON.parse(await zip.file("diagnostic.json")!.async("string"));
    expect(json).toMatchObject({
      platform: "desktop",
      app: { version: pkg.version },
    });
  });
});
