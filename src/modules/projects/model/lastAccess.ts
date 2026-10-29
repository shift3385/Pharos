// "Último acceso" of the Home list (spec §5, UX-08): when this user last opened
// each project on this device. It is device-local by design: it is not project
// data, so it stays out of the encrypted database and of sync (it would churn
// the oplog on every open). Only project ids and timestamps are kept, per user.

const PREFIX = "pharos.projects.lastAccess.";

/** Project id → ISO timestamp of the last time `userId` opened it here. */
export function lastAccessMap(userId: string): Record<string, string> {
  try {
    const raw = JSON.parse(
      localStorage.getItem(PREFIX + userId) ?? "{}",
    ) as unknown;
    return raw && typeof raw === "object"
      ? (raw as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

/** Records that `userId` opened `projectId` now. Storage failures are ignored:
 *  the list then falls back to the project's last update. */
export function recordProjectAccess(
  userId: string,
  projectId: string,
  when = new Date(),
): void {
  if (!userId) return;
  try {
    const map = lastAccessMap(userId);
    map[projectId] = when.toISOString();
    localStorage.setItem(PREFIX + userId, JSON.stringify(map));
  } catch {
    // Private mode or full storage: nothing to record.
  }
}
