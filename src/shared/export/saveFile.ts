// Single exit for every file the app hands to the user (UX-02): exports,
// templates, planner attachments and the diagnostic bundle. In the desktop app
// the bytes go to Rust (`download_save`), which writes them into the download
// folder chosen with the native picker (or the OS Downloads folder) without
// overwriting earlier files. In the web preview there is no Rust side, so the
// browser's own download takes over.
import { invoke } from "@tauri-apps/api/core";

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
 * file name in the web preview.
 */
export async function saveFile(
  name: string,
  data: Data,
  mime?: string,
): Promise<string> {
  if (!isTauri()) {
    browserDownload(name, data, mime);
    return name;
  }
  return invoke<string>("download_save", await toBytes(data), {
    headers: { "x-pharos-filename": encodeURIComponent(name) },
  });
}

/** Download folder settings (desktop only; the web preview has no folder). */
export const downloadDir = {
  available: isTauri,
  get: (): Promise<DownloadDirInfo> => invoke("download_dir_get"),
  /** Opens the native folder picker; `null` when the user cancels. */
  pick: (): Promise<DownloadDirInfo | null> => invoke("download_dir_pick"),
  reset: (): Promise<DownloadDirInfo> => invoke("download_dir_reset"),
};
