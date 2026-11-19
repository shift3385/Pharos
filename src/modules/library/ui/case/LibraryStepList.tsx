import "../Library.css";
import { Fragment, type ReactNode } from "react";
import { joinSegments, segmentsOf } from "../../model/caseRefs";
import type {
  LibraryRefStatus,
  LibraryStep,
  SharedRef,
} from "../../model/types";
import { SharedStepBlock, type BlockActions } from "./SharedStepBlock";

/** A case's step list (Pasos or Precondiciones) with the calls of shared
 *  steps shown as read-only blocks (boceto 4). The case's own steps between
 *  them are edited with `renderOwn` (the editor's usual list field), which
 *  gets one run of own steps at a time; the last run always exists and is
 *  where «Añadir paso» adds. Without calls it is just `renderOwn(steps)`. */
export function LibraryStepList<S extends LibraryStep>({
  projectId,
  list,
  steps,
  refs,
  statuses,
  actions,
  onChange,
  renderOwn,
}: {
  projectId: string;
  list: SharedRef["list"];
  steps: S[];
  refs: SharedRef[];
  statuses: LibraryRefStatus[];
  actions: BlockActions;
  onChange: (next: S[]) => void;
  renderOwn: (
    own: S[],
    onChange: (next: S[]) => void,
    at: { start: number; last: boolean },
  ) => ReactNode;
}) {
  const segments = segmentsOf(steps, refs, list);
  return (
    <div className="lb-case-list">
      {segments.map((seg, i) => {
        const last = i === segments.length - 1;
        if (seg.kind === "own") {
          if (seg.steps.length === 0 && !last) return null;
          return (
            <Fragment key={`own-${i}`}>
              {renderOwn(
                seg.steps,
                (next) => onChange(joinSegments(segments, i, next)),
                { start: seg.start, last },
              )}
            </Fragment>
          );
        }
        return (
          <SharedStepBlock
            key={`block-${seg.ref.id}-${i}`}
            projectId={projectId}
            sharedRef={seg.ref}
            steps={seg.steps}
            start={seg.start}
            status={statuses.find(
              (s) => s.kind === "shared_step" && s.refId === seg.ref.id,
            )}
            actions={actions}
          />
        );
      })}
    </div>
  );
}
