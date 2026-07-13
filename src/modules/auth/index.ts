// auth module boundary (spec §4). Reserved from day 1; implemented in Phase 1
// (account login with Argon2id + JWT/refresh, cached offline session).
export const AUTH_MODULE = "auth" as const;
