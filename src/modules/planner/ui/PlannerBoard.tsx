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
import { Bug, Database, Flag, GripVertical, Link2, Plus, Search, SquareCheck, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@shared/ui/ConfirmDialog";
import { FilterChips } from "@shared/ui/FilterChips";
import { FilterMenuButton } from "@shared/ui/FilterMenuButton";
import { PriorityFlag, type FlagTone } from "@shared/ui/PriorityFlag";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { plannerApi } from "../api/plannerApi";
import {
  CARD_KINDS,
  CARD_PRIORITIES,
  CARD_STATUSES,
  type CardKind,
  type CardStatus,
  type LinkableCase,
  type PlannerCard,
} from "../model/types";
import { CardEditor } from "./CardEditor";
import "@shared/ui/buttons.css";
import "@shared/ui/filters.css";
import "./Planner.css";

const KIND_ICON = { task: SquareCheck, defect: Bug, test_data: Database } as const;
const PRIORITY_TONE: Record<string, FlagTone> = { critical: "error", high: "warning", medium: "info", low: "muted" };

const fold = (v: string) =>
  v
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** A card matches the kind chip, the search (title, key, labels) and the
 *  chosen priorities (none = any). */
function matches(card: PlannerCard, kind: string, query: string, priorities: ReadonlySet<string>): boolean {
  const q = fold(query.trim());
  return (
    (kind === "all" || card.kind === kind) &&
    (priorities.size === 0 || priorities.has(card.priority)) &&
    (!q || [card.title, card.cardKey ?? "", ...(card.data.labels ?? [])].some((v) => fold(v).includes(q)))
  );
}

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
  const [deleting, setDeleting] = useState<PlannerCard | null>(null);
  const [kind, setKind] = useState<"all" | CardKind>("all");
  const [query, setQuery] = useState("");
  const [priorities, setPriorities] = useState<Set<string>>(new Set());
  const mobile = useBreakpoint() === "mobile";
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

  const byStatus = useMemo(
    () => group(cards.filter((c) => matches(c, kind, query, priorities))),
    [cards, kind, query, priorities],
  );
  const kindCount = (k: CardKind | "all") => cards.filter((c) => matches(c, k, query, priorities)).length;

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

  async function remove(card: PlannerCard) {
    setDeleting(null);
    await plannerApi.remove(card.id, ownerId);
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
    <div className="pl">
      <header className="pl-head">
        <button
          type="button"
          className="ui-btn ui-btn--primary"
          onClick={() => setEditing({ card: null, status: "backlog" })}
        >
          <Plus size={16} aria-hidden="true" />
          <span className="ui-btn__text">{t("planner.newCard")}</span>
        </button>
      </header>
      <div className="pl-toolbar">
        <FilterChips
          label={t("planner.kind")}
          options={[
            { value: "all", label: t("planner.filter.all"), count: kindCount("all") },
            ...CARD_KINDS.map((k) => ({ value: k, label: t(`planner.filter.${k}`), count: kindCount(k) })),
          ]}
          value={kind}
          onChange={(v) => setKind(v as "all" | CardKind)}
        />
        <label className="ui-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">{t("planner.filter.searchLabel")}</span>
          <input
            type="search"
            value={query}
            placeholder={t("planner.filter.search")}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {!mobile && (
          <FilterMenuButton
            label={t("planner.priority")}
            icon={Flag}
            options={[...CARD_PRIORITIES].reverse().map((p) => ({ value: p, label: t(`planner.priorityLabel.${p}`) }))}
            selected={priorities}
            onChange={setPriorities}
          />
        )}
      </div>
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
              onDelete={setDeleting}
            />
          ))}
        </div>
      </DndContext>
      {deleting && (
        <ConfirmDialog
          variant="destructive"
          title={t("planner.deleteTitle")}
          message={t("planner.deleteMessage", { card: deleting.title })}
          confirmLabel={t("planner.deleteConfirm")}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void remove(deleting)}
        />
      )}
    </div>
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
  onDelete: (card: PlannerCard) => void;
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const add = t("planner.newCardIn", { column: title });
  return (
    <section className="pl-col" data-status={status} data-over={isOver} aria-labelledby={`pl-col-${status}`}>
      <header className="pl-col__head">
        <span className="pl-col__dot" aria-hidden="true" />
        <h3 id={`pl-col-${status}`} className="pl-col__title">
          {title}
        </h3>
        <span className="pl-col__count">
          <span className="sr-only">{t("planner.cardCount", { count: cards.length })}</span>
          <span aria-hidden="true">{cards.length}</span>
        </span>
        <span className="pl-col__spacer" />
        <button type="button" className="pl-col__plus" title={add} aria-label={add} onClick={onNew}>
          <Plus size={16} aria-hidden="true" />
        </button>
      </header>
      <div ref={setNodeRef} className="pl-col__drop">
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <Card key={card.id} card={card} onOpen={onOpen} onDelete={onDelete} />
          ))}
        </SortableContext>
      </div>
      <button type="button" className="pl-col__add" onClick={onNew}>
        <Plus size={15} aria-hidden="true" />
        {t("planner.addCard")}
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
  onDelete: (card: PlannerCard) => void;
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
  const Icon = KIND_ICON[card.kind];
  const links = card.data.testCaseIds?.length ?? 0;
  const del = `${t("common.delete")}: ${card.title}`;
  return (
    <article ref={setNodeRef} style={style} className="pl-card" data-priority={card.priority} {...pointer}>
      <div className="pl-card__top">
        <button
          type="button"
          className="pl-card__handle"
          {...attributes}
          onKeyDown={onKeyDown as KeyboardEventHandler<HTMLButtonElement> | undefined}
          aria-label={t("planner.drag.handle", { card: card.title })}
        >
          <GripVertical size={14} aria-hidden="true" />
        </button>
        <span className={`pl-card__kind pl-card__kind--${card.kind}`}>
          <Icon size={13} aria-hidden="true" />
          {t(`planner.kindLabel.${card.kind}`)}
        </span>
        <span className="pl-card__spacer" />
        {card.cardKey && <span className="pl-card__key">{card.cardKey}</span>}
        <button
          type="button"
          className="pl-card__del"
          aria-label={del}
          title={del}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onDelete(card)}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        className="pl-card__title"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onOpen(card)}
      >
        {card.title}
      </button>
      {(card.data.labels ?? []).length > 0 && (
        <div className="pl-card__labels">
          {(card.data.labels ?? []).map((l) => (
            <span key={l} className="pl-card__label" title={l}>
              {l}
            </span>
          ))}
        </div>
      )}
      <div className="pl-card__foot">
        <PriorityFlag
          tone={PRIORITY_TONE[card.priority] ?? "muted"}
          label={t(`planner.priorityLabel.${card.priority}`)}
          showLabel
        />
        {links > 0 && (
          <span className="pl-card__links" title={t("planner.linksTitle", { count: links })}>
            <Link2 size={13} aria-hidden="true" />
            <span className="sr-only">{t("planner.linksTitle", { count: links })}</span>
            <span aria-hidden="true">{links}</span>
          </span>
        )}
      </div>
    </article>
  );
}
