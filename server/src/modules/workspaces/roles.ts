// Workspace roles and capabilities (SYNC-07, ADR-0019 permission table,
// ADR-0042 §1 and §8). The single source is
// `src/shared/contracts/workspace-roles.json`; this is its mirror, because
// the server image is built from `server/` alone. `tests/workspaces.roles.test.ts`
// holds both equal.

export const WORKSPACE_ROLES = [
  "test_manager",
  "test_analyst",
  "automation_engineer",
  "product_owner",
  "viewer",
] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

const ALL = WORKSPACE_ROLES;
const TM = ["test_manager"] as const;
const TM_TA = ["test_manager", "test_analyst"] as const;
const TM_TA_AE = ["test_manager", "test_analyst", "automation_engineer"] as const;

/** Who may do what. Read the table of ADR-0019 «Permisos». */
export const CAPABILITIES = {
  read: ALL,
  export: ALL,
  "members.manage": TM,
  "project.manage": TM,
  "plan.edit": TM_TA,
  "plan.approve": TM,
  "requirement.edit": ["test_manager", "test_analyst", "product_owner"],
  "case.edit": TM_TA_AE,
  "case.approve": TM_TA,
  "cycle.edit": TM_TA,
  "config.edit": TM_TA_AE,
  "field.edit": TM_TA,
  "planner.edit": TM_TA_AE,
  "run.execute": TM_TA_AE,
  "result.import": TM_TA_AE,
  "defect.edit": TM_TA_AE,
  "defect.create": ["test_manager", "test_analyst", "automation_engineer", "product_owner"],
  // SYNC-04b: adding evidence or an attachment, and the workspace's templates.
  "attachment.add": ["test_manager", "test_analyst", "automation_engineer", "product_owner"],
  "template.edit": TM_TA,
  "audit.read": TM,
  // INT-02/03 (ADR-0052): project tokens and webhooks of the workspace.
  "token.manage": TM,
} as const satisfies Record<string, readonly WorkspaceRole[]>;
export type Capability = keyof typeof CAPABILITIES;

export const isRole = (v: unknown): v is WorkspaceRole =>
  typeof v === "string" && (WORKSPACE_ROLES as readonly string[]).includes(v);

/** True if `role` has the capability. */
export function can(role: WorkspaceRole, cap: Capability): boolean {
  return (CAPABILITIES[cap] as readonly string[]).includes(role);
}

/** The capability a synced change of `entity` needs (ADR-0042 §2). `isNew`:
 *  the entity does not exist in the workspace yet (a Product Owner may create
 *  a defect but not edit one). Unknown entities need the strictest one. */
export function capabilityFor(entity: string, isNew: boolean): Capability {
  switch (entity) {
    case "project":
      return "project.manage";
    case "test_plan":
      return "plan.edit";
    case "requirement":
      return "requirement.edit";
    case "test_case":
    case "test_case_revision":
      return "case.edit";
    case "custom_field":
      return "field.edit";
    case "configuration":
      return "config.edit";
    case "test_cycle":
    case "test_cycle_item":
      return "cycle.edit";
    case "planner_card":
      return "planner.edit";
    // Findings and metrics only come from an import (ING-06, ADR-0053).
    case "run_shard":
    case "finding":
    case "metric":
      return "result.import";
    // A triage decision is a judgement on an executed result (ADR-0053).
    case "run":
    case "run_item":
    case "unlinked_mapping":
    case "result":
    case "finding_triage":
      return "run.execute";
    case "defect":
      return isNew ? "defect.create" : "defect.edit";
    case "defect_link":
      return "defect.edit";
    case "attachment":
      return "attachment.add";
    case "template":
      return "template.edit";
    default:
      return "members.manage";
  }
}
