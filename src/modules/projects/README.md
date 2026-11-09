# projects — the project list, its header and its settings

A project is the container of one test plan, its board, requirements, cases,
cycles, runs and defects (spec §5.1). Desktop core: `src-tauri/src/project.rs`;
web: `server/src/modules/domain/domain.service.ts` (`/api/projects`). Both apply
the same rules (BASE-10): the owner sees only their projects, and a project's
key prefix may not overlap another's (NC-030).

- **Proyectos** (`ProjectsPage`, route `/projects`): the recent projects, then
  the table with search, sort and pages (`model/projectTable.ts`, rows from
  `model/projectRows.ts`, which composes the plan, traceability and runs
  modules). The row menu opens, sets up or exports a project; «Exportar todo»
  exports all of them (`useProjectExport`, `export/exportAll.ts`).
- **Nuevo proyecto** (the `.pj-create` row of `ProjectsPage`): the name, a free
  prefix suggested from it (`model/prefix.ts`) and **«Copiar ajustes de:»**
  (UX-25, `model/copySettings.ts`; decision: amendment UX-25 of
  [ADR-0018](../../../docs/adr/0018-campos-personalizados.md)):
  - «(ninguno)» by default; choosing one of the user's projects shows a
    checkbox per part, all checked: custom fields of every entity, key digits,
    «Historial en el plan exportado» and, on the desktop only, evidence
    retention (the web has none and the form says so);
  - the digits and the plan history travel in the create itself
    (`withCopiedSettings`); the fields (`customFieldApi.copy`, once per entity
    of `FIELD_ENTITIES`) and the retention (`projectApi.copyRetention`, the
    Rust command `evidence_retention_copy`) are copied right after
    (`copyAfterCreate`), each on its own;
  - never the name, the prefix or any data, and only once: the two projects
    stay independent;
  - a part that fails does not undo the project: a warning toast names what
    was not copied.
- **Project page** (`ProjectDetail`, `ProjectHeader`): the header shared by
  every section and the sections in the URL (`model/sections.ts`, ADR-0029).
- **Ajustes del proyecto** (`ProjectSettings`): name and key numbering, plan
  history (PLN-02), custom fields (from `@modules/custom-fields`),
  configurations, export and delete.

Boundaries: other modules use it only through `index.ts`. It may depend on the
domain modules whose facts it shows (test-plan, traceability, runs, cycles,
custom-fields…), never on `admin`: the retention copy calls its Rust command
directly instead (admin imports nothing from here either).

User manual: chapter 4 (`docs/manual/fuentes/proyectos.md`, tour
`e2e/tours/04-proyectos.tour.ts`) and chapter 14 for the settings.
