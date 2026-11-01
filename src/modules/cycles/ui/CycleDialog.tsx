import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "@shared/ui/Dialog";
import { FormField } from "@shared/ui/FormField";
import {
  CYCLE_STATUSES,
  attributesLine,
  type Configuration,
  type TestCycle,
  type TestCycleInput,
} from "../model/types";
import "@shared/ui/ConfirmDialog.css";
import "./Cycles.css";


/** «Nuevo ciclo» / «Editar ciclo» (ADR-0017): what (the items are added
 *  later), where (configurations), against what (build, environment) and
 *  when (dates; milestone and sprint of the plan as text). */
export function CycleDialog({
  cycle,
  projectId,
  userId,
  configurations,
  error,
  onSave,
  onCancel,
}: {
  cycle: TestCycle | null;
  projectId: string;
  userId: string;
  /** Every configuration of the project, archived ones too. */
  configurations: Configuration[];
  error?: string;
  onSave: (input: TestCycleInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [form, setForm] = useState({
    title: cycle?.title ?? "",
    description: cycle?.description ?? "",
    build: cycle?.build ?? "",
    environment: cycle?.environment ?? "",
    milestone: cycle?.milestone ?? "",
    sprint: cycle?.sprint ?? "",
    startsOn: cycle?.startsOn ?? "",
    endsOn: cycle?.endsOn ?? "",
    status: cycle?.status ?? "planned",
  });
  const [chosen, setChosen] = useState<string[]>(cycle?.configurationIds ?? []);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });
  const missingTitle = form.title.trim() === "";
  const datesWrong = form.startsOn !== "" && form.endsOn !== "" && form.startsOn > form.endsOn;
  // Archived configurations are offered only if the cycle already has them.
  const offered = configurations.filter((c) => !c.archived || chosen.includes(c.id));

  async function save() {
    setTried(true);
    if (missingTitle || datesWrong) return;
    setBusy(true);
    try {
      await onSave({
        projectId,
        title: form.title.trim(),
        description: form.description,
        build: form.build,
        environment: form.environment,
        milestone: form.milestone,
        sprint: form.sprint,
        startsOn: form.startsOn,
        endsOn: form.endsOn,
        status: cycle ? form.status : undefined,
        configurationIds: chosen,
        userId,
      });
    } finally {
      setBusy(false);
    }
  }

  const text = (k: "build" | "environment" | "milestone" | "sprint") => (
    <FormField label={t(`cycles.field.${k}`)}>
      {(p) => (
        <input
          {...p}
          value={form[k]}
          maxLength={200}
          placeholder={t(`cycles.placeholder.${k}`)}
          onChange={(e) => set(k)(e.target.value)}
        />
      )}
    </FormField>
  );

  return (
    <Dialog className="cd cy-dialog cy-dialog--wide" labelledBy={`${id}-title`} onClose={onCancel} dismissable={!busy}>
      <h3 id={`${id}-title`} className="cd__title">
        {cycle ? t("cycles.editTitle", { key: cycle.cycleKey }) : t("cycles.newTitle")}
      </h3>
      <form
        className="cy-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <FormField
          label={t("cycles.field.title")}
          required
          issue={tried && missingTitle ? { severity: "error", code: "required" } : null}
        >
          {(p) => (
            <input
              {...p}
              value={form.title}
              maxLength={500}
              placeholder={t("cycles.placeholder.title")}
              onChange={(e) => set("title")(e.target.value)}
            />
          )}
        </FormField>
        <FormField label={t("cycles.field.description")}>
          {(p) => (
            <textarea {...p} rows={3} value={form.description} onChange={(e) => set("description")(e.target.value)} />
          )}
        </FormField>
        <div className="cy-form__grid">
          {text("build")}
          {text("environment")}
          {text("milestone")}
          {text("sprint")}
          <FormField label={t("cycles.field.startsOn")}>
            {(p) => <input {...p} type="date" value={form.startsOn} onChange={(e) => set("startsOn")(e.target.value)} />}
          </FormField>
          <FormField
            label={t("cycles.field.endsOn")}
            issue={tried && datesWrong ? { severity: "error", code: "cycles.error.dates" } : null}
          >
            {(p) => <input {...p} type="date" value={form.endsOn} onChange={(e) => set("endsOn")(e.target.value)} />}
          </FormField>
          {cycle && (
            <FormField label={t("cycles.field.status")}>
              {(p) => (
                <select {...p} value={form.status} onChange={(e) => set("status")(e.target.value)}>
                  {CYCLE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`cycles.status.${s}`)}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          )}
        </div>
        <fieldset className="cy-fieldset">
          <legend className="tp-field__label">{t("cycles.field.configurations")}</legend>
          {offered.length === 0 ? (
            <p className="tp__muted">{t("cycles.noConfigurations")}</p>
          ) : (
            <div className="cy-checks">
              {offered.map((c) => (
                <label key={c.id} className="cy-check">
                  <input
                    type="checkbox"
                    checked={chosen.includes(c.id)}
                    onChange={(e) =>
                      setChosen(e.target.checked ? [...chosen, c.id] : chosen.filter((x) => x !== c.id))
                    }
                  />
                  <span>
                    <span className="cy-check__name">{c.name}</span>
                    {attributesLine(c.attributes) && (
                      <span className="cy-check__meta">{attributesLine(c.attributes)}</span>
                    )}
                    {c.archived && <span className="cy-check__meta">{t("configurations.archived")}</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
          <p className="tp-field__hint">{t("cycles.configurationsHint")}</p>
        </fieldset>
        {error && (
          <p className="cy-error" role="alert">
            {error}
          </p>
        )}
        <div className="cd__actions">
          <button type="button" className="cd__cancel" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="cd__confirm" disabled={busy}>
            {busy ? t("cycles.saving") : cycle ? t("cycles.save") : t("cycles.create")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
