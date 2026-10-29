// Single exit for every file the app hands to the user (UX-02): exports,
// templates, planner attachments and the diagnostic bundle. In the desktop app
// the bytes go to Rust (`download_save`), which writes them into the download
// folder chosen with the native picker (or the OS Downloads folder) without
// overwriting earlier files. In the web preview there is no Rust side, so the
// browser's own download takes over.
//
// Problems are never silent: a save that had to go to Downloads instead of the
// chosen folder, or that failed, shows a toast from here (`notify`), and a
// failure rejects with a `ReportedError` that callers skip with `unlessReported`.
import { invoke } from "@tauri-apps/api/core";
import i18n from "i18next";
import { notify, ReportedError } from "../ui/notify";

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

/** Where downloads go: `custom` false = the OS Downloads folder; `missing`
 *  true = the chosen folder no longer exists (files fall back to Downloads). */
export interface DownloadDirInfo {
  path: string | null;
  custom: boolean;
  missing: boolean;
}

interface SaveResult {
  path: string;
  /** The chosen folder was missing or not writable: saved in Downloads. */
  fallback: boolean;
}

export interface SaveOptions {
  mime?: string;
  /** Content that came from someone else (planner attachments): the saved
   *  file gets Mark-of-the-Web, so Windows warns before opening it. */
  untrusted?: boolean;
}

type Data = Blob | ArrayBuffer | Uint8Array | string;

async function toBytes(data: Data): Promise<Uint8Array> {
  if (typeof data === "string") return new TextEncoder().encode(data);
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(await data.arrayBuffer());
}

function browserDownload(name: string, data: Data, mime?: string) {
  const blob =
    data instanceof Blob
      ? data
      : new Blob([data as BlobPart], {
          type: mime ?? "application/octet-stream",
        });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking right after click() can cancel the download before it starts.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Saves `data` as `name` and returns where it went: the full path in the
 * desktop app (it may carry a " (2)" suffix when the name was taken), or the
 * file name in the web preview. On failure it shows an error toast and
 * rejects with a `ReportedError`.
 */
export async function saveFile(
  name: string,
  data: Data,
  options: SaveOptions | string = {},
): Promise<string> {
  const { mime, untrusted } =
    typeof options === "string" ? { mime: options } : options;
  if (!isTauri()) {
    browserDownload(name, data, mime);
    return name;
  }
  let saved: SaveResult;
  try {
    const headers: Record<string, string> = {
      "x-pharos-filename": encodeURIComponent(name),
    };
    if (untrusted) headers["x-pharos-untrusted"] = "1";
    saved = await invoke<SaveResult>("download_save", await toBytes(data), {
      headers,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    notify(i18n.t("downloads.failed", { name, reason }), "error");
    throw new ReportedError(reason);
  }
  if (saved.fallback)
    notify(i18n.t("downloads.fallback", { path: saved.path }), "warning");
  return saved.path;
}

/** Download folder settings (desktop only; the web preview has no folder). */
export const downloadDir = {
  available: isTauri,
  get: (): Promise<DownloadDirInfo> => invoke("download_dir_get"),
  /** Opens the native folder picker; `null` when the user cancels. */
  pick: (): Promise<DownloadDirInfo | null> => invoke("download_dir_pick"),
  reset: (): Promise<DownloadDirInfo> => invoke("download_dir_reset"),
};
