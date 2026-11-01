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
  Offline: Ollama, called from the frontend. Structured answers (IA-05 cases
  from a requirement, IA-10 risks and preconditions) reuse the same chat path
  with a strict prompt and are validated with zod on the client before use
  ([ADR-0023](adr/0023-salida-estructurada-ia.md)); the traceability module
  creates the accepted cases through the test-cases public API.

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
    custom-fields/  cycles/  defects/
  shared/      # design system (theme tokens), i18n, ui kit, form validation, fonts, diagnostics, version, platform, contracts
  test/        # test utilities (renderWithProviders, axe helper, fake server)
src-tauri/     # Tauri 2 (Rust): encrypted local DB, repositories, oplog, sync, logs
e2e/           # desktop smoke of the real binary (WebdriverIO + tauri-driver)
server/        # backend API (Fastify): auth, sync document store, the web's domain API
docs/          # ARCHITECTURE.md, ROADMAP.md, GLOSARIO.md, adr/, design/, referencias/, spikes/
```

Modules with UI sections expose a `*Page` component. Cross-cutting modules:
`auth` (Phase 1) and `sync-offline` (Phase 8) are implemented; `integrations`
remains a reserved boundary for Jira (backlog INT-05).

Future modules — manual test execution (0.2.0), mobile build (0.4.0) — must
be addable without touching existing modules.

**One platform layer (BASE-10, [ADR-0004](adr/0004-web-cliente-del-servidor.md)).**
`@shared/platform` is the only place that knows whether Pharos runs as the
desktop app or as the web build: `isTauri()`, `invoke()` (Tauri, loaded on
demand) and `capabilities` (what only the desktop has). Each module's `api/`
file sends a call either to the Rust core (`invoke`) or, on the web, to the
server's domain API through `serverApi` (`@modules/sync-offline`). The
browser holds **no domain logic and no domain data**: no localStorage store,
no outbox, no web conflicts. What stays in localStorage is per-browser
preferences only (theme, language, Administration settings, AI non-secret
config, last access, when the recovery key was shown) and, on the web, the
session. Until SYNC-04b, attachments, the user's own templates and revision
history are desktop-only: the web shows the built-in templates (held in
memory) and no history, and a desktop-only action says so in a toast.

- **Edits never overwrite blindly (FIX-04).** `serverApi` remembers the
  revision of every item the page read and sends it with each update or
  delete. If the item changed elsewhere meanwhile, the server answers 409
  `stale_write` with its version; the user is told, the form keeps the edit,
  and saving again replaces the newer version knowingly.
- **Keys.** On the web the server numbers cases, requirements and defects from
  the same key series as the devices' leased blocks (`key_blocks`), so a web
  key never collides with a device's. A typed key that is taken (`key_taken`),
  belonged to a deleted item (`key_retired`) or is invalid (`invalid_key`) is
  refused at once with a toast, never queued.
- **Deleted elsewhere.** Editing an item another device deleted answers 409
  `deleted_elsewhere`, with its own toast; there is no version to replace.
- **Old browser data.** On the account's first sync with this version,
  `web/legacyWebData.ts` pushes what the old outbox still held and sets aside,
  under `pharos.legacy.unsent:<userId>`, what the server does not take plus the
  attachments, imported templates and revision history that only lived in the
  browser. A topbar notice (`ui/LegacyUnsentNotice.tsx`) downloads it as
  `pharos-web-unsent-<date>.json`; it is removed only when the user confirms
  the file is saved or discards it, since a browser download cannot be
  confirmed. That browser-only data was per browser: an account takes the
  attachments of cards in its outbox, and the rest only if the old caches were
  its own (`pharos.sync.cacheOwner`, or none, as before FIX-07).

**Proyectos (RED-V2).** `ProjectsPage` loads `projectRows` (projects with
plan status, case count and requirement coverage, through the `test-plan`,
`test-cases` and `traceability` public APIs) and builds the screen from pure
functions in `model/projectTable.ts` (recent, search, sort with nulls last,
pages). The table is the shared `DataTable` + `Pagination` + `FilterChips` +
`SortMenu`. Ajustes del proyecto is `ProjectSettings`: the delete dialog is
`ConfirmDialog variant="destructive"` with `confirmText` set to the prefix
without its separator (`deleteConfirmWord`), and `useProjectExport` holds the
export progress shared with the list.

**Plan wizard (RED-V2).** `TestPlanWizard` composes `ui/wizard/*`:
- `formState.ts`: the form and its pure conversions (from a plan, an import or
  a revision; to the saved input and the export shape);
- `steps.ts`: the 19 step ids and `stepCompletion` (a step is complete when its
  main field has content);
- `StepBody` and one component per large step (`DeliverablesStep`,
  `ToolsStep`, `ScheduleStep`, `FinishStep`);
- `StepNav`: one navigation is rendered, chosen by the app container's width.
  `StepRail` (sticky, `z-index: 2`, its own scroll) from 1360 px, measured by
  `useWideApp` on `.viewport-root` like `ViewportProvider`; `StepStrip`
  (current step centred) from 600 px; `StepCompact` + a `BottomSheet` below;
- `PlanSidePanels`: «Estado del plan», the latest revisions, the revisions
  dialog and the «Importar / Exportar» menu.

Its header buttons go through `useHeaderActions`. Leaving with unsaved changes asks first (`useUnsavedChangesGuard`; the wizard never navigates by itself after a save, so it needs no `bypass`). Saving reloads the saved
plan in place, so the step stays put, and fires `PLAN_SAVED_EVENT`, which the
project header listens to. Deliverables and tools are catalog keys
(ADR-0030, `model/catalogLabels.ts`).

**Plan schedule, step 14 «Cronograma» (RED-W5).** `ScheduleStep` holds one
calendar (`wizard/schedule/ScheduleCalendar.tsx`, its own month grid, two
months from 640 px of step width) and the rows below
(`wizard/schedule/ScheduleRows.tsx`); both edit `form.sprints` and
`form.milestones`. The calendar is a WAI-ARIA grid with one tab stop
(arrows, Home/End, PageUp/PageDown, Enter/Space, Esc); bands and diamonds are
drawn `aria-hidden` and every day's label says the same in words. Band ends
drag with pointer events only with a fine pointer (`(pointer: fine)`, from
560 px; never a finger, which scrolls); the row dates are the keyboard and
touch way to do it. A row date (dd/mm/aaaa or ISO) is applied on blur or
Enter whatever it says: a real day as ISO, empty clears it, anything else is
kept as typed with its warning, so nothing typed stays unsaved; the focus
stays put when the row re-sorts. Rules live in `model/schedule.ts` and `formState.sprintIssues`: missing
or invalid date, end before start, overlap, and a length other than the step 6
sprint weeks × 7 (agile plans only). All are warnings (ADR-0027): the plan
still saves; an overlap is drawn in error colors but says «es un aviso» with
an icon.

Data: sprints are `{ id, name, start, end }` and milestones
`{ id, name, date }` inside the plan's `data`, dates ISO `YYYY-MM-DD`. Rust
(`test_plan.rs`, `sync.rs`) and the server (`domain.schemas.ts`) keep
`data` as an opaque blob and never read these lists, so there is no
migration: `normalizeSchedule` gives ids on read, in the one TS path both
clients take (`formState.applyRevision` / `fromPlan`). A row without a unique
id gets `crockford32(fmix64(fnv1a64("<planId>:sprints|milestones:<index>")))`
(8 characters, `:<n>` appended while taken), so every device reads an
unsaved legacy plan, or restores a legacy revision, with the same ids; the
first save persists them. New rows (calendar, «Siguiente sprint», an .xlsx
import) get random ids, so a deleted row's id is never reused. Nothing is
dropped: unknown fields stay, a legacy dd/mm/aaaa day (old imports) reads as
ISO, and any other date that is not ISO stays as written (shown as invalid,
not drawn). The wizard's unsaved-changes check compares against this same
normalized form, so reading never marks a plan changed. Exports map sprints to
`{ name, range }`, so ids never reach .xlsx or .pdf. **Old clients:** every
released build gets 426 on push since `stable-steps` (DAT-02), so none can
write a plan back without its ids; on pull they store `data` as received
(`serde_json::Value`), so the ids survive on their disk too. No sync feature
gate is needed (VERSIONING §6.5).

**Home (UX-08, redesign RED-V1, SPEC §8).** `app/dashboard` is the Inicio of
the redesign. `model/loadHome.ts` reads only public read APIs, one project
list and three reads per project, most recently updated first:
`projectApi.list` (case-id prefix → key), `projectLiveCases` (`test-cases`),
`projectPlanClosure` (`test-plan`: latest sprint end or milestone, and the
closure criteria) and `projectDefects` (`defects`: open = not closed nor
rejected; critical = severity).
`model/homeData.ts` aggregates it as pure functions (KPIs, the queue by
priority, the exit-criteria choices and default, the period days and which day
labels show). The widgets — `KpiCards`, `PeriodSelector`,
`ExecutionByProject`, `ExitCriteriaCard`, `DailyExecutionsChart`,
`UpcomingTests` — never invent run data: until the run model (0.2.0, RED-W6)
every case is "not run", and the pass rate, the daily runs and the criteria
show an explicit empty state ([ADR-0028](adr/0028-rediseno-de-la-interfaz.md)).
On mobile the page is three `Tabs`. The chosen period is a per-device
convenience in `localStorage` (`pharos.home.period`). The last access is
device-local metadata kept in `localStorage` per user
(`pharos.projects.lastAccess.<userId>`): project ids and timestamps only,
outside the database and sync on purpose.

**Login and Perfil (RED-V1).** `modules/auth/ui/AuthScreen` is the redesigned
login: from 600 px a form column beside `assets/login-faro.jpg` (the
prototype's 1024 px photo; production should ship a ≥ 2400 px version); below
600 px the photo is a header and the form a sheet sized with `cqh` units on a
`container-type: size` root, so the login never scrolls (the longer sign-up
form scrolls inside the sheet). One scroll at most (RED-V1c): the root is
`100dvh` with `overflow: hidden`, `html.auth-route` locks html and body while
the screen is mounted, and only `.auth-col` (the sheet on mobile) scrolls;
`.auth-col` is `position: relative` so its `sr-only` texts cannot stretch
the page. Sign-up is compact (Nombre and Apellidos in `.auth-form__row`,
46 px inputs) and fits at ~800 px. The Google button is a disabled placeholder
with a monochrome inline mark (Lucide has no brand icons). `modules/profile`
shows identity, name and Preferencias (`SegmentedControl` for language and
theme) and the recovery key; `RecoveryKeySection` is also exported, so that
Administración › Seguridad (RED-V4) can mount it and take it out of Perfil.

**Traceability (0.1.0).** `traceability` owns requirements (`REQ-xxx`, stable
keys) and the requirement ↔ test case ↔ defect matrix. It reads `test-cases`,
`defects` and `test-plan` through their public APIs; none of them imports it.
`projects` is the composition root: it hands requirement options to
`test-cases` and linkable cases and requirements to `defects` as props, so the module graph stays
acyclic. The link itself lives in the case (`data.requirementKeys`) so it is
revisioned and synced with the case, and travels as Gherkin tags (`@REQ-xxx` on
the Feature, `@<case id>` on each Scenario — never the scenario name).

**Execution model (decided for 0.2.0; the tables are built, the UI is not).** Gate C closed on
2026-10-28 with ADR-0011…0019; the design is in
`docs/design/0.2.0-modelo-ejecucion.md`. In short:

- Every execution, manual or imported, is a `run` with its context
  (environment, build, commit, dataset, configuration).
- A run holds four generic kinds: `result` (+ `step_result`), `finding`,
  `metric` and `exploratory_session`. 0.2.0 stores results only; the other
  kinds are fixed in the Pharos Run JSON schema and get their tables in
  0.4.0/0.5.0. Cycles, configurations and custom fields may slip to 0.3.0.
  The run tables, the results and the Pharos Run JSON 1.0.0 schema are
  **built in E3 (step 4, EJE-01)**, see "Runs and results" below; the manual
  execution UI is step 7.
- Results are append-only and point to an immutable, synced
  `test_case_revision` and to stable step ids — the revisions and the ids are
  **built in E2 (DAT-02)**, see "Case revisions and stable steps" below.
- Evidence lives encrypted outside the database (`evidence/`, addressed by
  hash) — **built in E2 (DAT-03)**, see "Evidence store" below.
- One write path (`journal::record`) feeds both the oplog and an append-only
  `audit_log` — **built in E1 (AUD-01)**, see "Journal and audit log" below.
- Defects become their own `defects` module — **built in E4 (step 8, DEF-01)**,
  see "Defects" below.
- Sync gains an `append_only` class (**built in E1**: `audit_event` is the
  first entity); from 0.3.0 the server is keyed by workspace (ADR-0019).

**Runs and results (EJE-01, RUN-00, KND-01; ADR-0012, ADR-0013).** Migration
0024 and `src-tauri/src/runs.rs`, no UI yet:

- **Tables.** `runs` (header with its context: trigger, tool, environment,
  build, commit, branch, CI URL, dataset, `context` JSON; status
  `in_progress | completed | aborted`; key `RUN-001`), `run_items` (case + the
  revision frozen when the item is added + flow + Outline row), `run_shards`,
  `results` (one attempt each, status `passed | failed | blocked | skipped |
  other` + `raw_status`, `test_key` always present), `step_results` (pointing
  at the stable `step_id`), `unlinked_mappings` (`test_key → case`, ING-05) and
  the local `execution_drafts` (step 7). Requirements gain
  `risk_likelihood`/`risk_impact` (1..5).
- **No foreign key to `runs`** from a synced table (only `step_results →
  results`): a pull can bring a result before its run, and the bundled SQLite
  enforces foreign keys. The repository checks the links. No UNIQUE index but
  the live run key.
- **Immutable.** Triggers refuse any change to the content of a shard, a result
  or a step result (only `workspace_id`/`project_id` may move, ADR-0019). The
  purge is the only code that deletes them (a test greps for it): with their
  run, once none of them is still pending for the server, together with their
  journal rows; and stale ones whose run never came and whose project is gone.
  A correction is a new attempt.
- **Ids by kind.** A run item's flow must be a flow of the frozen revision, its
  row a row of that flow (or of the case), and a step result's `step_id` a step
  of that flow (the main flow: preconditions, Background and steps; a flow:
  Background and its own lists). A case with an open key conflict cannot be
  frozen. The server's size limits are checked before writing.
- **Commands.** `run_create`, `run_update` (only while `in_progress`, else
  `run-closed`), `run_get`, `run_list`, `run_items_add` (one oplog row per item
  and one audit event), `run_items_list`, `result_record` (a manual attempt of
  a run item: the result, its steps, the oplog row and one `execute` audit
  event in one transaction; a `step_id`, flow or row that is not in the frozen
  revision is refused), `results_list` and `unlinked_mapping_set`;
  `requirement_risk_set` for the risk.
- **Derived, never stored** (`runs/derive.rs`): the final attempt of each
  `(run, test_key, configuration_label)` by
  `coalesce(finished_at, started_at, shard.imported_at)`, then `attempt`, then
  HLC; flaky (the final attempt passed after a failed one, or
  `attributes.flaky` from the tool); the worst status;
  `risk_level = likelihood × impact` and its band (defaults ≤ 4 / ≤ 12 / > 12;
  per-project bands come with TRZ-04).
- **Deterministic ids** (`runs/ids.rs`, TS twin in
  `src/shared/contracts/pharos-run/ids.ts`, shared vectors
  `src-tauri/tests/fixtures/run-id-vectors.json`): UUIDv5 over the JCS of
  `[run, sha256]` (shard), `[shard, test_key, label, attempt]` (imported
  result) and `[project, test_key]` (mapping). Manual attempts use random ids:
  two simultaneous attempts are both kept.
- **Sync.** `run`, `run_item` and `unlinked_mapping` are lww (`oplog::SYNCED`);
  `run_shard` and `result` (its steps inside) are append-only (`sync_class.rs`;
  `APPLIED_SET_VERSION` 3). All of them, and `run` key blocks, wait for a
  server that lists `runs` (`sync::server_takes_runs`; the diagnostics count
  them in `heldBackRuns`). A project delete soft-deletes runs, items and
  mappings here and tombstones all five on the server.
- **Pharos Run JSON 1.0.0** (`src/shared/contracts/pharos-run/`): zod schema,
  `parsePharosRun` and the generated JSON Schema
  `docs/formats/pharos-run-1.schema.json`. `results[]` is a superset of CTRF
  `results.tests[]`; `findings[]`, `metrics[]` and `exploratorySession` are
  validated only. The importers of step 9 produce it.

**Defects (DEF-01, ADR-0016).** Migration 0029, `src-tauri/src/defects.rs`
(+ `defects/{ids,lifecycle,convert}.rs`) and `src/modules/defects/`:

- **Tables.** `defects` (key `DEF-001` from the project's `defect` key
  counter, which already existed; severity `critical | major | minor |
  trivial` apart from priority; status, resolution; found in run, build and
  environment; fixed in build; reporter, assignee; `external_*` for INT-05;
  `data` with labels and `custom`) and `defect_links` (`result |
  test_case | requirement | finding | session_note`, id
  `UUIDv5(NS_DEFECT_LINK, JCS([defect, kind, target]))`, soft-deleted to
  unlink, revived to link again). No foreign key to `defects`; a partial
  UNIQUE index on the live key, like the other keys (the pull vacates the local
  holder first, ADR-0010 A3). Enums have CHECKs; a pulled value outside them is
  normalised, never failing the pull.
- **Lifecycle** (`lifecycle.rs`, TS twin `model/lifecycle.ts`, server
  `sync/defects.ts`, one table in `tests/fixtures/defect-vectors.json`):
  `new → open → in_progress → fixed → retest → closed`, `retest → open`,
  `new|open → rejected|deferred`, and `closed|rejected|deferred → open`.
  A resolution goes with `closed`/`rejected` only. Open = not closed nor
  rejected (the matrix and the dashboard).
- **Commands.** `defect_list`/`_get` (with live links and the derived
  `caseIds`: direct case links plus the case of each linked result, through
  its mapping), `defect_create` (optional `links` and `fromResult`),
  `defect_update`, `defect_transition`, `defect_delete` (links folded into
  one event; attachments released), `defect_link_set` (`link`/`unlink`
  events), `defect_draft_from_result` (read only: the steps of the executed
  revision, what the step result obtained, the run's build and environment),
  `defect_result_list` (the project's attempts that did not pass) and
  `defect_attachment_add/list/save/delete`. Creating from a result links the
  result and its case and adds a new `attachments` row per attachment of the
  result and its step results with the same sha256 (no bytes copied,
  ADR-0014). Every row belongs to the project's owner, not to a card owner.
- **Conversion of planner defect cards.** The Rust step of 0029
  (`migrate_planner_defects`, same savepoint) and the server's migration 0010
  call one pure function (`convert::from_card` / `fromCard`): same id and
  key, column → status (`done` → `closed` + `fixed`), severity `major`,
  `data.testCaseIds` → links; the server's limits always hold (title and
  description cut, an empty title becomes the key) and `data.fromCard` keeps
  the full text and the card's case ids. Locally the card's base becomes the defect's,
  its unsynced oplog rows become the defect's, never-synced links are
  journaled, key and version conflicts move with it, its attachments become
  the defect's, and the card is soft-deleted without an oplog row; the DEF
  keys of tasks that once were defects go to `retired_keys`. The server keeps
  the card's revision and HLC, so a device that converted on its own pushes
  nothing (or a normal update for an offline edit) and never conflicts. A live
  defect card still pulled from an older server is converted the same way
  (`apply_pulled_card`) and never overwrites a defect at that revision or
  later. When the server's conversion started from another card, the links
  reconcile (`reconcile_pulled`): without a pending edit, a made-up link the
  server lacks goes locally; with one, the server's links the edited card
  dropped are deleted and pushed.
- **Sync.** `defect` and `defect_link` are lww (`oplog::SYNCED`;
  `APPLIED_SET_VERSION` 6) and wait for a server that lists `defects`
  (`heldBackDefects` in the diagnostics, with `defectsByStatus`). A project
  delete soft-deletes both here and tombstones them on the server; the purge
  takes links, defects and their attachments and retires the key.
- **UI.** `DefectsPage` (section `defects` of a project): a `DataTable` list
  and a board by status (dnd-kit; a drop follows the lifecycle, closing,
  rejecting or a drop on «Otros» ask in `TransitionDialog`), `DefectEditor`,
  and «Desde un resultado» (`ResultPickerDialog`, desktop). No screen design
  exists in `docs/rediseno/`: they reuse the list and board primitives.
  `createDefectFromResult` and `DefectEditor` are exported for the execution
  screen (EJE-02). The planner keeps tasks and test data only.

**Result import and the unlinked tray (ING-02..05; ADR-0005, ADR-0012,
ADR-0013; built in E4, step 9).** The section «Ejecuciones»
(`/projects/:id/runs`, `src/modules/runs/`) lists the runs and the tray, and
«Importar informe» runs the pipeline:

- **Parsers in TypeScript** (`src/shared/contracts/pharos-run/importers/`):
  Cucumber Messages (NDJSON, read line by line), CTRF, JUnit XML (the webview's
  `DOMParser`, no XML dependency), Playwright JSON and Pharos Run JSON itself.
  The format is detected by content (Cucumber JSON is refused). Each produces a
  Pharos Run JSON document checked by `parsePharosRun`, with a `testKey` per
  result (relative path + title path, `[n]` for a Cucumber Outline row; the
  three Playwright reporters give the same key) and one result per attempt.
  Parsers never link: they keep every tag. Contract tests run the sanitized
  ING-01 samples against committed normalized snapshots
  (`fixtures/ing01/normalized/`), the vectors of a later port (INT-01).
- **One persister in Rust** (`src-tauri/src/runs/import.rs`, a child of
  `runs`): `run_import_preview` (read-only, rolled back), `run_import`
  (raw report upload + one transaction: the run if new, the shard, results
  with steps, one `import` audit event; a new run closes unless kept open),
  `run_import_attach` (one report attachment to its result or step result,
  idempotent by owner and content), `unlinked_tests_list` (the tray: the keys
  whose latest imported result has no case) and `run_counts_list` (final
  results per run, one read for the list). **The link is never stored** for
  an imported result (its content is the same on every device): the one
  resolver, `runs/link.rs` (`Resolver`, set queries per project), derives it
  for every reader (results list, tray, counts, preview; cycles, defects and
  the matrix call it too). A later link wins; else the tags against every key
  a case ever had (current `scenario_id` and those of its synced revisions;
  two cases → unlinked, a deleted case → `caseDeleted`); the revision is the
  run's item for that case/flow/row, else the synced revision current
  at `run.started_at`, else the oldest (a pulled revision takes the
  server's `createdAt`, so this converges); flow by scenario name, Outline
  row by index and step ids only when the texts match the revision. Ids:
  shard and result as above, step `UUIDv5(NS_STEP_RESULT, [result, position])`;
  re-importing a file into its run writes nothing. Texts are cut
  deterministically so no result document exceeds 1 MiB.
- **Evidence.** The raw report is an attachment of the shard (`raw_report`);
  attachments the report embeds (Messages, Playwright `body`) or names by
  path (resolved against a folder the user picks) go to their result or step.
  Purging a run deletes those rows too, and the evidence collection frees the
  files.
  None of them syncs yet (ADR-0014).
- **Sync.** Nothing new: the import writes `run`, `run_shard`, `result` and,
  from the tray, `unlinked_mapping`, all under the `runs` feature.

**Journal and audit log (AUD-01, ADR-0015).** Every audited mutation goes
through `src-tauri/src/journal.rs`:

- `journal::record` writes, in the caller's transaction, the oplog row the
  sync needs (exactly what `oplog::record` wrote before; only the journal calls
  it, a test greps for it) and one event in `audit_log` (migration 0019):
  actor (`user:<id>`, `system:<component>` with `on_behalf_of`), action, entity,
  key and `changes = { field: [before, after] }` (`data` one level down,
  `data.<key>`; a template file as its sha256, an attachment as name, size and
  sha256, never bytes). An update that changes nothing leaves no event. A CSV
  import is one `import` event with counts; a project delete is one `delete`
  event with its cascade counts.
- Mutating commands run in `Db::with_tx`, so the entity write, the oplog row
  and the event commit or roll back together. Commands that already open their
  own transaction (CSV import, purge, key blocks, conflicts, pull) keep it and
  are called through `with_conn`: `with_tx` never nests.
- `audit_log` is append-only for every writer: triggers refuse a DELETE and any
  UPDATE but a redaction (`changes` → NULL and `redacted_at` set, once). The
  purge never touches it.
- **Hash chain** per `(device_id, chain_workspace_id, chain_owner)`, numbered by
  `chain_seq`: `hash = sha256(prev_hash ‖ JCS(header) ‖ changes_sha256)`
  (`audit.rs`). The header leaves out `changes`, the location and the owner
  bucket, so a redaction or a move keeps it valid. `audit::verify_chain`
  reports a gap, a broken link, an edited field or edited content. Until
  0.3.0 the chain is also per owner: every account on a device shares the
  local workspace but only syncs its own events.
- **Owner** fixed when the event is written: the person's account; for a
  `system:` actor, the project's owner, or '' — the event then stays on the
  device and is never pushed. So does the event of a `user:` actor without an id (a change
  made signed out).
- Pulls create no event (they arrive as the other device's events); resolving a
  conflict does (`resolve_conflict`). There is no audit UI yet (Admin > Auditoría comes later).
- **Web edits (AUD-01b)** are audited by the server
  (`server/src/modules/audit/`). `DomainTx.put` writes, in the same
  transaction and under the user's write lock, one `audit_event` document
  per domain write with the journal's rules (`audit.diff.ts` ports
  `journal::diff` and `location`): create, update or delete with the diff,
  nothing for a no-diff update or a refused write (409/404), one `import`
  event for a requirement import (its rows are `folded`), one `delete` with
  the cascade counts for a project delete. The events form the chain
  `("web", "web", user)`: `deviceId "web"`, `chainWorkspaceId "web"`,
  `origin "local"` (a new origin would fail the desktop's CHECK), an empty
  `workspaceId` so each desktop files them under its own workspace. Its head
  lives in `audit_chain_heads` (server migration 0007). `audit.chain.ts` is
  a port of `audit.rs` (JCS subset, `hashOf`, `verifyChain`); the shared
  vectors `src/shared/contracts/fixtures/audit/chain.json` (canonical forms,
  refusals and a web chain as `/sync/pull` returns it) are asserted by both
  `cargo test` and the server tests. Desktops with `append-only` pull the
  events unchanged and `audit::verify_chain(conn, "web", "web", user)`
  verifies them. `/sync/push` is not audited (devices push their own events)
  and refuses an `audit_event` with `deviceId "web"` (`appendRejected`,
  `reserved_chain`), so only the server extends that chain.
- Each event with an owner rides an oplog row `entity = 'audit_event'`,
  outside `oplog::SYNCED`, so it is not in the "pending changes" badge; the
  exported diagnostics carry `pendingAuditEvents` (all accounts) so a server
  that does not take them can be spotted. An event the server refuses (`appendRejected`)
  is marked and never resent; the diagnostics count it as
  `rejectedAuditEvents`. A failed push of events is logged and never fails the
  sync. A pull stores events without checking their hash: `verify_chain` does.
- **A copy of the database forks nothing:** a database recovered with the
  recovery key gets a new `device_id`, so its events start a new chain. A
  `.bak` copied back by hand keeps the old one (AUD-01c).
- **Growth.** Every audited change writes two oplog rows (the entity's and its
  event's) and an event with the changed values; a planner reorder writes one
  event per moved card. Nothing is compacted yet: synced oplog rows are kept
  until SYNC-10, and the audit log is never purged in 0.x (ADR-0015).

## Design system — "Faro Nocturno" (spec §12.1)

- No hardcoded colors. All colors come from CSS custom properties in
  `src/shared/theme/tokens.css` (light default + `[data-theme="dark"]`). A test
  (`src/design-tokens.test.ts`) fails the build if any other file hardcodes a
  color. This keeps additional themes swappable later.
- Typography: **Inter** (UI/titles) + **JetBrains Mono** (code/Gherkin/IDs),
  self-hosted via `@fontsource` (OFL, no font CDN — the app is offline).
- Icons: **Lucide** (`lucide-react`, ISC), imported one by one (ADR-0028).
  No Unicode glyphs, CSS masks or inline SVG icons in new code.
- Logo: `@shared/ui/Logo` (`size`, `surface="light" | "navy"`): the full mark
  from 28 px, the compact one below. The favicon (`index.html`) and the native
  icons (`src-tauri/icons/README.md`) are generated from it.
- Type scale and text wrapping (SPEC §3) in `src/shared/theme/typography.css`:
  `.screen-root` (the shell's `<main>`) sets `container-type: inline-size`
  (so `cqi` works), `hyphens: auto` in the `<html lang>` language (kept in
  sync by i18n), `overflow-wrap` and `text-wrap`. Classes `.t-page-title`,
  `.t-card-title`, `.t-group-label`, `.t-kpi`, `.t-id`, `.u-num`
  (tabular numbers) and `.u-truncate` / `TruncatedText` for emails, paths and
  IDs that must never break.
- Motion (SPEC §9): 120–220 ms. Under `prefers-reduced-motion: reduce`,
  `base.css` removes all movement and keeps only ≤ 100 ms opacity fades.

## App shell and navigation (redesign, ADR-0028/0029)

- **Views by container width** (SPEC §2, amended 2026-10-30 by
  `docs/rediseno/cambios/CAMBIO-vista-adaptativa.md`): < 600 px mobile,
  600–1279 px tablet, ≥ 1280 px desktop.
  - The width is the app root's, not the window's. `ViewportProvider`
    (`@shared/ui/ViewportProvider`, above the routes in `main.tsx`, so the
    sign-in screen gets it too) wraps the app in `.viewport-root`.
  - It measures that container synchronously before the first paint, so
    nothing flashes. Then a `ResizeObserver` provides the band through
    `useBreakpoint`, re-rendering only when the band changes and
    disconnecting on unmount.
  - CSS keys on the root's `data-viewport` attribute or on `@container`
    (the root is `container-type: inline-size`; the top bar is its own
    `topbar` container). No window media queries for layout.
  - Only structural differences read the hook (sidebar or bottom bar,
    dropdown or bottom sheet).
  - Tests: `@test/viewport` mocks `ResizeObserver` (`setViewportWidth`,
    `resizeViewport`).
- **Layout** (`src/app/layout/AppShell.tsx`): full window height; the
  navigation stays put and only `<main>` scrolls. Content is centred, up to
  1600 px wide.
  - **Desktop:** `Sidebar` is 248 px, navy 900, and collapses to the 84 px
    strip. The choice is kept in `localStorage` (`pharos.sidebar.collapsed`).
  - **Tablet:** always the strip.
  - **Mobile:** a 56 px navy `MobileTopbar` and a `BottomNav` (Inicio,
    Proyectos, Admin, Perfil).
- **Navigation model:** `src/app/navConfig.ts`.
  - The sidebar shows Inicio and Proyectos, then Administración under
    «Configuración».
  - Plantillas and Motor de IA are tabs of Administración (ADR-0031):
    `/templates` and `/ai` redirect to `/admin?tab=…`.
- **Data router** (RED-V3k, ADR-0028 §9): `main.tsx` creates a
  `createHashRouter` with one splat route that renders `App`, which keeps
  its own `<Routes>` unchanged; `RouterProvider` comes from
  `react-router/dom`. The route's `ErrorBoundary` is `RethrowRouteError`
  (`@shared/ui/RethrowRouteError`), so a crash in the shell still reaches
  `ErrorBoundary variant="app"` around the router (logged, «Exportar
  diagnóstico») instead of React Router's default screen.
  - `useUnsavedChangesGuard(dirty, message | { message, ignore })`
    (`@shared/ui/useUnsavedChangesGuard`) uses `useBlocker` for every
    address change (links, sidebar, pills, `navigate`/`setSearchParams`,
    the system/Android «Atrás») and shows the destructive `ConfirmDialog`
    «Descartar cambios» / «Seguir editando»; it also sets `beforeunload`
    while dirty. `ignore: true` lets query-string-only changes through (or
    pass a predicate, evaluated per path or query change, never for hash-only
    changes; keep it stable, module level or `useCallback`); by default they
    ask.
  - `bypass(go)` lets the next location change through, sync or after an
    `await` (`navigate(-1)` included), for a navigation the screen starts on
    purpose while still dirty (e.g. right after saving). If `go` throws or
    rejects (a failed save) the guard stays armed. Another location change
    during the `await` ends the bypass early.
  - **One per screen:** React Router keeps one blocker per router (the last
    registered wins), so only the component that owns the form calls it; a
    second mounted guard warns in development.
  - Tests render under the same kind of router (`createMemoryRouter` in
    `@test/TestRouter`, used by `renderWithProviders`; with
    `RouterProvider` from `react-router`, because under Vitest
    `react-router/dom` loads a second copy of the router).
- **Administración** (RED-V4, ADR-0031): `AdminPage` reads the tab from
  `?tab=` (`adminTabFrom`, Motor de IA by default) and renders one panel.
  - `AdminTabs`: one `tablist` grouped Recursos · Aplicación · Cuenta y
    datos · Soporte, roving tabindex across groups, a strip that scrolls
    sideways.
  - Panels: `AiEngineTab` (`@modules/ai`), `TemplatesTab`
    (`@modules/templates`), and `GeneralTab`, `SyncTab`, `SecurityTab`
    (reuses `RecoveryKeySection` from `@modules/profile`), `DiagnosticsTab`
    in `modules/admin/ui/tabs/`.
  - Unsaved drafts (Motor de IA, General) report `dirty` to `AdminPage`:
    switching tabs asks with its own confirm; leaving `/admin` or closing
    the window goes through `useUnsavedChangesGuard(dirty, { ignore: true })`.
  - `SyncTab` reads the shell's `SyncStatusProvider` through
    `useSyncStatus()` (`@modules/sync-offline`); it never mounts another
    provider.
  - Shared look: `adm-*` classes in `Admin.css` (cards, rows, fields,
    buttons); choices, switches and state pills are the shared
    `SegmentedControl`, `Switch` and `StatusPill`.
- **AI parameters** (ADR-0031): `ai/model/capabilities.ts` is the one table of
  what each provider/model accepts (`capabilitiesFor`, `sendsTemperature`).
  The Motor de IA tab draws its controls from it and `aiApi` decides from it
  whether `temperature` is sent; Rust takes `temperature: Option<f32>`.
  Reasoning is listed with `sent: false` (locked, "coming soon").
- **Theme preference:** `ThemeProvider` keeps `preference`
  (`light | dark | system`, stored in `pharos.theme`) and the resolved
  `theme`; «system» follows `prefers-color-scheme` live. The topbar's
  moon/sun sets an explicit mode.
- **Project routes** (ADR-0029): `/projects/:projectId/:section`, built with
  `projectPath()`. `useActiveProject` (`useMatch`) feeds:
  - the «Proyecto activo» sidebar group (switcher + 5 sections). Inside a
    project only the section is marked current; «Proyectos» is not (it stays
    current in the mobile bottom bar);
  - the breadcrumbs;
  - the mobile header (back + section + project) and the section pills.
- **Project header** (RED-V2, `@modules/projects`): `ProjectDetail` wraps
  every section in `ProjectHeaderLayout`, which draws `ProjectHeader`:
  - prefix badge, name (`h1`, cut with «…», with a `title` only when it is
    cut), plan status (the shared `StatusPill`; no pill while the status is
    still unknown, so «Sin plan» never flashes) and a meta line (cases,
    requirements);
  - the facts reload when the section changes, after a sync and after the plan
    is saved (`PLAN_SAVED_EVENT` from `@modules/test-plan`); only the newest
    answer is kept and a failed load keeps the last one. The requirements it
    loads are also the cases section's options.

  Section pages draw no header of their own. To put buttons on its right they
  call `useHeaderActions(<…/>)` (`@shared/ui/headerActions`: the section
  modules cannot import `projects`, which composes them):
  - each caller registers with its own token, the last one wins, and a
    caller's cleanup only clears its own node (going from section A to B never
    wipes B's buttons);
  - cost: every render of the calling page hands over a new node and the
    header renders again; the page itself does not, because it is the
    provider's `children` (it re-renders only for its own reasons or when
    `ProjectDetail` does). Keep the node small, and never call the hook from
    inside the header;
  - `.header-action` (shared, `headerActions.css`) is the 40 px secondary
    button (44 px on mobile).

  On mobile the shell's top bar already names the project: the card is not
  drawn and the `h1` stays `.sr-only`. With actions they show as a row (the
  buttons share the width; `data-natural` keeps its own); without them nothing
  else is drawn, so there is no empty row.

  `/projects?open=<id>` redirects there.
- **Top bar** (`Topbar`, 64 px):
  - breadcrumbs;
  - the offline badge;
  - search (Ctrl K / ⌘K);
  - notifications;
  - the light/dark quick switch (`data-testid="theme-toggle"`).

  Search and notifications open "coming soon" panels until RED-W1/W2.
- **Sync status:**
  - `SyncStatusProvider` (in `AppShell`, mounted once) holds the sync state
    and the background work: refresh, auto-sync, purge and the conflict panel.
  - `SyncIndicator` only shows it:
    - `full` in the sidebar foot, above the user, and in the mobile user
      sheet;
    - `compact` (a dot that syncs on click) in the strip.
  - Moving it between layouts never runs the work twice.
  - The web-only `LegacyUnsentNotice` is a strip above the content.
- **User menu** (`UserMenu`): Mi perfil, Administración, Idioma and Cerrar
  sesión (`data-testid="user-menu-trigger"`).
  - It opens up from the sidebar foot and to the right from the strip.
  - On mobile it is a bottom sheet that also holds the theme switch and the
    sync status.
  - Menus focus their first item once they are visible (a hidden panel
    cannot take the focus). The project switcher focuses its search field;
    Tab and ↓ enter the list, and Shift+Tab returns.
- **Collapse/expand:** the texts fade out (100 ms) before the width closes and
  fade in after it opens (`data-phase` on the sidebar); immediate under
  reduced motion.
- **Shared primitives** (`src/shared/ui`, SPEC §6/§10):
  - `Popover` + `usePopover` (`popoverPosition.ts`):
    - rendered in a portal with `position: fixed`;
    - trigger and panel carry `data-pop`;
    - closes on a click outside, a scroll outside and Escape (the focus returns
      to the trigger);
    - flips up when it does not fit below;
    - `max-height` is the visible room (at least 120 px);
    - shifts inwards with an 8 px margin;
    - only one is open at a time;
    - measured while transparent (not `visibility: hidden`, which would
      refuse the focus); the focus moves in once it is placed (a `dialog`
      popover focuses itself), and returns to the trigger after a choice, Tab
      or Escape;
    - re-measured when its content changes size;
    - above dialogs (z-index 110 vs 100).
  - Ctrl K / ⌘K opens search unless a dialog (`aria-modal`) is open or the
    key was already handled.
  - `Menu` / `MenuItem` / `MenuLabel` / `MenuSeparator`: `role="menu"`,
    arrows, Home and End.
  - `BottomSheet` (on top of `Dialog`): handle, title, ✕ and ≥ 46 px options.
  - `ResponsiveMenu`: a `Menu` from 600 px, a `BottomSheet` below, with the
    same items.
  - `ConfirmDialog variant="destructive"` closes only with «Cancelar» (not
    Escape or the backdrop). `confirmText` keeps the confirm button disabled
    until that text is typed.
  - `SortMenu` (RED-V2): «Orden: <opción>» trigger and a `ResponsiveMenu` with
    the sort keys as radio options (disabled ones keep a `title` with the
    reason) in a «Ordenar por» group, and the direction (Descendente ·
    Ascendente), which is also part of the trigger's accessible name. Choosing a
    key keeps the direction and vice versa.
  - `MenuItem description`: a second line that explains the option (its
    accessible description, not its name). `MenuCheckItem`: a
    `menuitemcheckbox` (a pressed toggle in a sheet) that keeps the menu open,
    for multi-choice filters.
  - `SortMenu` (RED-V2): «Orden: <opción>» trigger and a `ResponsiveMenu` with
    the sort keys as radio options (disabled ones keep a `title` with the
    reason) and the direction (Descendente · Ascendente). Choosing a key keeps
    the direction and vice versa.
- **Tables and filters** (`src/shared/ui`, SPEC §4/§8, RED-V3; also used by
  Proyectos, RED-V2):
  - `DataTable`: a semantic `<table>` laid out as a CSS grid (every row shares
    the column tracks given as `width`). Optional multi-selection (header
    checkbox with «indeterminate»), sortable headers (`aria-sort`; the parent
    sorts), columns hidden below a view (`minView`) and, on mobile, a list of
    cards (`mobileCard`). A row is never a link as a whole: its primary cell
    holds the link or button, so it does not fight the checkbox.
  - `Pagination`: «Mostrando 1–10 de 240», ‹ 1 2 3 … 24 › (`pageWindow`,
    `pageWindow.ts`), an optional «Por página» menu (`pageSizes`), and
    ‹ Página N de M › on mobile.
  - `FilterChips`: one-of-N quick filters with counts (`aria-pressed`); an
    option can be disabled with a `title` that says why («Próximamente»).
  - `FilterMenuButton`: «Prioridad ▾» opening `MenuCheckItem`s (a sheet on
    mobile) with a count and «Limpiar filtro»; disabled, it stays focusable
    (`aria-disabled`) with its reason as tooltip.
  - `StatusPill` (`tone`, `dot`, `strike`) and `PriorityFlag` (`tone`,
    `label`, `showLabel`) only know tones; each module maps its own states and
    priorities to them.
  - Their texts live in the `table.*` i18n namespace.
  - `buttons.css` (`ui-btn`, `--primary` amber once per view, `--small`,
    `--ghost`, `--danger`, `ui-iconbtn`) and `.ui-search` (in
    `filters.css`): the action buttons and list search field the screens
    share, so no module styles itself with another module's CSS.
    **Known duplicate:** `.header-action` (`@shared/ui/headerActions.css`, V2)
    draws the same secondary button as `.ui-btn`; ROADMAP RED-V3c unifies
    them.
- **Shell slots** (RED-V3, amendment to ADR-0028): a screen may ask things of
  the shell around it without importing `src/app`. `ShellChromeProvider`
  (`@shared/ui/ShellChrome`, provided once by `AppShell`) and
  `useHideMobileChrome(active)` (`@shared/ui/useShellChrome`) hide the
  mobile top bar, section pills and bottom bar while Gherkin is edited
  full screen (SPEC §7/§8). The project header and its
  actions are V2's slot (`ProjectHeader`; sections add buttons with
  `useHeaderActions`, `@shared/ui/headerActions`).
- **Casos (RED-V3):** `TestCasesPage` owns the filters, order and page
  (`model/caseList.ts`, pure) and keeps the open case in `?case=`
  (`caseLink`), so the editor walks the same ordered list and «Atrás» works.
  The editor keeps a snapshot of the loaded form to tell «Guardado» from
  «Cambios sin guardar» and asks before leaving with changes.
- **Cross-module read APIs** used by other screens (each additive, with a
  test):
  - `projectDefects(projectId, userId)` (`@modules/defects`): the live
    defects of a project with their `caseIds`, for the matrix and Inicio;
  - `projectCardCount(projectId, ownerId)` (`@modules/planner`): how many
    cards a board has (Proyectos);
  - `projectCoverage(projectId, ownerId)` (`@modules/traceability`): the
    share of covered requirements by the matrix rule, `null` without
    requirements (Proyectos);
  - `caseLink(projectId, caseId)` (`@modules/test-cases`): the Casos route
    with `?case=`. It repeats the shape of `projectPath(id, "cases")`
    because projects depends on test-cases, not the other way.
- **Trazabilidad (RED-V3):** `TraceabilityPage` loads requirements, cases and
  defects once for both views (Requisitos, Matriz) and owns their dialogs; the
  views only render (`buildMatrix` stays the single source, also for
  `projectCoverage`).
- **Switches, segmented controls and tabs** (`src/shared/ui`, SPEC §4/§5/§9/§10,
  RED-V1; also used by Casos, RED-V3, and Administración, RED-V4):
  - `Switch`: a `role="switch"` button named by its visible `label` (or
    `ariaLabel`); the knob slides in 150 ms and moves without sliding
    with reduced motion; disabled, it keeps its reason in a `title`. It cannot live inside
    a `role="menu"`: there, draw it on a `MenuItem`.
  - `SegmentedControl<T>`: one choice out of a few as a pill track. A
    `radiogroup` with a roving tabindex: Tab enters on the selected option,
    arrows/Home/End move and select and skip disabled options (a disabled
    option's `title` is also its `aria-describedby`); per option `icon`,
    `disabled` and `title`; `size` sm/md/lg (md and lg are 44 px
    tall on mobile).
  - `Tabs`: the WAI-ARIA tabs pattern with automatic activation, `variant`
    `segmented` (equal pills, e.g. the mobile Home) or `underline` (a strip
    above a list), count bubbles (`badge` with tone `danger`, `navy` or
    `muted`; read once, through its `title` or as «(N)»), and disabled tabs
    (`aria-disabled`: still focusable with the arrows, never selected, so their
    reason is heard). The Tab stop falls back to the first enabled tab. Panels use
    `TabPanel`, or spread `tabPanelProps(id, idPrefix)` from
    `@shared/ui/tabPanel` on your own element; `idPrefix` keeps two tab sets
    on one page apart.
  - Styles in `controls.css`; no i18n of their own (callers pass the texts).
- **Read-only exports for the Home** (RED-V1; no writes):
  - `projectPlanClosure(projectId, userId)` (`@modules/test-plan`) →
    `{ closeDate, criteria } | null`: the latest sprint end or milestone of the
    plan's schedule (only ISO `YYYY-MM-DD` dates count; raw text from an
    imported plan is ignored; null without one) and its filled closure
    criteria; null without a plan. V2 reuses it for «Cierre del ciclo».
  - `projectLiveCases(projectId, userId)` (`@modules/test-cases`): the cases
    that are not obsolete.
- WCAG 2.1 AA by tokens (ADR-0027): semantic hues fill and border; text uses
  their `--color-*-text` tone. Field boundaries use `--color-border-input`
  (≥ 3:1). Focus is `--color-focus` (navy on light, amber
  on dark and on the navy sidebar). `src/shared/theme/contrast.test.ts` reads
  `tokens.css` and fails the build if a text/background pair drops under
  4.5:1 or the focus under 3:1, in either theme.

## Accessibility and form validation (UX-05, UX-01, ADR-0027)

- **Dialogs:** every modal is a `Dialog` (`@shared/ui/Dialog`): focus moves
  in and returns to the opener, Tab stays inside, Escape and the backdrop close
  it unless it is not `dismissable` (while saving, an export in progress, the
  recovery key on screen). Nested dialogs: only the innermost (deepest in the
  React tree) handles keys. Dialogs are portaled to `<body>`, so a bar or
  container that opens one never clips or styles it; `<html data-viewport>`
  keeps view-specific styles working.
  The opener is read on the first render (an `autoFocus` child would
  otherwise pose as it). A form passes `confirmClose`, so Escape and the
  backdrop ask before discarding typed changes.
- **Shell:** a skip link is the first Tab stop and jumps to
  `<main id="main-content">`; the sidebar (or the mobile bottom bar) is the
  "Main navigation" landmark and the breadcrumbs another `nav`. Icon-only
  buttons have `aria-label` and `title`; menus move with the arrow keys.
- **Forms:** rules are pure functions in `@shared/validation` returning an
  `Issue` (`code`, `severity`). `FormField` / `FieldMessage` render them with
  `aria-invalid` (errors only) and `aria-describedby`. `ListField`,
  `PairListField`, `CheckboxGroup` and `SortableSteps` require a `label` that
  names the group and each row, and warn about repeated rows (not
  `SortableSteps`: a repeated step is a normal test). A `required` error
  shows on the field after the first save attempt.
- **Draft rule:** an `error` (data integrity: a blank title or template name,
  an invalid or repeated requirement key, case-ID digits or retention out of
  range) blocks saving; `useSaveGuard` then shows an `ErrorSummary` that takes
  the focus. Save is never disabled by validation. Anything else is a
  `warning`: it saves and the save toast counts it.
- **Keyboard:** steps and planner cards move with the dnd-kit keyboard
  sensor (Space, arrows, Space; announced in es/en). A planner card takes the
  mouse drag itself and the keyboard drag on its ⠿ handle, so it holds no
  nested controls. The Gherkin editor keeps Tab for indentation and says how
  to leave it (Escape, then Tab). When a dialog's opener is gone after it
  closes, the focus goes to `#main-content`.

## Internationalization (spec §11)

`i18next` + `react-i18next`, one JSON per language (`es` default, `en`). No
hardcoded UI strings. Adding a language = adding a file.

## Conventions (spec §15)

- Code/comments/commits in English; UI text only in i18n files.
- Ubiquitous language enforced via `docs/GLOSARIO.md`.
- Dependencies: permissive licenses only (MIT/Apache-2.0/BSD/ISC/OFL).
  **GPL/AGPL forbidden**, checked by `scripts/check-licenses.mjs`.

## Observability (BASE-08, ADR-0022)

Local only — nothing is sent anywhere.

- **Logs (Rust, `src-tauri/src/diag.rs`):** `tracing` with JSON lines in a
  daily rotating file, `pharos.YYYY-MM-DD.log` (7 kept), under the app log dir
  (`%LOCALAPPDATA%\com.pharos.desktop\logs`). The filter is `info`, or the
  `EnvFilter` directive in `PHAROS_LOG`. `log` records from Tauri/wry are
  bridged in and debug builds also log to stderr. A panic is also appended
  synchronously to `pharos.panic.log`, since the non-blocking writer may not
  flush before the process ends. Without a resolvable or writable log dir the
  app runs without a log file. Today the Rust side logs startup (version, OS,
  WebView2), how long the database took to open or why it failed, the
  diagnostic export and frontend errors; each track adds logging to its own
  modules under the content rule below (ADR-0022).
- **Content rule:** a log line never interpolates user content — only ids,
  command names, counts and error kinds. Text from outside that rule
  (frontend errors, error strings) goes through `redact` (emails, tokens, API
  keys, `key=value` secrets, long opaque strings except UUIDs, the Windows
  user name in paths). Redaction is a safety net: free text such as a name in
  a provider error is not detected, so the content rule comes first.
- **Frontend (`@shared/diagnostics`):** uncaught errors, unhandled rejections
  and errors caught by `ErrorBoundary` go to the desktop log through the
  `diag_log` command (in the web preview, to an in-memory buffer). Only an
  `Error`'s name, message and stack are kept; for any other thrown or
  rejected value only its type. `diag_log` writes at most 20 messages per
  10 s, so an error loop cannot grow the log without bound. Two
  boundaries: one around the whole app (`main.tsx`) and one per page inside
  the shell, reset on navigation.
- **Diagnostic bundle:** `diag_export` builds it and the frontend zips it
  (`diagnostic.json` + `logs/`). It carries the app version (the single
  version source), build profile, Tauri, OS, WebView2, UI language and theme,
  applied migrations and the last 2,000 lines (read from at most the last
  1 MiB) of the 3 newest logs, redacted again. It works without a database:
  when the local database failed to open, the bundle carries no migrations and
  a redacted `openError` instead. It never carries the database or its key,
  keychain entries, the profile, entity content, settings or environment
  variables. The test `diag::tests::bundle_excludes_user_data` and the E2E
  spec `e2e/specs/diagnostics.e2e.ts` (which clicks the button and opens the
  saved ZIP) enforce it.
- **Version in the UI (UX-07):** `APP_VERSION` (`@shared/version`, read from
  the root `package.json`) at the foot of the sidebar and in Administration.

## Exports and the download folder (UX-02, EXP-02)

Every file the app hands to the user (plan and case `.xlsx`/`.pdf`,
`.feature` files, project ZIPs, the matrix, templates and the diagnostic
bundle) goes through `saveFile` (`@shared/export/saveFile`). Planner attachments
go through `saveVia` with the same toasts: Rust streams them from the evidence
store into the same folder (`planner_attachment_save`, `Downloads::save_with`).

- **Desktop:** the bytes travel as a raw IPC body to `download_save`
  (`src-tauri/src/downloads.rs`), with the name in the `x-pharos-filename`
  header. Rust (an `async` command, off the main thread) writes the file into
  the download folder: the one chosen in Administration, or the OS Downloads
  folder. When the chosen one is missing or cannot be written, the file goes to
  Downloads and the result says `fallback`. The name is reduced to one safe
  component (a long one is cut in the stem, keeping the extension). The final
  name is reserved with `create_new` (`name (2).ext`…), so an existing file is
  never overwritten, even by concurrent saves. The content goes to a unique
  temp file, is fsynced and renamed over the reservation. The full path comes
  back for the confirmation message. Planner attachments
  (`x-pharos-untrusted: 1`) get Mark-of-the-Web (`Zone.Identifier`).
- **Errors are never silent:** `saveFile` and `savePdf` show a toast through
  `notify` (`@shared/ui/notify`, a window event the `ToastProvider` listens
  to) for a fallback or a failure, and a failure rejects with `ReportedError`,
  which callers skip with `unlessReported`. `pdfBytes` rejects instead of
  hanging when pdfmake fails asynchronously or exceeds 60 s.
- **Choosing the folder:** only the native picker (`download_dir_pick`, the
  `rfd` crate called from Rust, modal to the main window) can set it, so the
  webview can never name a path; the capability keeps `core:default` only, with
  no dialog or fs permission. It is stored in `downloads.json` under the
  instance's config dir (an E2E profile gets its own, see `instance.rs`). The
  picker is Windows-only (the shipped target); elsewhere it reports that it is
  not available and files go to Downloads. The folder is per installation and
  Windows account, not per Pharos user ([ADR-0025](adr/0025-carpeta-descarga-y-ultimo-acceso.md)).
- **Web preview:** no Rust side, so `saveFile` falls back to the browser's
  own download.
- **ZIPs (spec §5.4):** the project ZIP and the global ZIP carry, per project,
  the plan and every case as `.xlsx` **and** `.pdf`. `projects` builds them
  from `projectPlanFiles` (`test-plan`) and `projectCaseFiles` (`test-cases`);
  a PDF that cannot be rendered is left out and reported (`skipped`).

## Testing

The QA tool tests itself at four levels:

- **Client:** Vitest + React Testing Library + jsdom (`npm run verify` also runs
  typecheck, lint with 0 warnings and the license check). Includes the
  no-hardcoded-color guard and a test that filters an exported `.feature` with
  the real Cucumber tag-expression engine.
- **Rust core:** `cargo test` in `src-tauri/` (repositories, encryption,
  atomic persistence, HLC, sync merge). It runs again since the switch to MSVC.
- **Contracts (BASE-05, [ADR-0026](adr/0026-contratos-generados.md)):** the
  Rust types that cross the Tauri boundary and the sync wire derive
  `ts_rs::TS` in tests only, so `cargo test` writes their TS form to
  `src/shared/contracts/generated/` (`i64` as `number`, `Value` as
  `unknown`, inputs with optional fields). The hand-written models stay; each
  `model/types.ts` (and `server/src/modules/sync/sync.contracts.ts`) asserts
  `Covers<Producer, Consumer>` against them, so `tsc` fails when a field is
  renamed, dropped or retyped. The CI job `rust` empties the folder, runs
  `cargo test` and fails if the result differs from the commit
  (`scripts/contracts.mjs`). Shared sync fixtures
  (`src/shared/contracts/fixtures/sync/`): `hlc.json` runs against `hlc.rs`,
  `sync.hlc.ts` and `hlc.ts`; `documents.json` is stored and read back by
  the desktop and matched by what the web API writes.
- **Backend:** Vitest against a real Postgres database (`pharos_test_db`).
- **Accessibility (UX-05):** axe-core (`src/test/axe.ts`) in one
  `a11y.test.tsx` per module: every dialog, every step of the plan wizard, the
  case editor, admin and the shared form parts, plus direct assertions for
  what axe cannot see (focus order and return, Escape, summary focus, row
  names). jsdom has no layout, so contrast is the token test's job there.
  `e2e/specs/a11y.e2e.ts` runs axe, contrast included, on the real binary in
  both themes. The manual keyboard and screen-reader pass is in
  `docs/accesibilidad/auditoria-wcag-0.1.0.md`.
- **Repository gates** (`scripts/*.mjs`, tested with `node:test`): migration
  numbering, npm audit with expiring exceptions, and `cargo fmt`/clippy with exact
  exceptions.
- **Desktop E2E (BASE-14):** a smoke of the real debug binary with
  WebdriverIO → `tauri-driver` → `msedgedriver` → WebView2 (`e2e/`): start,
  sign in with the seeded test account, create a project, restart, and the
  project and the session are still there. Each run uses an isolated
  instance: `PHAROS_E2E_PROFILE` (honoured only by debug builds,
  `src-tauri/src/instance.rs`) moves the data dir, log dir and every keychain
  account (`instance::account`: the session and the AI keys; only the local
  database key in `db.rs` is shared), and the run deletes its
  credentials at the end. `WEBVIEW2_USER_DATA_FOLDER` moves the WebView2
  storage. Each spec starts signed out and, at the end, deletes every `E2E …`
  project on the test account, syncs and signs out.

Coverage (BASE-13) is a report, not a gate: `npm run coverage`
(`@vitest/coverage-v8`) and `npm run coverage:rust` (`cargo llvm-cov`, works
with MSVC), both into `coverage/`. CI publishes the frontend report on every PR
(job summary and artifact of the `client` job); the Rust report stays local.

The client, Rust core, backend and repository-gate suites run in GitHub Actions
on every PR and push to `main` (`.github/workflows/ci.yml`). The same pipeline
also runs `cargo deny` (RustSec, licenses) and `zizmor` on the workflows, and
the Windows installer is built as a CI artifact (`installer.yml`). The desktop
E2E smoke runs in the `e2e` job (BASE-14) and the frontend coverage report in
`client` (BASE-13). Policy: [ADR-0021](adr/0021-ci-y-cadena-de-suministro.md).

## Backend (Phase 1+)

`server/` is a Fastify + TypeScript app (run via `tsx`) backed by PostgreSQL —
either a native service or the `db` container of the root `docker-compose.yml`
(`postgres:15-alpine`). Layered per domain module (routes → service/merge →
repository), with a minimal forward-only SQL migration runner (`db/migrate.ts` +
`migrations/`) that the server also runs on start. A migration may have a
TypeScript data step (`DATA_STEPS` in `migrate.ts`, the twin of the desktop's
`RUST_STEPS`), run right after its SQL in the same transaction: if it throws,
the SQL is rolled back and the migration is not recorded. The first is
`0010_defects.sql` → `convertPlannerDefects` (DEF-01: UUIDv5 needs SHA-1, which
core Postgres lacks). Modules:

- `auth` — accounts and sessions (below).
- `sync` — per-user document store for the oplog: `POST /sync/push` (one
  batch of up to 500 deltas; last-write-wins by HLC; rejects a desktop delta
  whose base revision the server no longer holds and returns its own version as
  a conflict; a project delete also tombstones its plans, cases, requirements
  and planner cards; refuses an upsert whose key another live document of the
  project has, in `keyConflicts`), `GET /sync/pull?since=<seq>` (pages of up
  to 500 with `hasMore`) and `POST /sync/key-blocks` (blocks of 50 key numbers
  per project and kind, DAT-01). Every sync request must carry
  `x-pharos-version`; the server serves its own MINOR and the previous one and
  answers others with 426 (ADR-0020). Inside one minor the
  `x-pharos-sync-features` header tells builds apart (`key-conflicts`,
  `append-only`, `complete-payload`, `stable-steps`, `runs`, `custom-fields`,
  `cycles`, `defects`). Configurations, test cycles and their items (CYC-01)
  only reach clients that send `cycles`, and only those may push them (else
  400 `cycles_unsupported`); `cycleKey` is a key like the others (migration
  0009 rebuilds `documents_key_idx` with it). Without `defects` (DEF-01) a
  client neither pulls defects, their links nor the converted defect cards,
  and its push that touches one is refused with 400 `defects_unsupported`;
  migration 0010 rebuilds the key index with `defectKey` too. A
  test_case upsert from a client without `custom-fields` keeps the stored
  `caseType`, `automationStatus` (`FEATURE_KEYS`) and `data.custom`
  (`FEATURE_DATA_KEYS`); read-only clients pull the first two in
  `data.__caseFields` (FLD-01). A push from a client
  without `stable-steps` (0.1.x, 0.2.0-alpha.1) is refused with 426
  `read_only_client_version` before anything is stored, and its pulls carry
  test cases with text steps (`flattenCaseData`), the stable lists kept in
  `data.__stableSteps` so their upgrade restores the same ids and hash: older
  clients may only read (VERSIONING §6.5, DAT-02). Two sync classes (design 0.2.0 §3.2): `lww` (the above) and
  `append_only` (`APPEND_ONLY_ENTITIES` in `sync.schemas.ts`, today
  `audit_event`, `test_case_revision`, `run_shard` and `result`; for the last
  three `createdAt`/`importedAt`, `createdBy`/`importedBy` and `hlc` are
  outside the compared content): op `append`, inserted if absent, the same content again is a
  no-op, other content under the same id is refused in `appendRejected`
  (`content_changed`) and the stored one stays, and an `audit_event` that claims
  `deviceId "web"` is refused too (`reserved_chain`: only the server writes the
  web chain, AUD-01b); only the location keys (`workspaceId`, `projectId`) may
  change; never a conflict. A project delete tombstones shards and results
  (with runs, run items and mappings), not revisions or audit events
  (SYNC-11); a shard or result first pushed after its project was deleted is
  stored as a tombstone. The execution entities only reach clients that send `runs`, and
  only those may push them (else 400 `runs_unsupported`); a requirement upsert
  from a client without `runs` keeps `riskLikelihood`/`riskImpact`
  (`FEATURE_KEYS`) even with `complete-payload`. The server validates their
  shape (`EXECUTION_PAYLOADS`); it does not interpret them. Only a client
  that sends `append-only` may push them, pulls them and gets `features` in the
  answers; older clients get exactly the previous answers. An upsert from a
  client that does not send `complete-payload` (0.1.x, 0.2.0-alpha.1) keeps
  every payload key it left out, and `data` keys one level deep (`storeDoc`,
  VERSIONING §6.5), so it never resets a field it does not know. Current
  clients and the web's domain writes are stored as sent: they may clear a key
  by leaving it out (sending `null` stays the recommended practice). Tombstones are never removed; at start
  and then daily (`server.ts`) the payload of those older than
  `SYNC_TOMBSTONE_DAYS` is cleared (SYNC-06). See `src/modules/sync-offline/README.md`.
- `domain` — the web's domain API (BASE-10, ADR-0004): `/api/projects`,
  `/api/test-plans`, `/api/test-cases`, `/api/requirements` (+ `/import`),
  `/api/planner-cards` (+ `/reorder`; a `defect` card is refused with
  `defect_moved`), `/api/custom-fields` (+ `/reorder`, `/copy`,
  `/:id/archive`; FLD-01), `/api/configurations` and `/api/cycles` (items,
  filter, clone, progress, runs; CYC-01, `domain/cycles.ts`; runs are not
  created on the web), and `/api/defects` (+ `/:id/transition`,
  `/:id/links`; DEF-01, `domain/defects.ts`). `domain.service.ts` applies the
  desktop core's rules (defaults, immutable keys, keys never reused,
  positions per column, upsert-by-key import) to the same document store, in
  one transaction under the user's sync write lock (`domain.store.ts`). Every
  write is a document with a new revision, a new `seq` and an HLC stamped by
  the server's clock (`sync.hlc.ts`, device id `server`, always newer than the
  version it replaces), so devices pull it like any other change and a
  project delete cascades as on `/sync/push`. Payloads have exactly the shape
  the desktop pushes (`sync.rs::read_payload`). Updates and deletes name the
  revision the client read; a newer one answers 409 `stale_write` with the
  current version, a deleted one 409 `deleted_elsewhere`. Timestamps use the
  desktop's form, `YYYY-MM-DD HH:MM:SS` in UTC (older ISO ones are read
  alike), and ties within a second sort by write order (`seq`). The shared
  documents fixture asserts the form on both sides. Same auth and version check (426) as `/sync/*`.
  `PATCH /auth/me` changes the account's names (not its role).

Auth: registration/login with **Argon2id** (`@node-rs/argon2`), a short-lived
**JWT access token** (`jose`) plus an opaque **refresh token** stored hashed
with rotation + revocation. The desktop client caches the session in the OS
keychain (Windows Credential Manager via a Tauri `keyring` command) and reopens
offline from that cache (spec §4). The session and AI-key commands go through
`src-tauri/src/keychain.rs` (`read` / `write` / `delete`; a missing entry is
`None`, deleting it is not an error), whose tests (CORE-02) run against the
real Credential Manager. Windows caps a secret at 1280 UTF-16 code units; a
session at the server's field limits fits. The module serializes its calls
behind one lock: writes and deletes from several threads of one process make
Credential Manager lose deletes (a deleted entry comes back). Sync Tauri
commands run on the main thread, but the async AI commands (`ai_chat_online`,
`ai_list_models`) read keys from the runtime's threads. Only `db.rs` still
calls `keyring` directly, once at startup to load the database key.

Hardening (BASE-06): `config/env.ts` validates the environment at start-up.
In production it refuses a default/short JWT secret and `CORS_ORIGIN=*`.
`app.ts` sets per-route policies in one `onRoute` hook:

- a per-IP attempt limit on `/auth/login` and `/auth/register`
  (`@fastify/rate-limit`, 429 `rate_limited`);
- body limits of 1 MiB in general and 8 MiB on `/sync/*` and `/api/*` (413
  `payload_too_large`).

Fastify's own 4xx errors keep their status in the JSON error format.

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

Key recovery (SEC-03, [ADR-0024](adr/0024-clave-de-recuperacion.md)):

- **Key store.** `db.rs` reads and writes the key through a `KeyStore` trait:
  `Keychain` (account `db-key`, shared by every instance) in the app, an
  in-memory store in tests.
- **No silent new key.** A key is generated only when neither `pharos.db.enc`
  nor `pharos.db.enc.new` exists. A missing key with a saved file fails with
  `db-key-missing`; a key that does not decrypt it, or a keychain entry that is
  not a valid key, fails with `db-key-mismatch`. Both land in `DbStatus` like
  any open error. An I/O error while checking for saved files fails closed.
- **No silent wipe.** A lone `pharos.db.enc.new` the key does not decrypt is
  `db-key-mismatch` and stays on disk (AES-GCM cannot tell a torn write from
  another key); a torn `.new` is discarded only next to a `pharos.db.enc` the
  same key opens.
- **Recovery key** (`src-tauri/src/recovery.rs`): the key itself plus a 3-byte
  `SHA-256("pharos-recovery-v1" || key)` checksum, as 56 Crockford base32
  characters in 14 groups of 4. `recovery_key_export` returns it for the
  Profile dialog.
- **`db_recover`** runs only while `DbStatus` holds a key error. It decodes the
  key (`recovery-key-invalid`), decrypts the latest save before touching
  anything (`recovery-key-wrong`), opens it, keeps the replaced key once as
  `db-key.prev`, stores the new one in the keychain, `manage`s the `Db` at runtime and clears
  `DbStatus`, so the UI continues without a restart. A bad key changes no file
  and no keychain entry.
- **Never logged.** No error repeats the typed key; both redactors mask the
  recovery key shape as `<recovery-key>`.

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
  explains how it was generated. A second fixture,
  `tests/fixtures/0.2.0-alpha.1/`, is the previous published minor: it must open
  with every row unchanged, its pending changes still push, its cursor restarts
  once and its audit log starts empty. Both fixtures (plus outline, advanced
  and odd-shaped cases added to the 0.1 image) must migrate to stable step
  ids without losing a character, with one current revision row per case;
  0020–0021 are also tested after 0022–0023 (a database that took the
  evidence store first).

**Case revisions and stable steps (DAT-02, [ADR-0011](adr/0011-revision-del-caso-y-pasos-estables.md)).**
Steps are `{ id, text, expected? }` (preconditions, background, steps and
those of every flow) and Outline rows `{ id, values }`; ids are unique within
the case and never reused. `src-tauri/src/steps.rs` normalizes anything older
without loss (derived ids, the same on every device), computes the full
RFC 8785 JCS hash of a revision and its UUIDv5 id; the server has the same code
(`stable-steps.ts`) and both check `tests/fixtures/stable-steps-vectors.json`.
Every state a case reaches has one immutable row in `test_case_revisions`
(`src-tauri/src/revisions.rs`, `ensure_current`), synced as the append-only
`test_case_revision`. Migration 0020 rebuilds that table without its foreign
key (a pull may bring revisions before their case); 0021 runs a Rust step
(`db.rs`, `RUST_STEPS`, same savepoint as its SQL) that gives every case its
ids and its current revision. A save gives a new step a random id; the
editor keeps ids through edits, moves and Gherkin re-parses
(`src/modules/test-cases/model/steps.ts`). Test cases and revisions wait
until the account's server lists `stable-steps` (diagnostics:
`heldBackCases`). A case pulled flattened by a read-only build gets its ids
back from the stash on upgrade (`restore_from_stash`, or the stash of its
newest pre-0.2 history row if the old editor saved over it).
`.feature` and `.xlsx` exports are unchanged (`exportGolden.test.ts`).

**Case type, automation status and custom fields (FLD-01, [ADR-0018](adr/0018-campos-personalizados.md)).**
`test_cases.case_type` (`standard | checklist`) and `automation_status`
(`manual | to_automate | automated`) are nullable (0026): NULL = never set,
read as standard / manual, and hashed as stored, so no revision written
before them changes. Definitions live in `custom_fields` (lww entity
`custom_field`, id `UUIDv5(NS_CUSTOM_FIELD, "<project>:<entity>:<key>")`,
no UNIQUE index; key and type immutable; archived, never deleted;
`src-tauri/src/custom_fields.rs`). Values are `data.custom` of each case,
checked on a local save against the project's definitions (unknown keys,
archived fields and fields of another case type are kept as they are;
`required` is enforced by the editor only); the same validator runs on the
server and the client, checked against
`tests/fixtures/custom-field-vectors.json`. Definitions wait until the
account's server lists `custom-fields` (diagnostics: `heldBackFields`). 0027
(Rust step) restores what read-only builds kept in `data.__caseFields` and a
`custom` their old editor dropped. The client module is
`src/modules/custom-fields` (API, validator, settings card, editor section);
`test-cases` and `projects` use it, it uses neither.

**Test cycles and configurations (CYC-01, [ADR-0017](adr/0017-ciclos-y-configuraciones.md)).**
Migration 0028: `configurations` (name, `{browser, os, device, locale}`,
`match_labels`, position; archived, never deleted), `test_cycles` (`CYC-001`
keys, build, environment, dates, plan milestone and sprint as text,
`configuration_ids`, status `planned | active | closed`) and
`test_cycle_items` (case, optional flow or Outline row, assignee). No foreign
key from items to their cycle and no CHECK on the status: a pull may bring
them in any order or with a status this build does not know
(`src-tauri/src/cycles.rs`). Items are static ("add by filter" resolves
once); a case that is not approved is added and reported. A match label is
unique among the project's live configurations; when two devices created the
same one offline, `match_configuration` (the importers' hook, with
`item_for`) takes the smallest id on every device and the settings card flags
both. «Ejecutar» creates one run per live configuration through
`runs::add_items` (revisions frozen then), all or nothing; `run_create`
checks a given cycle and configuration. Progress is derived
(`cycles/progress.rs`, TS twin on the server, shared vectors
`tests/fixtures/cycle-progress-vectors.json`): per item × configuration, the
latest final result among the cycle's runs, the worst across tests, or
`not_run`. Deleting a cycle keeps its runs (their `cycle_id` may dangle after
the purge). All three are lww (`APPLIED_SET_VERSION` 5) and, with `cycle` key
blocks, wait for a server that lists `cycles` (diagnostics: `heldBackCycles`).
The client module is `src/modules/cycles` (API, «Ciclos» section of a
project, «Configuraciones» card of the settings); `projects` composes it and
passes it the cases and requirement keys, so it depends on no other domain
module. «Ejecutar» is desktop-only until runs have a web API.

**Evidence store (DAT-03, [ADR-0014](adr/0014-evidencias-cifradas-por-hash.md)).**
Attachment contents live outside the database, in `<data dir>/evidence/`
(`src-tauri/src/evidence.rs`), so saving the database never depends on their
size, and a file is never held whole in memory while it is written or read.
(The migration below reads BLOBs that are already part of the in-memory image,
and its `VACUUM` can briefly double that image.)

- **Data folder = `pharos.db.enc` + `evidence/`.** Backups, recovery and the
  "newer version" check cover both. The store is created only after the
  database decrypts and passes that check, so a wrong key or a newer database
  never touches `evidence/`.
- **Tables (0022).**
  - `blobs` (local, never synced): one row per content by plaintext `sha256`,
    with `local_state` `present | remote_only | missing | deleting`.
  - `attachments`: one use of a content (`owner_entity`/`owner_id`, `kind`,
    name, mime, size, `blob_purged_at`). Shaped as an LWW entity, but not
    registered for sync yet (step 7 or SYNC-04b).
  - `evidence_retention`: per-project overrides of the retention by kind.
- **Files.** `evidence/<2 hex>/<hmac>.pev`, with
  `hmac = HMAC-SHA256(name key, sha256)`.
  - Keys come from `db_key` by HKDF-SHA256 (`"pharos-evidence-v1"`, then the
    `"name"` and `"file"` subkeys): no keychain entry, and the recovery key
    opens them.
  - `.pev` v1: a 16-byte header (`PEV1`, version, block size, nonce prefix)
    and AES-256-GCM STREAM in 64 KiB blocks, with the header as associated
    data. Reading re-hashes the plaintext and fails on a mismatch. A version
    above 1 is `evidence-newer-than-app`.
- **Writes.** `BlobWriter` encrypts and hashes block by block into
  `evidence/tmp/<uuid>.pev.new`. `seal` writes the last block and fsyncs, off
  the database lock; `commit` renames it under the lock. It drops the new copy
  only when an intact one is already stored (expected length
  `16 + size + 16 × max(1, ⌈size / 64 KiB⌉)` and a valid header); a truncated or
  foreign copy is replaced, also when a migration resumes. `commit` reports
  whether it wrote, so a failed attach removes only a file it wrote. `tmp/` is
  emptied at open.
- **Ordering with `Db::persist`.** A file is written before the database that
  references it is saved, and removed only after the database that no longer
  references it is saved.
  - Releasing a content marks it `deleting` in the same transaction.
    `Db::persist_and_collect` saves and then, under the same lock, removes the
    files and rows of those contents and saves again: every `deleting` row it
    sees is in the image just written, and a failed save removes nothing. At
    open it finishes deletions an earlier run saved. A content referenced again
    meanwhile goes back to `present`.
  - `.pev` files no row knows are only **counted** (diagnostic bundle), never
    swept: they may belong to a database the user moved aside.
- **UI path.** Uploads go in raw 4 MiB chunks (`evidence_upload_begin`,
  `_chunk`, `_cancel`, held in the managed `Uploads`); `planner_attachment_add`
  then attaches the upload. At most 8 are open; one idle for 10 minutes (a
  webview reload mid-upload) is dropped to make room, a chunk always gets its
  slot back, and a second chunk of an upload that is being written is refused. `planner_attachment_save` decrypts straight into
  the download folder (`Downloads::save_with`, Mark-of-the-Web). The bytes
  never cross the webview as base64. Limit: 200 MB per file (`MAX_FILE_BYTES`).
- **Retention and purge.** `purge_deleted` also:
  - purges soft-deleted planner attachments past the retention;
  - runs `evidence::expire`: per-kind days (defaults in `DEFAULT_RETENTION`;
    only `run_shard` evidence can expire until step 7 brings the ADR's result
    exceptions). Expiry sets `blob_purged_at` and writes a `redact` audit event;
  - releases every content no live attachment needs.

  Deleting an attachment is a soft delete plus an immediate release. Deleting
  a card releases nothing, because the card may come back.
- **Migration (0022 → Rust → 0023).** `run_migrations_with` calls
  `evidence::migrate_planner_attachments` before 0023 drops
  `planner_attachments`. Each BLOB is read with SQLite incremental BLOB I/O,
  stored, and becomes an `attachments` row with the same id; the image is then
  vacuumed. Nothing but `.pev` files reaches disk before the final save, which
  comes after the SEC-06 backup, so a cut run repeats to the same end state:
  rows already moved are skipped and stored contents are not rewritten. Rows
  whose card is gone are dropped (the backup keeps them).
- **Never synced, never logged.** No `attachments` row reaches the oplog:
  `journal::record_event` writes the `link`/`unlink` audit event with
  `{id, name, mime, size, sha256}`. Logs carry counts and error kinds only.

Every business entity is multi-user ready (spec §3): `workspace_id` + audit
fields (`created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`,
`revision`), filled automatically by the repository.

- **Audit fields (FIX-06):** `created_by` and `updated_by` hold the signed-in
  user's id.
- **Deletes are soft, then purged (SYNC-06):** a delete sets `deleted_at`;
  `src-tauri/src/purge.rs` removes the row for good after the Administration
  retention, once the server has its tombstone (rules in
  `src/modules/sync-offline/README.md`).
- **Owner checks (FIX-08):** every command that reads or changes a test plan,
  test case, requirement or planner attachment takes the signed-in user
  (`userId`, or `ownerId` in the planner). It only touches rows of projects that
  user owns (`projects.owner_id`). A foreign or unknown id reads as nothing and
  fails to change, without writing an oplog row.
  - A plan without a project is shown to nobody: the owner comes from the
    project, and the UI only reaches a plan through its project.
  - Templates (FIX-08b): a user template belongs to the account that imported
    it (`templates.owner_id`, migration 0018) and only that account edits or
    deletes it. Built-in templates and shared legacy ones (imported before
    accounts, `owner_id` NULL) are visible to every account and read-only.
    Sync conflicts, oplog and cursor are per account since FIX-07.
  - The user id comes from the UI. This separates the accounts of one
    installation; it does not defend against a tampered frontend.
- **Human-readable keys (DAT-01, ADR-0010):** case, requirement, defect and run keys
  come from `key_counters` (`src-tauri/src/keys.rs`):
  - the counter only moves forward, so a key is never reused;
  - a case's `scenario_id` is immutable;
  - a hand-typed or imported key already used by any row, live or deleted, is
    refused (the requirement CSV import skips and reports it).
  - numbers come from blocks the server leases per project and kind
    (`key_sync.rs`), so two devices never hand out the same key; offline
    without a block the key is provisional (`ATS_?KQZD`) until the next sync;
  - live keys are unique per project (local unique indexes, migration 0017);
    a key another document already has becomes a key conflict for the user,
    never a silent rename (rules in `src/modules/sync-offline/README.md`).

The profile (`display_name`
alias + mandatory `first_name`/`last_name`) is exposed to the client through
typed Tauri commands (`profile_get`, `profile_upsert`); the web edits the
account's names on the server (`PATCH /auth/me`, BASE-10).

## Distribution (BASE-09, UX-06)

- **Installer:** `npm run build:installer` (`scripts/build-installer.mjs`)
  picks the Tauri bundle formats from the version: NSIS only for alpha, beta
  and rc (WiX rejects non-numeric pre-releases), NSIS + MSI for stable
  versions (VERSIONING §5). The Installer workflow runs it on every push to
  `main` and on `v*` tags and uploads `pharos-<version>-<sha7>-windows` (30
  days). The NSIS bundle installs for the current user and downloads WebView2
  only if it is missing.
- **Not code-signed:** no certificate is configured, so SmartScreen warns on
  install. Signing is out of scope for 0.1.0 and listed as a known limitation.
- **Fixed API address:** the desktop build talks to `VITE_API_URL`, which
  defaults to `http://localhost:3000`, and its CSP (`tauri.conf.json`) allows
  only that port (plus Ollama on 11434). The CI installer is built without
  `VITE_API_URL`, so an installed beta needs the API on the same PC.
- **Version compatibility:** the server accepts its own MINOR and the previous
  one (`server/src/modules/sync/sync.version.ts`, SYNC-08), and the local
  upgrade from the previous published version is tested against a fixture
  (BASE-04, "Local data" above).

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
  module — plan CRUD, a stepped wizard, a schedule calendar (react-day-picker
  then; its own grid since RED-W5), and a revision-history panel. (The `cargo test` launch failure
  noted at the time was specific to the GNU toolchain and is gone with MSVC.)
- **Phases 4–8 and 9A:** implemented — test cases, planner, templates/export,
  AI, oplog + push/pull sync with HLC and the conflict panel (8C), admin hub.
- **Phase 9:** the WCAG 2.1 AA audit and shared form validation (UX-05, UX-01),
  the CI installer (BASE-09) and the final docs (UX-06, with the beta guide
  `docs/guia-beta.md`) are done. `0.1.0-beta.1` is the first beta; the native
  checks of `docs/ROADMAP.md` §6 remain before `0.1.0`.
- **Wave 4 — interface redesign (`0.2.0-alpha.1`, 2026-10-30):** the redesign
  package in `docs/rediseno/` applied in full (ADR-0028…0031): new shell and
  shared UI primitives (F1), Login/Inicio/Perfil (V1), Proyectos/Ajustes/Plan
  (V2), Casos/Planificador/Trazabilidad (V3), Administración by tabs (V4), and
  the data router with the shared unsaved-changes guard (RED-V3k). Released as
  `0.2.0-alpha.1`; test execution (the rest of 0.2.0) is next.
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
