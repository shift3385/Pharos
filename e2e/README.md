# Desktop E2E: smoke and guided tours

Everything here drives the **real desktop binary** with WebdriverIO →
`tauri-driver` → `msedgedriver` → WebView2, on Windows.

| Command                     | What it runs                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `npm run e2e`               | The smoke (`specs/`, BASE-14) against the API of this checkout on `localhost:3000`    |
| `npm run manual`            | The guided tours (`tours/`, MAN-01) on an isolated API + DB, then the user manual     |
| `npm run manual:build`      | Only the manual, from the last tour run or from `docs/manual/pasos.json` (no app run) |
| `npm run check:manual`      | The coverage check of the tours (static, part of `verify:static`)                      |
| `npm run e2e:driver`        | Downloads the `msedgedriver` that matches WebView2 into `e2e/.bin/`                   |

One-time setup (shared by both): `cargo install tauri-driver --locked`,
`npm run e2e:driver`, PostgreSQL running and `.env` copied from
`.env.example`. The smoke is documented in the root README → "Desktop E2E
smoke".

## Tours (MAN-01)

`npm run manual` (`tours/run-tours.mjs`) does, in order:

1. **Guards.** First a **run lock** (MAN-02): every run shares the port and
   the database, so only one runs at a time on the machine. The lock is
   `pharos-tours.lock` in the OS temp dir (PID and start time); a second run
   refuses with «otra ejecución de recorridos en curso (PID …)», a lock whose
   PID is gone is stale and replaced, and it is released on every exit
   (`scripts/manual/run-lock.mjs`). Then: the tour API port is `PHAROS_TOURS_PORT` (default **3100**);
   3000 — the user's own API — is refused, and so is a port already in use
   (the tours never stop other programs). The database name is fixed to
   `pharos_test_db_tours`.
2. **Database.** Drops and creates `pharos_test_db_tours` on the server of
   `TEST_DATABASE_URL` (only its host and credentials are used), migrates it
   and seeds the test account.
3. **API.** Starts `tsx src/server.ts` with `PORT=3100` and that database
   (not `npm start`, whose `prestart` stops Pharos APIs on its port).
4. **Binary.** `tauri build --debug --no-bundle` with
   `VITE_API_URL=http://localhost:3100` and a `--config` override of the CSP
   (generated from `tauri.conf.json` with 3000 → 3100), into
   `<cargo target>/tours` (or `PHAROS_TOURS_TARGET_DIR`), so the smoke's
   binary is never overwritten. `E2E_SKIP_BUILD=1` reuses the last one.
5. **Tours.** `wdio run e2e/wdio.tours.conf.ts`: one group, one app session,
   chapters in manifest order, profile `tours-<timestamp>`. Exports go to
   `e2e/results/tours/downloads` (the profile's `downloads.json` is written
   before the app starts); the run **fails if any file appears in your own
   Downloads folder**.
6. **Manual.** `scripts/build-manual.mjs --from-run` (below).
7. **Always:** stops the API and drops the database; the base config removes
   the profile, the WebView2 folder and the run's keychain entries.

`npm run manual -- --spec 04` runs the preparation tour plus the tours whose
file name matches the regular expression (`"0[2-4]"`), and skips the manual.
Some chapters read data the earlier ones make (custom fields, configurations,
cases, an imported report): each declares them in `needs` (`manifest.ts`), and
the runner **adds those chapters** and says which. An invalid expression, or
one matching no tour, stops the run before the database and the build.

At the end of each chapter, `closeLeftovers` (`tour.ts`) closes any dialog or
menu still open, so a failed step cannot block the next chapter, and leaves the
screen after a failure, whose unsaved editor would stop the next navigation.
A clean chapter should have nothing to close: it is reported as a warning.

### Writing a tour step

```ts
step("nuevo", {
  title: "Crear un caso",                       // heading in the manual
  caption: "Pulsa «Nuevo caso», …",              // Spanish, second person, UI names in «»
  covers: ["action:case-create-basic"],          // inventory ids (string literals)
  shot: "page" | { element: '[role="dialog"]' } | false,
  mask: ["#ai-key"],                             // blurred in the capture
  skip: "motivo",                                // recorded as pending
  focus: '[data-testid="login-language"]',       // the control the step is about (MAN-02)
  group: "ojo",                                  // consecutive steps printed side by side
  run: async () => { /* action */ await expect(/* outcome */).toBeDisplayed(); },
  after: async () => { /* runs after the capture, still part of the step */ },
});
```

- **`focus`** (one selector or several, their union box): the tour records
  the box in capture pixels; the manual draws an amber outline (Faro
  Nocturno's accent) into the PNG and, in the PDF only, adds a magnified
  «Detalle» inset cropped by CSS from the same file, beside the capture or
  below it for a wide strip, and none when the control is already big. Use it
  when a step is about one control in a big screen. A focus not displayed at
  capture time is a warning (`focusMissing`), listed by the manual build.
- **`group`**: a before/after pair (e.g. the password hidden, then shown).
- **`after`**: capture the state *before* an action and still assert the
  action (e.g. «Iniciar sesión» shows the filled form, then signs in).

**Waits, never sleeps.** `field()` looks again until the control is rendered;
`waitForText()` also finds a toast that came and went (success toasts live
3 s and only the newest is shown in a capture: `stabilise()` logs every toast,
and each logged one answers one wait within 15 s); `atLeast(selector, n)`
replaces one-shot `$$()` counts right after an action.

Every step must assert its outcome: the tours are a functional regression
suite as well as the manual. After the first failure in a chapter, the rest
of that chapter is skipped. Selectors: test ids, roles and es.json copy
(`helpers.ts`); `strictSelectors` is off for the tours (a page often repeats
a label), so assertions must be specific. Failure screenshots go to
`e2e/results/tours/failures/`.

### States produced for real

A few screens only appear when something "outside" happens; the tours make
it happen inside the isolated run instead of skipping them:

- **Sync conflict** (chapter 10): `other-device.ts` signs in to the tour API
  (never port 3000) as a second Pharos and pushes a newer version of a
  requirement; the app then edits the same requirement and syncs.
- **Orphan evidence** (chapter 14): a stray `.pev` file, back-dated two days,
  in the tour profile's `evidence/` folder.
- **Database that does not open** (chapter 15): the app is closed, the tour
  profile's `pharos.db.enc` is replaced by garbage (a copy is kept), the app
  restarts on the error screen, then the copy is restored.
- **«Algo salió mal»** (chapter 15): date formatting is made to throw in the
  WebView, so a view fails and the error boundary catches it.
- **Clipboard paste** (chapter 13) and the **attachments folder** of a report
  (chapter 8): a synthetic paste event with an image, and msedgedriver's
  folder upload into the `webkitdirectory` input.

### Coverage: `npm run check:manual`

`tours/manifest.ts` holds the chapters and the **inventory**: every screen,
tab, dialog and main action (create, edit, delete with confirmation, import,
export, filter, sort, keyboard alternatives, empty and error states, desktop
vs web). The check fails when:

- the code has a route (`App.tsx`; every `<Route` must be readable), project
  section (`PROJECT_SECTIONS`), admin tab (`AdminTab`), plan-wizard step
  (`STEP_IDS`), a `.ts`/`.tsx` file that opens dialogs (`Dialog`,
  `ConfirmDialog`, `BottomSheet`, ARIA dialog, `window.confirm` / `prompt` /
  `alert`), a file upload, or a screen with tabs or a view switch, with no
  inventory item;
- an item has no tour step covering it and no `pending` / `skip` reason (a
  step with a literal `skip` reason covers nothing);
- a file opens more dialogs than tour steps cover it;
- a step covers an unknown id, or an active chapter lacks its tour or its
  prose (`docs/manual/fuentes/<id>.md`).

The AI chapter counts as pending unless `PHAROS_TOURS_AI_KEY` is set in the
environment (`check:manual` never reads `.env`). After a full run, the runner
also calls `check-manual.mjs --from-run`, which fails when an item is covered
only by steps that did not pass.

It prints the inventory size, the coverage percentage and every pending item.
A chapter can be marked `pending` (with its reason) while its screen is not
on `main` yet; the check then lists its items instead of failing. When the
screen lands, write the tour and flip the chapter to `active` (as happened
with «Ejecución manual» and «Evidencias», wave E5).

### The manual

`scripts/build-manual.mjs` writes `docs/manual/` (see its
[README](../docs/manual/README.md) and the review checklist
[REVIEW.md](../docs/manual/REVIEW.md)): chapters in Spanish Markdown, the
captures as deterministic 8-bit palette PNGs (median cut, zlib only; a new
capture replaces the committed one only if more than `MANUAL_DIFF_THRESHOLD`,
default 0.5 %, of its pixels changed; a step this run skipped, such as the AI
chapter without a key, keeps its committed capture),
`pasos.json`, and `Pharos-manual-de-usuario.pdf` printed by headless
Microsoft Edge (`PHAROS_EDGE` to point at another `msedge.exe`). The PDF is
gitignored: open it locally after `npm run manual`, or download the `manual`
artifact of the CI on `main`.

PDF layout (MAN-02): the contents link every chapter and step to its page,
with its number (a draft print with placeholders, then the real numbers read
from the PDF's named destinations; the build fails if they move). A step's
heading, text and capture never split; «Consejos» and «Véase también» stay
whole; captures take 84 % of the text width so two ordinary steps share a
page. Each print uses its own Edge profile under
`docs/manual/.build/edge-profiles`, retried once on EPERM; a profile Edge
still holds never fails the build.

### AI tours (real key, set by you)

Chapter 11 calls a real AI provider, so it runs only when **you** set the key
in your environment. Without it the AI steps are skipped and listed as
pending; they are never faked.

| Variable                     | Meaning                                                                     |
| ---------------------------- | --------------------------------------------------------------------------- |
| `PHAROS_TOURS_AI_KEY`        | The API key (required to run the AI chapter)                                |
| `PHAROS_TOURS_AI_PROVIDER`   | `gemini` (default), `openai`, `anthropic` or `openrouter`                    |
| `PHAROS_TOURS_AI_MODEL`      | Model id; default the cheapest suitable one (`gemini-2.0-flash-lite`, `gpt-4o-mini`, `claude-haiku-5-5`; required for `openrouter`) |
| `PHAROS_TOURS_AI_MAX_CALLS`  | Cap on AI requests per run (default 8; the chapter makes 6)                  |

**Fallback: `.env`.** When `PHAROS_TOURS_AI_KEY` is not set, the runner
reads `ANTHROPIC_API_KEY` (and `ANTHROPIC_MODEL`, used as given) from the
`.env` of this checkout, else from the main checkout's
(`D:\MI_AREA_DE_QA\Suite de pruebas\pharos\.env` on the maintainer's machine;
a worktree has no `.env` of its own), with provider `anthropic`. `.env` is
git-ignored. The runner reads it only after the API and the tour binary are
started and built (neither sees the key) and never prints it; it only says
which file the key came from. `PHAROS_TOURS_AI_MODEL=claude-haiku-5-5` makes a
run cheaper.

Local (PowerShell, current window only; the key is not saved anywhere):

```powershell
$env:PHAROS_TOURS_AI_KEY = Read-Host -AsSecureString "Clave de IA" | ForEach-Object { [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($_)) }
$env:PHAROS_TOURS_AI_PROVIDER = "gemini"
npm run manual
Remove-Item Env:PHAROS_TOURS_AI_KEY
```

CI: the key lives in the GitHub **environment `tours-ai`**, used only by the
non-required job `manual (main)` (push to `main` and manual runs; the pull
request job `manual` has no key). The maintainer sets it up once:

1. GitHub → Settings → Environments → New environment → `tours-ai`.
2. Deployment branches and tags → «Selected branches and tags» → add `main`.
3. Environment secrets → Add secret `PHAROS_TOURS_AI_KEY` (or
   `gh secret set PHAROS_TOURS_AI_KEY --env tours-ai --repo shift3385/Pharos`,
   which asks for the value without echoing it).
4. Environment variables (optional) → `PHAROS_TOURS_AI_PROVIDER=anthropic`,
   `PHAROS_TOURS_AI_MODEL=<model>`.

An unset variable arrives as an empty string and counts as unset.

How the key is protected:

- The runner keeps it out of its own environment: only the WebdriverIO run
  gets it (never the API, the migrations, the seed or the build).
- The tours hand it to the app's keychain command (`ai_key_set`) inside the
  isolated profile: never typed into the UI, written to a file or logged
  (msedgedriver's verbose log is off; there is no JUnit report, which would
  record command arguments).
- The key field is blurred in every capture, and so is the download folder
  (a local path); toasts are hidden unless a step shows one on purpose.
- The profile's keychain entries are removed at the end, also after Ctrl+C.
- **Secret scan, first thing after the tours** (and again after the manual
  build): `docs/manual/` and `e2e/results/` are searched for the key as text,
  URL-encoded, UTF-16LE and base64 at every alignment, including the entries
  of the ZIPs the tours write (diagnostics, `.xlsx`). The PDF is compressed:
  it is covered through its uncompressed sources (`docs/manual/.build/*.html`,
  the Markdown, the images). Any file with a hit is deleted, the run fails,
  and the marker `e2e/results/tours/SECRET-SCAN-FAILED` stops CI from
  uploading any results.
