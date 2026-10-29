// Weak-copyleft exceptions shared by the npm license gates (root and server),
// the npm side of deny.toml's `exceptions` (ADR-0021).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Whether a weak-copyleft package is accepted by scripts/license-exceptions.json:
 * it is named there with the same license, or it is one of the per-platform
 * binary packages of a named package that sets `coversPlatformBinaries` (an
 * entry of that package's `optionalDependencies`, e.g. lightningcss-linux-x64-gnu
 * for lightningcss), with the same license. npm installs only the binary of the
 * current platform, so naming each one would pass on Windows and fail on Linux.
 */
export function isExcepted(name, license, exceptions, optionalDepsOf) {
  const own = exceptions[name];
  if (own) return own.license === license;
  return Object.entries(exceptions).some(
    ([parent, entry]) =>
      entry.coversPlatformBinaries === true &&
      entry.license === license &&
      optionalDepsOf(parent).includes(name),
  );
}

/** optionalDependencies of a package installed in `modulesDir` (cached). */
export function optionalDepsReader(modulesDir) {
  const cache = new Map();
  return (pkg) => {
    if (!cache.has(pkg)) {
      const file = join(modulesDir, pkg, "package.json");
      const deps = existsSync(file)
        ? Object.keys(
            JSON.parse(readFileSync(file, "utf8")).optionalDependencies ?? {},
          )
        : [];
      cache.set(pkg, deps);
    }
    return cache.get(pkg);
  };
}
