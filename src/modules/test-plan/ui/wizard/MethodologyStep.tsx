import { useId } from "react";
import { useTranslation } from "react-i18next";
import { ListOrdered, Users, Workflow } from "lucide-react";
import { ListField } from "@shared/ui/fields";
import { FormField } from "@shared/ui/FormField";
import { Select } from "@shared/ui/Select";
import { CEREMONIES, CEREMONY_FREQUENCIES } from "../../model/catalogs";
import { frequencyOf } from "../../model/methodology";
import { methodologyGaps } from "./steps";
import type { FormState } from "./formState";

type Keys = "methodologyType" | "sprintWeeks" | "ceremonies" | "ceremonyFrequency" | "phases";

/**
 * «Metodología» (UX-36) in two columns, with the look of «Niveles y tipos de
 * prueba» (CheckColumns): thin lines, heads in small capitals with a grey
 * icon, no counters. Left, «Método de trabajo»: the methodology and the
 * sprint length («2 semanas»). Right, «Reuniones del equipo»: one row per
 * meeting with its checkbox, its name and its frequency; an unticked
 * meeting's frequency is greyed out and says why. A methodology without
 * sprints (traditional) has no sprint length or meetings: the right column
 * holds its phases. The data is as before.
 */
export function MethodologyStep({
  form,
  set,
}: {
  form: Pick<FormState, Keys>;
  set: <K extends Keys>(key: K, value: FormState[K]) => void;
}) {
  const { t } = useTranslation();
  const gapId = useId();
  const uid = useId();
  const agile = form.methodologyType === "agile";
  // An imported plan may hold a meeting of its own: it gets its row too.
  const meetings = [...CEREMONIES, ...form.ceremonies.filter((c) => !CEREMONIES.includes(c))];
  const nameOf = (c: string) => (CEREMONIES.includes(c) ? t(`testPlan.ceremonyLabel.${c}`) : c);
  const weeks = [1, 2, 3, 4];
  if (form.sprintWeeks > 0 && !weeks.includes(form.sprintWeeks)) weeks.push(form.sprintWeeks);

  return (
    <>
      <div className="tpw-cols tpw-meth" data-testid="plan-methodology-cols">
        <div className="tpw-cols__grid">
          <fieldset className="tpw-cols__cell" data-group="method">
            <legend className="tpw-cols__head">
              <Workflow size={14} className="tpw-cols__icon" aria-hidden="true" />
              {t("testPlan.methodGroup")}
            </legend>
            <div className="tpw-meth__fields">
              <FormField id="tp-methodology" label={t("testPlan.methodology")}>
                {(p) => (
                  <Select<"agile" | "traditional">
                    {...p}
                    value={form.methodologyType}
                    onChange={(v) => set("methodologyType", v)}
                    data-testid="plan-methodology"
                    options={[
                      { value: "agile", label: t("testPlan.agile") },
                      { value: "traditional", label: t("testPlan.traditional") },
                    ]}
                  />
                )}
              </FormField>
              {agile && (
                <FormField id="tp-sprint-weeks" label={t("testPlan.sprintLength")}>
                  {(p) => (
                    <Select
                      {...p}
                      value={String(form.sprintWeeks)}
                      onChange={(v) => set("sprintWeeks", Number(v))}
                      placeholder="—"
                      data-testid="plan-sprint-weeks"
                      options={weeks.map((w) => ({ value: String(w), label: t("testPlan.weeks", { count: w }) }))}
                    />
                  )}
                </FormField>
              )}
            </div>
          </fieldset>

          {agile ? (
            <fieldset
              className="tpw-cols__cell"
              data-group="meetings"
              aria-describedby={gapId}
              data-testid="plan-meetings"
            >
              <legend className="tpw-cols__head">
                <Users size={14} className="tpw-cols__icon" aria-hidden="true" />
                {t("testPlan.ceremonies")}
              </legend>
              <div className="tpw-meet-list">
                {meetings.map((c) => {
                  const on = form.ceremonies.includes(c);
                  const name = nameOf(c);
                  const reasonId = `${uid}-${c}-off`;
                  return (
                    <div key={c} className="tpw-meet" data-meeting={c}>
                      <label className="tpw-check">
                        <input
                          type="checkbox"
                          checked={on}
                          data-key={c}
                          onChange={() =>
                            set("ceremonies", on ? form.ceremonies.filter((x) => x !== c) : [...form.ceremonies, c])
                          }
                        />
                        <span className="tpw-check__text">{name}</span>
                      </label>
                      <Select
                        className="tpw-meet__freq"
                        aria-label={t("testPlan.frequencyFor", { ceremony: name })}
                        aria-describedby={on ? undefined : reasonId}
                        disabled={!on}
                        title={on ? undefined : t("testPlan.frequencyOff", { ceremony: name })}
                        value={frequencyOf(c, form.ceremonyFrequency)}
                        onChange={(v) => set("ceremonyFrequency", { ...form.ceremonyFrequency, [c]: v })}
                        data-testid={`plan-frequency-${c}`}
                        options={CEREMONY_FREQUENCIES.map((f) => ({
                          value: f,
                          label: t(`testPlan.frequencyLabel.${f}`),
                        }))}
                      />
                      {!on && (
                        <span id={reasonId} className="sr-only">
                          {t("testPlan.frequencyOff", { ceremony: name })}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ) : (
            <fieldset className="tpw-cols__cell" data-group="phases" aria-describedby={gapId}>
              <legend className="tpw-cols__head">
                <ListOrdered size={14} className="tpw-cols__icon" aria-hidden="true" />
                {t("testPlan.phases")}
              </legend>
              <ListField label={t("testPlan.phases")} items={form.phases} onChange={(v) => set("phases", v)} />
            </fieldset>
          )}
        </div>
      </div>
      {/* What is still missing for the ✓ (FIX-14). Always rendered, so the
          live region exists before its text changes and is announced. */}
      <p id={gapId} className="tpw-hint tpw-gap" role="status" data-testid="methodology-gaps">
        {methodologyGaps(form)
          .map((g) => t(`testPlan.methodologyGap.${g}`))
          .join(" ")}
      </p>
    </>
  );
}
