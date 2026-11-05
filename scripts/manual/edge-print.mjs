// Prints an HTML file to PDF with headless Microsoft Edge (MAN-01, hardened in
// MAN-02). Each print gets its own fresh profile directory (`--user-data-dir`)
// under the build's own folder, so a profile left behind by an earlier or a
// concurrent build can never be reused or block this one. The profile is
// removed afterwards on a best-effort basis: Edge's helper processes can hold
// its files for a moment on Windows, and that must not fail a build whose PDF
// is already written. A print that fails with EPERM (a locked profile or PDF)
// is retried once, with a new profile.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const isEperm = (err) => err?.code === "EPERM" || /\bEPERM\b/.test(String(err?.message ?? "")) || /\bEPERM\b/.test(String(err?.stderr ?? ""));

/** Removes a directory, never throwing (it is retried a few times first). */
export function removeQuietly(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    return true;
  } catch {
    return false;
  }
}

/** Removes the profiles earlier builds could not delete (best effort). */
export function sweepProfiles(profilesDir) {
  if (!existsSync(profilesDir)) return 0;
  let removed = 0;
  for (const name of readdirSync(profilesDir)) if (name.startsWith("edge-") && removeQuietly(join(profilesDir, name))) removed++;
  return removed;
}

/**
 * Prints `htmlUrl` to `pdfFile`. `exec(args)` runs Edge with those arguments
 * (execFileSync in the build, a fake in the tests). Throws when Edge fails
 * twice, or once for any reason other than EPERM.
 */
export function printWithEdge({ htmlUrl, pdfFile, profilesDir, exec, attempts = 2 }) {
  mkdirSync(profilesDir, { recursive: true });
  for (let attempt = 1; ; attempt++) {
    const profile = mkdtempSync(join(profilesDir, `edge-${process.pid}-`));
    try {
      // A PDF left by an earlier build: removed first, so a stale file can
      // never pass for this print's output.
      rmSync(pdfFile, { force: true });
      exec([
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        `--user-data-dir=${profile}`,
        "--no-pdf-header-footer",
        "--generate-pdf-document-outline",
        "--allow-file-access-from-files",
        `--print-to-pdf=${pdfFile}`,
        htmlUrl,
      ]);
      if (!existsSync(pdfFile) || statSync(pdfFile).size === 0) throw new Error(`Edge did not print ${pdfFile}.`);
      return { attempt, profile };
    } catch (err) {
      if (attempt >= attempts || !isEperm(err)) throw err;
    } finally {
      removeQuietly(profile);
    }
  }
}
