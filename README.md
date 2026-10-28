# Pharos

Desktop QA test-management suite (offline-first). Guides each testing project
safely to port, following ISO/IEC/IEEE 29119, ISO/IEC 25010 and the ISTQB CTFL
Syllabus v4.0.1.

> v0.0.1 — planning and design only (test plans, test cases, templates, local
> planner, AI assist, offline sync, exports). No test execution yet.

## Prerequisites

- **Node.js** ≥ 20 and npm.
- To build/run the **native Tauri desktop app** on Windows:
  - **Visual Studio 2022** (Community is enough) with the **"Desktop development
    with C++"** workload (MSVC compiler, linker and Windows SDK).
  - **Rust** via rustup with the **MSVC** toolchain: `rustup toolchain install
    stable-x86_64-pc-windows-msvc` (pinned in `src-tauri/rust-toolchain.toml`;
    rustup installs it on first build).
  - **WebView2** runtime (preinstalled on Windows 11).
  - Before 2026-10-27 the project pinned the GNU toolchain + MinGW. A local
    (git-ignored) `.cargo/config.toml` that redirects `target-dir` to a
    space-free folder is a leftover of that setup; it is harmless with MSVC.
- The web frontend runs without any of the above via `npm run dev`.

## Setup

```bash
npm install
```

## Scripts

| Command                  | Purpose                                             |
| ------------------------ | --------------------------------------------------- |
| `npm run dev`            | Vite dev server (web preview) at localhost:1420     |
| `npm run tauri dev`      | Run the native desktop app (needs Rust)             |
| `npm run build`          | Type-check + build the frontend                     |
| `npm run tauri build`    | Build the Windows installer (needs Rust)            |
| `npm test`               | Run the Vitest suite                                |
| `npm run typecheck`      | TypeScript, no emit                                 |
| `npm run lint`           | ESLint (0 warnings allowed)                         |
| `npm run check:licenses` | Fail on GPL/AGPL/SSPL dependencies                  |
| `npm run verify`         | typecheck + lint + licenses + tests                 |

## Running Pharos (development)

Pharos has **three parts**, and `npm run tauri dev` starts only the last one:

| Part | What | How |
| ---- | ---- | --- |
| Database | Postgres (Docker container `pharos-db`, port 5433) | `docker compose up -d db` |
| Backend API | Fastify, http://localhost:3000 | `cd server && npm start` |
| Desktop app | Tauri + Vite | `npm run tauri dev` |

**Without Docker:** a native PostgreSQL (15 or newer, verified on 18.6) works too.
Create `pharos_db` and `pharos_test_db`, point `DATABASE_URL` /
`TEST_DATABASE_URL` in `.env` to its port (the installer default is 5432), and
`dev.bat` will use the running `postgresql*` Windows service instead of Docker.
The API applies its migrations on start.

Login/sync talk to the backend API, so the database **and** the API must be up —
otherwise you get "Could not reach the server" on sign-in.

**One click:** run [`dev.bat`](dev.bat) (double-click it). It ensures the database
is up, then opens a **"Pharos API"** window and a **"Pharos App"** window. Close a
window (or press `Ctrl+C` in it) to stop that part. [`stop.bat`](stop.bat) stops
the database container.

**Manual:** make sure **Docker Desktop** is running, then in separate terminals:

```
docker compose up -d db      # 1) database (once; it auto-starts with Docker)
cd server && npm start       # 2) backend API on :3000  (npm run dev = auto-reload)
npm run tauri dev            # 3) desktop app  (from the repo root)
```

## Project layout

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Domain modules live in
`src/modules/*`, the shell in `src/app/*`, the design system and i18n in
`src/shared/*`. The ubiquitous language is in [`docs/GLOSARIO.md`](docs/GLOSARIO.md).

## Local test account

For local development there is a seeded account you can sign in with (exists
only in the local `pharos_db` — **not** a real credential):

- **Email:** `smoke@pharos.dev`
- **Password:** `supersecret1`

If the database is reset, just register a new account from the login screen.

## Status

Phase 0 (Foundations) — **complete**. Frontend verified (tests green, runs in
Vite dev); native Tauri window builds and runs on Windows 11 (GNU toolchain at
the time; MSVC since 2026-10-27). Progress tracked in `PROGRESO.md` (kept outside this repo, in the
planning workspace).
