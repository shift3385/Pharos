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
- **Nuevo proyecto** (`NewProjectWizard`, UX-29): a wizard in a `Dialog`, full
  screen on mobile, opened by «Nuevo proyecto» on Proyectos and by the Home
  (`/projects?new=1`). Copying from another project is UX-25 (decision:
  amendment UX-25 and its UX-29 note in
  [ADR-0018](../../../docs/adr/0018-campos-personalizados.md);
  `model/copySettings.ts`):
  - **Cómo empezar:** a radio group of two cards, «Proyecto en blanco» or «A
    partir de uno existente» (disabled, with its reason, without projects);
    the arrows choose and Enter goes on. The blank path skips step 2.
  - **Qué copiar:** the source (`ProjectSelect` with prefix and cases) and a
    checkbox per setting, all checked, with its real value there
    (`loadSourceFacts`: live custom fields per entity, the evidence retention
    on the desktop only; the web shows it disabled with its reason). Never the
    name, the prefix or any data.
  - **Datos generales:** `ProjectGeneralFields`, the same fields as Ajustes ›
    General (name, prefix, digits and the numbering preview), with a free
    prefix suggested from the name and checked at once (`model/prefix.ts`,
    NC-030: «✓ Libre» or the clash). From a source, the digits are prefilled
    and marked «copiado de …» (editable) and a summary lists what else goes.
    A blank name or a taken prefix shows the `ErrorSummary` on «Crear
    proyecto», as in Ajustes.
  - **Creating:** `newProjectInput` (the general data as typed plus the
    source's plan history), then `copyAfterCreate` copies the fields
    (`customFieldApi.copy`, once per entity of `FIELD_ENTITIES`) and the
    retention (`projectApi.copyRetention`, the Rust command
    `evidence_retention_copy`), each on its own. Only once: the projects stay
    independent. A part that fails does not undo the project: a warning toast
    names what was not copied. The page then opens the new project's plan.
  - **Cancel or Escape** create nothing; with something typed or chosen they
    ask first (`useConfirm`, NC-017).
- **Project page** (`ProjectDetail`, `ProjectHeader`): the header shared by
  every section and the sections in the URL (`model/sections.ts`, ADR-0029).
- **Ajustes del proyecto** (`ProjectSettings`): name and key numbering (the
  shared `ProjectGeneralFields`, `model/numbering.ts`), plan
  history (PLN-02), custom fields (from `@modules/custom-fields`),
  configurations, export and delete.

Boundaries: other modules use it only through `index.ts`. It may depend on the
domain modules whose facts it shows (test-plan, traceability, runs, cycles,
custom-fields…), never on `admin`: the retention read and copy call their Rust commands
directly instead (admin imports nothing from here either).

User manual: chapter 4 (`docs/manual/fuentes/proyectos.md`, tour
`e2e/tours/04-proyectos.tour.ts`) and chapter 14 for the settings.
