// The fixed lifecycle of a defect in 0.2.0 (ADR-0016): the twin of
// `src-tauri/src/defects/lifecycle.rs`; both check the transition table of
// `src-tauri/tests/fixtures/defect-vectors.json`.

import { BOARD_COLUMNS, OTHER_STATUSES, type BoardColumn, type DefectStatus } from "./types";

export const NEXT_STATUSES: Record<DefectStatus, readonly DefectStatus[]> = {
  new: ["open", "rejected", "deferred"],
  open: ["in_progress", "rejected", "deferred"],
  in_progress: ["fixed"],
  fixed: ["retest"],
  retest: ["closed", "open"],
  closed: ["open"],
  rejected: ["open"],
  deferred: ["open"],
};

/** True if `from → to` is allowed; staying where it is always is. */
export const transitionAllowed = (from: DefectStatus, to: DefectStatus): boolean =>
  from === to || NEXT_STATUSES[from].includes(to);

/** `closed` and `rejected` carry a resolution, and only they do. */
export const needsResolution = (status: DefectStatus): boolean => status === "closed" || status === "rejected";

/** The matrix and the dashboard count a defect as open unless it is closed
 *  or rejected: a deferred defect is still open. */
export const isOpenDefect = (status: string): boolean => status !== "closed" && status !== "rejected";

/** The board column of a status. */
export const columnOf = (status: DefectStatus): BoardColumn =>
  OTHER_STATUSES.includes(status) ? "other" : (status as BoardColumn);

/** The statuses a drop on `column` may mean for a defect in `from`. */
export function dropTargets(from: DefectStatus, column: BoardColumn): DefectStatus[] {
  const candidates: DefectStatus[] = column === "other" ? [...OTHER_STATUSES] : [column as DefectStatus];
  return candidates.filter((s) => s !== from && transitionAllowed(from, s));
}

export { BOARD_COLUMNS };
