import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Configuration, Run } from "@shared/contracts/contract";
import { FormField } from "@shared/ui/FormField";
import { runsApi } from "../api/runsApi";
import type { LinkableCase } from "../model/types";
import { CasePickerDialog } from "./CasePickerDialog";

/** «Nuevo run manual» (EJE-02, design §4 step 1): a run over the chosen
 *  cases, each frozen at its current revision, with its context (title,
 *  environment, build and, if the project has them, a configuration). */
export function NewRunDialog({
  projectId,
  userId,
  cases,
  onCreated,
  onCancel,
}: {
  projectId: string;
  userId: string;
  cases: LinkableCase[];
  onCreated: (run: Run) => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [title, setTitle] = useState(() =>
    t("execution.newRun.defaultTitle", {
      date: new Date().toLocaleDateString(i18n.resolvedLanguage),
    }),
  );
  const [environment, setEnvironment] = useState("");
  const [build, setBuild] = useState("");
  const [configurationId, setConfigurationId] = useState("");
  const [configurations, setConfigurations] = useState<Configuration[]>([]);
  useEffect(() => {
    runsApi
      .configurations(projectId, userId)
      .then(setConfigurations)
      .catch(() => setConfigurations([]));
  }, [projectId, userId]);

  return (
    <CasePickerDialog
      title={t("execution.newRun.title")}
      confirmLabel={t("execution.newRun.create")}
      cases={cases}
      canConfirm={title.trim().length > 0}
      onCancel={onCancel}
      onConfirm={async (ids) => {
        const run = await runsApi.createManual(
          {
            projectId,
            title: title.trim(),
            environment: environment.trim() || undefined,
            build: build.trim() || undefined,
            configurationId: configurationId || undefined,
            context: {},
            userId,
          },
          ids.map((id) => ({ testCaseId: id })),
        );
        if (run) onCreated(run);
      }}
    >
      <div className="rn-form">
        <FormField label={t("runs.field.title")} required>
          {(p) => (
            <input
              {...p}
              value={title}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              data-testid="run-new-title"
            />
          )}
        </FormField>
        <div className="rn-grid">
          <FormField label={t("runs.field.environment")}>
            {(p) => (
              <input {...p} value={environment} onChange={(e) => setEnvironment(e.target.value)} />
            )}
          </FormField>
          <FormField label={t("runs.field.build")}>
            {(p) => <input {...p} value={build} onChange={(e) => setBuild(e.target.value)} />}
          </FormField>
          {configurations.length > 0 && (
            <FormField label={t("execution.run.configuration")} className="tp-field rn-grid__wide">
              {(p) => (
                <select
                  {...p}
                  value={configurationId}
                  onChange={(e) => setConfigurationId(e.target.value)}
                >
                  <option value="">{t("execution.newRun.noConfiguration")}</option>
                  {configurations.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          )}
        </div>
      </div>
    </CasePickerDialog>
  );
}
