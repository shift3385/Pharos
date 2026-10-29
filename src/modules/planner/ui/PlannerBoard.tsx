import { useEffect, useMemo, useState, type KeyboardEventHandler } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DeleteButton } from "@shared/ui/fields";
import { plannerApi } from "../api/plannerApi";
import {
  CARD_STATUSES,
  type CardStatus,
  type LinkableCase,
  type PlannerCard,
} from "../model/types";
import { CardEditor } from "./CardEditor";
import "./Planner.css";

type EditView = { card: PlannerCard | null; status: CardStatus };

function group(cards: PlannerCard[]): Record<CardStatus, PlannerCard[]> {
  const by = {
    backlog: [],
    in_progress: [],
    in_review: [],
    done: [],
  } as Record<CardStatus, PlannerCard[]>;
  for (const c of cards) by[c.status]?.push(c);
  for (const s of CARD_STATUSES) by[s].sort((a, b) => a.position - b.position);
  return by;
}

export function PlannerBoard({
  projectId,
  ownerId,
  cases,
}: {
  projectId: string;
  ownerId: string;
  /** Test cases a defect can be linked to (supplied by the projects module). */
  cases?: LinkableCase[];
}) {
  const { t } = useTranslation();
  const [cards, setCards] = useState<PlannerCard[]>([]);
  const [editing, setEditing] = useState<EditView | null>(null);
  // The mouse drags the whole card; the keyboard moves it with the card's
  // handle (Space, arrows across rows and columns, Space), announced in the UI
  // language (WCAG 2.1.1, UX-05).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const titleOf = (id: unknown) => cards.find((c) => c.id === id)?.title ?? "";
  const placeOf = (id: unknown) => {
    const key = String(id);
    if ((CARD_STATUSES as string[]).includes(key)) return t(`planner.column.${key}`);
    const card = cards.find((c) => c.id === key);
    return card ? t(`planner.column.${card.status}`) : "";
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("planner.drag.start", { card: titleOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over ? t("planner.drag.over", { card: titleOf(active.id), column: placeOf(over.id) }) : undefined,
    onDragEnd: ({ active, over }) =>
      over ? t("planner.drag.end", { card: titleOf(active.id), column: placeOf(over.id) }) : undefined,
    onDragCancel: ({ active }) => t("planner.drag.cancel", { card: titleOf(active.id) }),
  };

  async function refresh() {
    setCards(await plannerApi.list(projectId, ownerId));
  }
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, ownerId]);

  const byStatus = useMemo(() => group(cards), [cards]);

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeCard = cards.find((c) => c.id === active.id);
    if (!activeCard) return;
    const overId = String(over.id);
    const overStatus = (CARD_STATUSES as string[]).includes(overId)
      ? (overId as CardStatus)
      : cards.find((c) => c.id === overId)?.status;
    if (!overStatus) return;

    const sourceStatus = activeCard.status;
    const next = group(cards);
    next[sourceStatus] = next[sourceStatus].filter((c) => c.id !== active.id);
    const target = next[overStatus];
    let index = target.findIndex((c) => c.id === overId);
    if (index < 0) index = target.length;
    target.splice(index, 0, { ...activeCard, status: overStatus });

    const flat = CARD_STATUSES.flatMap((s) =>
      next[s].map((c, i) => ({ ...c, status: s, position: i })),
    );
    setCards(flat);
    await plannerApi.reorder(ownerId, overStatus, next[overStatus].map((c) => c.id));
    if (sourceStatus !== overStatus) {
      await plannerApi.reorder(ownerId, sourceStatus, next[sourceStatus].map((c) => c.id));
    }
  }

  async function remove(id: string) {
    await plannerApi.remove(id, ownerId);
    void refresh();
  }

  if (editing) {
    return (
      <CardEditor
        projectId={projectId}
        ownerId={ownerId}
        card={editing.card}
        initialStatus={editing.status}
        cases={cases}
        onClose={() => {
          setEditing(null);
          void refresh();
        }}
      />
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={onDragEnd}
      accessibility={{ announcements, screenReaderInstructions: { draggable: t("planner.drag.help") } }}
    >
      <div className="pl-board">
        {CARD_STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            title={t(`planner.column.${status}`)}
            cards={byStatus[status]}
            onNew={() => setEditing({ card: null, status })}
            onOpen={(card) => setEditing({ card, status })}
            onDelete={remove}
          />
        ))}
      </div>
    </DndContext>
  );
}

function Column({
  status,
  title,
  cards,
  onNew,
  onOpen,
  onDelete,
}: {
  status: CardStatus;
  title: string;
  cards: PlannerCard[];
  onNew: () => void;
  onOpen: (card: PlannerCard) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section className="pl-col" data-over={isOver} aria-labelledby={`pl-col-${status}`}>
      <header className="pl-col__head">
        <span id={`pl-col-${status}`} className="pl-col__title">
          {title}
        </span>
        <span className="pl-col__count">{cards.length}</span>
      </header>
      <div ref={setNodeRef} className="pl-col__drop">
        <SortableContext
          items={cards.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((card) => (
            <Card key={card.id} card={card} onOpen={onOpen} onDelete={onDelete} />
          ))}
        </SortableContext>
      </div>
      <button type="button" className="pl-col__add" onClick={onNew}>
        + {t("planner.newCard")}
      </button>
    </section>
  );
}

function Card({
  card,
  onOpen,
  onDelete,
}: {
  card: PlannerCard;
  onOpen: (card: PlannerCard) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  // The card itself only takes the mouse drag; the keyboard drag and the
  // sortable role live on the handle, so the card holds no nested controls.
  const { onKeyDown, ...pointer } = listeners ?? {};
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="pl-card"
      data-priority={card.priority}
      {...pointer}
    >
      <div className="pl-card__top">
        <button
          type="button"
          className="pl-card__handle"
          {...attributes}
          onKeyDown={onKeyDown as KeyboardEventHandler<HTMLButtonElement> | undefined}
          aria-label={t("planner.drag.handle", { card: card.title })}
        >
          ⠿
        </button>
        <span className={`pl-card__kind pl-card__kind--${card.kind}`}>
          {t(`planner.kindLabel.${card.kind}`)}
        </span>
        <span
          className="pl-card__del"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <DeleteButton itemLabel={card.title} needsConfirm onDelete={() => onDelete(card.id)} />
        </span>
      </div>
      <button
        type="button"
        className="pl-card__title"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onOpen(card)}
      >
        {card.cardKey && <span className="pl-card__key">{card.cardKey}</span>}
        {card.title}
      </button>
      <div className="pl-card__meta">
        <span className={`pl-card__prio pl-card__prio--${card.priority}`}>
          {t(`planner.priorityLabel.${card.priority}`)}
        </span>
        {(card.data.labels ?? []).map((l) => (
          <span key={l} className="pl-card__label">
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
