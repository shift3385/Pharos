import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "@shared/ui/Dialog";
import { FormField } from "@shared/ui/FormField";
import { attributesLine, type Configuration, type ExecuteInput, type TestCycle } from "../model/types";
import "@shared/ui/ConfirmDialog.css";
import "./Cycles.css";

/** «Ejecutar ciclo» (ADR-0017): one run per chosen configuration; each run
 *  freezes the revision of every case as it is now (decision 3). Archived
 *  configurations are not offered. */
export function ExecuteDialog({
  cycle,
  configurations,
  items,
  error,
  onExecute,
  onCancel,
}: {
  cycle: TestCycle;
  /** The cycle's configurations that still exist (archived ones too). */
  configurations: Configuration[];
  items: number;
  error?: string;
  onExecute: (input: Omit<ExecuteInput, "userId">) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const live = configurations.filter((c) => !c.archived);
  const [chosen, setChosen] = useState<string[]>(live.map((c) => c.id));
  const [build, setBuild] = useState(cycle.build ?? "");
  const [environment, setEnvironment] = useState(cycle.environment ?? "");
  const [busy, setBusy] = useState(false);
  const withoutConfigurations = cycle.configurationIds.length === 0;
  const runs = withoutConfigurations ? 1 : chosen.length;

  async function execute() {
    setBusy(true);
    try {
      await onExecute({
        configurationIds: withoutConfigurations ? undefined : chosen,
        build: build.trim() || undefined,
        environment: environment.trim() || undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog className="cd cy-dialog" labelledBy={`${id}-title`} describedBy={`${id}-msg`} onClose={onCancel} dismissable={!busy}>
      <h3 id={`${id}-title`} className="cd__title">
        {t("cycles.execute.title", { key: cycle.cycleKey })}
      </h3>
      <p id={`${id}-msg`} className="cd__msg">
        {t("cycles.execute.hint", { count: items })}
      </p>
      {!withoutConfigurations && (
        <fieldset className="cy-fieldset">
          <legend className="tp-field__label">{t("cycles.execute.configurations")}</legend>
          {live.length === 0 ? (
            <p className="tp__muted">{t("cycles.error.noConfiguration")}</p>
          ) : (
            <div className="cy-checks">
              {live.map((c) => (
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
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
      )}
      <div className="cy-form__grid">
        <FormField label={t("cycles.field.build")}>
          {(p) => <input {...p} value={build} maxLength={200} onChange={(e) => setBuild(e.target.value)} />}
        </FormField>
        <FormField label={t("cycles.field.environment")}>
          {(p) => (
            <input {...p} value={environment} maxLength={200} onChange={(e) => setEnvironment(e.target.value)} />
          )}
        </FormField>
      </div>
      {error && (
        <p className="cy-error" role="alert">
          {error}
        </p>
      )}
      <div className="cd__actions">
        <button type="button" className="cd__cancel" onClick={onCancel} disabled={busy}>
          {t("common.cancel")}
        </button>
        <button type="button" className="cd__confirm" disabled={busy || runs === 0} onClick={() => void execute()}>
          {busy ? t("cycles.execute.running") : t("cycles.execute.confirm", { count: runs })}
        </button>
      </div>
    </Dialog>
  );
}
