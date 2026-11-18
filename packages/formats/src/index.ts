// @pharos/formats (ADR-0053): Pharos Run JSON 1.x (KND-01, RUN-00) — schema,
// validator and the deterministic ids of the execution model — and the
// result importers (ING-02..05; ING-06/07 next). The one implementation for
// the desktop, the web and the server; the snapshots in
// `fixtures/*/normalized/` are the contract of any port (the CLI, INT-01).
export * from "./schema.js";
export * from "./ids.js";
export * from "./importers/index.js";
export { configureXml, type DomParserLike } from "./xml.js";
