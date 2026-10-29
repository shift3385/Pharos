// The Rust contract on the server side (BASE-05, ADR-0026). The desktop's sync
// types are generated from Rust into src/shared/contracts/generated/; these
// type-level checks make `npm run typecheck` fail when the server stops
// reading what the desktop sends, or stops sending what the desktop reads. The
// web's domain inputs are checked against the Tauri command inputs, so one
// client input object fits both backends. Type-only: nothing here runs.

import type { z } from "zod";
import type { Assert, Contract, Covers } from "../../../../src/shared/contracts";
import type {
  plannerCardInputSchema,
  projectInputSchema,
  requirementImportSchema,
  requirementInputSchema,
  testCaseInputSchema,
  testPlanInputSchema,
} from "../domain/domain.schemas";
import type { KeyBlock, KeyConflict, RemoteDoc } from "./sync.repository";
import type { Delta, keyBlocksSchema } from "./sync.schemas";

type LeaseRequest = z.output<typeof keyBlocksSchema>["requests"][number];
type Sent<T extends z.ZodType> = z.input<T>;

export type _RustContract = [
  // Desktop → server: a push and a key-block lease.
  Assert<Covers<Contract.Delta, Delta>>,
  Assert<Covers<Contract.LeaseRequest, LeaseRequest>>,
  // Server → desktop: pulled documents, conflicts, key refusals and blocks.
  Assert<Covers<RemoteDoc, Contract.RemoteDoc>>,
  Assert<Covers<KeyConflict, Contract.RejectedKey>>,
  Assert<Covers<KeyBlock, Contract.KeyBlock>>,
  // The web sends the inputs of the Tauri commands to the domain API.
  Assert<Covers<Contract.ProjectInput, Sent<typeof projectInputSchema>>>,
  Assert<Covers<Contract.TestPlanInput, Sent<typeof testPlanInputSchema>>>,
  Assert<Covers<Contract.TestCaseInput, Sent<typeof testCaseInputSchema>>>,
  Assert<Covers<Contract.RequirementInput, Sent<typeof requirementInputSchema>>>,
  Assert<Covers<Contract.RequirementImportRow, Sent<typeof requirementImportSchema>["rows"][number]>>,
  Assert<Covers<Contract.PlannerCardInput, Sent<typeof plannerCardInputSchema>>>,
];
