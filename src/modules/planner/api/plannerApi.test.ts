// BASE-10: on the web the planner store is a client of the server's domain API and keeps
// nothing in localStorage; on the desktop the same calls go to the Rust core.

import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeServer } from "@test/server";
import { DesktopOnlyError } from "@shared/platform";
import { plannerApi, projectCardCount, UPLOAD_CHUNK } from "./plannerApi";

// jsdom's Blob has no arrayBuffer() (WebView2 does).
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function (this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

function onDesktop() {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  invoke.mockReset();
  invoke.mockResolvedValue([]);
}
afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

const input = { projectId: "p1", ownerId: "u1", kind: "task" as const, title: "Prepare", data: {} };

describe("plannerApi", () => {
  it("web: /api/planner-cards and reorder", async () => {
    const server = fakeServer();
    await plannerApi.list("p1", "u1");
    await plannerApi.create(input);
    await plannerApi.update("k1", input);
    await plannerApi.reorder("u1", "done", ["k1", "k2"]);
    await plannerApi.remove("k1", "u1");
    expect(server.calls()).toEqual([
      "GET /api/planner-cards?projectId=p1",
      "POST /api/planner-cards",
      "PUT /api/planner-cards/k1",
      "POST /api/planner-cards/reorder",
      "DELETE /api/planner-cards/k1",
    ]);
    expect(server.body(3)).toEqual({ status: "done", ids: ["k1", "k2"] });
  });

  it("web: attachments stay on the desktop (SYNC-04b)", async () => {
    const server = fakeServer();
    expect(await plannerApi.attachmentList("k1", "u1")).toEqual([]);
    await expect(plannerApi.attachmentSave("a1", "u1")).rejects.toBeInstanceOf(DesktopOnlyError);
    await expect(plannerApi.attachmentAdd("k1", "u1", new File(["x"], "a.txt"))).rejects.toBeInstanceOf(
      DesktopOnlyError,
    );
    await expect(plannerApi.attachmentDelete("a1", "u1")).rejects.toBeInstanceOf(DesktopOnlyError);
    expect(server.calls()).toEqual([]);
    expect(Object.keys(localStorage)).toEqual(["pharos.session"]);
  });

  it("desktop: attachments in the Rust core", async () => {
    onDesktop();
    await plannerApi.attachmentList("k1", "u1");
    expect(invoke).toHaveBeenCalledWith("planner_attachment_list", { cardId: "k1", ownerId: "u1" });
    await plannerApi.attachmentSave("a1", "u1");
    expect(invoke).toHaveBeenCalledWith("planner_attachment_save", { id: "a1", ownerId: "u1" });
  });

  it("desktop: a file goes to the evidence store in raw chunks, never as base64", async () => {
    onDesktop();
    invoke.mockImplementation((cmd: string) =>
      Promise.resolve(cmd === "evidence_upload_begin" ? "up1" : null),
    );
    const size = 2 * UPLOAD_CHUNK + 10;
    const file = new File([new Uint8Array(size)], "trace.zip", { type: "application/zip" });
    await plannerApi.attachmentAdd("k1", "u1", file);
    const calls = invoke.mock.calls;
    expect(calls[0]).toEqual(["evidence_upload_begin", { size }]);
    const chunks = calls.filter((c) => c[0] === "evidence_upload_chunk");
    expect(chunks.map((c) => (c[1] as Uint8Array).byteLength)).toEqual([UPLOAD_CHUNK, UPLOAD_CHUNK, 10]);
    for (const c of chunks) {
      expect(c[1]).toBeInstanceOf(Uint8Array);
      expect(c[2]).toEqual({ headers: { "x-pharos-upload": "up1" } });
    }
    expect(calls.at(-1)).toEqual([
      "planner_attachment_add",
      { cardId: "k1", ownerId: "u1", uploadId: "up1", name: "trace.zip", mime: "application/zip" },
    ]);
  });

  it("desktop: a failed chunk cancels the upload and attaches nothing", async () => {
    onDesktop();
    invoke.mockImplementation((cmd: string) =>
      cmd === "evidence_upload_chunk"
        ? Promise.reject(new Error("evidence-too-large: the file is larger than 200 MB"))
        : Promise.resolve(cmd === "evidence_upload_begin" ? "up1" : null),
    );
    await expect(plannerApi.attachmentAdd("k1", "u1", new File(["abc"], "a.txt"))).rejects.toThrow(
      "evidence-too-large",
    );
    expect(invoke).toHaveBeenCalledWith("evidence_upload_cancel", { uploadId: "up1" });
    expect(invoke.mock.calls.some((c) => c[0] === "planner_attachment_add")).toBe(false);
  });
});

describe("projectCardCount", () => {
  it("counts every card of the project, of any kind", async () => {
    onDesktop();
    invoke.mockResolvedValue([{ kind: "task" }, { kind: "defect" }, { kind: "test_data" }]);
    expect(await projectCardCount("p1", "u1")).toBe(3);
    expect(invoke).toHaveBeenCalledWith("planner_list", { projectId: "p1", ownerId: "u1" });
  });
});
