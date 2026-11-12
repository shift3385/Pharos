# cycles — test cycles and configurations (CYC-01)

Decision: [ADR-0017](../../../docs/adr/0017-ciclos-y-configuraciones.md)
(«Implementación» has the details). Desktop core: `src-tauri/src/cycles.rs`;
web: `server/src/modules/domain/cycles.ts`.

- **Configurations** (`ConfigurationsCard`, in the project settings): name,
  `{browser, os, device, locale}` and the match labels an import recognizes
  them by. Archived, never deleted. A label is unique per project; when two
  devices created the same one offline, the card flags both and imports take
  the smallest id.
- **Cycles** (`CyclesPage`, the project section `cycles`): the list with
  status, dates and progress, and one cycle's detail at `?cycle=<id>` —
  header, items with one result column per configuration, «Añadir casos»,
  «Añadir por filtro», assignee in place, clone, delete (its runs stay) and
  «Ejecutar» (one run per configuration; on the web too since EJE-06,
  `/api/cycles/:id/execute`). The dates in `CycleDialog` are Pharos'
  `DatePicker` (UX-36): the end's calendar opens on the start's month with
  the days before it disabled; a typed end before the start is still refused
  on save.
- **Progress** comes computed from the core (`cycle_progress_get`, or
  `/api/cycles/:id/progress` on the web): this module only shows it.
- **Exports (EXP-03):** `loadCycleExport`, `cyclesTable` and `caseCyclesTable`
  build the «Ciclos» tables that the plan and case exports (`test-plan`,
  `test-cases`) add as a sheet and a PDF section, from the list's own
  progress summary.

- **Closing (DOC-02, ADR-0041):** a cycle closes only through the quality
  gate («Cerrar ciclo…», `CloseCycleButton` of `@modules/runs`, passed in
  by the project page through `cycleActions(cycleId, ctx)`). The edit dialog
  offers «Cerrado» only to a closed cycle, to reopen it
  (`editableStatuses`), and the core refuses closing by an edit
  (`cycle-close-needs-gate`). Each closing appends to `data.closures`,
  which an edit never touches; the detail shows the latest verdict
  (`latestVerdict`, `verdictTone`).

Boundaries: it depends on no other domain module (`test-plan` and
`test-cases` depend on it for their exports, never the other way round). The project page passes it
the cases (`loadCases`, from `@modules/test-cases`), the requirement keys and
`cycleActions(cycleId, ctx)`: extra buttons for an open cycle's header (the
status report of `@modules/runs`, EJE-03, scoped to that cycle, and «Cerrar
ciclo…», DOC-02), with the cycle's status and label and a way to read it
again after a change.
No design in `docs/rediseno/` covers these screens: they use the shared
primitives (`DataTable`, `StatusPill`, `SegmentedControl`, `Tabs`, `Dialog`).
