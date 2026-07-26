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
}

export interface PlannerCard {
  id: string;
  projectId: string;
  kind: CardKind;
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
