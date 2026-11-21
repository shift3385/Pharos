import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { Announcements, DragEndEvent, UniqueIdentifier } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { DeleteButton } from "@shared/ui/fields";
import { TextArea } from "@shared/ui/TextArea";
import type { Step } from "../model/types";
import { newStepId } from "../model/steps";

function SortableStep({
  id,
  inputId,
  index,
  start,
  value,
  onChange,
  onRemove,
}: {
  id: string;
  inputId: string;
  index: number;
  /** Steps shown before this list (a shared step's block, CAS-01). */
  start: number;
  value: string;
  onChange: (v: string) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const name = t("testCase.stepN", { n: start + index + 1 });
  return (
    <div ref={setNodeRef} style={style}>
      <div className="tc-step">
        <button
          type="button"
          className="tc-step__handle"
          {...attributes}
          {...listeners}
          aria-label={`${t("testCase.dragStep")}: ${name}`}
        >
          ⠿
        </button>
        <span className="tc-step__n" aria-hidden="true">
          {start + index + 1}
        </span>
        {/* A step is one line of text, but a long one wraps and the field
            grows instead of cutting it (FIX-44); Enter does not break it. */}
        <TextArea
          id={inputId}
          size="cell"
          className="tc-step__text"
          aria-label={name}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\r?\n/g, " "))}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
        />
        <DeleteButton itemLabel={name} needsConfirm={value.trim() !== ""} onDelete={onRemove} />
      </div>
    </div>
  );
}

/** Reorderable list of test steps (drag & drop, spec §5.3). The handle also
 *  works from the keyboard (Space to pick up, arrows to move, Space to drop,
 *  Escape to cancel) and each move is announced (WCAG 2.1.1, UX-05). Steps
 *  are not checked for repeats: "Click Next" twice is a normal test. Each step
 *  keeps its stable id (DAT-02) when it is edited or moved; a new one gets a
 *  fresh id. */
export function SortableSteps({
  steps,
  onChange,
  label,
  start = 0,
  addable = true,
  addLabel,
  actions,
}: {
  steps: Step[];
  onChange: (next: Step[]) => void;
  label: string;
  /** Numbering offset: steps shown before this list (CAS-01 blocks). */
  start?: number;
  /** False: no «Añadir paso» (a run of steps between two blocks). */
  addable?: boolean;
  /** The add button's text when the items are not steps (FIX-51: a
   *  checklist read «+ Añadir paso» under «Comprobaciones»). */
  addLabel?: string;
  /** More buttons next to «Añadir paso» («Insertar paso compartido…»). */
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  const baseId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = steps.map((s) => s.id);
  const n = (id: UniqueIdentifier) => ids.indexOf(String(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("testCase.drag.start", { n: n(active.id) }),
    onDragOver: ({ active, over }) =>
      over ? t("testCase.drag.over", { n: n(active.id), to: n(over.id) }) : undefined,
    onDragEnd: ({ active, over }) =>
      over ? t("testCase.drag.end", { n: n(active.id), to: n(over.id) }) : undefined,
    onDragCancel: ({ active }) => t("testCase.drag.cancel", { n: n(active.id) }),
  };

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onChange(
        arrayMove(
          steps,
          ids.indexOf(String(active.id)),
          ids.indexOf(String(over.id)),
        ),
      );
    }
  }

  return (
    <div className="tc-steps-field" role="group" aria-label={label}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: t("testCase.drag.help") },
        }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="tc-steps">
            {steps.map((step, i) => (
              <SortableStep
                key={step.id}
                id={step.id}
                inputId={`${baseId}-${i}`}
                index={i}
                start={start}
                value={step.text}
                onChange={(v) => {
                  const next = [...steps];
                  next[i] = { ...step, text: v };
                  onChange(next);
                }}
                onRemove={() => onChange(steps.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {addable && (
        <div className="tc-steps-field__actions">
          <button
            type="button"
            className="tp-list-field__add"
            onClick={() =>
              onChange([...steps, { id: newStepId(new Set(ids)), text: "" }])
            }
          >
            + {addLabel ?? t("testCase.addStep")}
          </button>
          {actions}
        </div>
      )}
    </div>
  );
}
