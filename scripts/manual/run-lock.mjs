// One tour run at a time on this machine (MAN-02). Every run shares the API
// port (3100) and the fixed database `pharos_test_db_tours`; a second run that
// started while the first was building would pass the port check and then drop
// the first run's database. The runner takes this lock before anything else.
//
// The lock is a file in the OS temp dir holding `{ pid, startedAt }`, created
// exclusively (`wx`), so two runs starting together cannot both win. A lock
// whose PID no longer runs (a crashed or killed run) is stale and is replaced.
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const LOCK_FILE = join(tmpdir(), "pharos-tours.lock");

/** True when a process with that PID exists (EPERM: it exists, not ours). */
export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

function readHolder(file) {
  try {
    const holder = JSON.parse(readFileSync(file, "utf8"));
    return Number.isInteger(holder?.pid) ? holder : null;
  } catch {
    return null;
  }
}

/**
 * Takes the lock for `pid`. Returns `{ ok: true }`, or `{ ok: false, holder }`
 * when another live process holds it. A stale or unreadable lock is replaced.
 */
export function acquireLock(file = LOCK_FILE, { pid = process.pid, now = new Date(), isAlive = pidAlive } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(file, JSON.stringify({ pid, startedAt: now.toISOString() }), { flag: "wx" });
      return { ok: true };
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
    const holder = readHolder(file);
    if (holder && holder.pid !== pid && isAlive(holder.pid)) return { ok: false, holder };
    // Stale (its process is gone), unreadable, or our own: replace it.
    rmSync(file, { force: true });
  }
  return { ok: false, holder: readHolder(file) };
}

/** Releases the lock only if `pid` holds it (never another run's). */
export function releaseLock(file = LOCK_FILE, pid = process.pid) {
  if (readHolder(file)?.pid === pid) rmSync(file, { force: true });
}

/** The refusal message, in the runner's language for the user. */
export function lockMessage(holder) {
  const since = holder?.startedAt ? `, desde ${holder.startedAt}` : "";
  return `otra ejecución de recorridos en curso (PID ${holder?.pid ?? "?"}${since}). Espera a que termine: comparten el puerto y la base de datos de los recorridos.`;
}
