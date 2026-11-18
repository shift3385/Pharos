// The trash (RED-W3), desktop only: the web keeps no deleted rows (ADR-0048
// decision 2). Rust `trash.rs`.
import type { Assert, Contract, Covers } from "@shared/contracts";
import { invoke, isTauri } from "@shared/platform";

export type TrashEntity =
  | "project"
  | "test_plan"
  | "test_case"
  | "requirement"
  | "planner_card"
  | "run"
  | "test_cycle"
  | "defect"
  | "template";

export interface TrashItem {
  entity: TrashEntity;
  id: string;
  projectId: string | null;
  projectName: string | null;
  key: string | null;
  title: string;
  deletedAt: string;
  /** Went with its project, also in the trash: it comes back with it. */
  withProject: boolean;
  /** Kept by the purge until a pending change is sent or a conflict solved. */
  held: boolean;
  /** For a project: the listed rows that went with it. */
  children: number;
}

export interface TrashRef {
  entity: string;
  id: string;
}

export interface RestoreSummary {
  restored: number;
  withThem: number;
}

/** Rows removed, per kind (`purge::PurgeSummary`). */
export type PurgeCounts = Contract.PurgeSummary;

export const trashApi = {
  available: () => isTauri(),
  list: (userId: string): Promise<TrashItem[]> => invoke<TrashItem[]>("trash_list", { userId }),
  restore: (userId: string, items: TrashRef[]): Promise<RestoreSummary> =>
    invoke<RestoreSummary>("trash_restore", { userId, items }),
  /** `items` null: «Vaciar papelera». */
  purge: (userId: string, items: TrashRef[] | null): Promise<PurgeCounts> =>
    invoke<PurgeCounts>("trash_purge", { userId, items }),
};

/** Total rows a purge removed. */
export const purgedTotal = (s: PurgeCounts) =>
  Object.values(s).reduce<number>((n, v) => n + (typeof v === "number" ? v : 0), 0);

export type _RustContract = [
  Assert<Covers<Contract.TrashItem, TrashItem>>,
  Assert<Covers<TrashRef, Contract.TrashRef>>,
  Assert<Covers<Contract.RestoreSummary, RestoreSummary>>,
];
