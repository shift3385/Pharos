// Signing webhook deliveries (INT-03, ADR-0052 §4) as Standard Webhooks
// (https://www.standardwebhooks.com/) does, so the receivers can verify with
// its libraries in any language:
//
//   webhook-id: <delivery id>          (the receiver dedupes by it)
//   webhook-timestamp: <unix seconds>  (the receiver refuses old ones)
//   webhook-signature: v1,<base64 HMAC-SHA256(key, id + "." + ts + "." + body)>
//
// The secret is `whsec_<base64 of 32 random bytes>`; the key is those bytes.
// During a rotation both secrets sign: two signatures separated by a space.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const PREFIX = "whsec_";

export function newSecret(): string {
  return `${PREFIX}${randomBytes(32).toString("base64")}`;
}

function keyOf(secret: string): Buffer {
  return Buffer.from(secret.startsWith(PREFIX) ? secret.slice(PREFIX.length) : secret, "base64");
}

/** `v1,<signature>` of one secret. */
export function sign(secret: string, id: string, timestamp: number, body: string): string {
  const mac = createHmac("sha256", keyOf(secret)).update(`${id}.${timestamp}.${body}`).digest("base64");
  return `v1,${mac}`;
}

/** The `webhook-*` headers of a delivery, signed with every given secret. */
export function signatureHeaders(secrets: string[], id: string, timestamp: number, body: string): Record<string, string> {
  return {
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": secrets.map((s) => sign(s, id, timestamp, body)).join(" "),
  };
}

/** What a receiver does (the manual's example, and the tests): true if one
 *  of the signatures matches and the timestamp is within `toleranceS`. */
export function verify(
  secret: string,
  headers: Record<string, string | undefined>,
  body: string,
  now = Math.floor(Date.now() / 1000),
  toleranceS = 300,
): boolean {
  const id = headers["webhook-id"];
  const ts = Number(headers["webhook-timestamp"]);
  const sigs = headers["webhook-signature"];
  if (!id || !Number.isInteger(ts) || !sigs || Math.abs(now - ts) > toleranceS) return false;
  const want = Buffer.from(sign(secret, id, ts, body));
  return sigs.split(" ").some((s) => {
    const got = Buffer.from(s);
    return got.length === want.length && timingSafeEqual(got, want);
  });
}
