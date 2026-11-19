import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Save } from "lucide-react";
import { StatusPill } from "@shared/ui/StatusPill";
import { TabPanel, Tabs } from "@shared/ui/Tabs";
import type { LibraryItem } from "../model/types";
import { UsagePanel, VersionsPanel } from "./ItemPanels";

type SubTab = "content" | "usage" | "versions";

/** The frame of both editors (bocetos 2 and 5): back to the list, the name
 *  with its version, the sub-tabs «Pasos|Datos», «Usado en» and «Versiones»,
 *  and the actions (Guardar, Marcar obsoleto / Reactivar, Eliminar). */
export function ItemEditorFrame({
  item,
  title,
  contentLabel,
  userId,
  saving,
  canSave,
  onBack,
  onSave,
  onToggleStatus,
  onDelete,
  when,
  children,
}: {
  item: LibraryItem | null;
  title: string;
  /** «Pasos» or «Datos». */
  contentLabel: string;
  userId: string;
  saving: boolean;
  canSave: boolean;
  onBack: () => void;
  onSave: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  when: (s: string) => string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  const [tab, setTab] = useState<SubTab>("content");
  const inUse = (item?.usedBy ?? 0) > 0;
  const items = [
    { id: "content", label: contentLabel },
    ...(item
      ? [
          {
            id: "usage",
            label: t("library.editor.usedIn", { count: item.usedBy }),
          },
          {
            id: "versions",
            label: t("library.editor.versions", { count: item.version }),
          },
        ]
      : []),
  ];
  return (
    <section className="lb-editor" aria-labelledby={`${hintId}-title`}>
      <div className="lb-editor__bar">
        <button
          type="button"
          className="ui-btn ui-btn--small ui-btn--ghost"
          onClick={onBack}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span className="ui-btn__text">{t("library.editor.back")}</span>
        </button>
      </div>
      <header className="lb-editor__head">
        <h2 id={`${hintId}-title`} className="lb-editor__title">
          {title}
        </h2>
        {item && <span className="lb-version">v{item.version}</span>}
        {item?.status === "obsolete" && (
          <StatusPill tone="neutral" strike>
            {t("library.status.obsolete")}
          </StatusPill>
        )}
      </header>
      {items.length > 1 && (
        <Tabs
          label={t("library.editor.sections")}
          variant="underline"
          idPrefix="lb-item-"
          items={items}
          value={tab}
          onChange={(v) => setTab(v as SubTab)}
        />
      )}
      {!item ? (
        <div className="lb-editor__body">
          {children}
          <div className="lb-editor__actions">
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              onClick={onSave}
              disabled={saving || !canSave}
            >
              <Save size={16} aria-hidden="true" />
              <span className="ui-btn__text">
                {saving ? t("library.editor.saving") : t("library.editor.save")}
              </span>
            </button>
          </div>
        </div>
      ) : tab === "content" ? (
        <TabPanel id="content" idPrefix="lb-item-" className="lb-editor__body">
          {children}
          <div className="lb-editor__actions">
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              onClick={onSave}
              disabled={saving || !canSave}
            >
              <Save size={16} aria-hidden="true" />
              <span className="ui-btn__text">
                {saving ? t("library.editor.saving") : t("library.editor.save")}
              </span>
            </button>
            {item && (
              <button type="button" className="ui-btn" onClick={onToggleStatus}>
                {item.status === "obsolete"
                  ? t("library.editor.reactivate")
                  : t("library.editor.markObsolete")}
              </button>
            )}
            {item && (
              <button
                type="button"
                className="ui-btn ui-btn--danger"
                onClick={onDelete}
                disabled={inUse}
                aria-describedby={inUse ? `${hintId}-del` : undefined}
              >
                {t("library.editor.delete")}
              </button>
            )}
            {inUse && (
              <span id={`${hintId}-del`} className="lb-muted">
                {t("library.editor.deleteInUse", { count: item?.usedBy ?? 0 })}
              </span>
            )}
          </div>
        </TabPanel>
      ) : tab === "usage" ? (
        <TabPanel id="usage" idPrefix="lb-item-" className="lb-editor__body">
          <UsagePanel item={item} userId={userId} />
        </TabPanel>
      ) : (
        <TabPanel id="versions" idPrefix="lb-item-" className="lb-editor__body">
          <VersionsPanel item={item} userId={userId} when={when} />
        </TabPanel>
      )}
    </section>
  );
}
