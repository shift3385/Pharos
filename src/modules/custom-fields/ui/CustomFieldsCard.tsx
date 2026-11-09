import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Copy,
  GripVertical,
  ListPlus,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Menu, MenuItem, MenuSeparator } from "@shared/ui/Menu";
import { SegmentedControl } from "@shared/ui/SegmentedControl";
import { StatusPill } from "@shared/ui/StatusPill";
import { Switch } from "@shared/ui/Switch";
import { usePopover } from "@shared/ui/usePopover";
import { useToast } from "@shared/ui/Toast";
import { ListSkeleton } from "@shared/ui/Skeleton";
import { customFieldApi } from "../api/customFieldApi";
import type { CustomField, CustomFieldInput } from "../model/types";
import { CustomFieldDialog } from "./CustomFieldDialog";
import { CopyFieldsDialog, type ProjectOption } from "./CopyFieldsDialog";
import "@shared/ui/buttons.css";
import "@shared/ui/headerActions.css";
import "./CustomFields.css";

/** The message of a refused save: a known code of the repository
 *  (`custom_field.<code>`) in words, anything else generic. */
function errorText(t: (k: string) => string, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const code = /custom_field\.([a-z_]+)/.exec(msg)?.[1];
  const known = code ? t(`customFields.error.${code}`) : "";
  return known && !known.startsWith("customFields.")
    ? known
    : t("customFields.saveFailed");
}

function FieldRow({
  field,
  index,
  count,
  onEdit,
  onArchive,
  onMove,
}: {
  field: CustomField;
  index: number;
  count: number;
  onEdit: () => void;
  onArchive: () => void;
  onMove: (to: number) => void;
}) {
  const { t } = useTranslation();
  const menu = usePopover("menu");
  const sortable = useSortable({
    id: field.id,
    disabled: field.archivedAt !== null,
  });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.6 : 1,
  };
  const archived = field.archivedAt !== null;
  const applies =
    field.appliesToCaseTypes?.length === 1 ? field.appliesToCaseTypes[0] : null;
  return (
    <li
      ref={sortable.setNodeRef}
      style={style}
      className="cf-row"
      data-archived={archived || undefined}
    >
      {archived ? (
        <span className="cf-row__handle" aria-hidden="true" />
      ) : (
        <button
          type="button"
          className="cf-row__handle"
          {...sortable.attributes}
          {...sortable.listeners}
          aria-label={t("customFields.drag", { label: field.label })}
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>
      )}
      <div className="cf-row__main">
        <span className="cf-row__label">{field.label}</span>
        <span className="cf-row__meta">
          <code className="cf-mono">{field.fieldKey}</code>
          <span aria-hidden="true">·</span>
          <span>{t(`customFields.type.${field.fieldType}`)}</span>
          {applies && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {applies === "standard"
                  ? t("customFields.appliesStandard")
                  : t("customFields.appliesChecklist")}
              </span>
            </>
          )}
        </span>
      </div>
      <span className="cf-row__pills">
        {field.required && (
          <StatusPill tone="info">{t("customFields.required")}</StatusPill>
        )}
        {archived && (
          <StatusPill tone="neutral">{t("customFields.archived")}</StatusPill>
        )}
      </span>
      <button
        type="button"
        className="cf-icon-btn"
        aria-label={t("customFields.actions", { label: field.label })}
        {...menu.triggerProps}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      <Menu
        open={menu.open}
        onClose={menu.close}
        anchorRef={menu.anchorRef}
        id={menu.id}
        label={t("customFields.actions", { label: field.label })}
        placement="bottom-end"
      >
        <MenuItem onSelect={onEdit}>{t("customFields.edit")}</MenuItem>
        {!archived && (
          <>
            <MenuItem disabled={index === 0} onSelect={() => onMove(index - 1)}>
              {t("customFields.moveUp")}
            </MenuItem>
            <MenuItem
              disabled={index >= count - 1}
              onSelect={() => onMove(index + 1)}
            >
              {t("customFields.moveDown")}
            </MenuItem>
          </>
        )}
        <MenuSeparator />
        <MenuItem onSelect={onArchive}>
          {archived ? t("customFields.unarchive") : t("customFields.archive")}
        </MenuItem>
      </Menu>
    </li>
  );
}

/** The entities whose fields the card defines (FLD-01 cases, FLD-03 defects). */
const CARD_ENTITIES = ["test_case", "defect"] as const;
type CardEntity = (typeof CARD_ENTITIES)[number];

/** «Campos personalizados» of the project settings (FLD-01, FLD-03): create,
 *  edit, reorder (drag or the row menu) and archive the definitions of the
 *  project's test cases or defects (the «Casos / Defectos» selector), and
 *  copy them from another project. Archived fields are hidden unless
 *  «Mostrar archivados» is on; they keep their values. */
export function CustomFieldsCard({
  projectId,
  userId,
  loadProjects,
}: {
  projectId: string;
  userId: string;
  /** The user's other projects, for «Copiar de otro proyecto». */
  loadProjects: () => Promise<ProjectOption[]>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const titleId = useId();
  const [entity, setEntity] = useState<CardEntity>("test_case");
  const [fields, setFields] = useState<CustomField[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<CustomField | "new" | null>(null);
  const [copying, setCopying] = useState(false);
  const [announce, setAnnounce] = useState("");

  // Loads again only when the project or the account changes: the toast
  // and the translator are read through a ref, so a provider that hands out
  // new ones on each render never loops the request.
  const notify = useRef({ toast, t });
  notify.current = { toast, t };
  // Only the latest request lands: a list of the entity left behind by a
  // quick switch never replaces the one now shown.
  const latest = useRef(0);
  const reload = useCallback(async () => {
    const ticket = ++latest.current;
    try {
      const list = await customFieldApi.list(projectId, userId, entity);
      if (ticket === latest.current) setFields(list);
    } catch {
      if (ticket !== latest.current) return;
      setFields([]);
      notify.current.toast(notify.current.t("customFields.loadFailed"), "error");
    }
  }, [projectId, userId, entity]);
  useEffect(() => {
    void reload();
  }, [reload]);

  function switchEntity(next: CardEntity) {
    if (next === entity) return;
    setFields(null);
    setShowArchived(false);
    setEntity(next);
  }

  const live = (fields ?? []).filter((f) => f.archivedAt === null);
  const archived = (fields ?? []).filter((f) => f.archivedAt !== null);
  const shown = showArchived ? [...live, ...archived] : live;

  async function save(input: CustomFieldInput) {
    try {
      const saved =
        editing && editing !== "new"
          ? await customFieldApi.update(editing.id, input)
          : await customFieldApi.create(input);
      toast(
        t("customFields.savedToast", { label: saved?.label ?? input.label }),
      );
      setEditing(null);
      await reload();
    } catch (e) {
      toast(errorText(t, e), "error");
    }
  }

  async function toggleArchived(f: CustomField) {
    const archive = f.archivedAt === null;
    try {
      await customFieldApi.archive(f.id, archive, userId);
      toast(
        t(
          archive ? "customFields.archivedToast" : "customFields.restoredToast",
          { label: f.label },
        ),
      );
      await reload();
    } catch (e) {
      toast(errorText(t, e), "error");
    }
  }

  async function move(from: number, to: number) {
    const order = arrayMove(live, from, to);
    setFields([...order, ...archived]);
    setAnnounce(
      t("customFields.moved", { label: live[from].label, n: to + 1 }),
    );
    try {
      await customFieldApi.reorder(
        projectId,
        order.map((f) => f.id),
        userId,
        entity,
      );
    } catch (e) {
      toast(errorText(t, e), "error");
    }
    await reload();
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const ids = live.map((f) => f.id);
  const n = (id: UniqueIdentifier) => ids.indexOf(String(id)) + 1;
  const label = (id: UniqueIdentifier) =>
    live.find((f) => f.id === String(id))?.label ?? "";
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      t("customFields.dragStart", { label: label(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t("customFields.dragOver", { label: label(active.id), to: n(over.id) })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t("customFields.dragEnd", { label: label(active.id), to: n(over.id) })
        : undefined,
    onDragCancel: ({ active }) =>
      t("customFields.dragCancel", { label: label(active.id) }),
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id)
      void move(n(active.id) - 1, n(over.id) - 1);
  };

  return (
    <section
      className="pj-card-box"
      aria-labelledby={titleId}
      data-testid="custom-fields-card"
    >
      <div className="cf-card__head">
        <div className="pj-card-box__head">
          <h2 id={titleId} className="pj-section-title">
            {t("customFields.title")}
          </h2>
          <p className="pj-card-box__desc">
            {t(
              entity === "defect"
                ? "customFields.descDefect"
                : "customFields.desc",
            )}
          </p>
        </div>
        <div className="cf-card__actions">
          <button
            type="button"
            className="header-action"
            onClick={() => setCopying(true)}
          >
            <Copy size={16} aria-hidden="true" />
            <span className="header-action__label">
              {t("customFields.copy")}
            </span>
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            onClick={() => setEditing("new")}
          >
            <Plus size={16} aria-hidden="true" />
            {t("customFields.new")}
          </button>
        </div>
      </div>

      <SegmentedControl<CardEntity>
        label={t("customFields.entity.label")}
        size="sm"
        className="cf-entity"
        testId="custom-fields-entity"
        value={entity}
        onChange={switchEntity}
        options={CARD_ENTITIES.map((e) => ({
          value: e,
          label: t(`customFields.entity.${e}`),
        }))}
      />

      {fields === null ? (
        <ListSkeleton rows={3} />
      ) : fields.length === 0 ? (
        <p className="cf-empty">
          <ListPlus size={18} aria-hidden="true" />
          <span>
            {t(
              entity === "defect"
                ? "customFields.emptyDefect"
                : "customFields.empty",
            )}
          </span>
        </p>
      ) : (
        <>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
            accessibility={{
              announcements,
              screenReaderInstructions: { draggable: t("customFields.dragHelp") },
            }}
          >
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <ul className="cf-list" aria-label={t("customFields.listLabel")}>
                {shown.map((f) => {
                  const index = live.indexOf(f);
                  return (
                    <FieldRow
                      key={f.id}
                      field={f}
                      index={index}
                      count={live.length}
                      onEdit={() => setEditing(f)}
                      onArchive={() => void toggleArchived(f)}
                      onMove={(to) => void move(index, to)}
                    />
                  );
                })}
              </ul>
            </SortableContext>
          </DndContext>
          {archived.length > 0 && (
            <Switch
              label={`${t("customFields.showArchived")} (${archived.length})`}
              checked={showArchived}
              onChange={setShowArchived}
            />
          )}
        </>
      )}
      <span className="sr-only" role="status">
        {announce}
      </span>

      {editing && (
        <CustomFieldDialog
          field={editing === "new" ? null : editing}
          entity={entity}
          takenKeys={(fields ?? []).map((f) => f.fieldKey)}
          projectId={projectId}
          userId={userId}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
      {copying && (
        <CopyFieldsDialog
          projectId={projectId}
          entity={entity}
          userId={userId}
          loadProjects={loadProjects}
          onDone={() => {
            setCopying(false);
            void reload();
          }}
          onCancel={() => setCopying(false)}
        />
      )}
    </section>
  );
}
