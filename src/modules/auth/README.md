# auth

Authentication and session domain (spec §4). **Reserved boundary — no logic yet.**

Scope when implemented (Phase 1):

- Account login (email + password) against the backend, Argon2id hashing.
- JWT access token + refresh token with rotation.
- Securely cached offline session so the app opens without connectivity.

Layers to be added: `domain/`, `application/`, `infrastructure/`, `ui/`.
Other modules must consume this one only through its public `index.ts`.
