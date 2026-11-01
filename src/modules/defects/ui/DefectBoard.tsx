import { useState, type KeyboardEventHandler } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Link2 } from "lucide-react";
import { PriorityFlag } from "@shared/ui/PriorityFlag";
import { useToast } from "@shared/ui/Toast";
import { defectsApi } from "../api/defectsApi";
import { columnOf, dropTargets, needsResolution } from "../model/lifecycle";
import {
  BOARD_COLUMNS,
  type BoardColumn,
  type Defect,
  type DefectResolution,
  type DefectStatus,
} from "../model/types";
import { SeverityPill, StatusBadge } from "./badges";
import { PRIORITY_TONE } from "./tones";
import { TransitionDialog } from "./TransitionDialog";

/** The keyboard moves a picked-up defect a whole column at a time (left and
 *  right arrows): its status is its column, so there is nothing to move to
 *  inside one. */
const toNextColumn: KeyboardCoordinateGetter = (event, { context }) => {
  const step = event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1 : 0;
  const rect = context.collisionRect;
  if (!step || !rect) return undefined;
  event.preventDefault();
  const columns = [...context.droppableRects.values()].sort((a, b) => a.left - b.left);
  const center = rect.left + rect.width / 2;
  const at = columns.findIndex((c) => center >= c.left && center <= c.left + c.width);
  const next = columns[(at < 0 ? 0 : at) + step];
  if (!next) return undefined;
  return { x: next.left + next.width / 2 - rect.width / 2, y: rect.top };
};

/**
 * The board by status (ADR-0016, user decision 1). Columns follow the main
 * flow; rejected and deferred share «Otros». A drop is a status change, only
 * along the lifecycle: one that is not allowed is refused with a message, and
 * closing, rejecting or a drop on «Otros» ask first (`TransitionDialog`).
 * The order inside a column is by key: a defect has no position.
 */
export function DefectBoard({
  defects,
  userId,
  onOpen,
  onChanged,
}: {
  defects: Defect[];
  userId: string;
  onOpen: (d: Defect) => void;
  onChanged: (d: Defect) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [asking, setAsking] = useState<{ defect: Defect; statuses: DefectStatus[] } | null>(null);
  // The mouse drags the whole card; the keyboard picks it up with its handle
  // and moves it column by column (WCAG 2.1.1, as on the planner).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: toNextColumn }),
  );
  const byColumn = (c: BoardColumn) =>
    defects
      .filter((d) => columnOf(d.status) === c)
      .sort((a, b) => a.defectKey.localeCompare(b.defectKey, undefined, { numeric: true }));
  const titleOf = (id: unknown) => defects.find((d) => d.id === id)?.title ?? "";
  const columnName = (id: unknown) => t(`defects.status.${String(id)}`);
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("defects.board.drag.start", { defect: titleOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over ? t("defects.board.drag.over", { defect: titleOf(active.id), column: columnName(over.id) }) : undefined,
    onDragEnd: ({ active, over }) =>
      over ? t("defects.board.drag.end", { defect: titleOf(active.id), column: columnName(over.id) }) : undefined,
    onDragCancel: ({ active }) => t("defects.board.drag.cancel", { defect: titleOf(active.id) }),
  };

  async function apply(d: Defect, status: DefectStatus, resolution: DefectResolution | null, build: string | null) {
    setAsking(null);
    try {
      const next = await defectsApi.transition(d.id, userId, status, resolution, build);
      if (next) onChanged(next);
    } catch (e) {
      toast(t("defects.board.moveFailed", { reason: e instanceof Error ? e.message : String(e) }));
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const d = defects.find((x) => x.id === e.active.id);
    const column = e.over?.id as BoardColumn | undefined;
    if (!d || !column || columnOf(d.status) === column) return;
    const targets = dropTargets(d.status, column);
    if (targets.length === 0) {
      toast(t("defects.board.notAllowed", { from: t(`defects.status.${d.status}`), to: columnName(column) }));
      return;
    }
    if (targets.length > 1 || needsResolution(targets[0])) {
      setAsking({ defect: d, statuses: targets });
      return;
    }
    void apply(d, targets[0], null, null);
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={onDragEnd}
        accessibility={{ announcements, screenReaderInstructions: { draggable: t("defects.board.drag.help") } }}
      >
        <div className="df-board" role="region" aria-label={t("defects.board.label")}>
          {BOARD_COLUMNS.map((c) => (
            <Column key={c} column={c} defects={byColumn(c)} onOpen={onOpen} />
          ))}
        </div>
      </DndContext>
      {asking && (
        <TransitionDialog
          defect={asking.defect}
          statuses={asking.statuses}
          onCancel={() => setAsking(null)}
          onApply={(s, r, b) => void apply(asking.defect, s, r, b)}
        />
      )}
    </>
  );
}

function Column({ column, defects, onOpen }: { column: BoardColumn; defects: Defect[]; onOpen: (d: Defect) => void }) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: column });
  const title = t(`defects.status.${column}`);
  return (
    <section className="df-col" data-column={column} data-over={isOver} aria-labelledby={`df-col-${column}`}>
      <header className="df-col__head">
        <h3 id={`df-col-${column}`} className="df-col__title">
          {title}
        </h3>
        <span className="df-col__count">
          <span className="sr-only">{t("defects.count", { count: defects.length })}</span>
          <span aria-hidden="true">{defects.length}</span>
        </span>
      </header>
      <div ref={setNodeRef} className="df-col__drop">
        {defects.map((d) => (
          <Card key={d.id} defect={d} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function Card({ defect: d, onOpen }: { defect: Defect; onOpen: (d: Defect) => void }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: d.id });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 };
  // The mouse drags the whole card; the keyboard drag lives on the handle, so
  // the card holds no nested interactive roles (as on the planner board).
  const { onKeyDown, ...pointer } = listeners ?? {};
  const links = d.caseIds.length;
  return (
    <article ref={setNodeRef} style={style} className="df-card" data-severity={d.severity} {...pointer}>
      <div className="df-card__top">
        <button
          type="button"
          className="df-card__handle"
          {...attributes}
          onKeyDown={onKeyDown as KeyboardEventHandler<HTMLButtonElement> | undefined}
          aria-label={t("defects.board.drag.handle", { defect: d.title })}
        >
          <GripVertical size={14} aria-hidden="true" />
        </button>
        <span className="df-key">{d.defectKey}</span>
        <span className="df-spacer" />
        <SeverityPill severity={d.severity} />
      </div>
      <button
        type="button"
        className="df-card__title"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onOpen(d)}
      >
        {d.title}
      </button>
      <div className="df-card__foot">
        <PriorityFlag tone={PRIORITY_TONE[d.priority]} label={t(`defects.priority.${d.priority}`)} showLabel />
        {columnOf(d.status) === "other" && <StatusBadge defect={d} />}
        {links > 0 && (
          <span className="df-card__links" title={t("defects.casesTitle", { count: links })}>
            <Link2 size={13} aria-hidden="true" />
            <span className="sr-only">{t("defects.casesTitle", { count: links })}</span>
            <span aria-hidden="true">{links}</span>
          </span>
        )}
      </div>
    </article>
  );
}
