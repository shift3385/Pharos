import { useTranslation } from "react-i18next";
import { CircleCheck, CircleAlert } from "lucide-react";
import { STEP_IDS } from "./steps";
import type { StepProps } from "./stepProps";

/** Step 19's «Antes de terminar»: how many steps have content, which are
 *  missing (each a link to its step), the plan's status and where to export. */
export function FinishStep({ form, completion, goTo }: StepProps) {
  const { t } = useTranslation();
  const done = completion.filter(Boolean).length;
  // The conclusion is the step on screen: it is not listed as missing.
  const missing = STEP_IDS.map((id, i) => ({ id, i })).filter(
    ({ id, i }) => !completion[i] && id !== "conclusion",
  );
  return (
    <section className="tpw-finish" aria-labelledby="tpw-finish-title">
      <h3 id="tpw-finish-title" className="tpw-finish__title">
        {t("testPlan.finish.title")}
      </h3>
      <p className="tpw-finish__line">
        {missing.length === 0 ? (
          <CircleCheck size={16} className="tpw-ok" aria-hidden="true" />
        ) : (
          <CircleAlert size={16} className="tpw-warn" aria-hidden="true" />
        )}
        {t("testPlan.finish.progress", { done, total: STEP_IDS.length })}
      </p>
      {missing.length === 0 ? (
        <p className="tpw-hint">{t("testPlan.finish.allDone")}</p>
      ) : (
        <ul className="tpw-finish__missing" aria-label={t("testPlan.finish.missingLabel")}>
          {missing.map(({ id, i }) => (
            <li key={id}>
              <button type="button" className="tpw-link" onClick={() => goTo(i)}>
                {i + 1}. {t(`testPlan.step.${id}`)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="tpw-hint">
        {t("testPlan.finish.status", { status: t(`testPlan.statusLabel.${form.status}`) })}
      </p>
      <p className="tpw-hint">{t("testPlan.finish.exportHint")}</p>
    </section>
  );
}
