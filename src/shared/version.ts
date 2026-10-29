// The app version (UX-07). The root package.json is the single version source
// (scripts/version.mjs keeps the other manifests in sync); vite.config.ts
// inlines its `version` as `__APP_VERSION__` at build time.
declare const __APP_VERSION__: string;

export const APP_VERSION: string = __APP_VERSION__;
