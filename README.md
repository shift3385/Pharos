# Pharos

Desktop QA test-management suite (offline-first). Guides each testing project
safely to port, following ISO/IEC/IEEE 29119, ISO/IEC 25010 and the ISTQB CTFL
Syllabus v4.0.1.

> **Version 0.1.0-alpha.1** — test plans, test cases with Gherkin, templates,
> local planner, AI assist, offline sync with conflict panel, exports, and
> requirements with a traceability matrix. No test execution yet (0.2.0).
> Roadmap and backlog: [`docs/ROADMAP.md`](docs/ROADMAP.md) · changes:
> [`CHANGELOG.md`](CHANGELOG.md) · versioning policy:
> [`docs/VERSIONING.md`](docs/VERSIONING.md).

## How Pharos runs

Pharos has **three parts**. The desktop app works offline on its own encrypted
local database, but **sign-in and sync need the backend**, and the first
sign-in on a machine always needs it:

| Part        | What                                                                      | Port                      |
| ----------- | ------------------------------------------------------------------------- | ------------------------- |
| Database    | PostgreSQL (native Windows service **or** Docker container `pharos-db`)   | 5432 native / 5433 Docker |
| Backend API | Node + Fastify (`server/`) — auth and sync                                | 3000                      |
| App         | Tauri desktop window (Rust + WebView) **or** the web preview in a browser | Vite on 1420              |

If the database or the API is down, sign-in shows "Could not reach the server"
("No se pudo conectar con el servidor" in Spanish, the default UI language).

## Prerequisites (Windows 11)

| Needed for            | Install                                                                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Everything            | **Node.js ≥ 20** with npm                                                                                                                                                                                                                         |
| Database (pick one)   | **PostgreSQL ≥ 15** native (verified on 18.6), **or** **Docker Desktop** (needs WSL2)                                                                                                                                                             |
| Native desktop app    | **Visual Studio 2022** (Community is enough) with the **"Desktop development with C++"** workload, and **Rust** via [rustup](https://rustup.rs) — the MSVC toolchain pinned in `src-tauri/rust-toolchain.toml` installs itself on the first build |
| Native desktop app    | **WebView2** runtime (preinstalled on Windows 11)                                                                                                                                                                                                 |
| Offline AI (optional) | **Ollama** — the model (`llama3.2:3b`) is downloaded from the app's AI panel                                                                                                                                                                      |

After installing Rust, **open a new terminal** so `cargo` is on the `PATH`.
The web preview (`npm run dev`) needs neither Visual Studio nor Rust.

## First-time setup

Run from the repository root:

1. **Install dependencies** (frontend and backend are separate npm projects):

   ```
   npm install
   cd server && npm install && cd ..
   ```

2. **Create `.env`** from the template: `copy .env.example .env`.
   - **Native PostgreSQL:** change the port in `DATABASE_URL` and
     `TEST_DATABASE_URL` from `5433` to your server's port (installer default
     **5432**). Use the password you chose for the `postgres` user.
   - **Docker:** keep the defaults (`postgres` / `postgres` on 5433).

3. **Create the databases.**
   - **Native PostgreSQL:** create `pharos_db` and `pharos_test_db`, e.g. with
     `psql -U postgres -c "create database pharos_db"` (and the same for
     `pharos_test_db`), or from pgAdmin.
   - **Docker:** `docker compose up -d db` creates `pharos_db`; create
     `pharos_test_db` only if you run the backend tests.

   Tables are created by the API itself: it applies its migrations on start
   (or run `cd server && npm run migrate`).

## Running (every day)

**One click:** double-click [`dev.bat`](dev.bat). It checks the database (Docker
if installed, otherwise the running `postgresql*` Windows service), then opens
two windows:

- **"Pharos API"** — the backend on http://localhost:3000
- **"Pharos App"** — Vite plus the native desktop window. The **first** run
  compiles the Rust side and takes several minutes; later runs are fast.

Close a window (or `Ctrl+C` inside it) to stop that part. [`stop.bat`](stop.bat)
stops the Docker database; a native PostgreSQL service is left running.

**Manual**, in separate terminals from the repository root:

```
docker compose up -d db      # 1) only with Docker; a native service is already running
cd server && npm start       # 2) backend API on :3000 (npm run dev = auto-reload)
npm run tauri dev            # 3) desktop app (or: npm run dev for the web preview)
```

**Web preview only:** with the database and the API up, `npm run dev` and open
http://localhost:1420. The browser has no local encrypted database or oplog; it
reads and writes the backend directly, so offline work and the conflict panel
are desktop-only.

### Signing in

On a fresh database there are no accounts: use **"Sign up"** ("Regístrate")
on the login screen, or create the local test account with:

```
cd server && npm run seed:test-user
```

The script is idempotent (it does nothing if the account exists) and refuses to
run with `NODE_ENV=production`. The account exists only in your local
`pharos_db` — **not** a real credential:

- **Email:** `smoke@pharos.dev`
- **Password:** `supersecret1`
- Override both with `TEST_USER_EMAIL` / `TEST_USER_PASSWORD`.

After the first sign-in the desktop app can reopen offline from the cached
session.

### Troubleshooting

| Symptom                                                  | Cause / fix                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `dev.bat`: "no running PostgreSQL service found"         | Start the service in `services.msc`, or install Docker Desktop                                         |
| "Could not reach the server" on sign-in                  | The API window is closed or crashed; check that window, then `.env` (`DATABASE_URL` port and password) |
| API fails with a database connection error               | Wrong port/password in `.env`, or the database does not exist (step 3)                                 |
| `cargo` not found / `npm run tauri dev` fails at once    | Open a new terminal after installing Rust; check the Visual Studio C++ workload                        |
| Port 3000 or 1420 already in use                         | Another API/Vite is still running; close the old windows                                               |
| Console shows `localhost:11434 … ERR_CONNECTION_REFUSED` | Ollama is not installed or not running; harmless — AI assist is simply disabled                        |

## Scripts

Frontend (repository root):

| Command                        | Purpose                                           |
| ------------------------------ | ------------------------------------------------- |
| `npm run dev`                  | Vite dev server (web preview) at localhost:1420   |
| `npm run tauri dev`            | Run the native desktop app (needs Rust)           |
| `npm run build`                | Type-check + build the frontend                   |
| `npm run tauri build`          | Build the Windows installer (needs Rust)          |
| `npm test`                     | Run the Vitest suite                              |
| `npm run typecheck`            | TypeScript, no emit                               |
| `npm run lint`                 | ESLint (0 warnings allowed)                       |
| `npm run check:licenses`       | Fail on GPL/AGPL/SSPL dependencies                |
| `npm run check:version`        | Fail if the version differs across manifests      |
| `npm run version:set -- X.Y.Z` | Set the version in every manifest (releases only) |
| `npm run verify`               | typecheck + lint + licenses + version + tests     |
| `npm run e2e`                  | Desktop smoke of the real binary (see below)      |
| `npm run e2e:driver`           | Download the msedgedriver that matches WebView2   |
| `npm run coverage`             | Frontend coverage report into `coverage/`         |
| `npm run coverage:rust`        | Rust coverage report into `coverage/rust/`        |

Backend (`server/`): `npm start`, `npm run dev` (auto-reload), `npm run migrate`,
`npm run seed:test-user`, `npm test` (needs `pharos_test_db`), `npm run typecheck`.

Desktop core (`src-tauri/`): `cargo check`, `cargo test`.

## Logs and diagnostics

The desktop app writes one log file per day, `pharos.YYYY-MM-DD.log` (JSON
lines; the last 7 days are kept), in:

```
%LOCALAPPDATA%\com.pharos.desktop\logs
```

The level is `info`. For more detail, start the app with `PHAROS_LOG` set to
an `EnvFilter` directive, e.g. `PHAROS_LOG=debug`. Logs never contain your
data: only ids, command names, counts and error kinds, with emails, tokens and
keys masked.

**To report a problem:** Administration → **Diagnóstico** → **Exportar
diagnóstico** ("Export diagnostics"). It is also on the error screen that
replaces a view that crashed. You get `pharos-diagnostic-<version>-<date>.zip`
in your downloads folder, with `diagnostic.json` (app version, OS, WebView2,
applied migrations, UI language and theme) and `logs/` (the recent logs,
masked again). It never includes projects, plans, cases, requirements, your
profile, the database, keys or tokens. In the web preview it holds only the
frontend facts.

The installed version is shown at the foot of the sidebar and in
Administration → Diagnóstico.

## Desktop E2E smoke

`npm run e2e` drives the **real desktop binary**: start → sign in with the test
account → create a project → restart → the project and the session are still
there (`e2e/specs/smoke.e2e.ts`). A second spec (`e2e/specs/diagnostics.e2e.ts`)
checks the version and "Exportar diagnóstico" in Administration and that the
bundle the desktop builds holds no user data. It runs WebdriverIO against
[`tauri-driver`](https://v2.tauri.app/develop/tests/webdriver/), which drives
the WebView2 window through Microsoft Edge WebDriver.

One-time setup (Windows):

```
cargo install tauri-driver --locked
npm run e2e:driver
```

`npm run e2e:driver` downloads into `e2e/.bin/` the `msedgedriver` that matches
your WebView2 runtime, from Microsoft. WebView2 updates itself, so re-run it
when the smoke reports a version mismatch.

Every run, with PostgreSQL and the API running (`cd server && npm start`):

```
npm run e2e
```

It checks the prerequisites and says how to fix a missing one, seeds the test
account (`seed:test-user`, idempotent), builds the debug binary
(`tauri build --debug --no-bundle`; skip it with `E2E_SKIP_BUILD=1`) and runs
the specs. Results: the console, plus one JUnit file per spec
(`e2e/results/e2e-<worker>.junit.xml`), the run's app logs in
`e2e/results/app-logs/` and a screenshot of Administration → Diagnóstico.

The smoke never touches your own data: each run sets `PHAROS_E2E_PROFILE`, so
the debug binary uses its own data folder, log folder and keychain session
entry (a release build ignores the variable), and `WEBVIEW2_USER_DATA_FOLDER`
gives WebView2 its own storage. At the end it deletes the projects it created,
signs out and removes those folders. Only the local database key
(`db-key.pharos` in the Credential Manager) is shared with the normal app: on a
machine that never ran Pharos, the first E2E run creates it, and the app reuses
it later.

**For CI** (`windows-latest`, track B1): the runner already has WebView2. It
needs Rust (MSVC), `cargo install tauri-driver --locked` (cache it),
`npm run e2e:driver`, the PostgreSQL service started with `pharos_db` created,
a `.env` made from `.env.example`, `cd server && npm run migrate`, the API in
the background, then `npm run e2e`. Publish `e2e/results/` as an artifact. The
session is cached in the Windows Credential Manager, which must be available
to the runner's user.

## Coverage

Coverage is a report, not a gate (no thresholds):

- `npm run coverage` — Vitest + `@vitest/coverage-v8`. Summary in the console;
  HTML in `coverage/index.html`, plus `lcov.info` and `coverage-summary.json`.
- `npm run coverage:rust` — `cargo llvm-cov` over `src-tauri`. Summary in the
  console; HTML in `coverage/rust/html/index.html`, plus `coverage/rust/lcov.info`.
  One-time setup: `cargo install cargo-llvm-cov --locked` and
  `rustup component add llvm-tools-preview`.

## Project layout

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Domain modules live in
`src/modules/*`, the shell in `src/app/*`, the design system and i18n in
`src/shared/*`, the Rust core in `src-tauri/`, the backend in `server/`. The
ubiquitous language is in [`docs/GLOSARIO.md`](docs/GLOSARIO.md); research
spikes are in `docs/spikes/`.

## Status

Current version: **0.1.0-alpha.1**. The 0.1.0 milestone (planning and design +
traceability) is implemented up to Phase 8; Phase 9 (accessibility audit,
installer, final docs) and SEC-03 are open before 0.1.0 is released. Detailed
progress lives in `PROGRESO.md` (outside this repo, in the planning workspace);
the backlog lives in [`docs/ROADMAP.md`](docs/ROADMAP.md).

The version is kept in sync across all manifests by `scripts/version.mjs`
(`npm run check:version`, `npm run version:set -- <version>`); never edit it
by hand — see [`docs/VERSIONING.md`](docs/VERSIONING.md).
