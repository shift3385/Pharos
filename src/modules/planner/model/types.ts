// Planner model (spec §7). A per-project kanban whose cards are tasks, defects
// or test data, moved across four columns.

export type CardKind = "task" | "defect" | "test_data";
export type CardStatus = "backlog" | "in_progress" | "in_review" | "done";
export type CardPriority = "low" | "medium" | "high" | "critical";

export const CARD_STATUSES: CardStatus[] = [
  "backlog",
  "in_progress",
  "in_review",
  "done",
];
export const CARD_KINDS: CardKind[] = ["task", "defect", "test_data"];
export const CARD_PRIORITIES: CardPriority[] = [
  "low",
  "medium",
  "high",
  "critical",
];

export interface CardData {
  description?: string;
  labels?: string[];
  /** Test cases a defect is linked to (traceability matrix, TRZ-02). */
  testCaseIds?: string[];
}

/** A test case a defect can be linked to (supplied by the projects module). */
export interface LinkableCase {
  id: string;
  scenarioId: string;
  title: string;
}

export const DEFECT_KEY_PREFIX = "DEF-";

export interface PlannerCard {
  id: string;
  projectId: string;
  kind: CardKind;
  /** Visible id of a defect (DEF-001…), numbered per project; null otherwise. */
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

export interface AttachmentData {
  name: string;
  mime: string | null;
  dataBase64: string;
}
