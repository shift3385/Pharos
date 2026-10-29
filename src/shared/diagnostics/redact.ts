// Client-side mirror of `diag::redact` (src-tauri/src/diag.rs): masks emails,
// tokens, API keys, `key=value` secrets, long opaque strings, recovery keys
// and the Windows user name in profile paths. The desktop redacts again in
// Rust; the web preview, which has no Rust side, relies on this one.

const RULES: [RegExp, string][] = [
  [/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, "<token>"],
  [/\bbearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <token>"],
  [/\b(?:sk-(?:ant-|or-)?[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{30,})/g, "<key>"],
  [
    /((?:api[_-]?key|x-goog-api-key|x-api-key|access[_-]?token|refresh[_-]?token|token|password|secret|authorization)["']?\s*[:=]\s*["']?)[^\s"',&}]+/gi,
    "$1<redacted>",
  ],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>"],
  [/\b([A-Z]:[\\/]+Users[\\/]+)[^\\/\s"']+/gi, "$1<user>"],
];

// A recovery key (SEC-03, ADR-0024): 14 groups of 4, written or typed.
const RECOVERY_KEY = /\b[0-9A-Z]{4}(?:[ -][0-9A-Z]{4}){13}\b/gi;
const OPAQUE_RUN = /[A-Za-z0-9+_=-]{32,}/g;
// Entity ids are UUIDs: they identify a row, not a person, and are kept.
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

const mixed = (run: string) => /\d/.test(run) && /[A-Za-z]/.test(run);

export function redact(text: string): string {
  let out = text;
  for (const [re, with_] of RULES) out = out.replace(re, with_);
  out = out.replace(RECOVERY_KEY, (run) =>
    mixed(run) ? "<recovery-key>" : run,
  );
  return out.replace(OPAQUE_RUN, (run) =>
    mixed(run) && !UUID.test(run) ? "<redacted>" : run,
  );
}
