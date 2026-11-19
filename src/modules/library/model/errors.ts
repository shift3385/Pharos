import type { TFunction } from "i18next";

/** Codes the core and the server answer with (`shared_library.<code>`), for
 *  which there is a sentence in `library.error.*`. */
const KNOWN = new Set([
  "in_use",
  "duplicate_name",
  "empty_name",
  "no_steps",
  "empty_step",
  "no_columns",
  "bad_param_name",
  "duplicate_param",
  "bad_column_name",
  "duplicate_column",
  "advanced_unsupported",
  "not_found",
  "too_many:steps",
  "too_many:params",
  "too_many:columns",
  "too_many:rows",
  "too_long:name",
  "too_long:description",
  "too_long:step",
  "too_long:expected",
  "too_long:default",
  "too_long:cell",
]);

/** The `shared_library.*` code inside an error (a Tauri string, or the web's
 *  `SyncHttpError` code or message), or null. */
export function libraryErrorCode(e: unknown): string | null {
  const parts: string[] = [];
  if (e && typeof e === "object") {
    const o = e as { code?: unknown; message?: unknown };
    if (typeof o.code === "string") parts.push(o.code);
    if (typeof o.message === "string") parts.push(o.message);
  }
  parts.push(String(e));
  for (const p of parts) {
    const m = /shared_library\.([a-z_]+(?::[a-z_]+)?)/.exec(p);
    if (m) return m[1];
  }
  return null;
}

/** A Spanish (or English) sentence for a failed library call. */
export function libraryErrorMessage(e: unknown, t: TFunction): string {
  const code = libraryErrorCode(e);
  if (code && KNOWN.has(code))
    return t(`library.error.${code.replace(":", "_")}`);
  const reason = e instanceof Error ? e.message : String(e);
  return t("library.error.generic", { reason });
}
