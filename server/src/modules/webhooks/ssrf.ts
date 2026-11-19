// Where a webhook may send (INT-03, ADR-0052 §4, security review point 8).
// A webhook URL comes from a user, and the server is inside someone's
// network: without care it could be pointed at the cloud metadata endpoint,
// the database or an admin panel on localhost (SSRF).
//
// - Only `https`, except to a private address the server allows.
// - The host is resolved here and the connection goes to the address that
//   was checked (`guardedLookup` is the socket's own lookup): a name that
//   resolves to a public address when checked and to a private one when
//   connecting (DNS rebinding) cannot slip through.
// - Loopback, private (RFC 1918), CGNAT, link-local (169.254.169.254
//   included), multicast, reserved, IPv6 ULA and link-local, and IPv4
//   addresses written as IPv6 are refused, unless `WEBHOOK_ALLOW_PRIVATE`
//   (a server inside a LAN that notifies its Jenkins) or the host is in
//   `WEBHOOK_ALLOW_HOSTS`.
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { BlockList, isIP } from "node:net";

export interface TargetPolicy {
  allowPrivate: boolean;
  /** Host names allowed whatever they resolve to (exact, lower case). */
  allowHosts: readonly string[];
  /** The resolver behind the socket's lookup: node's DNS, or a fake in tests
   *  so a rebinding is checked without the network. */
  resolve?: typeof dnsLookup;
}

const blocked = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, bits, "ipv4");
}
for (const [net, bits] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, bits, "ipv6");
}

/** True for an address no webhook may reach unless private ones are allowed. */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blocked.check(address, "ipv4");
  if (family === 6) {
    // An IPv4 address written as IPv6 (::ffff:10.0.0.1) is refused whatever
    // it holds: a real target is reached by its IPv4 form. (Not a BlockList
    // subnet: Node matches every IPv4 address against ::ffff:0:0/96.)
    if (/^::ffff:/i.test(address)) return true;
    return blocked.check(address, "ipv6");
  }
  return true;
}

export type UrlProblem = "invalid_url" | "scheme" | "credentials" | "private";

/** Checks a URL as typed (before any DNS): scheme, no credentials, and a
 *  literal address or `localhost` that is private. */
export function checkUrl(raw: string, policy: TargetPolicy): UrlProblem | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "invalid_url";
  }
  if (url.username || url.password) return "credentials";
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const allowedHost = policy.allowHosts.includes(host);
  const literalPrivate = host === "localhost" || host.endsWith(".localhost") || (isIP(host) !== 0 && isPrivateAddress(host));
  if (literalPrivate && !policy.allowPrivate && !allowedHost) return "private";
  if (url.protocol === "https:") return null;
  // Plain http only to a private target the server allows (a LAN Jenkins).
  if (url.protocol === "http:" && (policy.allowPrivate || allowedHost) && (literalPrivate || allowedHost)) return null;
  return "scheme";
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** A `lookup` for the socket: resolves, refuses private addresses (unless
 *  allowed) and hands the socket only addresses it checked. */
export function guardedLookup(policy: TargetPolicy, host: string) {
  const allowedHost = policy.allowHosts.includes(host.toLowerCase());
  return (hostname: string, options: { all?: boolean } & object, callback: LookupCallback) => {
    (policy.resolve ?? dnsLookup)(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, []);
      const list = (addresses as LookupAddress[]).filter((a) => policy.allowPrivate || allowedHost || !isPrivateAddress(a.address));
      if (list.length === 0) {
        const e = Object.assign(new Error("webhook target resolves to a private address"), { code: "EPRIVATE" });
        return callback(e as NodeJS.ErrnoException, []);
      }
      if (options.all) return callback(null, list);
      return callback(null, list[0].address, list[0].family);
    });
  };
}
