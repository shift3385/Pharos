// Where the AI tours' key comes from (MAN-01). Shared by the tour runner and
// check-manual: PHAROS_TOURS_AI_KEY from the environment, else
// ANTHROPIC_API_KEY / ANTHROPIC_MODEL from `.env` of this checkout, else of
// the main checkout (a worktree has no `.env` of its own). The key is
// returned to the caller only; nothing here prints it.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** `KEY=value` lines of a dotenv file (no expansion), or {} if unreadable. */
export function readDotenv(file) {
  try {
    const out = {};
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
    }
    return out;
  } catch {
    return {};
  }
}

/** `{ key, provider, model, baseUrl, maxCalls, source }` or null when no key
 *  is available. An empty variable (an unset GitHub variable arrives as "")
 *  counts as unset. */
export function findAiKey(repoDir, env = process.env) {
  const extra = {
    baseUrl: env.PHAROS_TOURS_AI_BASE_URL || undefined,
    maxCalls: env.PHAROS_TOURS_AI_MAX_CALLS || undefined,
  };
  if (env.PHAROS_TOURS_AI_KEY) {
    return {
      key: env.PHAROS_TOURS_AI_KEY,
      provider: env.PHAROS_TOURS_AI_PROVIDER || undefined,
      model: env.PHAROS_TOURS_AI_MODEL || undefined,
      ...extra,
      source: "env",
    };
  }
  let main = null;
  try {
    const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: repoDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    main = join(common, "..", ".env");
  } catch {
    // Not a git checkout: only this checkout's .env.
  }
  for (const file of [join(repoDir, ".env"), main].filter(Boolean)) {
    const vars = readDotenv(file);
    if (vars.ANTHROPIC_API_KEY) {
      return {
        key: vars.ANTHROPIC_API_KEY,
        provider: env.PHAROS_TOURS_AI_PROVIDER || "anthropic",
        model: env.PHAROS_TOURS_AI_MODEL || vars.ANTHROPIC_MODEL || undefined,
        ...extra,
        source: file,
      };
    }
  }
  return null;
}
