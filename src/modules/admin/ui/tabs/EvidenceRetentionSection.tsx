import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EvidenceRetention, EvidenceRetentionKind, RetentionPolicy } from "@shared/contracts/contract";
import { useAuth } from "@modules/auth";
import { projectApi, type ProjectSummary } from "@modules/projects";
import { useToast } from "@shared/ui/Toast";
import { evidenceApi } from "../../api/evidenceApi";
import { SettingsRow, SettingsSection } from "../SettingsSection";

/** Longest retention the backend accepts (evidence/retention.rs). */
const MAX_DAYS = 3650;

type Mode = RetentionPolicy["mode"];

/**
 * «Retención por proyecto» (DAT-03c, ADR-0014): how long each kind of
 * evidence is kept in one project before its file expires. The default, always,
 * or a number of days. A setting of this device only: it does not sync, like
 * the evidence itself until SYNC-04b. The exceptions (manual execution, final
 * failed or blocked result, open defect) are fixed and said here.
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
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    projectApi
      .list(userId)
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
    setRetention(null);
    evidenceApi
      .retention(projectId, userId)
      .then((r) => live && setRetention(r))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [projectId, userId]);

  async function save(kind: string, policy: RetentionPolicy) {
    try {
      setRetention(await evidenceApi.setRetention(projectId, kind, policy, userId));
      toast(t("admin.evidence.retention.saved"));
      onChanged?.();
    } catch {
      toast(t("admin.evidence.retention.failed"), "error");
    }
  }

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
      {retention?.kinds.map((k) => (
        <KindRow key={`${retention.projectId}-${k.kind}`} kind={k} onSave={(p) => void save(k.kind, p)} />
      ))}
      <SettingsRow label={t("admin.evidence.retention.exceptions")}>
        <span className="adm-hint" data-testid="evidence-retention-exceptions">
          {t("admin.evidence.retention.exceptionsText")}
        </span>
      </SettingsRow>
    </SettingsSection>
  );
}

function KindRow({ kind, onSave }: { kind: EvidenceRetentionKind; onSave: (p: RetentionPolicy) => void }) {
  const { t } = useTranslation();
  const id = useId();
  const mode: Mode = !kind.custom ? "default" : kind.days === null ? "always" : "days";
  const [days, setDays] = useState(String(kind.days ?? kind.defaultDays ?? 30));
  const [choice, setChoice] = useState<Mode>(mode);
  const label = (d: number | null) =>
    d === null ? t("admin.evidence.usage.rawAlways") : t("admin.evidence.usage.rawDays", { count: d });
  const value = Number(days);
  const valid = Number.isInteger(value) && value >= 1 && value <= MAX_DAYS;

  function choose(next: Mode) {
    setChoice(next);
    if (next === "default") onSave({ mode: "default" });
    else if (next === "always") onSave({ mode: "always" });
    else if (valid) onSave({ mode: "days", days: value });
  }

  return (
    <SettingsRow
      label={t(`admin.evidence.retention.kinds.${kind.kind}`)}
      hint={t("admin.evidence.retention.current", { days: label(kind.days) })}
      htmlFor={id}
    >
      <span className="adm-inline">
        <select
          id={id}
          className="adm-input"
          value={choice}
          onChange={(e) => choose(e.target.value as Mode)}
          data-testid={`evidence-retention-${kind.kind}`}
        >
          <option value="default">
            {t("admin.evidence.retention.default", { days: label(kind.defaultDays) })}
          </option>
          <option value="always">{t("admin.evidence.usage.rawAlways")}</option>
          <option value="days">{t("admin.evidence.retention.days")}</option>
        </select>
        {choice === "days" && (
          <input
            className="adm-input adm-input--number u-num"
            type="number"
            min={1}
            max={MAX_DAYS}
            aria-label={t("admin.evidence.retention.daysLabel", {
              kind: t(`admin.evidence.retention.kinds.${kind.kind}`),
            })}
            aria-invalid={!valid}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            onBlur={() => valid && value !== kind.days && onSave({ mode: "days", days: value })}
            data-testid={`evidence-retention-${kind.kind}-days`}
          />
        )}
      </span>
    </SettingsRow>
  );
}
