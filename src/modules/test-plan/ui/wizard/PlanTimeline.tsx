import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { StatusPill } from "@shared/ui/StatusPill";
import { testPlanApi } from "../../api/testPlanApi";
import { isRevision, planSaves, type PlanSave } from "../../export/planHistory";
import type { TestPlan } from "../../model/types";

const STATUS_TONE: Record<string, "neutral" | "info" | "success"> = {
  draft: "neutral",
  reviewed: "info",
  approved: "success",
  obsolete: "neutral",
};

/** A save worth a line: one that changed something, or the status. */
const shown = (s: PlanSave) => isRevision(s) || (s.statusBefore != null && s.statusBefore !== s.status);

/**
 * The plan's latest saves, newest first (PLN-07): the status and version
 * each left, who saved and which steps changed; an approval names who
 * approved, and a save that sent an approved plan back to «Revisado» says it
 * lost the approval. Built from the plan's audit (the same source as the
 * exported history, PLN-02), so the web shows it too.
 */
export function PlanTimeline({ plan, limit = 4 }: { plan: TestPlan; limit?: number }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [saves, setSaves] = useState<PlanSave[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Without a history (a failed read) the card says there is none yet.
    void Promise.resolve()
      .then(() => testPlanApi.history(plan.id, userId))
      .then((source) => {
        if (!cancelled) setSaves(source ? planSaves(source, plan).filter(shown).reverse() : []);
      })
      .catch(() => {
        if (!cancelled) setSaves([]);
      });
    return () => {
      cancelled = true;
    };
  }, [plan, userId]);

  if (saves === null) return null;
  if (saves.length === 0) return <p className="tp__muted">{t("testPlan.timeline.none")}</p>;

  const names: Record<string, string> = user ? { [user.id]: `${user.firstName} ${user.lastName}`.trim() } : {};
  const approval = plan.data.approval;
  if (approval) names[approval.by] ??= approval.byName;
  const nameOf = (actor: string) => names[actor] || t("testPlan.timeline.someone");
  const fmt = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium", timeStyle: "short" });

  return (
    <ol className="tpw-timeline" data-testid="plan-timeline">
      {saves.slice(0, limit).map((s, i) => {
        const lost = s.statusBefore === "approved" && s.status !== "approved";
        const what = s.created
          ? t("testPlan.timeline.created")
          : s.approved
            ? t("testPlan.timeline.approved", { name: nameOf(s.actor) })
            : [nameOf(s.actor), s.sections.map((id) => t(`testPlan.step.${id}`)).join(", ")]
                .filter(Boolean)
                .join(" · ");
        return (
          <li key={`${s.at.getTime()}-${i}`} className="tpw-timeline__item">
            <span className="tpw-timeline__line">
              {s.status && (
                <StatusPill tone={STATUS_TONE[s.status] ?? "neutral"} dot strike={s.status === "obsolete"}>
                  {t(`testPlan.statusLabel.${s.status}`)}
                </StatusPill>
              )}
              {s.version && <span className="t-id">v{s.version}</span>}
              <time className="tpw-timeline__when" dateTime={s.at.toISOString()}>
                {fmt.format(s.at)}
              </time>
            </span>
            <span className="tpw-timeline__what">
              {what}
              {lost && (
                <>
                  {" · "}
                  <span className="tpw-timeline__lost">{t("testPlan.timeline.lostApproval")}</span>
                </>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
