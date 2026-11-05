// The execution drafts of the web (EJE-06): the browser's, as the desktop's
// are the device's (`execution_drafts`, ADR-0013). One localStorage entry per
// run item and account, with the desktop's rules: each target's draft carries
// its attempt id; a save that would replace another tab's attempt, or bring
// back one already recorded, is refused (`draft-stale`), and recording needs
// the draft of that very attempt. Files are not part of a web draft (SYNC-04b).
// Signing out clears them all; a run read as cancelled or gone, or an item
// read as gone, takes its drafts. Other tabs: `ExecutionPanel` reloads the
// item when this entry, or the list of recorded attempts, changes there.

const PREFIX = "pharos:exec-draft:";
/** At most 1 MB of text per run item, as on the desktop (UTF-8 bytes). */
const MAX_BYTES = 1024 * 1024;

interface Entry {
  runId: string;
  targets: Record<string, Record<string, unknown>>;
  updatedAt: string;
}

export const draftKeyOf = (userId: string, runItemId: string) => `${PREFIX}${userId}:${runItemId}`;
const keyOf = draftKeyOf;

/** Attempt ids this page knows are recorded, by run item: from the last
 *  read of the item and from its own records. */
const recorded = new Map<string, Set<string>>();

/** What a tab recorded, for the other tabs of this browser: without it,
 *  their next autosave would bring back a draft whose attempt is recorded
 *  (the desktop checks its results table instead). The last ones only. */
const RECORDED = "pharos:exec-recorded:";
/** Drafts this page could not store (no storage, or full): their attempt
 *  may still be recorded, by `<item>|<target>|<attempt>`. */
const unstored = new Set<string>();
const KEEP_RECORDED = 200;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function recordedHere(userId: string): string[] {
  try {
    const v = JSON.parse(storage()?.getItem(RECORDED + userId) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function isRecorded(userId: string, runItemId: string, attempt: string) {
  return recorded.get(runItemId)?.has(attempt) === true || recordedHere(userId).includes(attempt);
}

function read(userId: string, runItemId: string): Entry | null {
  try {
    const raw = storage()?.getItem(keyOf(userId, runItemId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Entry>;
    if (!v || typeof v !== "object" || !v.targets || typeof v.targets !== "object") return null;
    return { runId: String(v.runId ?? ""), targets: v.targets, updatedAt: String(v.updatedAt ?? "") };
  } catch {
    return null;
  }
}

function write(userId: string, runItemId: string, entry: Entry) {
  const s = storage();
  if (!s) throw new Error("draft-unavailable: this browser keeps no local storage");
  const key = keyOf(userId, runItemId);
  if (Object.keys(entry.targets).length === 0) {
    s.removeItem(key);
    return;
  }
  const text = JSON.stringify(entry);
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error("draft-too-large: at most 1 MB of text per run item");
  try {
    s.setItem(key, text);
  } catch {
    throw new Error("draft-unavailable: the browser's storage is full");
  }
}

/** An attempt id in the desktop's one form (`manual::normalize_attempt`,
 *  Rust's `Uuid::parse_str`): hyphenated, braced, `urn:uuid:` or 32 hex
 *  digits, any case, become lower-case hyphenated; anything else is null. */
export function normalizeAttempt(id: unknown): string | null {
  if (typeof id !== "string") return null;
  let v = id.trim();
  if (/^urn:uuid:/i.test(v)) v = v.slice(9);
  else if (v.startsWith("{") && v.endsWith("}")) v = v.slice(1, -1);
  const hex = /^[0-9a-f]{32}$/i.test(v)
    ? v
    : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
      ? v.replace(/-/g, "")
      : null;
  if (!hex) return null;
  const h = hex.toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const attemptOf = (state: unknown) =>
  state && typeof state === "object" ? normalizeAttempt((state as Record<string, unknown>).attemptId) : null;

export const webDrafts = {
  /** The item's draft as the executor reads it (`RunItemDetail.draft`). */
  load(userId: string, runItemId: string) {
    const e = read(userId, runItemId);
    return e ? { targets: e.targets, attachments: [], updatedAt: e.updatedAt } : null;
  },
  /** Whether the item has a draft in this browser (`RunItemRow.hasDraft`). */
  has(userId: string, runItemId: string) {
    return read(userId, runItemId) !== null;
  },
  /** What the item's last read says is recorded. */
  noteRecorded(runItemId: string, ids: string[]) {
    const set = recorded.get(runItemId) ?? new Set<string>();
    for (const id of ids) set.add(id.toLowerCase());
    recorded.set(runItemId, set);
  },
  /** Saves one target's draft (`execution_draft_save`). */
  save(userId: string, runId: string, runItemId: string, key: string, state: Record<string, unknown>) {
    const entry = read(userId, runItemId) ?? { runId, targets: {}, updatedAt: "" };
    // Never a draft without its run: cancelling the run must find it.
    if (!runId && !entry.runId) throw new Error("draft-unavailable: the item's run is not known yet");
    const incoming = attemptOf(state);
    if (incoming) {
      const stored = attemptOf(entry.targets[key]);
      if (stored && stored !== incoming) throw new Error("draft-stale: another attempt is in progress");
      if (!stored && isRecorded(userId, runItemId, incoming))
        throw new Error("draft-stale: that attempt is already recorded");
    }
    entry.runId = runId || entry.runId;
    entry.targets = { ...entry.targets, [key]: state };
    entry.updatedAt = new Date().toISOString();
    try {
      write(userId, runItemId, entry);
    } catch (e) {
      if (incoming && String((e as Error).message).startsWith("draft-unavailable"))
        unstored.add(`${runItemId}|${key}|${incoming}`);
      throw e;
    }
  },
  /** Drops one target's draft (`execution_draft_discard`). */
  discard(userId: string, runItemId: string, key: string) {
    const entry = read(userId, runItemId);
    if (!entry || !(key in entry.targets)) return;
    const targets = { ...entry.targets };
    delete targets[key];
    write(userId, runItemId, { ...entry, targets, updatedAt: new Date().toISOString() });
  },
  /** Before recording: the draft of that attempt must still be here for
   *  that target, unless the attempt is already recorded (a retry). */
  checkRecordable(userId: string, runItemId: string, key: string, attemptId: string) {
    const attempt = normalizeAttempt(attemptId);
    if (!attempt) throw new Error(`attempt-id-invalid: ${attemptId}`);
    if (isRecorded(userId, runItemId, attempt) || unstored.has(`${runItemId}|${key}|${attempt}`)) return;
    if (attemptOf(read(userId, runItemId)?.targets[key]) !== attempt)
      throw new Error("draft-stale: the draft of this attempt is gone");
  },
  /** After recording: the target leaves the draft. */
  recorded(userId: string, runItemId: string, key: string, attemptId: string) {
    webDrafts.noteRecorded(runItemId, [attemptId]);
    const attempt = normalizeAttempt(attemptId);
    if (attempt) {
      try {
        const list = [...recordedHere(userId).filter((x) => x !== attempt), attempt].slice(-KEEP_RECORDED);
        storage()?.setItem(RECORDED + userId, JSON.stringify(list));
      } catch {
        // A full storage only loses the hint for the other tabs.
      }
    }
    const entry = read(userId, runItemId);
    if (entry && attemptOf(entry.targets[key]) === normalizeAttempt(attemptId)) webDrafts.discard(userId, runItemId, key);
  },
  /** Drops the draft of an item that is gone. */
  forget(userId: string, runItemId: string) {
    try {
      storage()?.removeItem(keyOf(userId, runItemId));
    } catch {
      // Nothing to drop.
    }
  },
  /** Every draft and recorded attempt in this browser, of every account
   *  (signing out). */
  clearAll() {
    recorded.clear();
    unstored.clear();
    const s = storage();
    if (!s) return;
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith(PREFIX) || k?.startsWith(RECORDED)) keys.push(k);
    }
    for (const k of keys) s.removeItem(k);
  },
  /** Whether a `storage` event of another tab concerns this item: its draft
   *  or the list of recorded attempts. */
  concerns(key: string | null, userId: string, runItemId: string) {
    return key === null || key === keyOf(userId, runItemId) || key === RECORDED + userId;
  },
  /** Drops every draft of a run in this browser (closing it as cancelled,
   *  or «Descartar los borradores»; a run read as cancelled or gone). */
  dropRun(userId: string, runId: string) {
    const s = storage();
    if (!s) return;
    const mine = `${PREFIX}${userId}:`;
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith(mine)) keys.push(k);
    }
    for (const k of keys) {
      const item = k.slice(mine.length);
      if (read(userId, item)?.runId === runId) s.removeItem(k);
    }
  },
};

// Signing out leaves no execution draft behind in this browser (FIX-07).
if (typeof window !== "undefined") window.addEventListener("pharos:signed-out", () => webDrafts.clearAll());
