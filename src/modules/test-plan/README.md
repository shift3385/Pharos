# test-plan

The project's test plan (spec §5.1): one per project, written with a 22-step
wizard that follows ISO/IEC/IEEE 29119-3 and CTFL v4 §5.1.1 (RED-V2, UX-31,
PLN-06). The desktop keeps it
in the encrypted local store; the web is a client of the server's
`/api/test-plans`. The wizard content lives in `data` (`model/types.ts`), so
the shape can evolve without a migration.

## Public API (`index.ts`)

- `TestPlanPage` — the project section `plan`: loads the project's plan (or
  starts one) and hands it to `TestPlanWizard`.
- `PLAN_SAVED_EVENT` and the `projectPlan*` readers of `export/batch.ts`
  (status, version, closure, overview, the files of the project ZIP) — what
  the project header, the Home and the project export read from the plan.
- `exportPlanPdf`, `planContextForProject` (the plan as context for the AI).

## The wizard (`ui/wizard`)

- `steps.ts`: the 22 step ids in order (PLN-06 added `assumptions`,
  `techniques`, `estimation`, `entry` and `metrics`; no id changed), what makes each one complete (its ✓),
  and `LEGACY_STEPS` / `stepIndex`. The 19-step wizard (before UX-31) had
  `title` and `meta`, now **`identification`** («Identificación del plan»:
  title, status, version, date and author, the document's identification
  block), and `types` and `levels`, now **`levelsTypes`** («Niveles y tipos de
  prueba», before «Metodología»). An old id — in `?step=<id>` or anywhere a
  step is named — lands on the joined step. The saved data did not change.
- `StepBody`: the fields of each step; the large ones have their own component
  (`LevelsTypesStep`, `MethodologyStep`, `DeliverablesStep`, `ToolsStep`,
  `ScheduleStep`, `FinishStep`).
- `MethodologyStep` (UX-36): two columns in the look of `CheckColumns` (its
  `.tpw-cols` CSS). «Método de trabajo»: the methodology and the sprint
  length as «N semanas». «Reuniones del equipo»: one row per meeting with its
  checkbox, name and frequency `Select`; an unticked meeting's frequency is
  disabled with its reason (title and description). Traditional (no sprints):
  the right column holds the phases. Same data as before (`sprintWeeks`,
  `ceremonies`, `ceremonyFrequency`, `phases`).
- `ScheduleStep`: how to mark sprints and milestones is in the step's «?»
  help (`stepDesc.schedule`, UX-36); only the range being marked is
  announced, in a visually hidden live region, so the calendar sits right
  under its bar. The month grid's geometry and keys are shared with the
  `DatePicker` (`@shared/ui/monthGrid`), and the day helpers
  (`isoOf`, `parseIso`, `toDisplay`, `fromDisplay`, `addDays`) live in
  `@shared/time/isoDay` (re-exported by `model/schedule`).
- `CheckColumns`: checkboxes in columns by group, shared by «Niveles y tipos de
  prueba» and «Entregables» — thin lines between rows and columns, a grey icon
  and the group's name in small capitals as its head (no counters), an
  optional tooltip per option, and the last cell, «Propios», with the team's
  own entries (each with ✕) and the field to add one. A step's explanation
  goes in the «?» of its title, never as text under it.
- Selects are Pharos' `Select` (`@shared/ui/Select`, UX-30); the plan's
  date is Pharos' `DatePicker` (`@shared/ui/DatePicker`, UX-36), never a
  native `<input type="date">`.

- `StrategySteps`: «Supuestos y restricciones» and «Entrada, suspensión y
  reanudación» (text lists with «Sugerir con IA», `suggestPlanLists`),
  «Técnicas de prueba» (`CheckColumns`), independence and training under the
  roles table, and «Estimación y presupuesto» (three-point result shown).
- `MetricsStep` and `ClosureStep` (ADR-0040): a metric is
  `{ id, kind, name, op, target, unit }` (`model/metrics.ts`, the literals
  agreed with DOC-02/DOC-06); «Criterio de salida» adds or removes the
  criterion linked to it (`metricId`, `blocking` true by default), and
  editing a metric rewrites the text of its criteria (`syncLinkedCriteria`).
  A linked criterion's text is read-only in its step.

## Saving and approval (PLN-03, PLN-04, PLN-07)

- `toInput` bumps the version only when `changesContent` (title and
  `toData` without the AI review marks); a save without changes writes
  nothing. The desktop skips the revision copy when title and data (without
  `approval`) are equal.
- «Aprobado» is not in the status select: «Aprobar versión N»
  (`PlanStatusPanel`) saves `data.approval` (who, name, when, version) with
  the status, after a confirmation, for a saved plan in «Revisado». Editing
  the content of an approved plan saves it as «Revisado» without the
  approval; a warning says so first. `PlanTimeline` shows the latest saves
  from the audit (`planSaves`), with «pierde la aprobación».
- `data.documentId`: `TP-<case prefix>-<6 hex>` by default (`documentIdFor`),
  editable in «Identificación del plan».

## Catalogs (`model/catalogs.ts`, `model/catalogLabels.ts`)

A plan stores catalog **keys** plus the team's own entries as typed
(ADR-0030); labels are only for show, export and import.

- Test levels: `unit`, `integration`, `system`, `acceptance`.
- Test types by group (`TYPE_GROUPS`): functional (`functional`,
  `exploratory`, `uat`), non-functional (`performance`, `load`, `stress`,
  `security`, `usability`, `compatibility`, `accessibility`) and
  «Confirmación y regresión» (`changeRelated`, ISTQB CTFL v4 §2.2.3):
  `retest` («Confirmación», added in UX-31; «Confirmación (re-test)» until UX-34), `regression`, `smoke`,
  `sanity`. `TEST_TYPES` is the flat list in group order.
- Deliverables by ISO 29119-3 group (`DELIVERABLE_GROUPS`) and the tool catalog
  (`TOOL_NAMES`, `TOP_TOOLS`, `MORE_TOOL_GROUPS`).

## Export and import

- `export/planPdf.ts` and `export/planXlsx.ts` take an `ExportablePlan`
  (`toExportable` in the wizard, `planToExportable` for batch export). Types
  and levels are exported in catalog order, own entries last (`typeLabels`,
  `levelLabels`); the PDF prints the levels, then the types one line per
  group (`typeGroupLines`), before the methodology. The .xlsx keeps the
  template's cells (`assets/plan-template-{es,en}.xlsx`), one item per line.
- The 29119-3 sections (`export/planStrategy.ts`): the PDF prints each
  where the wizard asks for it; the .xlsx keeps the template sheet (C3 is the
  document ID, row 8 «Aprobado por») and adds «Estrategia 29119-3»,
  «Métricas» and «Criterios de salida», read back by
  `import/strategyImport.ts`. An imported plan never comes in approved.
- `import/planImport.ts` reads a plan sheet by its headers (es/en), not by
  cells, and maps labels or keys back to catalog keys (`«Confirmación
  (re-test)»`, `Confirmation (re-test)` and `retest` are all `retest`).

## Tests

`ui/TestPlanWizard.test.tsx` (navigation with 22 steps, approval, metrics and linked criteria, the joined steps,
«Propios», an old plan and old step ids), `a11y.test.tsx` (axe on every
step), `model/catalogLabels.test.ts`, `export/*.test.ts` and
`import/planImport.test.ts` (the `retest` round trip), `model/iso29119.test.ts` (metric contract, save and approval rules, document ID) and `export/strategyRoundTrip.test.ts` (the new sheets and PDF sections).
