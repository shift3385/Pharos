# defects

Defects as their own entity (DEF-01, [ADR-0016](../../../docs/adr/0016-defecto-como-entidad.md)).
The desktop keeps them in the encrypted local store (`src-tauri/src/defects.rs`,
migration 0029); the web is a client of the server's `/api/defects`
(`server/src/modules/domain/defects.ts`), with the same rules.

## Public API (`index.ts`)

- `DefectsPage` — the project section `defects`: a list (`DataTable`) and a
  board by status, filters (open / all / closed, severity, search), the editor
  and «Desde un resultado» (desktop). The composing module (`projects`) hands
  it the linkable cases and requirements as props.
- `DefectEditor` and `createDefectFromResult(resultId, userId, stepId?)` — for
  the execution screen (EJE-02): the second returns the editor's `draft`.
- `defectsApi`, `projectDefects(projectId, userId)` (the matrix and Inicio) and
  `isOpenDefect(status)` (open = not `closed` nor `rejected`).

## Model

- `severity` (impact: `critical | major | minor | trivial`) apart from
  `priority` (urgency: `low | medium | high | critical`).
- `status` follows the fixed lifecycle of `model/lifecycle.ts`, the twin of
  `lifecycle.rs` and of the server's `sync/defects.ts` (one table in
  `src-tauri/tests/fixtures/defect-vectors.json`). `resolution` goes with
  `closed` and `rejected` only.
- `links` point at a `test_case`, `requirement` or `result` (`finding` and
  `session_note` come with 0.4.0/0.5.0); `caseIds` is derived: direct case
  links plus the case of each linked result.
- Evidence: `attachments` with `owner_entity = 'defect'` in the evidence store
  (desktop only until SYNC-04b). A defect created from a result points at the
  result's contents (same sha256, no bytes copied).
- Custom fields of entity `defect` live in `data.custom` (ADR-0018).

## Screens

No design exists in `docs/rediseno/` for these screens: they reuse the cases
list (`DataTable`, chips, `FilterMenuButton`, `SegmentedControl`) and the
planner board (dnd-kit with the keyboard handle and announcements). On the
board a drop is a status change along the lifecycle only; closing, rejecting
or a drop on «Otros» (rejected and deferred) ask first (`TransitionDialog`).
The chosen view (list or board) is a per-device convenience in `localStorage`.
