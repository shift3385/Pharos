import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Dialog } from "@shared/ui/Dialog";
import { FormField } from "@shared/ui/FormField";
import { StatusPill } from "@shared/ui/StatusPill";
import { cycleApi } from "../api/cycleApi";
import type { CaseOption, CycleFilter, CycleItemInput } from "../model/types";
import "@shared/ui/ConfirmDialog.css";
import "./Cycles.css";

const PRIORITIES = ["high", "medium", "low"] as const;
const CASE_STATUSES = ["draft", "reviewed", "approved", "obsolete"] as const;
/** Minimum risk options: the ADR-0013 bands (≤ 4 low, ≤ 12 medium, > 12 high). */
const RISK_FLOORS = [
  { value: 5, key: "medium" },
  { value: 13, key: "high" },
] as const;

/** «Añadir casos»: pick cases of the project (search by key or title); those
 *  already in the cycle are marked and cannot be picked again. A case that is
 *  not approved can be added (ADR-0017: a warning, never a block). */
export function AddCasesDialog({
  cases,
  present,
  onAdd,
  onCancel,
}: {
  cases: CaseOption[] | null;
  /** Ids of the cases already in the cycle as a whole case. */
  present: ReadonlySet<string>;
  onAdd: (items: CycleItemInput[]) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [assignee, setAssignee] = useState("");
  const [busy, setBusy] = useState(false);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (cases ?? []).filter(
      (c) => !q || c.scenarioId.toLowerCase().includes(q) || c.title.toLowerCase().includes(q),
    );
  }, [cases, query]);
  const notApproved = chosen.filter((x) => cases?.find((c) => c.id === x)?.status !== "approved").length;

  async function add() {
    setBusy(true);
    try {
      await onAdd(chosen.map((testCaseId) => ({ testCaseId, assignee: assignee.trim() || undefined })));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog className="cd cy-dialog cy-dialog--wide" labelledBy={`${id}-title`} onClose={onCancel} dismissable={!busy}>
      <h3 id={`${id}-title`} className="cd__title">
        {t("cycles.add.title")}
      </h3>
      <div className="cy-search">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          aria-label={t("cycles.add.search")}
          placeholder={t("cycles.add.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {cases === null ? (
        <p className="tp__muted">{t("common.loading")}</p>
      ) : shown.length === 0 ? (
        <p className="tp__muted">{t("cycles.add.none")}</p>
      ) : (
        <ul className="cy-pick" aria-label={t("cycles.add.listLabel")}>
          {shown.map((c) => {
            const inCycle = present.has(c.id);
            return (
              <li key={c.id}>
                <label className="cy-check" data-disabled={inCycle || undefined}>
                  <input
                    type="checkbox"
                    disabled={inCycle}
                    checked={inCycle || chosen.includes(c.id)}
                    onChange={(e) =>
                      setChosen(e.target.checked ? [...chosen, c.id] : chosen.filter((x) => x !== c.id))
                    }
                  />
                  <span className="cy-pick__row">
                    <code className="cy-key">{c.scenarioId}</code>
                    <span className="cy-pick__title">{c.title}</span>
                    {inCycle ? (
                      <StatusPill tone="neutral">{t("cycles.add.inCycle")}</StatusPill>
                    ) : (
                      c.status !== "approved" && (
                        <StatusPill tone="warning">{t("cycles.notApproved")}</StatusPill>
                      )
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <FormField label={t("cycles.add.assignee")} hint={t("cycles.add.assigneeHint")}>
        {(p) => <input {...p} value={assignee} maxLength={200} onChange={(e) => setAssignee(e.target.value)} />}
      </FormField>
      {notApproved > 0 && (
        <p className="cy-warn" role="status">
          {t("cycles.add.notApprovedWarning", { count: notApproved })}
        </p>
      )}
      <div className="cd__actions">
        <button type="button" className="cd__cancel" onClick={onCancel} disabled={busy}>
          {t("common.cancel")}
        </button>
        <button type="button" className="cd__confirm" disabled={busy || chosen.length === 0} onClick={() => void add()}>
          {t("cycles.add.confirm", { count: chosen.length })}
        </button>
      </div>
    </Dialog>
  );
}

/** «Añadir por filtro» (ADR-0017): the cases that match now are added; later
 *  changes to the cases do not change the cycle. Shows how many match before
 *  adding. */
export function AddByFilterDialog({
  projectId,
  userId,
  requirementKeys,
  onAdd,
  onCancel,
}: {
  projectId: string;
  userId: string;
  requirementKeys: string[];
  onAdd: (filter: CycleFilter, assignee: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [tags, setTags] = useState("");
  const [reqs, setReqs] = useState<string[]>([]);
  const [prios, setPrios] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [minRisk, setMinRisk] = useState("");
  const [assignee, setAssignee] = useState("");
  const [matches, setMatches] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const filter: CycleFilter = useMemo(
    () => ({
      tags: tags
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      requirementKeys: reqs,
      priorities: prios,
      statuses,
      minRisk: minRisk ? Number(minRisk) : undefined,
    }),
    [tags, reqs, prios, statuses, minRisk],
  );
  const key = JSON.stringify(filter);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      cycleApi
        .filterPreview(projectId, filter, userId)
        .then((n) => live && setMatches(n))
        .catch(() => live && setMatches(null));
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // `key` stands for the filter's content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, projectId, userId]);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function add() {
    setBusy(true);
    try {
      await onAdd(filter, assignee.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog className="cd cy-dialog cy-dialog--wide" labelledBy={`${id}-title`} onClose={onCancel} dismissable={!busy}>
      <h3 id={`${id}-title`} className="cd__title">
        {t("cycles.filter.title")}
      </h3>
      <p className="cd__msg">{t("cycles.filter.hint")}</p>
      <div className="cy-form">
        <FormField label={t("cycles.filter.tags")} hint={t("cycles.filter.tagsHint")}>
          {(p) => <input {...p} value={tags} placeholder="smoke, regression" onChange={(e) => setTags(e.target.value)} />}
        </FormField>
        <fieldset className="cy-fieldset">
          <legend className="tp-field__label">{t("cycles.filter.priorities")}</legend>
          <div className="cy-checks cy-checks--row">
            {PRIORITIES.map((p) => (
              <label key={p} className="cy-check">
                <input type="checkbox" checked={prios.includes(p)} onChange={() => toggle(prios, setPrios, p)} />
                <span>{t(`testCase.priorityLabel.${p}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="cy-fieldset">
          <legend className="tp-field__label">{t("cycles.filter.statuses")}</legend>
          <div className="cy-checks cy-checks--row">
            {CASE_STATUSES.map((s) => (
              <label key={s} className="cy-check">
                <input
                  type="checkbox"
                  checked={statuses.includes(s)}
                  onChange={() => toggle(statuses, setStatuses, s)}
                />
                <span>{t(`testCase.statusLabel.${s}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {requirementKeys.length > 0 && (
          <fieldset className="cy-fieldset">
            <legend className="tp-field__label">{t("cycles.filter.requirements")}</legend>
            <div className="cy-checks cy-checks--row cy-checks--scroll">
              {requirementKeys.map((r) => (
                <label key={r} className="cy-check">
                  <input type="checkbox" checked={reqs.includes(r)} onChange={() => toggle(reqs, setReqs, r)} />
                  <code className="cy-key">{r}</code>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="cy-form__grid">
          <FormField label={t("cycles.filter.minRisk")} hint={t("cycles.filter.minRiskHint")}>
            {(p) => (
              <select {...p} value={minRisk} onChange={(e) => setMinRisk(e.target.value)}>
                <option value="">{t("cycles.filter.anyRisk")}</option>
                {RISK_FLOORS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {t(`cycles.filter.risk.${r.key}`)}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label={t("cycles.add.assignee")}>
            {(p) => <input {...p} value={assignee} maxLength={200} onChange={(e) => setAssignee(e.target.value)} />}
          </FormField>
        </div>
      </div>
      <p className="cy-preview" role="status" aria-live="polite">
        {matches === null ? "" : t("cycles.filter.matches", { count: matches })}
      </p>
      <div className="cd__actions">
        <button type="button" className="cd__cancel" onClick={onCancel} disabled={busy}>
          {t("common.cancel")}
        </button>
        <button type="button" className="cd__confirm" disabled={busy || !matches} onClick={() => void add()}>
          {t("cycles.filter.confirm")}
        </button>
      </div>
    </Dialog>
  );
}

