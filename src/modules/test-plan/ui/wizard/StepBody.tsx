import { useTranslation } from "react-i18next";
import { ListField, PairListField } from "@shared/ui/fields";
import { DatePicker } from "@shared/ui/DatePicker";
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
import { ASSIST_INSTRUCTION } from "./aiGuidance";
import { closureBrief, conclusionBrief, planBrief, rolesWithoutResponsibility, withResponsibilities } from "./formState";
import type { StepId } from "./steps";
import { AreaField, FieldLabel, TextField, type StepProps } from "./stepProps";
import { DeliverablesStep } from "./DeliverablesStep";
import { LevelsTypesStep } from "./LevelsTypesStep";
import { MethodologyStep } from "./MethodologyStep";
import { ToolsStep } from "./ToolsStep";
import { ScheduleStep } from "./ScheduleStep";
import { FinishStep } from "./FinishStep";
import { AssumptionsStep, EntryStep, EstimationStep, StaffingFields, TechniquesStep } from "./StrategySteps";
import { MetricsStep } from "./MetricsStep";
import { ClosureStep } from "./ClosureStep";

/** The fields of one wizard step (spec §5.1, ScrPlan). */
export function StepBody({ id, ...props }: StepProps & { id: StepId }) {
  const { t, i18n } = useTranslation();
  const { form, set, setForm, aiReady, aiProps, review, attempted } = props;

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
                  // «Aprobado» comes only from «Aprobar» in «Estado del plan»,
                  // which records who and when (PLN-07).
                  options={["draft", "reviewed", "approved", "obsolete"].map((s) => ({
                    value: s,
                    label: t(`testPlan.statusLabel.${s}`),
                    ...(s === "approved" && form.status !== "approved"
                      ? { disabled: true, reason: t("testPlan.approval.optionReason") }
                      : {}),
                  }))}
                />
              )}
            </FormField>
          </div>
          <div className="tpw-grid tpw-grid--3">
            <TextField
              label={t("testPlan.documentId")}
              value={form.documentId}
              onChange={(v) => set("documentId", v)}
            />
            <TextField label={t("testPlan.version")} value={form.version} onChange={(v) => set("version", v)} />
            <FormField id="tp-date" label={t("testPlan.date")}>
              {(p) => (
                <DatePicker {...p} value={form.planDate} onChange={(v) => set("planDate", v)} data-testid="plan-date" />
              )}
            </FormField>
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
    case "assumptions":
      return <AssumptionsStep {...props} />;
    case "levelsTypes":
      return <LevelsTypesStep form={form} set={set} />;
    case "techniques":
      return <TechniquesStep value={form.techniques} onChange={(v) => set("techniques", v)} />;
    case "methodology":
      return <MethodologyStep form={form} set={set} />;
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
          <StaffingFields form={form} set={set} />
        </>
      );
    }
    case "estimation":
      return <EstimationStep form={form} set={set} />;
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
    case "entry":
      return <EntryStep {...props} />;
    case "metrics":
      return <MetricsStep form={form} setForm={setForm} />;
    case "closure":
      return (
        <>
          <ClosureStep form={form} set={set} />
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
