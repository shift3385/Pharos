import { useId } from "react";
import { useTranslation } from "react-i18next";
import { CheckboxGroup, ListField, PairListField } from "@shared/ui/fields";
import { FormField } from "@shared/ui/FormField";
import { Select } from "@shared/ui/Select";
import { required } from "@shared/validation";
import {
  AiSuggestList,
  AssistButton,
  suggestClosureCriteria,
  suggestResponsibilities,
  suggestRisks,
  withProvenance,
} from "@modules/ai";
import { CEREMONIES, CEREMONY_FREQUENCIES } from "../../model/catalogs";
import { frequencyOf } from "../../model/methodology";
import { ASSIST_INSTRUCTION } from "./aiGuidance";
import { closureBrief, conclusionBrief, planBrief, rolesWithoutResponsibility, withResponsibilities } from "./formState";
import { methodologyGaps, type StepId } from "./steps";
import { AreaField, FieldLabel, TextField, type StepProps } from "./stepProps";
import { DeliverablesStep } from "./DeliverablesStep";
import { LevelsTypesStep } from "./LevelsTypesStep";
import { ToolsStep } from "./ToolsStep";
import { ScheduleStep } from "./ScheduleStep";
import { FinishStep } from "./FinishStep";

/** The fields of one wizard step (spec §5.1, ScrPlan). */
export function StepBody({ id, ...props }: StepProps & { id: StepId }) {
  const { t, i18n } = useTranslation();
  const { form, set, setForm, aiReady, aiProps, review, attempted } = props;
  const gapId = useId();

  switch (id) {
    // The document's identification block (ISO/IEC/IEEE 29119-3, UX-31):
    // what were the steps «Título» and «Versión, fecha y autor».
    case "identification":
      return (
        <>
          <div className="tpw-ident">
            <FormField
              id="tp-title"
              label={t("testPlan.fieldTitle")}
              issue={attempted ? required(form.title) : null}
              required
              className="tp-field tpw-ident__title"
            >
              {(p) => <input {...p} value={form.title} onChange={(e) => set("title", e.target.value)} />}
            </FormField>
            <FormField id="tp-status" label={t("testPlan.status")}>
              {(p) => (
                <Select
                  {...p}
                  value={form.status}
                  onChange={(v) => set("status", v)}
                  data-testid="plan-status"
                  options={["draft", "reviewed", "approved", "obsolete"].map((s) => ({
                    value: s,
                    label: t(`testPlan.statusLabel.${s}`),
                  }))}
                />
              )}
            </FormField>
          </div>
          <div className="tpw-grid">
            <TextField label={t("testPlan.version")} value={form.version} onChange={(v) => set("version", v)} />
            <label className="tp-field">
              <span>{t("testPlan.date")}</span>
              <input type="date" value={form.planDate} onChange={(e) => set("planDate", e.target.value)} />
            </label>
            <label className="tp-field">
              <span>{t("testPlan.author")}</span>
              <input value={props.author} readOnly />
            </label>
          </div>
        </>
      );
    case "summary":
      return (
        <>
          <AreaField solo label={t("testPlan.summary")} value={form.summary} onChange={(v) => set("summary", v)} />
          <AssistButton
            available={aiReady}
            instruction={ASSIST_INSTRUCTION.summary}
            notes={form.summary}
            context={planBrief(form)}
            {...aiProps("summary")}
          />
        </>
      );
    case "scope":
      return (
        <>
          <FieldLabel text={t("testPlan.scopeIn")} />
          <ListField label={t("testPlan.scopeIn")} items={form.scopeIn} onChange={(v) => set("scopeIn", v)} />
          <FieldLabel text={t("testPlan.scopeOut")} />
          <ListField label={t("testPlan.scopeOut")} items={form.scopeOut} onChange={(v) => set("scopeOut", v)} />
        </>
      );
    case "levelsTypes":
      return <LevelsTypesStep form={form} set={set} />;
    case "methodology":
      return (
        <>
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
          {form.methodologyType === "agile" ? (
            <>
              <FormField id="tp-sprint-weeks" label={t("testPlan.sprintWeeks")}>
                {(p) => (
                  <Select
                    {...p}
                    value={String(form.sprintWeeks)}
                    onChange={(v) => set("sprintWeeks", Number(v))}
                    placeholder="—"
                    options={[1, 2, 3, 4].map((w) => ({ value: String(w), label: String(w) }))}
                  />
                )}
              </FormField>
              <FieldLabel text={t("testPlan.ceremonies")} />
              <CheckboxGroup
                label={t("testPlan.ceremonies")}
                options={CEREMONIES}
                selected={form.ceremonies}
                onChange={(v) => set("ceremonies", v)}
                labelFor={(k) => t(`testPlan.ceremonyLabel.${k}`)}
                variant="pills"
                describedBy={gapId}
              />
              {form.ceremonies.length > 0 && (
                <div className="tp-freq" data-testid="ceremony-frequencies">
                  {form.ceremonies.map((c) => {
                    const label = CEREMONIES.includes(c) ? t(`testPlan.ceremonyLabel.${c}`) : c;
                    return (
                      <FormField key={c} label={t("testPlan.frequencyFor", { ceremony: label })}>
                        {(p) => (
                          <Select
                            {...p}
                            value={frequencyOf(c, form.ceremonyFrequency)}
                            onChange={(v) => set("ceremonyFrequency", { ...form.ceremonyFrequency, [c]: v })}
                            options={CEREMONY_FREQUENCIES.map((f) => ({
                              value: f,
                              label: t(`testPlan.frequencyLabel.${f}`),
                            }))}
                          />
                        )}
                      </FormField>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <FieldLabel text={t("testPlan.phases")} />
              <ListField label={t("testPlan.phases")} items={form.phases} onChange={(v) => set("phases", v)} />
            </>
          )}
          {/* What is still missing for the ✓ (FIX-14). Always rendered, so the
              live region exists before its text changes and is announced. */}
          <p id={gapId} className="tpw-hint tpw-gap" role="status" data-testid="methodology-gaps">
            {methodologyGaps(form)
              .map((g) => t(`testPlan.methodologyGap.${g}`))
              .join(" ")}
          </p>
        </>
      );
    case "deliverables":
      return <DeliverablesStep value={form.deliverables} onChange={(v) => set("deliverables", v)} />;
    case "environment":
      return (
        <>
          <AreaField
            label={t("testPlan.environmentConfig")}
            value={form.environmentConfig}
            onChange={(v) => set("environmentConfig", v)}
          />
          <AssistButton
            available={aiReady}
            instruction={ASSIST_INSTRUCTION.environmentConfig}
            notes={form.environmentConfig}
            context={`Test plan title: ${form.title}`}
            {...aiProps("environmentConfig")}
          />
          <AreaField
            label={t("testPlan.environmentRequirements")}
            value={form.environmentRequirements}
            onChange={(v) => set("environmentRequirements", v)}
          />
          <AssistButton
            available={aiReady}
            instruction={ASSIST_INSTRUCTION.environmentRequirements}
            notes={form.environmentRequirements}
            context={`Test plan title: ${form.title}`}
            {...aiProps("environmentRequirements")}
          />
        </>
      );
    case "tools":
      return (
        <>
          <ToolsStep value={form.tools} onChange={(v) => set("tools", v)} />
          <AreaField
            label={t("testPlan.automationStrategy")}
            value={form.automationStrategy}
            onChange={(v) => set("automationStrategy", v)}
          />
          <AssistButton
            available={aiReady}
            instruction={ASSIST_INSTRUCTION.automationStrategy}
            notes={form.automationStrategy}
            context={planBrief(form)}
            {...aiProps("automationStrategy")}
          />
        </>
      );
    case "testData":
      return (
        <>
          <AreaField
            solo
            label={t("testPlan.testDataManagement")}
            value={form.testDataManagement}
            onChange={(v) => set("testDataManagement", v)}
          />
          <AssistButton
            available={aiReady}
            instruction={ASSIST_INSTRUCTION.testDataManagement}
            notes={form.testDataManagement}
            context={planBrief(form)}
            {...aiProps("testDataManagement")}
          />
        </>
      );
    case "defects":
      return (
        <>
          <AreaField
            solo
            label={t("testPlan.defectManagement")}
            value={form.defectManagement}
            onChange={(v) => set("defectManagement", v)}
          />
          <AssistButton
            available={aiReady}
            instruction={ASSIST_INSTRUCTION.defectManagement}
            notes={form.defectManagement}
            context={planBrief(form)}
            {...aiProps("defectManagement")}
          />
        </>
      );
    case "roles": {
      const pendingRoles = rolesWithoutResponsibility(form.roles);
      return (
        <>
          <PairListField
            label={t("testPlan.step.roles")}
            items={form.roles}
            keys={["role", "responsibility"]}
            labels={[t("testPlan.roleCol"), t("testPlan.responsibilityCol")]}
            onChange={(v) => set("roles", v)}
          />
          <AiSuggestList
            available={aiReady}
            buttonLabel={t("testPlan.suggestResponsibilities")}
            blockedReason={pendingRoles.length ? undefined : t("testPlan.suggestResponsibilitiesNone")}
            run={() => suggestResponsibilities(planBrief(form), pendingRoles, i18n.resolvedLanguage ?? "es")}
            renderItem={(r) => (
              <>
                {r.role}
                <span className="assist__pick-sub">{r.responsibility}</span>
              </>
            )}
            provenance={form.aiProvenance.roles}
            onAdd={(items, provenance) =>
              setForm((f) =>
                f
                  ? {
                      ...f,
                      roles: withResponsibilities(f.roles, items),
                      aiProvenance: withProvenance(f.aiProvenance, "roles", provenance),
                    }
                  : f,
              )
            }
            onReview={review("roles")}
          />
        </>
      );
    }
    case "schedule":
      return <ScheduleStep {...props} />;
    case "risks":
      return (
        <>
          <PairListField
            label={t("testPlan.step.risks")}
            items={form.risks}
            keys={["risk", "mitigation"]}
            labels={[t("testPlan.riskCol"), t("testPlan.mitigationCol")]}
            onChange={(v) => set("risks", v)}
          />
          <AiSuggestList
            available={aiReady}
            buttonLabel={t("testPlan.suggestRisks")}
            run={() =>
              suggestRisks(
                planBrief(form),
                form.risks.map((r) => r.risk).filter((r) => r.trim()),
                i18n.resolvedLanguage ?? "es",
              )
            }
            renderItem={(r) => (
              <>
                {r.risk}
                <span className="assist__pick-sub">{r.mitigation}</span>
              </>
            )}
            provenance={form.aiProvenance.risks}
            onAdd={(items, provenance) =>
              setForm((f) =>
                f
                  ? {
                      ...f,
                      // Replace the empty starter row instead of keeping it.
                      risks: [...f.risks.filter((r) => r.risk.trim() || r.mitigation.trim()), ...items],
                      aiProvenance: withProvenance(f.aiProvenance, "risks", provenance),
                    }
                  : f,
              )
            }
            onReview={review("risks")}
          />
        </>
      );
    case "communication":
      return (
        <>
          <AreaField
            solo
            label={t("testPlan.communicationPlan")}
            value={form.communicationPlan}
            onChange={(v) => set("communicationPlan", v)}
          />
          <AssistButton
            available={aiReady}
            instruction={ASSIST_INSTRUCTION.communicationPlan}
            notes={form.communicationPlan}
            context={planBrief(form)}
            {...aiProps("communicationPlan")}
          />
        </>
      );
    case "closure":
      return (
        <>
          <PairListField
            label={t("testPlan.step.closure")}
            items={form.closureCriteria}
            keys={["criterion", "metric"]}
            labels={[t("testPlan.criterionCol"), t("testPlan.metricCol")]}
            wideFirst
            onChange={(v) => set("closureCriteria", v)}
          />
          <AiSuggestList
            available={aiReady}
            buttonLabel={t("testPlan.suggestClosure")}
            run={() =>
              suggestClosureCriteria(
                closureBrief(form),
                form.closureCriteria.map((c) => c.criterion).filter((c) => c.trim()),
                i18n.resolvedLanguage ?? "es",
              )
            }
            renderItem={(c) => (
              <>
                {c.criterion}
                <span className="assist__pick-sub">{c.metric}</span>
              </>
            )}
            provenance={form.aiProvenance.closureCriteria}
            onAdd={(items, provenance) =>
              setForm((f) =>
                f
                  ? {
                      ...f,
                      // Replace an empty row instead of keeping it.
                      closureCriteria: [
                        ...f.closureCriteria.filter((c) => c.criterion.trim() || c.metric.trim()),
                        ...items,
                      ],
                      aiProvenance: withProvenance(f.aiProvenance, "closureCriteria", provenance),
                    }
                  : f,
              )
            }
            onReview={review("closureCriteria")}
          />
        </>
      );
    case "purpose":
      return (
        <>
          <AreaField
            solo
            label={t("testPlan.purpose")}
            value={form.purpose}
            onChange={(v) => set("purpose", v)}
          />
          <AssistButton
            available={aiReady}
            instruction={ASSIST_INSTRUCTION.purpose}
            notes={form.purpose}
            context={[
              `Title: ${form.title}`,
              form.summary && `Summary: ${form.summary}`,
              form.scopeIn.filter(Boolean).length && `In scope: ${form.scopeIn.filter(Boolean).join(", ")}`,
            ]
              .filter(Boolean)
              .join("\n")}
            {...aiProps("purpose")}
          />
        </>
      );
    case "conclusion":
      return (
        <>
          <AreaField solo label={t("testPlan.conclusion")} value={form.conclusion} onChange={(v) => set("conclusion", v)} />
          <AssistButton
            available={aiReady}
            instruction={ASSIST_INSTRUCTION.conclusion}
            notes={form.conclusion}
            context={conclusionBrief(form)}
            {...aiProps("conclusion")}
          />
          <FinishStep {...props} />
        </>
      );
  }
}
