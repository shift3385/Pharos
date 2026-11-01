import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, MonitorSmartphone, MoreHorizontal, Plus } from "lucide-react";
import { Menu, MenuItem, MenuSeparator } from "@shared/ui/Menu";
import { StatusPill } from "@shared/ui/StatusPill";
import { Switch } from "@shared/ui/Switch";
import { usePopover } from "@shared/ui/usePopover";
import { useToast } from "@shared/ui/Toast";
import { configurationApi } from "../api/cycleApi";
import { configurationError } from "../model/messages";
import { attributesLine, type Configuration, type ConfigurationInput } from "../model/types";
import { ConfigurationDialog } from "./ConfigurationDialog";
import "@shared/ui/buttons.css";
import "./Cycles.css";


function ConfigurationRow({
  configuration,
  index,
  count,
  onEdit,
  onArchive,
  onMove,
}: {
  configuration: Configuration;
  index: number;
  count: number;
  onEdit: () => void;
  onArchive: () => void;
  onMove: (to: number) => void;
}) {
  const { t } = useTranslation();
  const menu = usePopover("menu");
  const c = configuration;
  const line = attributesLine(c.attributes);
  const lost = c.labelClashes.filter((x) => !x.wins);
  return (
    <li className="cy-row" data-archived={c.archived || undefined}>
      <div className="cy-row__main">
        <span className="cy-row__label">{c.name}</span>
        {line && <span className="cy-row__meta">{line}</span>}
        {c.matchLabels.length > 0 && (
          <span className="cy-row__labels" aria-label={t("configurations.labels")}>
            {c.matchLabels.map((l) => (
              <code key={l} className="cy-tag">
                {l}
              </code>
            ))}
          </span>
        )}
        {c.labelClashes.length > 0 && (
          <span className="cy-row__warn">
            <AlertTriangle size={14} aria-hidden="true" />
            {lost.length > 0
              ? t("configurations.clashLoses", {
                  labels: lost.map((x) => x.label).join(", "),
                  other: lost[0].otherName,
                })
              : t("configurations.clashWins", {
                  labels: c.labelClashes.map((x) => x.label).join(", "),
                  other: c.labelClashes[0].otherName,
                })}
          </span>
        )}
      </div>
      {c.archived && <StatusPill tone="neutral">{t("configurations.archived")}</StatusPill>}
      <button
        type="button"
        className="cy-icon-btn"
        aria-label={t("configurations.actions", { name: c.name })}
        {...menu.triggerProps}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      <Menu
        open={menu.open}
        onClose={menu.close}
        anchorRef={menu.anchorRef}
        id={menu.id}
        label={t("configurations.actions", { name: c.name })}
        placement="bottom-end"
      >
        <MenuItem onSelect={onEdit}>{t("configurations.edit")}</MenuItem>
        {!c.archived && (
          <>
            <MenuItem disabled={index === 0} onSelect={() => onMove(index - 1)}>
              {t("configurations.moveUp")}
            </MenuItem>
            <MenuItem disabled={index >= count - 1} onSelect={() => onMove(index + 1)}>
              {t("configurations.moveDown")}
            </MenuItem>
          </>
        )}
        <MenuSeparator />
        <MenuItem onSelect={onArchive}>{c.archived ? t("configurations.unarchive") : t("configurations.archive")}</MenuItem>
      </Menu>
    </li>
  );
}

/** «Configuraciones» of the project settings (CYC-01): where cycles run
 *  (browser, OS, device, locale) and the labels imports recognize them by.
 *  Archived, never deleted: runs point at them. A label two devices gave to
 *  two configurations offline is flagged on both. */
export function ConfigurationsCard({ projectId, userId }: { projectId: string; userId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const titleId = useId();
  const [list, setList] = useState<Configuration[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Configuration | "new" | null>(null);
  const [error, setError] = useState("");
  const [announce, setAnnounce] = useState("");

  const notify = useRef({ toast, t });
  notify.current = { toast, t };
  const reload = useCallback(async () => {
    try {
      setList(await configurationApi.list(projectId, userId, true));
    } catch {
      setList([]);
      notify.current.toast(notify.current.t("configurations.loadFailed"), "error");
    }
  }, [projectId, userId]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const live = (list ?? []).filter((c) => !c.archived);
  const archived = (list ?? []).filter((c) => c.archived);
  const shown = showArchived ? [...live, ...archived] : live;

  async function save(input: ConfigurationInput) {
    try {
      const saved =
        editing && editing !== "new"
          ? await configurationApi.update(editing.id, input)
          : await configurationApi.create(input);
      toast(t("configurations.savedToast", { name: saved?.name ?? input.name }));
      setEditing(null);
      setError("");
      await reload();
    } catch (e) {
      setError(configurationError(t, e));
    }
  }

  async function toggleArchived(c: Configuration) {
    try {
      await configurationApi.archive(c.id, !c.archived, userId);
      toast(t(c.archived ? "configurations.restoredToast" : "configurations.archivedToast", { name: c.name }));
      await reload();
    } catch (e) {
      toast(configurationError(t, e), "error");
    }
  }

  async function move(from: number, to: number) {
    const order = [...live];
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    setList([...order, ...archived]);
    setAnnounce(t("configurations.moved", { name: moved.name, n: to + 1 }));
    try {
      await configurationApi.reorder(
        projectId,
        order.map((c) => c.id),
        userId,
      );
    } catch (e) {
      toast(configurationError(t, e), "error");
    }
    await reload();
  }

  return (
    <section className="pj-card-box" aria-labelledby={titleId} data-testid="configurations-card">
      <div className="cy-card__head">
        <div className="pj-card-box__head">
          <h2 id={titleId} className="pj-section-title">
            {t("configurations.title")}
          </h2>
          <p className="pj-card-box__desc">{t("configurations.desc")}</p>
        </div>
        <button
          type="button"
          className="ui-btn ui-btn--primary"
          onClick={() => {
            setError("");
            setEditing("new");
          }}
        >
          <Plus size={16} aria-hidden="true" />
          {t("configurations.new")}
        </button>
      </div>
      {list === null ? (
        <p className="tp__muted">{t("common.loading")}</p>
      ) : list.length === 0 ? (
        <p className="cy-empty">
          <MonitorSmartphone size={18} aria-hidden="true" />
          <span>{t("configurations.empty")}</span>
        </p>
      ) : (
        <>
          <ul className="cy-list" aria-label={t("configurations.listLabel")}>
            {shown.map((c) => {
              const index = live.indexOf(c);
              return (
                <ConfigurationRow
                  key={c.id}
                  configuration={c}
                  index={index}
                  count={live.length}
                  onEdit={() => {
                    setError("");
                    setEditing(c);
                  }}
                  onArchive={() => void toggleArchived(c)}
                  onMove={(to) => void move(index, to)}
                />
              );
            })}
          </ul>
          {archived.length > 0 && (
            <Switch
              label={`${t("configurations.showArchived")} (${archived.length})`}
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
        <ConfigurationDialog
          configuration={editing === "new" ? null : editing}
          projectId={projectId}
          userId={userId}
          error={error}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
    </section>
  );
}
