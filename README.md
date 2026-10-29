# Pharos

Desktop QA test-management suite (offline-first). Guides each testing project
safely to port, following ISO/IEC/IEEE 29119, ISO/IEC 25010 and the ISTQB CTFL
Syllabus v4.0.1.

> **Version 0.1.0-beta.1** (first beta) — test plans, test cases with Gherkin,
> templates, local planner, AI assist with several providers, offline sync with
> conflict panel, exports, requirements with a traceability matrix, a recovery
> key for the local data, and keyboard and screen-reader access (WCAG 2.1 AA).
> No test execution yet (0.2.0). Beta testers: start with the
> [beta guide](docs/guia-beta.md) (Spanish). Roadmap and backlog:
> [`docs/ROADMAP.md`](docs/ROADMAP.md) · changes:
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

## Installing the beta (Windows 11)

The **Installer** workflow builds the NSIS installer on every push to `main`
(see "Continuous integration"). To install it:

1. On GitHub: **Actions → Installer**, filter by the release tag (for this
   beta, `v0.1.0-beta.1`), open that green run and download the artifact
   `pharos-<version>-<commit>-windows` under **Artifacts** (you must be signed
   in to GitHub; artifacts expire after 30 days). Use the tag's run only:
   later pushes to `main` build artifacts with the same version number but
   unreleased code. It is a `.zip` holding `Pharos_<version>_x64-setup.exe`.
2. Run the `-setup.exe`. **The installer is not code-signed**, so Windows
   SmartScreen shows "Windows protected your PC": choose **More info → Run
   anyway**. Signing is a known limitation of the beta.
3. WebView2 is preinstalled on Windows 11. If it is missing, the installer
   downloads it (this needs internet).
4. Pharos appears in the Start menu. Uninstall it from **Settings → Apps →
   Installed apps**. Your data stays in `%APPDATA%\com.pharos.desktop` and the
   logs in `%LOCALAPPDATA%\com.pharos.desktop\logs` unless you delete them.

**The installed app talks to the API on `http://localhost:3000`** (the address
is fixed at build time, and the desktop CSP allows only that port). Sign-in and
sync therefore need the database and the API running on the same PC: follow
"Prerequisites", "First-time setup" and `cd server && npm start` below. Rust and
Visual Studio are only needed to build the app, not to install it. Once you
have signed in, the app opens offline from the cached session.

The step-by-step checklist for testers, in Spanish, is
[`docs/guia-beta.md`](docs/guia-beta.md).

## Prerequisites (Windows 11)

| Needed for            | Install                                                                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Everything            | **Node.js ≥ 22.12** with npm (CI uses the version in `.nvmrc`, Node 24)                                                                                                                                                                           |
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

   The root install also enables the git hooks (husky): `commit-msg` rejects a
   message that is not a [Conventional Commit](docs/VERSIONING.md#4-commits-ramas-y-etiquetas),
   and `pre-commit` runs ESLint on the staged `.ts`/`.tsx` files. The `prepare`
   script sets this up on every install, including a fresh clone.

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
http://localhost:1420. The web build is a client of the server (ADR-0004,
BASE-10): it keeps no domain data in the browser and reads and writes through
the API's domain endpoints (`/api/*`), so it needs the API and works only
online. Offline work, the conflict panel, attachments, your own templates and
revision history are desktop-only for now; the web shows the built-in
templates. If an item changed elsewhere while you edited it, saving tells you
and keeps your edit; saving again replaces the newer version.

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

### Sync

The desktop app works on its local database and sends and receives changes in
the background: at start-up, when the connection comes back and after you
resolve a conflict. The indicator in the top bar shows "Sincronizado" or the
number of pending changes (items, not edits) and has **Sincronizar ahora**
("Sync now").

- Projects, plans, cases, requirements and planner cards sync. Attachments
  and your own templates stay on the device that has them (SYNC-04b, later).
- Two devices that change the same item open the **conflict panel**: you pick
  the version to keep. Two devices that type the same key by hand show it in
  Conflictos → "Claves repetidas"; keys created offline are provisional
  (`ATS_?KQZD`) until the next sync (DAT-01).
- Every sync request carries the app version. The server accepts its own
  MINOR and the previous one (a 0.1.x server accepts 0.1.x and 0.0.x apps);
  any other app gets "Actualiza la app para sincronizar" and nothing is
  written (SYNC-08). `0.1.0-alpha.1` sends no version, so a newer server
  refuses its sync: update the app.
- Each account on the same PC has its own pending changes, cursor and
  conflicts (FIX-07). Deleted items are purged after the retention days of
  Administration (30 by default, SYNC-06).

### AI assist (optional)

Pharos works fully without AI; every AI button is disabled with a notice until
a provider is set up in the AI panel. Online providers, each with your own key
(kept in the Windows Credential Manager) and its own model: **Gemini, OpenAI,
Claude (Anthropic), OpenRouter** or any **OpenAI-compatible endpoint** (Groq,
DeepSeek, Mistral, a local LM Studio or vLLM…; it must use `https`, or `http`
only on `localhost`). "Listar modelos" lists the models your key offers.
Offline: **Ollama** (`llama3.2:3b`, downloaded from the AI panel). Before
sending anything, each AI control says which provider and model will receive
it. With AI you can:

- draft plan and case fields ("Assist with AI"), including the plan's
  automation strategy;
- suggest risks with mitigation (plan step 17) and preconditions (case editor);
- generate Gherkin scenarios and test cases from a requirement (✨ on each
  requirement in the Traceability tab).

Structured answers are JSON checked against a schema before use: an invalid
answer or a refusal is reported and nothing is applied
([ADR-0023](docs/adr/0023-salida-estructurada-ia.md)). Nothing is added until
you accept it, and AI content stays marked "AI · pending review" with its
provider and model until someone reviews it.

### Accessibility

Pharos targets WCAG 2.1 AA (UX-05, [ADR-0027](docs/adr/0027-accesibilidad-y-validacion-de-formularios.md)):

- everything works with the keyboard; "Saltar al contenido" is the first Tab
  stop;
- dialogs keep the focus inside, close with Escape and give the focus back to
  the button that opened them;
- case steps and planner cards are reordered with Space on the handle and
  the arrow keys, and each move is announced;
- forms explain every problem next to the field and in a summary that
  screen readers announce. Save is never disabled without a reason: only
  missing essentials block it, and other warnings let you save the draft
  (UX-01).

Both themes meet AA contrast. The audit and its open points are in
[`docs/accesibilidad/auditoria-wcag-0.1.0.md`](docs/accesibilidad/auditoria-wcag-0.1.0.md).

### Troubleshooting

| Symptom                                                  | Cause / fix                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `dev.bat`: "no running PostgreSQL service found"         | Start the service in `services.msc`, or install Docker Desktop                                         |
| "Could not reach the server" on sign-in                  | The API window is closed or crashed; check that window, then `.env` (`DATABASE_URL` port and password) |
| API fails with a database connection error               | Wrong port/password in `.env`, or the database does not exist (step 3)                                 |
| `cargo` not found / `npm run tauri dev` fails at once    | Open a new terminal after installing Rust; check the Visual Studio C++ workload                        |
| Port 3000 or 1420 already in use                         | 3000: `npm start` / `npm run dev` stop an earlier Pharos API themselves (any checkout or worktree) and refuse to touch another program, naming it; `node scripts/api-port.mjs owner` shows who holds the port. 1420: close the old Vite window |
| Console shows `localhost:11434 … ERR_CONNECTION_REFUSED` | Ollama is not installed or not running; harmless — AI assist is simply disabled                        |
| "This data comes from a newer version of Pharos"         | The local database was saved by a newer Pharos; install that version, or restore a backup (below)      |
| "The local database key is missing"                      | The Credential Manager lost the key (new PC, reinstall); enter the recovery key (below)                |
| "Windows protected your PC" when installing              | The beta installer is not code-signed: More info → Run anyway                                          |
| Installed app: "Could not reach the server"              | The installed app only talks to `localhost:3000`: start PostgreSQL and `cd server && npm start`        |
| "Actualiza la app para sincronizar" (or `push 426`)      | The app version is not accepted by the server (Sync, above); install the version that matches it       |
| "Demasiados intentos…" on sign-in                        | 10 attempts per minute per IP (`LOGIN_RATE_LIMIT_MAX`); wait a minute                                   |

### Local data backups

The desktop app keeps its data in `%APPDATA%\com.pharos.desktop\pharos.db.enc`.

Before a new version upgrades that database, the app saves an untouched,
encrypted copy next to it: `pharos.db.enc.bak-<version>-<last migration>`. For
example, `0.1.0-beta.1` opening data saved by `0.1.0-alpha.1` keeps
`pharos.db.enc.bak-0.1.0-beta.1-0011_sync_conflicts`.

- Only the 3 newest copies are kept; older ones are deleted.
- If the copy cannot be saved, the app upgrades nothing and says so.

To go back to the data from before an upgrade:

1. Close Pharos.
2. Rename `pharos.db.enc` (keep it until you are sure you want to discard it).
3. Copy the `.bak-…` file you want to `pharos.db.enc`.
4. Open the Pharos version that wrote that copy.

The copy is encrypted with the same key, kept in the Windows Credential
Manager, so it only opens on the same Windows account, or anywhere with the
recovery key (below).

### Recovery key (SEC-03)

The key of the local database lives only in the Windows Credential Manager. If
you lose it (new PC, reinstalled Windows, another account), the data cannot be
decrypted without the **recovery key** ([ADR-0024](docs/adr/0024-clave-de-recuperacion.md)).

- **Export it once:** Profile → Recovery key → Show recovery key. It is 56
  characters in 14 groups of 4 (`XXXX-XXXX-…`). Write it on paper or store it
  in a password manager, never next to the copy of your data: anyone with both
  can read it. Pharos keeps no copy of it.
- **A full backup** is `pharos.db.enc` (plus `evidence/` once evidence files
  exist) and the recovery key. The `.bak-…` copies use the same key.

To recover on another PC:

1. Install Pharos and close it if it is open.
2. Copy `pharos.db.enc` to `%APPDATA%\com.pharos.desktop\`.
3. Open Pharos. It says the database key is missing (or that the stored key
   does not open the database) and asks for the recovery key.
4. Type it: case, spaces and hyphens do not matter. A typo is reported before
   anything is changed. Once it opens, the key is stored in the Credential
   Manager again and the next start opens normally. The key it replaces, if
   any, is kept once as `db-key.prev`.

If a valid recovery key is reported as not opening the database, either it is
another key or the file is damaged (AES-GCM cannot tell them apart). With the
right key, close Pharos, move `pharos.db.enc` aside and copy the newest
`pharos.db.enc.bak-…` in its place as `pharos.db.enc`. Pharos never deletes a
saved file it cannot decrypt: a lone `pharos.db.enc.new` (a first save that
never finished) stays until it opens or you remove it.

`0.1.0-alpha.1` does not check for newer data. Never open data upgraded by a
later version with it; restore the matching `.bak` copy first.

## Scripts

Frontend (repository root):

| Command                        | Purpose                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                  | Vite dev server (web preview) at localhost:1420                                                                   |
| `npm run tauri dev`            | Run the native desktop app (needs Rust)                                                                           |
| `npm run build`                | Type-check + build the frontend                                                                                   |
| `npm run build:installer`      | Build the Windows installer (needs Rust): NSIS for pre-releases, NSIS + MSI for stable versions                   |
| `npm test`                     | Run the Vitest suite                                                                                              |
| `npm run typecheck`            | TypeScript, no emit                                                                                               |
| `npm run lint`                 | ESLint (0 warnings allowed)                                                                                       |
| `npm run check:licenses`       | Fail on GPL/AGPL/SSPL dependencies, or weak copyleft not named in `scripts/license-exceptions.json`               |
| `npm run check:version`        | Fail if the version differs across manifests                                                                      |
| `npm run check:migrations`     | Fail on duplicate or unexplained missing migration numbers (registry: `scripts/migration-registry.json`)          |
| `npm run test:scripts`         | `node:test` suite of the `scripts/` gates                                                                         |
| `npm run check:audit`          | npm audit gate: fails on high/critical advisories not in `scripts/audit-allowlist.json`                           |
| `npm run check:deps`           | `cargo deny` (RustSec advisories, licenses, sources); needs `cargo install --locked cargo-deny`                   |
| `npm run check:rust`           | `cargo fmt --check` + `cargo clippy -D warnings` with the exact exceptions of `scripts/rust-gates.allowlist.json` |
| `npm run contracts`            | Regenerate the TS contracts from the Rust types (`src/shared/contracts/generated/`, ADR-0026)                    |
| `npm run check:contracts`      | Fail if the generated contracts differ from the committed ones or the barrel misses one (BASE-05)                |
| `npm run version:set -- X.Y.Z` | Set the version in every manifest (releases only)                                                                 |
| `npm run verify`               | typecheck + lint + licenses + version + migrations + script tests + tests                                         |
| `npm run verify:static`        | `verify` without the Vitest suite (CI runs it, then `npm run coverage`)                                           |
| `npm run e2e`                  | Desktop smoke of the real binary (see below)                                                                      |
| `npm run e2e:driver`           | Download the msedgedriver that matches WebView2                                                                   |
| `npm run coverage`             | Frontend coverage report into `coverage/`                                                                         |
| `npm run coverage:rust`        | Rust coverage report into `coverage/rust/`                                                                        |

Backend (`server/`): `npm start`, `npm run dev` (auto-reload), `npm run migrate`,
`npm run seed:test-user`, `npm test` (needs `pharos_test_db`), `npm run typecheck`.

Desktop core (`src-tauri/`): `cargo check`, `cargo test`.

## Continuous integration

GitHub Actions ([`.github/workflows/`](.github/workflows/)) runs on every pull
request and on every push to `main`. A red check blocks the merge: `main`
is protected (see below).

| Check        | Runner                 | What it runs                                                             |
| ------------ | ---------------------- | ------------------------------------------------------------------------ |
| `client`     | Windows                | `npm ci`, `npm run verify:static`, `npm run coverage` (tests + report)   |
| `rust`       | Windows                | `npm run check:rust` equivalents (fmt, clippy), `cargo test --locked` and the generated-contracts drift check |
| `server`     | Ubuntu + PostgreSQL 18 | `server/`: typecheck, license check, `npm test`                          |
| `audit`      | Ubuntu                 | `npm run check:audit` (root and `server/`)                               |
| `cargo-deny` | Ubuntu                 | `npm run check:deps`                                                     |
| `workflows`  | Ubuntu                 | `zizmor` security lint of the workflows                                  |
| `commits`    | Ubuntu (PRs only)      | `commitlint` on every commit of the PR                                   |
| `e2e`        | Windows + PostgreSQL   | Desktop smoke `npm run e2e` against the API on `localhost:3000` (below)  |

`e2e` (BASE-14) runs the desktop smoke on every pull request and push to
`main`, in about 7 minutes with a warm cache (see "Desktop E2E smoke"). It is a
**required check** of `main` since 2026-10-29, like the jobs above.

`client` also publishes the frontend coverage on every pull request (BASE-13):
the totals (lines, statements, functions, branches) go to the run's job
summary (the run page → `client` → Summary), and the full report (HTML, lcov,
`coverage-summary.json`) is the `coverage-client` artifact (14 days). It is a
report, not a gate (a failing test still fails the job: `npm run coverage` is
the Vitest suite, run once), and it posts no PR comment, so the workflow keeps read-only
permissions. Rust coverage is not in CI: `cargo llvm-cov` needs a second,
instrumented build of the whole Tauri crate on top of the `rust` job's build,
which costs about as much as that job again on a Windows runner. Run it locally
(`npm run coverage:rust`, below).

The **Installer** workflow builds the Windows installer on every push to `main`
and on `v*` tags, and publishes it as a run artifact (30 days). Download it
from the run page on GitHub (Actions → Installer → the run → Artifacts).

To reproduce CI locally: `npm run verify`, `npm run check:rust`,
`cd src-tauri && cargo test`, `cd server && npm test`, `npm run check:audit`,
`npm run check:deps` and, with the API running, `npm run e2e`.

Every action is pinned to a commit SHA, and Dependabot proposes updates weekly
(npm, Cargo and actions) after a cooldown ([ADR-0021](docs/adr/0021-ci-y-cadena-de-suministro.md)).

**Protecting `main`** (BASE-02): an administrator applies
[`.github/branch-protection.json`](.github/branch-protection.json) once. After that:

- a PR with all the checks above green is required;
- administrators are included;
- no force-push or deletion is allowed.

```
gh api -X PUT repos/shift3385/Pharos/branches/main/protection --input .github/branch-protection.json
```

## Production configuration (API)

**`NODE_ENV` must be `production`** for any shared deployment. It defaults to
`development`, where none of the checks below run. An API started without it on
a non-loopback `HOST` (the default is `0.0.0.0`) logs a warning at start-up.
The `api` service of `docker-compose.yml` and the server's `Dockerfile` already
set it.

With `NODE_ENV=production` the API **refuses to start** (exit code 1, with the
reason) unless:

- `JWT_ACCESS_SECRET` is a random value of at least 32 characters, not the
  example one. Generate one with
  `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
- `CORS_ORIGIN` lists the allowed origins explicitly (never `*`): the web
  client's URL and the desktop app's `http://tauri.localhost`, comma-separated,
  each written as `scheme://host[:port]` with no path.

Optional limits (defaults in brackets):

| Variable                  | Purpose                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `LOGIN_RATE_LIMIT_MAX`    | Attempts per client IP on `/auth/login` and `/auth/register` [10]                                                             |
| `LOGIN_RATE_LIMIT_WINDOW` | Window for that limit: milliseconds or `30 seconds`, `1 minute`, `2 hours`… [`1 minute`]; above the limit the API answers 429 |
| `BODY_LIMIT_BYTES`        | Largest request body [1 MiB]; above it the API answers 413                                                                    |
| `SYNC_BODY_LIMIT_BYTES`   | Largest body on `/sync/*` (push batches) [8 MiB]                                                                              |
| `SYNC_TOMBSTONE_DAYS`     | Days the server keeps the content of a deleted record before clearing it (the tombstone stays) [30]; `0` = never clear        |
| `TRUST_PROXY`             | `true` behind a reverse proxy, so the limit counts real client IPs [false]                                                    |

The `api` service of `docker-compose.yml` runs in production mode. It reads
every variable above from `.env`, so set at least `JWT_ACCESS_SECRET` and
`CORS_ORIGIN` there before `docker compose up`, and `TRUST_PROXY=true` behind a
reverse proxy. The database-only setup (`docker compose up -d db`, `dev.bat`) is
unaffected.

## Logs and diagnostics

The desktop app writes one log file per day, `pharos.YYYY-MM-DD.log` (JSON
lines; the last 7 days are kept), in:

```
%LOCALAPPDATA%\com.pharos.desktop\logs
```

The level is `info`. For more detail, start the app with `PHAROS_LOG` set to
an `EnvFilter` directive, e.g. `PHAROS_LOG=debug`. Logs never contain your
data: only ids, command names, counts and error kinds, with emails, tokens and
keys masked. A crash (panic) is also written straight to `pharos.panic.log` in
the same folder. Frontend errors are logged too, at most 20 every 10 seconds,
and so are sync failures: HTTP status and code or error kind only, never the
server's text or your data, and a failure that repeats in the background only
once.

**To report a problem:** Administration → **Diagnóstico** → **Exportar
diagnóstico** ("Export diagnostics"). It is also on the error screen that
replaces a view that crashed. You get `pharos-diagnostic-<version>-<date>.zip`
in the download folder (see below), with `diagnostic.json` (app version, OS, WebView2,
applied migrations, UI language and theme) and `logs/` (the recent logs,
masked again). It never includes projects, plans, cases, requirements, your
profile, the database, keys or tokens. In the web preview it holds only the
frontend facts. The bundle can describe a local database that did not open
(`openError` instead of the migrations), but the screen shown in that case
(missing key, newer data) has no export button yet and Administration is out
of reach (UX-09): report the exact message, a screenshot and that day's
`pharos.YYYY-MM-DD.log` from the logs folder above.

The installed version is shown at the foot of the sidebar and in
Administration → Diagnóstico.

## Exports and the download folder

Every export (plan and case `.xlsx`/`.pdf`, `.feature` files, the project
ZIP and the "export everything" ZIP, the traceability matrix, templates,
planner attachments and the diagnostic bundle) is saved in the **download
folder**. By default it is your Windows Downloads folder. To change it:
Administration → Settings → **Carpeta de descarga** → **Elegir carpeta…**
opens the Windows folder picker; **Usar Descargas** goes back to the default.
The choice is saved at once (it is not part of "Guardar ajustes") in
`%APPDATA%\com.pharos.desktop\downloads.json`.

- A file is never overwritten: a second export with the same name is saved as
  `name (2).ext`.
- The confirmation message shows the full path of the saved file.
- If the chosen folder is deleted, renamed or cannot be written (access denied,
  disk full, Windows "Controlled folder access"), the file goes to Downloads and
  a warning says so; the settings screen also flags a missing folder. If even
  Downloads fails, an error message says why. Nothing fails silently.
- Planner attachments are saved with Mark-of-the-Web, so Windows warns before
  opening them, as with a browser download. Pharos' own exports are not marked.
- The folder is a setting of this Windows account on this computer, shared by
  every Pharos user who signs in here (ADR-0025).
- If a PDF cannot be created, a ZIP is still saved without it and a warning
  lists the missing PDFs.
- The project ZIP and the global ZIP hold, for each project, the plan and
  every case as both `.xlsx` and `.pdf`.
- In the web preview (`npm run dev` in a browser) the browser decides where
  downloads go.

## Desktop E2E smoke

`npm run e2e` drives the **real desktop binary**: start → sign in with the test
account → create a project → restart → the project and the session are still
there (`e2e/specs/smoke.e2e.ts`). A second spec (`e2e/specs/diagnostics.e2e.ts`)
checks the version in Administration, clicks "Exportar diagnóstico", opens the
ZIP saved in your Downloads folder (an E2E profile has its own settings, so it
never uses a download folder you chose; set `PHAROS_E2E_DOWNLOADS` if your
Downloads folder is elsewhere), checks it holds no user data and deletes it. A
third spec (`e2e/specs/a11y.e2e.ts`, UX-05) injects axe-core into the window
and fails on any WCAG 2.1 A/AA violation, colour contrast included, on the
sign-in screen, Home, Projects, Templates, Administration, Profile, a project
and the plan wizard, in the light and the dark theme. It runs WebdriverIO
against
[`tauri-driver`](https://v2.tauri.app/develop/tests/webdriver/), which drives
the WebView2 window through Microsoft Edge WebDriver.

One-time setup (Windows; the E2E needs **Node ≥ 22.19**, required by
WebdriverIO 10):

```
cargo install tauri-driver --locked
npm run e2e:driver
```

`npm run e2e:driver` downloads into `e2e/.bin/` the `msedgedriver` that matches
your WebView2 runtime, from Microsoft's host (`msedgedriver.microsoft.com`)
only. The driver must carry a valid Authenticode signature from Microsoft
Corporation: it is checked after the download and before every use, and a file
that fails the check is deleted, never run. WebView2 updates itself, so re-run
it when the smoke reports a version mismatch.

Every run, with PostgreSQL and the API running (`cd server && npm start`):

```
npm run e2e
```

It checks the prerequisites and says how to fix a missing one (including an API
on port 3000 that belongs to another checkout or worktree: the smoke would test
that code instead), seeds the test
account (`seed:test-user`, idempotent), builds the debug binary
(`tauri build --debug --no-bundle`; skip it with `E2E_SKIP_BUILD=1`) and runs
the specs. Results: the console, plus one JUnit file per spec
(`e2e/results/e2e-<worker>.junit.xml`), the run's app logs in
`e2e/results/app-logs/` and a screenshot of Administration → Diagnóstico.
With `PHAROS_E2E_DRIVER_LOG=1`, `e2e/results/msedgedriver.log` also holds
msedgedriver's verbose log (CI sets it); a run stopped halfway can then leave
an `msedgedriver.exe` running.

The smoke never touches your own data: each run sets `PHAROS_E2E_PROFILE`, so
the debug binary uses its own data folder, log folder and keychain accounts
(session and AI keys; a release build ignores the variable), and
`WEBVIEW2_USER_DATA_FOLDER` gives WebView2 its own storage. Each spec starts
signed out; at the end it deletes every project whose name starts with `E2E `
on the test account (including leftovers of a failed run), syncs and signs
out. The run then removes those folders and its Credential Manager entries.
Only the local database key
(`db-key.pharos` in the Credential Manager) is shared with the normal app: on a
machine that never ran Pharos, the first E2E run creates it, and the app reuses
it later. Its recovery key (Profile → Recovery key) therefore also opens the
E2E databases.

**In CI.** The `e2e` job (`.github/workflows/ci.yml`,
on `windows-latest`, which already has WebView2) does the same. It starts the
runner image's PostgreSQL service and creates `pharos_db`, writes `.env` from
`.env.example`, runs `cd server && npm run migrate`, installs `tauri-driver`
(kept in the Rust cache with the build, which is saved even when the smoke
fails) and runs `npm run e2e:driver`. Then, in one step, it starts the API on
`localhost:3000` in the background and runs `npm run e2e`: the runner kills
whatever a step leaves running. The run's `e2e/results/` and the API logs are
published as the `e2e-results` artifact (14 days), also when the smoke fails,
with msedgedriver's verbose log (`PHAROS_E2E_DRIVER_LOG=1`). With a warm cache
the job takes about 7 minutes, almost 5 of them for the debug build and the
smoke.

**Why Pharos opens the DevTools port itself.** msedgedriver asks WebView2 for
a DevTools port through `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`. On the CI
runner, which runs elevated (an administrator with UAC auto-elevation), the
WebView2 browser starts without that argument, and the per-app registry policy
(`HKCU\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments`) is
ignored too: only the arguments the app passes itself get through (locally the
variable works). So with `PHAROS_E2E_PROFILE` set, a debug build adds
`--remote-debugging-port=0` to its own WebView2 arguments; msedgedriver finds
the port in `DevToolsActivePort` in the run's WebView2 folder. A release build
never does, whatever the environment (ADR-0022). The main window is therefore
built in `src-tauri/src/lib.rs` from its `tauri.conf.json` entry
(`"create": false`), with the same title, sizes and CSP.

`npm install` / `npm ci` download no browser driver: the `edgedriver` and
`geckodriver` packages that WebdriverIO pulls in only download when
`EDGEDRIVER_AUTO_INSTALL` / `GECKODRIVER_AUTO_INSTALL` are set.

License notes (dev-only E2E dependencies, not shipped in the app):
`css-value@0.0.1` (via `webdriverio`) declares no license field, and
`@promptbook/utils` (via `@wdio/utils` → `locate-app`) is CC-BY-4.0. Neither is
copyleft; `npm run check:licenses` passes.

## Coverage

Coverage is a report, not a gate (no thresholds):

- `npm run coverage` — Vitest + `@vitest/coverage-v8`. Summary in the console;
  HTML in `coverage/index.html`, plus `lcov.info` and `coverage-summary.json`.
  `node scripts/coverage-summary.mjs` prints the totals as the Markdown table
  that CI writes to the job summary.
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

Current version: **0.1.0-beta.1**, the first beta of the 0.1.0 milestone
(planning and design + traceability). Gates A and B of the baseline are closed
and every item of the milestone is merged. Before `0.1.0` the user still has to
run the native validations of [`docs/ROADMAP.md` §6](docs/ROADMAP.md) (the
[beta guide](docs/guia-beta.md) turns them into a checklist); each fix ships as
a new `beta.N`. Known limitations of the beta:

- the installer is not code-signed (SmartScreen warning);
- the installed app needs the API on `localhost:3000` of the same PC;
- when the local database does not open, its screen has no "Exportar
  diagnóstico" button yet (UX-09): attach that day's log instead;
- attachments and your own templates do not sync yet (SYNC-04b), and the web
  has no attachments, own templates or revision history;
- no test execution yet (0.2.0).

Detailed progress lives in `PROGRESO.md` (outside this repo, in the planning
workspace); the backlog lives in [`docs/ROADMAP.md`](docs/ROADMAP.md).

The version is kept in sync across all manifests by `scripts/version.mjs`
(`npm run check:version`, `npm run version:set -- <version>`); never edit it
by hand — see [`docs/VERSIONING.md`](docs/VERSIONING.md).
