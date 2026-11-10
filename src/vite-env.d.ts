/// <reference types="vite/client" />

/** Pharos version from the root package.json, injected by Vite (SYNC-08). */
declare const __APP_VERSION__: string;

/** Build commit, date and stack (UX-26), injected by Vite. */
declare const __APP_BUILD__: import("./shared/version").AppBuild;
