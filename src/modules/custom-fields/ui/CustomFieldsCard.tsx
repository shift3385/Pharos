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
import { StatusPill } from "@shared/ui/StatusPill";
import { Switch } from "@shared/ui/Switch";
import { usePopover } from "@shared/ui/usePopover";
import { useToast } from "@shared/ui/Toast";
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

/** «Campos personalizados» of the project settings (FLD-01): create, edit,
 *  reorder (drag or the row menu) and archive the definitions of the
 *  project's test cases, and copy them from another project. Archived fields
 *  are hidden unless «Mostrar archivados» is on; they keep their values. */
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
  const reload = useCallback(async () => {
    try {
      setFields(await customFieldApi.list(projectId, userId));
    } catch {
      setFields([]);
      notify.current.toast(notify.current.t("customFields.loadFailed"), "error");
    }
  }, [projectId, userId]);
  useEffect(() => {
    void reload();
  }, [reload]);

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
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("testCase.drag.start", { n: n(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t("testCase.drag.over", { n: n(active.id), to: n(over.id) })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t("testCase.drag.end", { n: n(active.id), to: n(over.id) })
        : undefined,
    onDragCancel: ({ active }) =>
      t("testCase.drag.cancel", { n: n(active.id) }),
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
          <p className="pj-card-box__desc">{t("customFields.desc")}</p>
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

      {fields === null ? (
        <p className="tp__muted">{t("common.loading")}</p>
      ) : fields.length === 0 ? (
        <p className="cf-empty">
          <ListPlus size={18} aria-hidden="true" />
          <span>{t("customFields.empty")}</span>
        </p>
      ) : (
        <>
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
