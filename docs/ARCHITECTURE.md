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

Its header buttons go through `useHeaderActions`. Saving reloads the saved
plan in place, so the step stays put, and fires `PLAN_SAVED_EVENT`, which the
project header listens to. Deliverables and tools are catalog keys
(ADR-0030, `model/catalogLabels.ts`).

**Home (UX-08, spec §5).** `app/dashboard` shows two actions (start a new
project, continue one) and the user's projects with search, last access, plan
status and progress, from `projectOverview` (`projects`), which reads the plan
status and case counts through the `test-plan` and `test-cases` public APIs.
Progress is approved cases over non-obsolete cases until the run model (0.2.0)
gives execution progress. The last access is device-local metadata kept in
`localStorage` per user (`pharos.projects.lastAccess.<userId>`): project ids
and timestamps only, outside the database and sync on purpose.

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
  - Plantillas and Motor de IA are reached from Administración. Their routes
    (`/templates`, `/ai`) stay, and `isCurrent` keeps «Administración» marked
    on them. `AdminSectionNav` links the three pages until V4 replaces it
    (temporary).
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
`.feature` files, project ZIPs, the matrix, templates, planner attachments
and the diagnostic bundle) goes through `saveFile` (`@shared/export/saveFile`).

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
`migrations/`) that the server also runs on start. Modules:

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
  answers others with 426 (ADR-0020). Tombstones are never removed; at start
  and then daily (`server.ts`) the payload of those older than
  `SYNC_TOMBSTONE_DAYS` is cleared (SYNC-06). See `src/modules/sync-offline/README.md`.
- `domain` — the web's domain API (BASE-10, ADR-0004): `/api/projects`,
  `/api/test-plans`, `/api/test-cases`, `/api/requirements` (+ `/import`) and
  `/api/planner-cards` (+ `/reorder`). `domain.service.ts` applies the
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
  explains how it was generated.

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
- **Human-readable keys (DAT-01, ADR-0010):** case, requirement and defect keys
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
  module — plan CRUD, a stepped wizard, a react-day-picker schedule
  calendar, and a revision-history panel. (The `cargo test` launch failure
  noted at the time was specific to the GNU toolchain and is gone with MSVC.)
- **Phases 4–8 and 9A:** implemented — test cases, planner, templates/export,
  AI, oplog + push/pull sync with HLC and the conflict panel (8C), admin hub.
- **Phase 9:** the WCAG 2.1 AA audit and shared form validation (UX-05, UX-01),
  the CI installer (BASE-09) and the final docs (UX-06, with the beta guide
  `docs/guia-beta.md`) are done. `0.1.0-beta.1` is the first beta; the native
  checks of `docs/ROADMAP.md` §6 remain before `0.1.0`.
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
