import { useTranslation } from "react-i18next";
import { CheckboxGroup, ListField, PairListField } from "@shared/ui/fields";
import { FormField } from "@shared/ui/FormField";
import { required } from "@shared/validation";
import { AiSuggestList, AssistButton, suggestRisks, withProvenance } from "@modules/ai";
import {
  CEREMONIES,
  CEREMONY_FREQUENCIES,
  FUNCTIONAL_TYPES,
  NON_FUNCTIONAL_TYPES,
  TEST_LEVELS,
  TEST_TYPES,
} from "../../model/catalogs";
import { frequencyOf } from "../../model/methodology";
import { planBrief } from "./formState";
import type { StepId } from "./steps";
import { AreaField, FieldLabel, TextField, type StepProps } from "./stepProps";
import { DeliverablesStep } from "./DeliverablesStep";
import { ToolsStep } from "./ToolsStep";
import { ScheduleStep } from "./ScheduleStep";
import { FinishStep } from "./FinishStep";

/** The fields of one wizard step (spec §5.1, ScrPlan). */
export function StepBody({ id, ...props }: StepProps & { id: StepId }) {
  const { t, i18n } = useTranslation();
  const { form, set, setForm, aiReady, aiProps, review, attempted } = props;

  switch (id) {
    case "title":
      return (
        <>
          <FormField
            id="tp-title"
            label={t("testPlan.fieldTitle")}
            issue={attempted ? required(form.title) : null}
            required
          >
            {(p) => <input {...p} value={form.title} onChange={(e) => set("title", e.target.value)} />}
          </FormField>
          <label className="tp-field">
            <span>{t("testPlan.status")}</span>
            <select value={form.status} onChange={(e) => set("status", e.target.value)}>
              {["draft", "reviewed", "approved", "obsolete"].map((s) => (
                <option key={s} value={s}>
                  {t(`testPlan.statusLabel.${s}`)}
                </option>
              ))}
            </select>
          </label>
        </>
      );
    case "meta":
      return (
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
      );
    case "summary":
      return (
        <>
          <AreaField label={t("testPlan.summary")} value={form.summary} onChange={(v) => set("summary", v)} />
          <AssistButton
            available={aiReady}
            instruction="the Summary (introduction) section of a software test plan"
            notes={form.summary}
            context={`Test plan title: ${form.title}`}
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
    case "types":
      return (
        <CheckboxGroup
          label={t("testPlan.step.types")}
          options={TEST_TYPES}
          selected={form.testTypes}
          onChange={(v) => set("testTypes", v)}
          labelFor={(k) => t(`testPlan.typeLabel.${k}`)}
          allowCustom
          variant="pills"
          groups={[
            { title: t("testPlan.typeGroup.functional"), options: FUNCTIONAL_TYPES },
            { title: t("testPlan.typeGroup.nonFunctional"), options: NON_FUNCTIONAL_TYPES },
          ]}
        />
      );
    case "methodology":
      return (
        <>
          <label className="tp-field">
            <span>{t("testPlan.methodology")}</span>
            <select
              value={form.methodologyType}
              onChange={(e) => set("methodologyType", e.target.value as "agile" | "traditional")}
            >
              <option value="agile">{t("testPlan.agile")}</option>
              <option value="traditional">{t("testPlan.traditional")}</option>
            </select>
          </label>
          {form.methodologyType === "agile" ? (
            <>
              <label className="tp-field">
                <span>{t("testPlan.sprintWeeks")}</span>
                <select value={form.sprintWeeks} onChange={(e) => set("sprintWeeks", Number(e.target.value))}>
                  {[1, 2, 3, 4].map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </label>
              <FieldLabel text={t("testPlan.ceremonies")} />
              <CheckboxGroup
                label={t("testPlan.ceremonies")}
                options={CEREMONIES}
                selected={form.ceremonies}
                onChange={(v) => set("ceremonies", v)}
                labelFor={(k) => t(`testPlan.ceremonyLabel.${k}`)}
                variant="pills"
              />
              {form.ceremonies.length > 0 && (
                <div className="tp-freq" data-testid="ceremony-frequencies">
                  {form.ceremonies.map((c) => {
                    const label = CEREMONIES.includes(c) ? t(`testPlan.ceremonyLabel.${c}`) : c;
                    return (
                      <label key={c} className="tp-field">
                        <span>{t("testPlan.frequencyFor", { ceremony: label })}</span>
                        <select
                          value={frequencyOf(c, form.ceremonyFrequency)}
                          onChange={(e) =>
                            set("ceremonyFrequency", { ...form.ceremonyFrequency, [c]: e.target.value })
                          }
                        >
                          {CEREMONY_FREQUENCIES.map((f) => (
                            <option key={f} value={f}>
                              {t(`testPlan.frequencyLabel.${f}`)}
                            </option>
                          ))}
                        </select>
                      </label>
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
        </>
      );
    case "levels":
      return (
        <CheckboxGroup
          label={t("testPlan.step.levels")}
          options={TEST_LEVELS}
          selected={form.testLevels}
          onChange={(v) => set("testLevels", v)}
          labelFor={(k) => t(`testPlan.levelLabel.${k}`)}
          variant="pills"
        />
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
            instruction="the test environment configuration description of a software test plan"
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
            instruction="the hardware and software requirements of a software test plan's test environment"
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
            instruction="the test automation strategy of a software test plan: what to automate first, at which levels, with which of the chosen tools, and what stays manual"
            notes={form.automationStrategy}
            context={planBrief(form)}
            {...aiProps("automationStrategy")}
          />
        </>
      );
    case "testData":
      return (
        <AreaField
          label={t("testPlan.testDataManagement")}
          value={form.testDataManagement}
          onChange={(v) => set("testDataManagement", v)}
        />
      );
    case "defects":
      return (
        <AreaField
          label={t("testPlan.defectManagement")}
          value={form.defectManagement}
          onChange={(v) => set("defectManagement", v)}
        />
      );
    case "roles":
      return (
        <PairListField
          label={t("testPlan.step.roles")}
          items={form.roles}
          keys={["role", "responsibility"]}
          labels={[t("testPlan.roleCol"), t("testPlan.responsibilityCol")]}
          onChange={(v) => set("roles", v)}
        />
      );
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
        <AreaField
          label={t("testPlan.communicationPlan")}
          value={form.communicationPlan}
          onChange={(v) => set("communicationPlan", v)}
        />
      );
    case "closure":
      return (
        <PairListField
          label={t("testPlan.step.closure")}
          items={form.closureCriteria}
          keys={["criterion", "metric"]}
          labels={[t("testPlan.criterionCol"), t("testPlan.metricCol")]}
          onChange={(v) => set("closureCriteria", v)}
        />
      );
    case "purpose":
      return (
        <>
          <AreaField
            label={t("testPlan.purpose")}
            hint={t("testPlan.purposeHint")}
            value={form.purpose}
            onChange={(v) => set("purpose", v)}
          />
          <AssistButton
            available={aiReady}
            instruction="the Purpose section of a software test plan"
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
          <AreaField label={t("testPlan.conclusion")} value={form.conclusion} onChange={(v) => set("conclusion", v)} />
          <AssistButton
            available={aiReady}
            instruction="the Conclusion section (summary and next steps) of a software test plan"
            notes={form.conclusion}
            context={`Test plan title: ${form.title}`}
            {...aiProps("conclusion")}
          />
          <FinishStep {...props} />
        </>
      );
  }
}
