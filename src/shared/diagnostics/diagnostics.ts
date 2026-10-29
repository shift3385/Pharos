// Client side of local observability (BASE-08, ADR-0022): frontend errors go
// to the desktop log (`diag_log`), and "Exportar diagnóstico" zips the bundle
// built by `diag_export`. In the web preview there is no Rust side: errors stay
// in a small in-memory buffer and the bundle carries only frontend facts.
import { invoke } from "@tauri-apps/api/core";
import i18n from "i18next";
import { APP_VERSION } from "../version";
import { redact } from "./redact";

const MAX_MESSAGE = 2000;
const MAX_BUFFERED = 50;
const recentErrors: string[] = [];

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

/** Message (and stack) of anything thrown, redacted and truncated. */
export function describeError(error: unknown, context?: string): string {
  const base =
    error instanceof Error
      ? `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`
      : String(error);
  const text = context ? `${base}\n${context}` : base;
  return redact(text).slice(0, MAX_MESSAGE);
}

/** Records a frontend error: the desktop log, or the in-memory buffer. */
export function logClientError(error: unknown, context?: string): void {
  const message = describeError(error, context);
  recentErrors.push(message);
  if (recentErrors.length > MAX_BUFFERED) recentErrors.shift();
  if (isTauri()) {
    // Logging must never throw into the code that reported the error.
    invoke("diag_log", { level: "error", message }).catch(() => undefined);
  }
}

/** Buffered frontend errors, oldest first (web preview and tests). */
export function recentClientErrors(): readonly string[] {
  return recentErrors;
}

let installed = false;

/** Sends uncaught errors and unhandled rejections to `logClientError`. */
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) =>
    logClientError(e.error ?? e.message, "window.onerror"),
  );
  window.addEventListener("unhandledrejection", (e) =>
    logClientError(e.reason, "unhandledrejection"),
  );
}

interface NativeBundle {
  manifest: Record<string, unknown>;
  logs: { name: string; content: string }[];
}

function uiFacts() {
  return {
    language: i18n.language ?? "",
    theme: document.documentElement.getAttribute("data-theme") ?? "light",
  };
}

function stamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** File name of a bundle exported at `when`. */
export function diagnosticFileName(when: Date): string {
  return `pharos-diagnostic-${APP_VERSION}-${stamp(when)}.zip`;
}

/** Builds the diagnostic ZIP: `diagnostic.json` plus `logs/` on the desktop. */
export async function buildDiagnosticZip(when = new Date()): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const header = {
    format: "pharos-diagnostic/1",
    generatedAt: when.toISOString(),
  };
  if (isTauri()) {
    const bundle = await invoke<NativeBundle>("diag_export", {
      client: uiFacts(),
    });
    zip.file(
      "diagnostic.json",
      JSON.stringify(
        { ...header, platform: "desktop", ...bundle.manifest },
        null,
        2,
      ),
    );
    for (const log of bundle.logs) zip.file(`logs/${log.name}`, log.content);
  } else {
    const web = {
      ...header,
      platform: "web",
      app: { name: "Pharos", version: APP_VERSION },
      ui: uiFacts(),
      userAgent: navigator.userAgent,
      note: "Web preview: no native logs, database or OS facts.",
      clientErrors: recentErrors,
    };
    zip.file("diagnostic.json", JSON.stringify(web, null, 2));
  }
  return zip.generateAsync({ type: "blob" });
}

/** Builds and downloads the bundle; returns the file name. */
export async function exportDiagnostics(): Promise<string> {
  const when = new Date();
  const blob = await buildDiagnosticZip(when);
  const name = diagnosticFileName(when);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return name;
}
