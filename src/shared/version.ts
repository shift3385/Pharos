// The app version (UX-07). The root package.json is the single version source
// (scripts/version.mjs keeps the other manifests in sync); vite.config.ts
// inlines its `version` as `__APP_VERSION__` at build time.
declare const __APP_VERSION__: string;

export const APP_VERSION: string = __APP_VERSION__;

/** One technology of the stack, with the major version this build used
 *  (empty when it is not pinned in a manifest). */
export interface StackItem {
  name: string;
  version: string;
  /** SQLite: the local store is encrypted at rest. */
  encrypted?: boolean;
}

/** The build «Acerca de Pharos» shows (UX-26): commit, date and stack, read by
 *  vite.config.ts from git, package.json, server/package.json and
 *  src-tauri/Cargo.toml. */
export interface AppBuild {
  commit: string;
  date: string;
  stack: StackItem[];
}

declare const __APP_BUILD__: AppBuild;

export const APP_BUILD: AppBuild = __APP_BUILD__;
