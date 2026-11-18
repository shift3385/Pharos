# @pharos/formats

Pharos Run JSON 1.x and the result importers ([ADR-0053](../../docs/adr/0053-hallazgos-metricas-y-paquete-de-formatos.md)).
It is TypeScript source with no build step, and it is the only implementation:

| Consumer | How it loads it |
| --- | --- |
| Desktop and web (Vite, vitest) | The alias `@pharos/formats` → `packages/formats/src` (`vite.config.ts`, `tsconfig.json`). XML uses the native `DOMParser`. |
| Server (`tsx`, vitest) | The same alias in `server/tsconfig.json` and `server/vitest.config.ts`. Call `configureXml(DOMParser)` with `@xmldom/xmldom`'s class once at boot. |
| A port (the CLI, INT-01) | It reproduces the snapshots in `src/fixtures/*/normalized/`. |

Runtime dependencies are resolved by the consumer: `zod` and `uuid`, and
`@cucumber/messages` for types only. In the server image the package has to
sit at `packages/formats/` beside `server/`, and `node_modules` has to be
reachable from it. One way is a symlink from `/<root>/node_modules` to the
server's `node_modules`. The server Dockerfile is owned by DEU-01 (track A).

Field mappings: [`docs/formats/importers.md`](../../docs/formats/importers.md).
Any change to what a parser produces raises `NORMALIZER_VERSION`.
