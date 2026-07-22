import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "react-i18next";
import { DeleteButton } from "@shared/ui/fields";

function SortableStep({
  id,
  index,
  value,
  onChange,
  onRemove,
}: {
  id: string;
  index: number;
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
  return (
    <div ref={setNodeRef} style={style} className="tc-step">
      <button
        type="button"
        className="tc-step__handle"
        aria-label={t("testCase.dragStep")}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <span className="tc-step__n">{index + 1}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
      <DeleteButton needsConfirm={value.trim() !== ""} onDelete={onRemove} />
    </div>
  );
}

/** Reorderable list of test steps (drag & drop, spec §5.3). */
export function SortableSteps({
  steps,
  onChange,
}: {
  steps: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const ids = steps.map((_, i) => String(i));

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onChange(arrayMove(steps, Number(active.id), Number(over.id)));
    }
  }

  return (
    <div className="tc-steps-field">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="tc-steps">
            {steps.map((value, i) => (
              <SortableStep
                key={i}
                id={String(i)}
                index={i}
                value={value}
                onChange={(v) => {
                  const next = [...steps];
                  next[i] = v;
                  onChange(next);
                }}
                onRemove={() => onChange(steps.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        className="tp-list-field__add"
        onClick={() => onChange([...steps, ""])}
      >
        + {t("testCase.addStep")}
      </button>
    </div>
  );
}
