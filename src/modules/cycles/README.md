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
  «Ejecutar» (one run per configuration; desktop only, `cycleApi.canExecute`).
- **Progress** comes computed from the core (`cycle_progress_get`, or
  `/api/cycles/:id/progress` on the web): this module only shows it.

Boundaries: it depends on no other domain module. The project page passes it
the cases (`loadCases`, from `@modules/test-cases`) and the requirement keys.
No design in `docs/rediseno/` covers these screens: they use the shared
primitives (`DataTable`, `StatusPill`, `SegmentedControl`, `Tabs`, `Dialog`).
