# Pharos — Architecture (v0.0.1)

Pharos is an offline-first desktop QA test-management suite. This document
records the architecture and the decisions taken, per the spec (source of truth:
`PROMPT_PHAROS_v0.3.md`). Build strictly phase by phase (spec §16).

## Stack

- **Client:** Tauri 2 + React 18 + TypeScript + Vite. Target: Windows 11.
  Tauri 2 is deliberate — its mobile support lets v0.0.4 reuse this codebase.
- **Local DB (Phase 2+):** SQLite (encrypted) as the offline source of truth.
- **Backend (Phase 1+):** Node.js + TypeScript + PostgreSQL via docker-compose.
- **AI (Phase 7):** provider-agnostic layer — Gemini (online), Ollama (offline).

## Modular monolith (spec §2)

One deployable per side, organized into domain modules with **strict
boundaries**. A module is consumed only through its public API (`index.ts`);
deep imports into another module's internals are forbidden and enforced by an
ESLint `no-restricted-imports` rule (`@modules/*/*`).

```
src/
  app/         # shell: layout (sidebar/topbar), router, dashboard, nav config
  modules/     # domain modules (each: domain/ application/ infrastructure/ ui/)
    projects/  test-plan/  test-cases/  planner/  templates/
    integrations/  ai/  sync-offline/  admin/  auth/
  shared/      # design system (theme tokens), i18n, ui kit, fonts
  test/        # test utilities (renderWithProviders)
src-tauri/     # Tauri 2 (Rust) shell
docs/          # GLOSARIO.md, ARCHITECTURE.md, referencias/
```

Modules with UI sections in Phase 0 expose a `*Page` component; cross-cutting
modules (`auth`, `sync-offline`, `integrations`) exist as reserved boundaries
and are implemented in their phases (1, 8, and a future version respectively).

Future modules — traceability matrix (v0.0.2), manual test execution (v0.0.3),
mobile build (v0.0.4) — must be addable without touching existing modules.

## Design system — "Faro Nocturno" (spec §12.1)

- No hardcoded colors. All colors come from CSS custom properties in
  `src/shared/theme/tokens.css` (light default + `[data-theme="dark"]`). A test
  (`src/design-tokens.test.ts`) fails the build if any other file hardcodes a
  color. This keeps additional themes swappable later.
- Typography: **Inter** (UI/titles) + **JetBrains Mono** (code/Gherkin/IDs),
  self-hosted via `@fontsource` (OFL, no font CDN — the app is offline).
- Responsive from day 1 (sidebar collapses to an icon rail ≤768px).

## Internationalization (spec §11)

`i18next` + `react-i18next`, one JSON per language (`es` default, `en`). No
hardcoded UI strings. Adding a language = adding a file.

## Conventions (spec §15)

- Code/comments/commits in English; UI text only in i18n files.
- Ubiquitous language enforced via `docs/GLOSARIO.md`.
- Dependencies: permissive licenses only (MIT/Apache-2.0/BSD/ISC/OFL).
  **GPL/AGPL forbidden**, checked by `scripts/check-licenses.mjs`.

## Testing

Vitest + React Testing Library + jsdom. The QA tool tests itself: theme
switching, i18n switching, navigation, and the no-hardcoded-color guard.

## Backend (Phase 1+)

`server/` is a Fastify + TypeScript app (run via `tsx`), orchestrated with
`db/` (Postgres, reused `postgres:15-alpine`) by the root `docker-compose.yml`.
Layered per domain module (`modules/auth`: routes → service → repository), with
a minimal forward-only SQL migration runner (`db/migrate.ts` + `migrations/`).

Auth: registration/login with **Argon2id** (`@node-rs/argon2`), a short-lived
**JWT access token** (`jose`) plus an opaque **refresh token** stored hashed
with rotation + revocation. The desktop client caches the session in the OS
keychain (Windows Credential Manager via a Tauri `keyring` command) and reopens
offline from that cache (spec §4).

## Phase status

- **Phase 0 — Foundations:** complete. Scaffold, modular structure, i18n
  (es/en), Faro Nocturno theme, native Tauri window (GNU toolchain).
- **Phase 1 — Backend & auth:** docker-compose + Fastify API, Postgres schema,
  register/login/refresh/logout, client auth UI + offline session. Tests green
  (backend 9, client 8).
- Phases 2–9: not started (see `PROGRESO.md`).
