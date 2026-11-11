// Numbers for keys about to be created on the desktop (DAT-04, ADR-0010
// amendment). With a connection, the device asks the server for exactly the
// numbers it is about to use, right after the last one handed out, so a
// project's keys stay contiguous across devices. Without one, or if the server
// is slow, nothing is asked: the device uses its offline reserve, and beyond
// it the key is provisional until the next sync.
import type { Contract } from "@shared/contracts";
import { getSession } from "@modules/auth";
import { invoke, isTauri } from "@shared/platform";
import { sessionRequester } from "./sessionRequest";

export type KeyKind = "case" | "requirement" | "defect" | "run" | "cycle";

/** How long creating waits for the server before going on without it. */
export const RESERVE_TIMEOUT_MS = 4000;

const timeout = (ms: number) => new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));

/** Leases the numbers `count` new keys of `kind` need in a project, when this
 *  desktop has none left. Never fails: creating goes on without it. */
export async function reserveKeys(projectId: string, kind: KeyKind, count = 1): Promise<void> {
  if (!isTauri() || count < 1 || !projectId) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  try {
    const session = await getSession();
    if (!session) return;
    const lease = await invoke<Contract.LeaseRequest | null>("key_lease_for", {
      userId: session.userId,
      projectId,
      kind,
      count,
    });
    if (!lease) return;
    const request = sessionRequester(session);
    const body = await Promise.race([
      request<{ blocks?: unknown[] }>("/sync/key-blocks", { method: "POST", body: { requests: [lease] } }),
      timeout(RESERVE_TIMEOUT_MS),
    ]);
    await invoke("key_blocks_apply", { userId: session.userId, blocks: body.blocks ?? [] });
  } catch (e) {
    console.warn("[keys] could not lease key numbers; the key stays provisional until the next sync", e);
  }
}
