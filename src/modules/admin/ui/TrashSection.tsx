import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, Trash2 } from "lucide-react";
import { useAuth } from "@modules/auth";
import { ConfirmDialog } from "@shared/ui/ConfirmDialog";
import { InfoTip } from "@shared/ui/InfoTip";
import { StatusPill } from "@shared/ui/StatusPill";
import { useToast } from "@shared/ui/Toast";
import { purgedTotal, trashApi, type TrashEntity, type TrashItem } from "../api/trashApi";

/** The order of the breakdown. */
const KINDS: TrashEntity[] = [
  "project",
  "test_plan",
  "test_case",
  "requirement",
  "defect",
  "test_cycle",
  "run",
  "planner_card",
  "template",
];

type Filter = "all" | TrashEntity;
type Confirm = { kind: "empty" } | { kind: "forever"; items: TrashItem[] } | null;

const DAY_MS = 86_400_000;

/** Days until the purge removes a row deleted at `deletedAt` (0 = today). */
function daysLeft(deletedAt: string, retentionDays: number, now = Date.now()): number {
  const at = Date.parse(deletedAt.includes("T") ? deletedAt : `${deletedAt.replace(" ", "T")}Z`);
  if (Number.isNaN(at)) return retentionDays;
  return Math.max(0, Math.ceil((at + retentionDays * DAY_MS - now) / DAY_MS));
}

const refOf = (i: TrashItem) => ({ entity: i.entity, id: i.id });
const keyOf = (i: TrashItem) => `${i.entity}:${i.id}`;

/**
 * Papelera (SPEC §8; RED-W3): what this account deleted and the purge has not
 * removed yet, on this device. A counter, a breakdown by kind, restore and
 * delete forever for a selection, and «Vaciar papelera». Rows deleted with
 * their project are not listed: they come back (or go) with it. The web keeps
 * nothing deleted, so there it says where to find the trash.
 */
export function TrashSection({ retentionDays }: { retentionDays: number }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const available = trashApi.available();
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!available || !userId) return;
    try {
      setItems(await trashApi.list(userId));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [available, userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const top = useMemo(() => (items ?? []).filter((i) => !i.withProject), [items]);
  const counts = useMemo(() => {
    const c = new Map<TrashEntity, number>();
    for (const i of top) c.set(i.entity, (c.get(i.entity) ?? 0) + 1);
    return c;
  }, [top]);
  const shown = filter === "all" ? top : top.filter((i) => i.entity === filter);
  const chosen = top.filter((i) => selected.has(keyOf(i)));
  const allShownChosen = shown.length > 0 && shown.every((i) => selected.has(keyOf(i)));
  const held = (items ?? []).filter((i) => i.held).length;
  const lng = i18n.resolvedLanguage ?? "es";

  const toggle = (i: TrashItem) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(keyOf(i))) next.delete(keyOf(i));
      else next.add(keyOf(i));
      return next;
    });
  const toggleAll = () =>
    setSelected((s) => {
      const next = new Set(s);
      for (const i of shown) {
        if (allShownChosen) next.delete(keyOf(i));
        else next.add(keyOf(i));
      }
      return next;
    });

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    try {
      toast(await work(), "success");
      setSelected(new Set());
    } catch (e) {
      const code = e instanceof Error ? e.message : String(e);
      toast(t(code === "project-in-trash" ? "admin.trash.projectFirst" : "admin.trash.failed"), "error");
    } finally {
      setBusy(false);
      setConfirm(null);
      void reload();
    }
  };

  const restore = (list: TrashItem[]) =>
    run(async () => {
      const s = await trashApi.restore(userId, list.map(refOf));
      return t("admin.trash.restored", { count: s.restored });
    });

  const purge = (list: TrashItem[] | null) =>
    run(async () => {
      const s = await trashApi.purge(userId, list ? list.map(refOf) : null);
      return t("admin.trash.purged", { count: purgedTotal(s) });
    });

  const kindLabel = (e: TrashEntity, count = 1) => t(`admin.trash.kind.${e}`, { count });

  if (!available) {
    return (
      <div className="adm-trash" role="group" aria-labelledby="adm-trash-title" data-testid="admin-trash">
        <Head title={t("admin.trash.title")} hint={t("admin.trash.webOnly")} />
      </div>
    );
  }

  return (
    <div className="adm-trash adm-trash--live" role="group" aria-labelledby="adm-trash-title" data-testid="admin-trash">
      <Head
        title={t("admin.trash.title")}
        count={items ? top.length : undefined}
        hint={top.length ? t("admin.trash.desc", { count: retentionDays }) : t("admin.trash.emptyDesc", { count: retentionDays })}
        info={top.length ? t("admin.trash.restoreHint") : undefined}
      >
        <button
          type="button"
          className="adm-btn adm-btn--danger-outline"
          disabled={!top.length || busy}
          title={top.length ? undefined : t("admin.trash.nothingToEmpty")}
          onClick={() => setConfirm({ kind: "empty" })}
          data-testid="trash-empty"
        >
          <Trash2 size={16} aria-hidden="true" />
          {t("admin.trash.empty")}
        </button>
      </Head>

      {failed && <p className="adm-hint adm-trash__error">{t("admin.trash.loadFailed")}</p>}

      {top.length > 0 && (
        <>
          <div className="adm-trash__chips" role="group" aria-label={t("admin.trash.breakdown")}>
            <Chip label={t("admin.trash.everything")} n={top.length} on={filter === "all"} onClick={() => setFilter("all")} />
            {KINDS.filter((k) => counts.get(k)).map((k) => (
              <Chip
                key={k}
                label={kindLabel(k, 2)}
                n={counts.get(k) ?? 0}
                on={filter === k}
                onClick={() => setFilter(k)}
              />
            ))}
          </div>

          {chosen.length > 0 && (
            <div className="adm-trash__selbar" data-testid="trash-selection">
              <span>{t("admin.trash.selected", { count: chosen.length })}</span>
              <span className="adm-trash__selbar-actions">
                <button type="button" className="adm-btn adm-btn--secondary" disabled={busy} onClick={() => void restore(chosen)}>
                  <RotateCcw size={16} aria-hidden="true" />
                  {t("admin.trash.restore")}
                </button>
                <button
                  type="button"
                  className="adm-btn adm-btn--danger-outline"
                  disabled={busy}
                  onClick={() => setConfirm({ kind: "forever", items: chosen })}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  {t("admin.trash.deleteForever")}
                </button>
              </span>
            </div>
          )}

          <div className="adm-trash__table-wrap">
            <table className="adm-trash__table" data-testid="trash-table">
              <thead>
                <tr>
                  <th scope="col" className="adm-trash__check">
                    <input
                      type="checkbox"
                      checked={allShownChosen}
                      onChange={toggleAll}
                      aria-label={t("admin.trash.selectAll")}
                    />
                  </th>
                  <th scope="col">{t("admin.trash.col.item")}</th>
                  <th scope="col">{t("admin.trash.col.project")}</th>
                  <th scope="col">{t("admin.trash.col.deleted")}</th>
                  <th scope="col">{t("admin.trash.col.purge")}</th>
                  <th scope="col">
                    <span className="sr-only">{t("admin.trash.col.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => {
                  const days = daysLeft(i.deletedAt, retentionDays);
                  return (
                    <tr key={keyOf(i)} className={selected.has(keyOf(i)) ? "is-selected" : undefined} data-testid="trash-row">
                      <td className="adm-trash__check">
                        <input
                          type="checkbox"
                          checked={selected.has(keyOf(i))}
                          onChange={() => toggle(i)}
                          aria-label={t("admin.trash.select", { title: i.title })}
                        />
                      </td>
                      <td className="adm-trash__item">
                        <span className="adm-trash__title">
                          {i.key && <span className="adm-trash__key">{i.key}</span>} {i.title}
                        </span>
                        <span className="adm-trash__kind">
                          {kindLabel(i.entity)}
                          {i.entity === "project" && i.children > 0 && ` · ${t("admin.trash.withChildren", { count: i.children })}`}
                        </span>
                      </td>
                      <td>{i.projectName ?? "—"}</td>
                      <td className="adm-trash__num">{formatDay(i.deletedAt, lng)}</td>
                      <td className="adm-trash__num">
                        {i.held ? (
                          <StatusPill tone="warning" title={t("admin.trash.heldHint")}>
                            {t("admin.trash.held")}
                          </StatusPill>
                        ) : days === 0 ? (
                          t("admin.trash.purgeToday")
                        ) : (
                          t("admin.trash.purgeIn", { count: days })
                        )}
                      </td>
                      <td className="adm-trash__row-action">
                        <button
                          type="button"
                          className="adm-btn adm-btn--secondary adm-btn--sm"
                          disabled={busy}
                          onClick={() => void restore([i])}
                        >
                          {t("admin.trash.restore")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {confirm && (
        <ConfirmDialog
          variant="destructive"
          title={confirm.kind === "empty" ? t("admin.trash.confirmEmptyTitle") : t("admin.trash.confirmForeverTitle")}
          message={
            confirm.kind === "empty"
              ? t("admin.trash.confirmEmpty", { count: top.length - top.filter((i) => i.held).length })
              : t("admin.trash.confirmForever", { count: confirm.items.length })
          }
          confirmLabel={confirm.kind === "empty" ? t("admin.trash.empty") : t("admin.trash.deleteForever")}
          confirmTestId="trash-confirm"
          onConfirm={() => void purge(confirm.kind === "empty" ? null : confirm.items)}
          onCancel={() => setConfirm(null)}
        >
          <ul className="adm-trash__confirm-list">
            {summarize(confirm.kind === "empty" ? top : confirm.items, kindLabel, t).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {held > 0 && <p className="adm-hint">{t("admin.trash.confirmHeld", { count: held })}</p>}
          <p className="adm-hint">{t("admin.trash.confirmIrreversible")}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function formatDay(value: string, lng: string): string {
  const at = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(at.getTime()) ? value : at.toLocaleDateString(lng, { day: "numeric", month: "short", year: "numeric" });
}

/** «1 proyecto con sus 12 elementos», «13 casos», … for the confirmation. */
function summarize(
  list: TrashItem[],
  kindLabel: (e: TrashEntity, count?: number) => string,
  t: (key: string, o?: Record<string, unknown>) => string,
): string[] {
  const lines: string[] = [];
  for (const k of KINDS) {
    const of = list.filter((i) => i.entity === k);
    if (!of.length) continue;
    const children = k === "project" ? of.reduce((n, p) => n + p.children, 0) : 0;
    const base = `${of.length} ${kindLabel(k, of.length).toLowerCase()}`;
    lines.push(children ? `${base} · ${t("admin.trash.withChildren", { count: children })}` : base);
  }
  return lines;
}

function Head({
  title,
  count,
  hint,
  info,
  children,
}: {
  title: string;
  count?: number;
  hint: string;
  /** Secondary help behind a «?» next to the title. */
  info?: string;
  children?: ReactNode;
}) {
  return (
    <div className="adm-trash__head">
      <span className="adm-trash__icon" aria-hidden="true">
        <Trash2 size={18} />
      </span>
      <div className="adm-trash__text">
        <span className="ui-title-row">
          <span id="adm-trash-title" className="adm-label">
            {title}
            {count !== undefined && (
              <span className="adm-trash__count" data-testid="trash-count">
                {count}
              </span>
            )}
          </span>
          {info && (
            <InfoTip id="adm-trash-help" label={title}>
              {info}
            </InfoTip>
          )}
        </span>
        <span className="adm-hint">{hint}</span>
      </div>
      {children && <div className="adm-trash__actions">{children}</div>}
    </div>
  );
}

function Chip({ label, n, on, onClick }: { label: string; n: number; on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={on ? "adm-trash__chip is-on" : "adm-trash__chip"} aria-pressed={on} onClick={onClick}>
      {label} <b>{n}</b>
    </button>
  );
}
