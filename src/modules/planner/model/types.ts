// Planner model (spec §7). A per-project kanban whose cards are tasks or test
// data, moved across four columns. Defects have their own module since DEF-01
// (ADR-0016); the planner no longer creates or shows them.

import type { Assert, Contract, Covers } from "@shared/contracts";

export type CardKind = "task" | "test_data";
export type CardStatus = "backlog" | "in_progress" | "in_review" | "done";
export type CardPriority = "low" | "medium" | "high" | "critical";

export const CARD_STATUSES: CardStatus[] = [
  "backlog",
  "in_progress",
  "in_review",
  "done",
];
export const CARD_KINDS: CardKind[] = ["task", "test_data"];
export const CARD_PRIORITIES: CardPriority[] = [
  "low",
  "medium",
  "high",
  "critical",
];

export interface CardData {
  description?: string;
  labels?: string[];
}

export interface PlannerCard {
  id: string;
  projectId: string;
  kind: CardKind;
  /** The DEF key a card kept from before DEF-01 (a task that was once a
   *  defect); new cards never get one. */
  cardKey?: string | null;
  title: string;
  status: CardStatus;
  priority: CardPriority;
  position: number;
  data: CardData;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface PlannerCardInput {
  projectId: string;
  ownerId: string;
  kind: CardKind;
  title: string;
  status?: CardStatus;
  priority?: CardPriority;
  data: CardData;
}

export interface AttachmentSummary {
  id: string;
  name: string;
  mime: string | null;
  size: number;
}

// The Rust contract (BASE-05, ADR-0026): what Rust sends covers what this model
// reads, and what this model sends covers what Rust reads. `tsc` fails if a
// field is renamed, dropped or retyped on either side.
export type _RustContract = [
  Assert<Covers<Contract.PlannerCard, PlannerCard>>,
  Assert<Covers<Contract.AttachmentSummary, AttachmentSummary>>,
  Assert<Covers<PlannerCardInput, Contract.PlannerCardInput>>,
];
