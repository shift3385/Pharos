import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import type { FindingView } from "@shared/contracts/contract";
import { FilterChips } from "@shared/ui/FilterChips";
import { StatusPill } from "@shared/ui/StatusPill";
import { Switch } from "@shared/ui/Switch";
import {
  SEVERITIES,
  type FindingStanding,
  groupByRule,
  severityTone,
  standingOf,
  whereOf,
} from "../model/findings";
import { TriageDialog } from "./TriageDialog";
import "./Findings.css";

type SeverityFilter = "all" | (typeof SEVERITIES)[number];
type StandingFilter = "open" | "review" | "triaged" | "all";

/** «Hallazgos» of a run (ING-06, F4; bocetos §2): chips by severity, the
 *  standing (open, «A revisar», triaged), «Solo nuevos», and the findings
 *  grouped by rule with their locations and «Triaje». */
export function FindingsPanel({
  projectId,
  userId,
  findings,
  onChanged,
}: {
  projectId: string;
  userId: string;
  findings: FindingView[];
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [standing, setStanding] = useState<StandingFilter>("open");
  const [onlyNew, setOnlyNew] = useState(false);
  const [triaging, setTriaging] = useState<FindingView | null>(null);

  const byStanding = (s: StandingFilter) =>
    findings.filter(
      (f) => s === "all" || standingOf(f) === (s as FindingStanding),
    );
  const inStanding = byStanding(standing);
  const shown = inStanding.filter(
    (f) =>
      (severity === "all" || f.severity === severity) && (!onlyNew || f.isNew),
  );
  const groups = groupByRule(shown);
  const newCount = inStanding.filter((f) => f.isNew).length;

  return (
    <div className="fd" data-testid="findings-panel">
      <div className="fd__filters">
        <FilterChips
          label={t("findings.filter.severity")}
          value={severity}
          onChange={(v) => setSeverity(v as SeverityFilter)}
          options={[
            {
              value: "all",
              label: t("findings.filter.all"),
              count: inStanding.length,
            },
            ...SEVERITIES.map((s) => ({
              value: s,
              label: t(`findings.severity.${s}`),
              count: inStanding.filter((f) => f.severity === s).length,
            })).filter((o) => o.count > 0),
          ]}
        />
        <FilterChips
          label={t("findings.filter.standing")}
          value={standing}
          onChange={(v) => setStanding(v as StandingFilter)}
          options={(
            ["open", "review", "triaged", "all"] as StandingFilter[]
          ).map((s) => ({
            value: s,
            label: t(`findings.standing.${s}`),
            count: byStanding(s).length,
          }))}
        />
        {/* The app's switch, not a native checkbox (FIX-45). */}
        <span className="fd__new">
          <Switch
            checked={onlyNew}
            onChange={setOnlyNew}
            label={t("findings.filter.onlyNew", { count: newCount })}
            testId="findings-only-new"
          />
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="tp-field__hint rn-note">{t("findings.empty")}</p>
      ) : (
        <div className="fd__groups">
          {groups.map((g, i) => (
            <details
              key={g.key}
              className="fd-rule"
              open={i === 0}
              data-testid="finding-rule"
            >
              <summary className="fd-rule__summary">
                <StatusPill tone={severityTone(g.severity)}>
                  {t(`findings.severity.${g.severity}`)}
                </StatusPill>
                <span className="fd-rule__name">
                  <strong>{g.ruleName ?? g.ruleId}</strong>
                  <span className="fd-mono fd-muted">
                    {g.ruleId}
                    {g.tool ? ` · ${g.tool}` : ""} ·{" "}
                    {t("findings.locations", { count: g.findings.length })}
                  </span>
                </span>
                <span className="fd-refs">
                  {g.standardRefs.slice(0, 4).map((r) => (
                    <span key={r} className="fd-ref fd-mono">
                      {r}
                    </span>
                  ))}
                </span>
              </summary>
              <ul className="fd-rule__list">
                {g.findings.map((f) => {
                  const st = standingOf(f);
                  return (
                    <li key={f.id} className="fd-loc" data-testid="finding">
                      <span className="fd-mono fd-loc__where">
                        {whereOf(f) || "—"}
                      </span>
                      <span className="fd-loc__meta">
                        {f.isNew && (
                          <StatusPill tone="info">
                            {t("findings.new")}
                          </StatusPill>
                        )}
                        {f.attributes?.suppressed === true && (
                          <StatusPill tone="neutral">
                            {t("findings.suppressed")}
                          </StatusPill>
                        )}
                        {st === "review" && (
                          <StatusPill tone="warning">
                            {t("findings.standing.review")}
                          </StatusPill>
                        )}
                        {f.triage && f.triage.state !== "open" && (
                          <StatusPill
                            tone="neutral"
                            title={f.triage.reason ?? undefined}
                          >
                            {t(
                              `findings.triageState.${f.triage.state}`,
                              f.triage.state,
                            )}
                          </StatusPill>
                        )}
                        {f.helpUri && (
                          <a
                            className="fd-help"
                            href={f.helpUri}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={t("findings.help", { rule: f.ruleId })}
                          >
                            <ExternalLink size={14} aria-hidden="true" />
                          </a>
                        )}
                        <button
                          type="button"
                          className="ui-btn ui-btn--small"
                          onClick={() => setTriaging(f)}
                          data-testid="finding-triage"
                        >
                          {t("findings.triage.open")}
                        </button>
                      </span>
                      <span className="fd-loc__msg">{f.message}</span>
                    </li>
                  );
                })}
              </ul>
            </details>
          ))}
        </div>
      )}

      {triaging && (
        <TriageDialog
          finding={triaging}
          projectId={projectId}
          userId={userId}
          onCancel={() => setTriaging(null)}
          onSaved={() => {
            setTriaging(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
