// Public API of the cycles module (CYC-01, ADR-0017): configurations of a
// project, test cycles with their items and progress, and «Ejecutar» (one run
// per configuration, desktop only). It depends on no other domain module: the
// project page passes it the cases and requirement keys it offers.
export { configurationApi, cycleApi } from "./api/cycleApi";
export { ConfigurationsCard } from "./ui/ConfigurationsCard";
export { CyclesPage } from "./ui/CyclesPage";
export type { CaseOption, Configuration, CycleSummary, TestCycle } from "./model/types";
