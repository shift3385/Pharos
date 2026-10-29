# Pharos — Architecture (0.1.x)

Pharos is an offline-first desktop QA test-management suite. This document
records the architecture and the decisions taken, per the spec (source of truth:
`PROMPT_PHAROS_v0.3.md`, amended 2026-10-27). Work proceeds one phase at a time
_per track_ (spec §16); the backlog is `docs/ROADMAP.md`. How to install and
run it: `README.md`. Versioning (SemVer, one version for app, Rust core and
backend; data-compatibility rules for migrations and sync): `docs/VERSIONING.md`.

## Stack

- **Client:** Tauri 2 + React 18 + TypeScript + Vite. Target: Windows 11.
  Tauri 2 is deliberate — its mobile support lets the 0.4.0 mobile build reuse this codebase.
  The Rust side builds with the **MSVC** toolchain (`src-tauri/rust-toolchain.toml`).
- **Local DB (Phase 2+):** SQLite (encrypted) as the offline source of truth.
- **Backend (Phase 1+):** Node.js + TypeScript (Fastify) + PostgreSQL — a
  native PostgreSQL service or the `docker-compose.yml` container.
- **AI (Phase 7, IA-08):** provider-agnostic layer. One active online
  provider, chosen by the user with their own key: Gemini, OpenAI, Claude
  (Anthropic), OpenRouter or any OpenAI-compatible endpoint. Calls run in Rust
  (`src-tauri/src/ai.rs`) so each key stays in the OS keychain; three wire
  formats (Gemini, OpenAI chat completions, Anthropic Messages) cover them.
  Offline: Ollama, called from the frontend.

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
    integrations/  ai/  sync-offline/  admin/  auth/  traceability/
  shared/      # design system (theme tokens), i18n, ui kit, fonts
  test/        # test utilities (renderWithProviders)
src-tauri/     # Tauri 2 (Rust): encrypted local DB, repositories, oplog, sync
server/        # backend API (Fastify): auth + sync document store
docs/          # ARCHITECTURE.md, ROADMAP.md, GLOSARIO.md, adr/, design/, referencias/, spikes/
```

Modules with UI sections expose a `*Page` component. Cross-cutting modules:
`auth` (Phase 1) and `sync-offline` (Phase 8) are implemented; `integrations`
remains a reserved boundary for Jira (backlog INT-05).

Future modules — manual test execution (0.2.0), mobile build (0.4.0) — must
be addable without touching existing modules.

**Traceability (0.1.0).** `traceability` owns requirements (`REQ-xxx`, stable
keys) and the requirement ↔ test case ↔ defect matrix. It reads `test-cases`,
`planner` and `test-plan` through their public APIs; none of them imports it.
`projects` is the composition root: it hands requirement options to
`test-cases` and linkable cases to `planner` as props, so the module graph stays
acyclic. The link itself lives in the case (`data.requirementKeys`) so it is
revisioned and synced with the case, and travels as Gherkin tags (`@REQ-xxx` on
the Feature, `@<case id>` on each Scenario — never the scenario name).

**Execution model (decided for 0.2.0, not built yet).** Gate C closed on
2026-10-28 with ADR-0011…0019; the design is in
`docs/design/0.2.0-modelo-ejecucion.md`. In short:

- Every execution, manual or imported, is a `run` with its context
  (environment, build, commit, dataset, configuration).
- A run holds four generic kinds: `result` (+ `step_result`), `finding`,
  `metric` and `exploratory_session`. 0.2.0 stores results only; the other
  kinds are fixed in the Pharos Run JSON schema and get their tables in
  0.4.0/0.5.0. Cycles, configurations and custom fields may slip to 0.3.0.
- Results are append-only and point to an immutable, synced
  `test_case_revision` and to stable step ids.
- Evidence lives encrypted outside the database (`evidence/`, addressed by
  hash).
- One write path (`journal::record`) feeds both the oplog and an append-only
  `audit_log`.
- Defects become their own `defects` module.
- Sync gains an `append_only` class; from 0.3.0 the server is keyed by
  workspace (ADR-0019).

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

The QA tool tests itself at three levels:

- **Client:** Vitest + React Testing Library + jsdom (`npm run verify` also runs
  typecheck, lint with 0 warnings and the license check). Includes the
  no-hardcoded-color guard and a test that filters an exported `.feature` with
  the real Cucumber tag-expression engine.
- **Rust core:** `cargo test` in `src-tauri/` (repositories, encryption,
  atomic persistence, HLC, sync merge). It runs again since the switch to MSVC.
- **Backend:** Vitest against a real Postgres database (`pharos_test_db`).

## Backend (Phase 1+)

`server/` is a Fastify + TypeScript app (run via `tsx`) backed by PostgreSQL —
either a native service or the `db` container of the root `docker-compose.yml`
(`postgres:15-alpine`). Layered per domain module (routes → service/merge →
repository), with a minimal forward-only SQL migration runner (`db/migrate.ts` +
`migrations/`) that the server also runs on start. Modules:

- `auth` — accounts and sessions (below).
- `sync` — per-user document store for the oplog: `POST /sync/push` (one
  batch of up to 500 deltas; last-write-wins by HLC; rejects a desktop delta
  whose base revision the server no longer holds and returns its own version as
  a conflict; a project delete also tombstones its plans, cases, requirements
  and planner cards) and `GET /sync/pull?since=<seq>` (pages of up to 500 with
  `hasMore`). Every sync request must carry `x-pharos-version`; the server
  serves its own MINOR and the previous one and answers others with 426
  (ADR-0020). See `src/modules/sync-offline/README.md`.

Auth: registration/login with **Argon2id** (`@node-rs/argon2`), a short-lived
**JWT access token** (`jose`) plus an opaque **refresh token** stored hashed
with rotation + revocation. The desktop client caches the session in the OS
keychain (Windows Credential Manager via a Tauri `keyring` command) and reopens
offline from that cache (spec §4).

## Local data (Phase 2+)

The desktop client owns an encrypted local SQLite database (offline source of
truth, spec §9). SQLCipher is **not** used because its OpenSSL build did not
compile under the GNU toolchain the project used until 2026-10-27 (it now builds
with MSVC; page-level encryption is re-evaluated in backlog item SEC-04). Instead
the working database lives in memory — loaded and saved with SQLite
`deserialize`/`serialize`, so the plaintext never touches disk — and is
persisted atomically to `pharos.db.enc` as an **AES-256-GCM** blob (pure-Rust
RustCrypto, no OpenSSL). The 32-byte key is stored in the OS keychain. Schema is
applied by a small forward-only migration runner (`src-tauri/migrations/`).

Upgrades follow `docs/VERSIONING.md` §6 (SEC-06):

- **Backup before migrating.** When an existing database has pending
  migrations, the still-encrypted file is first copied to
  `pharos.db.enc.bak-<app version>-<last applied migration>`. The migration
  part keeps two upgrades within one app version apart.
  - The migrated image is then saved at once.
  - Only the 3 newest backups are kept (`BACKUPS_KEPT`); pruning is best effort.
  - If the backup cannot be written, or its path holds anything other than the
    same bytes, opening fails with "failed to save the pre-migration backup"
    and nothing is migrated.
- **No silent downgrade.** A database whose `schema_migrations` lists a
  migration this build does not ship was written by a newer Pharos. `Db::open`
  refuses it with an error starting with `db-newer-than-app` before touching any
  file. Startup does not abort: `setup` stores the error in `DbStatus`, and the
  UI asks `db_open_error` and shows a blocking, translated screen.
- **Upgrade test (BASE-04).** `src-tauri/src/upgrade_tests.rs` opens
  `src-tauri/tests/fixtures/0.1.0-alpha.1/pharos.db.enc`, a database written by
  the real 0.1.0-alpha.1 code. It checks that every row and column survives,
  except the audit fields that migration 0015 repairs. The fixture's README
  explains how it was generated.

Every business entity is multi-user ready (spec §3): `workspace_id` + audit
fields (`created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`,
`revision`), filled automatically by the repository.

- **Audit fields (FIX-06):** `created_by` and `updated_by` hold the signed-in
  user's id.
- **Owner checks (FIX-08):** every command that reads or changes a test plan,
  test case, requirement or planner attachment takes the signed-in user
  (`userId`, or `ownerId` in the planner). It only touches rows of projects that
  user owns (`projects.owner_id`). A foreign or unknown id reads as nothing and
  fails to change, without writing an oplog row.
  - A plan without a project is shown to nobody: the owner comes from the
    project, and the UI only reaches a plan through its project.
  - Templates and the sync conflicts are not owner-scoped yet (FIX-08b, FIX-07).
  - The user id comes from the UI. This separates the accounts of one
    installation; it does not defend against a tampered frontend.
- **Human-readable keys (DAT-01, ADR-0010):** case, requirement and defect keys
  come from `key_counters` (`src-tauri/src/keys.rs`):
  - the counter only moves forward, so a key is never reused;
  - a case's `scenario_id` is immutable;
  - a hand-typed or imported key already used by any row, live or deleted, is
    refused (the requirement CSV import skips and reports it).
  - Phase 2 of track A2 brings server-leased key blocks for several devices.
    It also brings unique indexes on live case and defect keys (local migration
    `0017`), together with the sync handling of a pulled key that collides with
    a local one.

The profile (`display_name`
alias + mandatory `first_name`/`last_name`) is exposed to the client through
typed Tauri commands (`profile_get`, `profile_upsert`); the browser falls back
to localStorage for `vite dev`.

## Phase status

- **Phase 0 — Foundations:** complete. Scaffold, modular structure, i18n
  (es/en), Faro Nocturno theme, native Tauri window (GNU toolchain at the time; the
  Rust build is pinned to MSVC since 2026-10-27).
- **Phase 1 — Backend & auth:** docker-compose + Fastify API, Postgres schema,
  register/login/refresh/logout, client auth UI + offline session.
- **Phase 2 — Local data & profile:** encrypted SQLite (pure-Rust AES-256-GCM),
  migrations, multi-user schema (workspaces + profiles with audit fields),
  profile CRUD via Tauri commands + client Profile page.
- **Phase 3 — Test plan:** `test_plans` (+ `test_plan_revisions`) with promoted
  columns + a JSON `data` blob for the 21-field content (spec §5.1); Rust repo +
  Tauri commands (list/get/create/update/delete/revisions); client test-plan
  module — plan list/CRUD, a stepped wizard, a react-day-picker schedule
  calendar, and a revision-history panel. (The `cargo test` launch failure
  noted at the time was specific to the GNU toolchain and is gone with MSVC.)
- **Phases 4–8 and 9A:** implemented — test cases, planner, templates/export,
  AI, oplog + push/pull sync with HLC and the conflict panel (8C), admin hub.
  The rest of Phase 9 (accessibility audit, installer, final docs) is open.
- **Traceability (former milestone v0.0.2):** requirements, the requirement ↔ case ↔ defect
  matrix with XLSX export, `@REQ-xxx`/case-ID tags in `.feature` files, and
  visible AI provenance. Requirements and planner cards sync since SYNC-04a;
  templates and attachments follow in SYNC-04b.
- **Roadmap and backlog:** `docs/ROADMAP.md` (replanned 2026-10-26 from the
  state-of-the-art study). Its target direction: Pharos as a local-first
  _control plane_ that orchestrates external frameworks (Playwright, Karate,
  Appium, k6…), ingests their results (JUnit, Cucumber Messages, CTRF, SARIF)
  into a CTRF-inspired Run/Result model, and shares a Tauri-free `pharos-core`
  crate between desktop, CLI and agent.
