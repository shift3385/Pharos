import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EvidenceRetention, EvidenceRetentionKind, RetentionPolicy } from "@shared/contracts/contract";
import { useAuth } from "@modules/auth";
import { ConfirmDialog } from "@shared/ui/ConfirmDialog";
import { useToast } from "@shared/ui/Toast";
import { evidenceApi } from "../../api/evidenceApi";
import { SettingsRow, SettingsSection } from "../SettingsSection";

type ProjectSummary = { id: string; name: string };

/** Longest retention the backend accepts (evidence/retention.rs). */
const MAX_DAYS = 3650;

type Mode = RetentionPolicy["mode"];

/** What the user is choosing for one kind, before «Guardar». */
interface Draft {
  mode: Mode;
  days: string;
}

/** A change that shortens the retention, with how many files it expires. */
interface Shorter {
  kind: string;
  from: number | null;
  to: number;
  files: number;
}

function draftOf(k: EvidenceRetentionKind): Draft {
  return {
    mode: !k.custom ? "default" : k.days === null ? "always" : "days",
    days: String(k.days ?? k.defaultDays ?? 30),
  };
}

function validDays(d: Draft): boolean {
  const n = Number(d.days);
  return d.mode !== "days" || (Number.isInteger(n) && n >= 1 && n <= MAX_DAYS);
}

function policyOf(d: Draft): RetentionPolicy {
  if (d.mode === "default") return { mode: "default" };
  if (d.mode === "always") return { mode: "always" };
  return { mode: "days", days: Number(d.days) };
}

/** Days a draft keeps the files (null = always). */
function effectiveDays(d: Draft, k: EvidenceRetentionKind): number | null {
  if (d.mode === "default") return k.defaultDays;
  if (d.mode === "always") return null;
  return Number(d.days);
}

function same(d: Draft, k: EvidenceRetentionKind): boolean {
  const saved = draftOf(k);
  return d.mode === saved.mode && (d.mode !== "days" || Number(d.days) === k.days);
}

/**
 * «Retención por proyecto» (DAT-03c, ADR-0014): how long each kind of
 * evidence is kept in one project before its file expires. The default, always,
 * or a number of days. Nothing is saved until «Guardar»; a shorter retention
 * asks first, with how many files the next pass would expire, and a failed
 * save goes back to what was saved. A setting of this device only: it does
 * not sync, like the evidence itself until SYNC-04b. The exceptions (manual
 * execution, final failed or blocked result, open defect) are fixed and said
 * here.
 */
export function EvidenceRetentionSection({ onChanged }: { onChanged?: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const toast = useToast();
  const pickerId = useId();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [projectId, setProjectId] = useState("");
  const [retention, setRetention] = useState<EvidenceRetention | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<Shorter[] | null>(null);

  const reset = (r: EvidenceRetention | null) => {
    setRetention(r);
    setDrafts(Object.fromEntries((r?.kinds ?? []).map((k) => [k.kind, draftOf(k)])));
  };

  useEffect(() => {
    if (!userId) return;
    let live = true;
    evidenceApi
      .projects(userId)
      .then((list) => {
        if (!live) return;
        setProjects(list);
        setProjectId((p) => p || (list[0]?.id ?? ""));
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!projectId || !userId) return;
    let live = true;
    reset(null);
    evidenceApi
      .retention(projectId, userId)
      .then((r) => live && reset(r))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [projectId, userId]);

  const kinds = retention?.kinds ?? [];
  const changed = kinds.filter((k) => drafts[k.kind] && !same(drafts[k.kind], k));
  const valid = kinds.every((k) => !drafts[k.kind] || validDays(drafts[k.kind]));

  async function apply() {
    if (!retention) return;
    setBusy(true);
    setConfirming(null);
    try {
      let last = retention;
      for (const k of changed) {
        last = await evidenceApi.setRetention(projectId, k.kind, policyOf(drafts[k.kind]), userId);
      }
      reset(last);
      toast(t("admin.evidence.retention.saved"));
      onChanged?.();
    } catch {
      toast(t("admin.evidence.retention.failed"), "error");
      // Back to what is saved (some kinds may have been saved before the error).
      try {
        reset(await evidenceApi.retention(projectId, userId));
      } catch {
        reset(retention);
      }
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!retention || changed.length === 0 || !valid) return;
    setBusy(true);
    try {
      const shorter: Shorter[] = [];
      for (const k of changed) {
        const d = drafts[k.kind];
        const to = effectiveDays(d, k);
        if (to !== null && (k.days === null || to < k.days)) {
          const files = await evidenceApi.previewRetention(projectId, k.kind, policyOf(d), userId);
          shorter.push({ kind: k.kind, from: k.days, to, files });
        }
      }
      if (shorter.length > 0) {
        setBusy(false);
        setConfirming(shorter);
        return;
      }
    } catch {
      setBusy(false);
      toast(t("admin.evidence.retention.failed"), "error");
      return;
    }
    await apply();
  }

  const label = (d: number | null) =>
    d === null ? t("admin.evidence.usage.rawAlways") : t("admin.evidence.usage.rawDays", { count: d });

  return (
    <SettingsSection
      title={t("admin.evidence.retention.title")}
      desc={t("admin.evidence.retention.desc")}
      testId="evidence-retention"
    >
      <p className="adm-hint" data-testid="evidence-retention-device">
        {t("admin.evidence.retention.deviceOnly")}
      </p>
      {failed && (
        <p className="adm-warn" role="alert">
          {t("admin.evidence.retention.failed")}
        </p>
      )}
      {projects !== null && projects.length === 0 ? (
        <p className="adm-hint">{t("admin.evidence.retention.noProjects")}</p>
      ) : (
        <SettingsRow label={t("admin.evidence.retention.project")} htmlFor={pickerId}>
          <select
            id={pickerId}
            className="adm-input"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            data-testid="evidence-retention-project"
          >
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </SettingsRow>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {projectId && !retention && !failed ? t("common.loading") : ""}
      </p>
      {kinds.map((k) =>
        drafts[k.kind] ? (
          <KindRow
            key={`${retention?.projectId}-${k.kind}`}
            kind={k}
            draft={drafts[k.kind]}
            onChange={(d) => setDrafts((all) => ({ ...all, [k.kind]: d }))}
          />
        ) : null,
      )}
      {retention && (
        <SettingsRow label={t("admin.evidence.retention.saveLabel")}>
          <button
            type="button"
            className="adm-btn"
            disabled={busy || changed.length === 0 || !valid}
            onClick={() => void save()}
            data-testid="evidence-retention-save"
          >
            {t("admin.evidence.retention.save")}
          </button>
        </SettingsRow>
      )}
      <SettingsRow label={t("admin.evidence.retention.exceptions")}>
        <span className="adm-hint" data-testid="evidence-retention-exceptions">
          {t("admin.evidence.retention.exceptionsText")}
        </span>
      </SettingsRow>
      {confirming && (
        <ConfirmDialog
          title={t("admin.evidence.retention.confirmTitle")}
          message={t("admin.evidence.retention.confirmMessage")}
          confirmLabel={t("admin.evidence.retention.confirm")}
          danger
          confirmTestId="evidence-retention-confirm"
          onConfirm={() => void apply()}
          onCancel={() => setConfirming(null)}
        >
          <ul className="adm-evidence-list" data-testid="evidence-retention-shorter">
            {confirming.map((s) => (
              <li key={s.kind}>
                {t("admin.evidence.retention.confirmLine", {
                  kind: t(`admin.evidence.retention.kinds.${s.kind}`),
                  from: label(s.from),
                  to: label(s.to),
                  count: s.files,
                })}
              </li>
            ))}
          </ul>
        </ConfirmDialog>
      )}
    </SettingsSection>
  );
}

function KindRow({
  kind,
  draft,
  onChange,
}: {
  kind: EvidenceRetentionKind;
  draft: Draft;
  onChange: (d: Draft) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const errorId = useId();
  const label = (d: number | null) =>
    d === null ? t("admin.evidence.usage.rawAlways") : t("admin.evidence.usage.rawDays", { count: d });
  const valid = validDays(draft);
  const name = t(`admin.evidence.retention.kinds.${kind.kind}`);

  return (
    <SettingsRow
      label={name}
      hint={t("admin.evidence.retention.current", { days: label(kind.days) })}
      htmlFor={id}
    >
      <span className="adm-inline">
        <select
          id={id}
          className="adm-input"
          value={draft.mode}
          onChange={(e) => onChange({ ...draft, mode: e.target.value as Mode })}
          data-testid={`evidence-retention-${kind.kind}`}
        >
          <option value="default">
            {t("admin.evidence.retention.default", { days: label(kind.defaultDays) })}
          </option>
          <option value="always">{t("admin.evidence.usage.rawAlways")}</option>
          <option value="days">{t("admin.evidence.retention.days")}</option>
        </select>
        {draft.mode === "days" && (
          <input
            className="adm-input adm-input--number u-num"
            type="number"
            min={1}
            max={MAX_DAYS}
            aria-label={t("admin.evidence.retention.daysLabel", { kind: name })}
            aria-invalid={!valid}
            aria-describedby={valid ? undefined : errorId}
            value={draft.days}
            onChange={(e) => onChange({ ...draft, days: e.target.value })}
            data-testid={`evidence-retention-${kind.kind}-days`}
          />
        )}
        {!valid && (
          <span id={errorId} className="adm-warn" data-testid={`evidence-retention-${kind.kind}-error`}>
            {t("admin.evidence.retention.daysInvalid", { max: MAX_DAYS })}
          </span>
        )}
      </span>
    </SettingsRow>
  );
}
