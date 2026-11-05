// One tour run at a time on this machine (MAN-02). Every run shares the API
// port (3100) and the fixed database `pharos_test_db_tours`; a second run that
// started while the first was building would pass the port check and then drop
// the first run's database. The runner takes this lock before anything else.
//
// The lock is a file in the OS temp dir holding `{ pid, startedAt }`, created
// exclusively (`wx`), so two runs starting together cannot both win. A lock
// whose PID no longer runs (a crashed or killed run), or now belongs to a newer
// process (Windows reuses PIDs), is stale and is taken over.
import { spawnSync } from "node:child_process";
import { readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const LOCK_FILE = join(tmpdir(), "pharos-tours.lock");

/** A lock with no readable content this young is a run between creating the
 *  file and writing it: held, not stale. */
export const UNREADABLE_GRACE_MS = 5_000;

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

/** When that PID's process started (ms), or null when it can't be told. */
export function processStartMs(pid) {
  if (process.platform !== "win32") return null;
  const r = spawnSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", `(Get-Process -Id ${Number(pid)}).StartTime.ToUniversalTime().ToString('o')`],
    { encoding: "utf8", timeout: 10_000, windowsHide: true },
  );
  const ms = Date.parse((r.stdout ?? "").trim());
  return Number.isNaN(ms) ? null : ms;
}

function readHolder(file) {
  try {
    const holder = JSON.parse(readFileSync(file, "utf8"));
    return Number.isInteger(holder?.pid) ? holder : null;
  } catch {
    return null;
  }
}

/** A live PID that started after the lock was written is not its holder. */
function reusedPid(holder, startOf) {
  const lockedAt = Date.parse(holder.startedAt ?? "");
  const started = Number.isNaN(lockedAt) ? null : startOf(holder.pid);
  return started !== null && started > lockedAt + 1_000;
}

/**
 * Takes the lock for `pid`. Returns `{ ok: true }`, or `{ ok: false, holder }`
 * when another live process holds it (`holder` is null for a lock still being
 * written). A stale lock is renamed away first: of two runs taking it over at
 * once, only one rename succeeds, so the other cannot delete the winner's lock.
 */
export function acquireLock(file = LOCK_FILE, { pid = process.pid, now = new Date(), isAlive = pidAlive, startOf = processStartMs } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      writeFileSync(file, JSON.stringify({ pid, startedAt: now.toISOString() }), { flag: "wx" });
      return { ok: true };
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
    const holder = readHolder(file);
    if (holder && holder.pid !== pid && isAlive(holder.pid) && !reusedPid(holder, startOf)) return { ok: false, holder };
    if (!holder) {
      let age = Infinity;
      try {
        age = now.getTime() - statSync(file).mtimeMs;
      } catch {
        continue; // gone meanwhile: try again
      }
      if (age < UNREADABLE_GRACE_MS) return { ok: false, holder: null };
    }
    const aside = `${file}.${pid}.${attempt}.stale`;
    try {
      renameSync(file, aside);
      rmSync(aside, { force: true });
    } catch {
      // Another run took it over first: the next attempt sees its lock.
    }
  }
  return { ok: false, holder: readHolder(file) };
}

/** Releases the lock only if `pid` holds it (never another run's). */
export function releaseLock(file = LOCK_FILE, pid = process.pid) {
  if (readHolder(file)?.pid === pid) rmSync(file, { force: true });
}

/** The refusal message, in the runner's language for the user. */
export function lockMessage(holder, file = LOCK_FILE) {
  const since = holder?.startedAt ? `, desde ${holder.startedAt}` : "";
  return `otra ejecución de recorridos en curso (PID ${holder?.pid ?? "?"}${since}). Espera a que termine: comparten el puerto y la base de datos. Si no hay ninguna en marcha, borra ${file}.`;
}
