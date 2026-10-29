import { readFileSync } from "node:fs";
import type { FastifyReply, FastifyRequest } from "fastify";

/** Header that carries the client's Pharos version on every sync request
 *  (SYNC-08, VERSIONING §6.5). */
export const VERSION_HEADER = "x-pharos-version";

/** The server's own version. `server/package.json` is kept equal to the root
 *  one by `npm run version:set`, so this is the Pharos version. */
export const SERVER_VERSION: string = (
  JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;

interface MajorMinor {
  major: number;
  minor: number;
}

/** MAJOR.MINOR of a SemVer string (pre-release ignored); null if invalid. */
export function parseMajorMinor(version: string | undefined): MajorMinor | null {
  const m = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.exec(version?.trim() ?? "");
  return m ? { major: Number(m[1]), minor: Number(m[2]) } : null;
}

/** Minors this server accepts: its own and the previous one of the same
 *  major (VERSIONING §6.5), e.g. 0.1 and 0.0 for 0.1.x. */
export function acceptedMinors(serverVersion = SERVER_VERSION): string[] {
  const s = parseMajorMinor(serverVersion);
  if (!s) return [];
  const own = `${s.major}.${s.minor}`;
  return s.minor > 0 ? [own, `${s.major}.${s.minor - 1}`] : [own];
}

export function isSupportedClient(clientVersion: string | undefined, serverVersion = SERVER_VERSION): boolean {
  const c = parseMajorMinor(clientVersion);
  return c !== null && acceptedMinors(serverVersion).includes(`${c.major}.${c.minor}`);
}

/** preHandler: rejects a sync request from a missing or unsupported client
 *  version with 426 before anything is read or written. */
export async function requireSupportedVersion(req: FastifyRequest, reply: FastifyReply) {
  const raw = req.headers[VERSION_HEADER];
  const clientVersion = Array.isArray(raw) ? raw[0] : raw;
  if (isSupportedClient(clientVersion)) return;
  const accepted = acceptedMinors();
  return reply.code(426).send({
    code: "unsupported_client_version",
    message: `Pharos ${clientVersion ?? "(unknown version)"} cannot sync with this server (${SERVER_VERSION}). Supported app versions: ${accepted.map((v) => `${v}.x`).join(", ")}.`,
    clientVersion: clientVersion ?? null,
    serverVersion: SERVER_VERSION,
    accepted,
  });
}

/** Header with the sync features the client understands (DAT-01). */
export const FEATURES_HEADER = "x-pharos-sync-features";

/** True if the client reads `keyConflicts` in the push answer. Clients built
 *  before DAT-01 send the same version string but not this header; they only
 *  read `conflicts`, so a refused key would look accepted to them. */
export function understandsKeyConflicts(req: FastifyRequest): boolean {
  const raw = req.headers[FEATURES_HEADER];
  const value = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  return value.split(",").map((f) => f.trim()).includes("key-conflicts");
}
