import { Fragment, useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Camera, GitCompare } from "lucide-react";
import { Alert } from "@shared/ui/Alert";
import { Dialog } from "@shared/ui/Dialog";
import { FormField } from "@shared/ui/FormField";
import { InfoTip } from "@shared/ui/InfoTip";
import { LoadError } from "@shared/ui/LoadError";
import { Select } from "@shared/ui/Select";
import { StatusPill } from "@shared/ui/StatusPill";
import { TextArea } from "@shared/ui/TextArea";
import { useToast } from "@shared/ui/Toast";
import { WholeKeys } from "@shared/ui/WholeKeys";
import "@shared/ui/buttons.css";
import { baselineApi } from "../api/baselineApi";
import {
  compareBaselines,
  type CaseBaseline,
  type CaseBaselineSummary,
  type CaseChange,
} from "../model/baseline";
import type { ListedCase } from "../model/caseList";
import { CaseChanges } from "./CaseChanges";
import { stampLabel, statusTone } from "./caseTones";
import "./CaseList.css";
import "./Baselines.css";

/** The «Estado actual» side of a comparison. */
const CURRENT = "current";

type Scope = "all" | "filtered" | "selected";

/** What the create dialog can freeze. */
export interface BaselineScopes {
  /** Every live case of the project. */
  all: ListedCase[];
  /** The cases the list's filters show, when a filter is on. */
  filtered: ListedCase[] | null;
  /** The cases selected in the list, when there are some. */
  selected: ListedCase[] | null;
}

/**
 * Suite baselines of a project (CAS-02, ADR-0047): the list, a new one (the
 * project's cases, the list's filter or its selection; only the approved
 * ones by default), one baseline read-only, and a comparison of two
 * baselines or of one with the current state.
 */
export function BaselinesView({
  projectId,
  userId,
  scopes,
  startCreating = false,
  onClose,
}: {
  projectId: string;
  userId: string;
  scopes: BaselineScopes;
  /** Open «Nueva baseline» at once (from the list's selection). */
  startCreating?: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "es";
  const [list, setList] = useState<CaseBaselineSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(startCreating);
  const [compare, setCompare] = useState<{ from: string; to: string } | null>(null);

  async function load() {
    try {
      setList(await baselineApi.list(projectId, userId));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, userId]);

  if (compare && list) {
    return (
      <BaselineCompare
        projectId={projectId}
        userId={userId}
        baselines={list}
        from={compare.from}
        to={compare.to}
        onChange={setCompare}
        onBack={() => setCompare(null)}
      />
    );
  }

  return (
    <section className="bl tc-body" aria-labelledby="bl-title">
      <div className="bl-head">
        <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose}>
          <ArrowLeft size={16} aria-hidden="true" />
          {t("testCase.baselines.back")}
        </button>
        <div className="bl-titleline">
          <h2 id="bl-title" className="bl-title">
            {t("testCase.baselines.title")}
          </h2>
          <InfoTip id="bl-title-help" label={t("testCase.baselines.title")}>
            {t("testCase.baselines.lead")}
          </InfoTip>
        </div>
        <button type="button" className="ui-btn ui-btn--primary" onClick={() => setCreating(true)} data-testid="baseline-new">
          <Camera size={16} aria-hidden="true" />
          {t("testCase.baselines.new")}
        </button>
      </div>
      {failed && <LoadError message={t("testCase.baselines.loadFailed")} onRetry={() => void load()} />}
      {list && list.length === 0 && <p className="bl-empty">{t("testCase.baselines.empty")}</p>}
      {list && list.length > 0 && (
        <div className="bl-table-wrap">
          <table className="bl-table">
            <thead>
              <tr>
                <th scope="col">{t("testCase.baselines.col.name")}</th>
                <th scope="col" className="bl-num">
                  {t("testCase.baselines.col.cases")}
                </th>
                <th scope="col">{t("testCase.baselines.col.created")}</th>
                <th scope="col">
                  <span className="sr-only">{t("testCase.baselines.col.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.id} data-testid="baseline-row">
                  <td>
                    <strong>{b.name}</strong>
                    {(b.scopeLabel || b.approvedOnly || b.description) && (
                      <span className="bl-sub">
                        {[b.approvedOnly ? t("testCase.baselines.approvedOnly") : "", b.scopeLabel, b.description]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </td>
                  <td className="bl-num">{b.itemCount}</td>
                  <td>{stampLabel(b.createdAt, lang)}</td>
                  <td>
                    <button
                      type="button"
                      className="ui-btn ui-btn--small"
                      onClick={() => setCompare({ from: b.id, to: CURRENT })}
                    >
                      <GitCompare size={15} aria-hidden="true" />
                      {t("testCase.baselines.compare")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && (
        <CreateBaselineDialog
          projectId={projectId}
          userId={userId}
          scopes={scopes}
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void load();
          }}
        />
      )}
    </section>
  );
}

function CreateBaselineDialog({
  projectId,
  userId,
  scopes,
  onCancel,
  onCreated,
}: {
  projectId: string;
  userId: string;
  scopes: BaselineScopes;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const id = useId();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<Scope>(scopes.selected ? "selected" : scopes.filtered ? "filtered" : "all");
  const [approvedOnly, setApprovedOnly] = useState(true);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const live = scopes.all.filter((c) => c.status !== "obsolete");
  const chosen = scope === "selected" ? (scopes.selected ?? []) : scope === "filtered" ? (scopes.filtered ?? []) : live;
  const kept = approvedOnly ? chosen.filter((c) => c.status === "approved") : chosen;
  const left = chosen.filter((c) => !kept.includes(c));
  const missingName = !name.trim();

  async function create() {
    setTried(true);
    if (missingName || kept.length === 0) return;
    setBusy(true);
    try {
      await baselineApi.create({
        projectId,
        name: name.trim(),
        description: description.trim() || undefined,
        scopeLabel: t(`testCase.baselines.scopeLabel.${scope}`, { count: chosen.length }),
        approvedOnly,
        caseIds: kept.map((c) => c.id),
        userId,
      });
      toast(t("testCase.baselines.createdToast", { name: name.trim(), count: kept.length }));
      onCreated();
    } catch {
      toast(t("testCase.baselines.createFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  const option = (value: Scope, count: number, hint?: string) => (
    <label className="bl-radio">
      <input type="radio" name={`${id}-scope`} checked={scope === value} onChange={() => setScope(value)} />
      <span>
        {t(`testCase.baselines.scope.${value}`, { count })}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );

  return (
    <Dialog className="cd bl-dialog" labelledBy={`${id}-title`} onClose={onCancel} dismissable={!busy}>
      <h3 id={`${id}-title`} className="cd__title">
        {t("testCase.baselines.newTitle")}
      </h3>
      <p className="cd__msg">{t("testCase.baselines.newHint")}</p>
      <form
        className="bl-form"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <FormField
          label={t("testCase.baselines.name")}
          required
          issue={tried && missingName ? { severity: "error", code: "required" } : null}
        >
          {(p) => (
            <input
              {...p}
              value={name}
              maxLength={200}
              placeholder={t("testCase.baselines.namePlaceholder")}
              onChange={(e) => setName(e.target.value)}
              data-testid="baseline-name"
            />
          )}
        </FormField>
        <FormField label={t("testCase.baselines.description")}>
          {(p) => <TextArea {...p} size="short" value={description} onChange={(e) => setDescription(e.target.value)} />}
        </FormField>
        <fieldset className="bl-scope">
          <legend>{t("testCase.baselines.casesLegend")}</legend>
          {option("all", live.length)}
          {scopes.filtered && option("filtered", scopes.filtered.length)}
          {scopes.selected && option("selected", scopes.selected.length)}
        </fieldset>
        <label className="bl-check">
          <input type="checkbox" checked={approvedOnly} onChange={(e) => setApprovedOnly(e.target.checked)} />
          {t("testCase.baselines.approvedOnlyLabel")}
        </label>
        {kept.length === 0 ? (
          <Alert kind="warning" role="note">
            {t("testCase.baselines.nothing")}
          </Alert>
        ) : (
          left.length > 0 && (
            <Alert kind="warning" role="note">
              <WholeKeys
                text={t("testCase.baselines.leftOut", {
                  count: left.length,
                  kept: kept.length,
                  keys:
                    left
                      .slice(0, 8)
                      .map((c) => c.scenarioId)
                      .join(", ") + (left.length > 8 ? "…" : ""),
                })}
              />
            </Alert>
          )
        )}
        <div className="cd__actions">
          <button type="button" className="cd__cancel" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="cd__confirm" disabled={busy || kept.length === 0} data-testid="baseline-create">
            {t("testCase.baselines.freeze", { count: kept.length })}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

const CHANGE_TONE: Record<CaseChange, "success" | "error" | "warning" | "info"> = {
  added: "success",
  removed: "error",
  content: "warning",
  status: "info",
};

function BaselineCompare({
  projectId,
  userId,
  baselines,
  from,
  to,
  onChange,
  onBack,
}: {
  projectId: string;
  userId: string;
  baselines: CaseBaselineSummary[];
  from: string;
  to: string;
  onChange: (pair: { from: string; to: string }) => void;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "es";
  const [sides, setSides] = useState<{ from: CaseBaseline; to: CaseBaseline } | null>(null);
  const [failed, setFailed] = useState(false);
  const [onlyChanged, setOnlyChanged] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const fromId = useId();
  const toId = useId();

  useEffect(() => {
    let live = true;
    setSides(null);
    setFailed(false);
    const read = (id: string) =>
      id === CURRENT ? baselineApi.current(projectId, userId) : baselineApi.get(id, userId);
    void Promise.all([read(from), read(to)])
      .then(([a, b]) => {
        if (!live) return;
        if (!a || !b) setFailed(true);
        else setSides({ from: a, to: b });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [projectId, userId, from, to, attempt]);

  const result = useMemo(() => (sides ? compareBaselines(sides.from, sides.to) : null), [sides]);
  const options = [
    ...baselines.map((b) => ({ value: b.id, label: `${b.name} · ${stampLabel(b.createdAt, lang)}` })),
  ];
  const rows = result ? result.rows.filter((r) => !onlyChanged || r.changes.length > 0) : [];
  const changed = result ? result.rows.filter((r) => r.changes.length > 0).length : 0;
  const statusLabel = (s?: string) => (s ? t(`testCase.statusLabel.${s}`, { defaultValue: s }) : "—");

  return (
    <section className="bl tc-body" aria-labelledby="bl-cmp-title">
      <div className="bl-head">
        <button type="button" className="ui-btn ui-btn--ghost" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" />
          {t("testCase.baselines.open")}
        </button>
        <h2 id="bl-cmp-title" className="bl-title">
          {t("testCase.baselines.compareTitle")}
        </h2>
      </div>
      <div className="bl-pair">
        <label htmlFor={fromId} className="sr-only">
          {t("testCase.baselines.from")}
        </label>
        <Select id={fromId} value={from} options={options} onChange={(v) => onChange({ from: v, to })} />
        <span className="bl-vs">{t("testCase.baselines.versus")}</span>
        <label htmlFor={toId} className="sr-only">
          {t("testCase.baselines.to")}
        </label>
        <Select
          id={toId}
          value={to}
          options={[{ value: CURRENT, label: t("testCase.baselines.current") }, ...options]}
          onChange={(v) => onChange({ from, to: v })}
        />
      </div>
      {failed && <LoadError message={t("testCase.baselines.loadFailed")} onRetry={() => setAttempt((n) => n + 1)} />}
      {!result && !failed && <p className="bl-empty">{t("testCase.baselines.loading")}</p>}
      {result && (
        <>
          <dl className="bl-tiles" data-testid="baseline-counts">
            {(["added", "removed", "content", "status", "same"] as const).map((k) => (
              <div key={k} className="bl-tile" data-kind={k}>
                <dt>{t(`testCase.baselines.count.${k}`)}</dt>
                <dd>{result.counts[k]}</dd>
              </div>
            ))}
          </dl>
          <label className="bl-check">
            <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
            {t("testCase.baselines.onlyChanged", { count: changed })}
          </label>
          {rows.length === 0 ? (
            <p className="bl-empty">{t("testCase.baselines.noChanges")}</p>
          ) : (
            <div className="bl-table-wrap">
              <table className="bl-table">
                <thead>
                  <tr>
                    <th scope="col">{t("testCase.list.col.id")}</th>
                    <th scope="col">{t("testCase.list.col.title")}</th>
                    <th scope="col">{t("testCase.baselines.col.change")}</th>
                    <th scope="col" className="bl-num">
                      {t("testCase.baselines.col.revision")}
                    </th>
                    <th scope="col">{t("testCase.baselines.col.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const expanded = open === r.caseId;
                    const canOpen = r.fields.length > 0;
                    return (
                      <Fragment key={r.caseId}>
                        <tr data-testid="baseline-diff-row">
                          <td className="bl-id">{r.scenarioId}</td>
                          <td>
                            {canOpen ? (
                              <button
                                type="button"
                                className="bl-link"
                                aria-expanded={expanded}
                                onClick={() => setOpen(expanded ? null : r.caseId)}
                              >
                                {r.title}
                              </button>
                            ) : (
                              r.title
                            )}
                          </td>
                          <td>
                            {r.changes.length === 0
                              ? t("testCase.baselines.change.same")
                              : r.changes.map((c) => (
                                  <StatusPill key={c} tone={CHANGE_TONE[c]}>
                                    {t(`testCase.baselines.change.${c}`)}
                                  </StatusPill>
                                ))}
                          </td>
                          <td className="bl-num">
                            {r.from?.revision ?? "—"} → {r.to?.revision ?? "—"}
                          </td>
                          <td>
                            {r.from?.status === r.to?.status || !r.from || !r.to ? (
                              <StatusPill tone={statusTone((r.to ?? r.from)!.status)}>
                                {statusLabel((r.to ?? r.from)?.status)}
                              </StatusPill>
                            ) : (
                              `${statusLabel(r.from.status)} → ${statusLabel(r.to.status)}`
                            )}
                          </td>
                        </tr>
                        {expanded && (
                          <tr key={`${r.caseId}-diff`} className="bl-diff-row">
                            <td colSpan={5}>
                              <CaseChanges changes={r.fields} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
