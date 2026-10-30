import { useId } from "react";
import { useTranslation } from "react-i18next";
import { CalendarRange, Plus, X } from "lucide-react";
import { FieldMessage } from "@shared/ui/FormField";
import { controlProps } from "@shared/ui/fieldProps";
import { duplicateRow, duplicateRows } from "@shared/validation";
import { ScheduleCalendar } from "../ScheduleCalendar";
import { sprintIssues } from "./formState";
import { FieldLabel, type StepProps } from "./stepProps";

/** Step 14, Cronograma: sprints (with the calendar) and milestones. «Generar
 *  sprints a partir de un rango» is shown but not usable yet (RED-W5). */
export function ScheduleStep({ form, set }: StepProps) {
  const { t } = useTranslation();
  const genId = useId();
  const issues = sprintIssues(form.sprints);
  const sprintNames = duplicateRows(form.sprints, (x) => x.name);
  const milestoneNames = duplicateRows(form.milestones, (x) => x.name);

  const updateSprint = (i: number, patch: Partial<(typeof form.sprints)[number]>) => {
    const next = [...form.sprints];
    next[i] = { ...next[i], ...patch };
    set("sprints", next);
  };
  const updateMilestone = (i: number, patch: Partial<(typeof form.milestones)[number]>) => {
    const next = [...form.milestones];
    next[i] = { ...next[i], ...patch };
    set("milestones", next);
  };

  return (
    <>
      <section
        className="tpw-soon"
        aria-labelledby={`${genId}-title`}
        aria-describedby={`${genId}-desc`}
        title={t("testPlan.sprintGen.soonTitle")}
      >
        <div className="tpw-soon__head">
          <CalendarRange size={18} aria-hidden="true" />
          <h3 id={`${genId}-title`} className="tpw-soon__title">
            {t("testPlan.sprintGen.title")}
          </h3>
          <span className="tpw-badge">{t("testPlan.sprintGen.soon")}</span>
        </div>
        <p id={`${genId}-desc`} className="tpw-hint">
          {t("testPlan.sprintGen.desc", { count: form.sprintWeeks })}
        </p>
        <div className="tpw-soon__row">
          <label className="tp-field">
            <span>{t("testPlan.sprintGen.from")}</span>
            <input type="date" disabled />
          </label>
          <label className="tp-field">
            <span>{t("testPlan.sprintGen.to")}</span>
            <input type="date" disabled />
          </label>
          <button type="button" className="header-action" disabled title={t("testPlan.sprintGen.soonTitle")}>
            {t("testPlan.sprintGen.button")}
          </button>
        </div>
      </section>

      <ScheduleCalendar sprints={form.sprints} onAdd={(s) => set("sprints", [...form.sprints, s])} />

      <FieldLabel text={t("testPlan.sprints")} />
      {form.sprints.map((s, i) => {
        const issue = issues[i];
        const nameIssue = duplicateRow(sprintNames, i);
        const row = `${t("testPlan.sprints")} · ${t("a11y.row", { n: i + 1 })}`;
        const id = `tp-sprint-${i}`;
        return (
          <div key={i} role="group" aria-label={row}>
            <div className="tp-sched-row">
              <input
                {...controlProps(`${id}-name`, nameIssue)}
                aria-label={`${t("testPlan.sprintName")} · ${t("a11y.row", { n: i + 1 })}`}
                placeholder={t("testPlan.sprintName")}
                value={s.name}
                onChange={(e) => updateSprint(i, { name: e.target.value })}
              />
              <input
                type="date"
                {...controlProps(`${id}-start`, issue)}
                aria-label={`${t("a11y.start")} · ${t("a11y.row", { n: i + 1 })}`}
                data-invalid={issue?.code === "testPlan.sprintDateError"}
                value={s.start}
                onChange={(e) => updateSprint(i, { start: e.target.value })}
              />
              <input
                type="date"
                {...controlProps(`${id}-end`, issue, issue ? `${id}-start-msg` : undefined)}
                aria-label={`${t("a11y.end")} · ${t("a11y.row", { n: i + 1 })}`}
                data-invalid={issue?.code === "testPlan.sprintDateError"}
                value={s.end}
                onChange={(e) => updateSprint(i, { end: e.target.value })}
              />
              <button
                type="button"
                className="tp-list-field__del"
                aria-label={`${t("common.delete")}: ${row}`}
                onClick={() => set("sprints", form.sprints.filter((_, j) => j !== i))}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            {issue && <FieldMessage id={`${id}-start-msg`} issue={issue} />}
            {nameIssue && <FieldMessage id={`${id}-name-msg`} issue={nameIssue} />}
          </div>
        );
      })}
      <button
        type="button"
        className="tp-list-field__add"
        onClick={() => set("sprints", [...form.sprints, { name: "", start: "", end: "" }])}
      >
        <Plus size={16} aria-hidden="true" /> {t("testPlan.addRow")}
      </button>

      <FieldLabel text={t("testPlan.milestones")} />
      {form.milestones.map((m, i) => {
        const nameIssue = duplicateRow(milestoneNames, i);
        const row = `${t("testPlan.milestones")} · ${t("a11y.row", { n: i + 1 })}`;
        return (
          <div key={i} role="group" aria-label={row}>
            <div className="tp-sched-row">
              <input
                {...controlProps(`tp-milestone-${i}`, nameIssue)}
                aria-label={`${t("testPlan.milestoneName")} · ${t("a11y.row", { n: i + 1 })}`}
                placeholder={t("testPlan.milestoneName")}
                value={m.name}
                onChange={(e) => updateMilestone(i, { name: e.target.value })}
              />
              <input
                type="date"
                aria-label={`${t("a11y.date")} · ${t("a11y.row", { n: i + 1 })}`}
                value={m.date}
                onChange={(e) => updateMilestone(i, { date: e.target.value })}
              />
              <button
                type="button"
                className="tp-list-field__del"
                aria-label={`${t("common.delete")}: ${row}`}
                onClick={() => set("milestones", form.milestones.filter((_, j) => j !== i))}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            {nameIssue && <FieldMessage id={`tp-milestone-${i}-msg`} issue={nameIssue} />}
          </div>
        );
      })}
      <button
        type="button"
        className="tp-list-field__add"
        onClick={() => set("milestones", [...form.milestones, { name: "", date: "" }])}
      >
        <Plus size={16} aria-hidden="true" /> {t("testPlan.addRow")}
      </button>
    </>
  );
}
