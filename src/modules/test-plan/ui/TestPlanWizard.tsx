import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { testPlanApi } from "../api/testPlanApi";
import type {
  RoleItem,
  RiskItem,
  ClosureCriterion,
  ScheduleMilestone,
  ScheduleSprint,
  TestPlan,
  TestPlanInput,
} from "../model/types";
import { CheckboxGroup, ListField, PairListField } from "./fields";
import "./TestPlan.css";

const TEST_TYPES = [
  "functional",
  "performance",
  "load",
  "stress",
  "security",
  "usability",
  "compatibility",
  "accessibility",
  "regression",
  "smoke",
  "sanity",
  "exploratory",
  "uat",
];
const TEST_LEVELS = ["unit", "integration", "system", "acceptance"];
const TOOLS = ["selenium", "playwright", "cypress", "postman", "jmeter", "jira"];
const CEREMONIES = ["daily", "review", "retrospective", "planning"];
const DELIVERABLE_KEYS = [
  "testPlan",
  "testCasesScripts",
  "statusReports",
  "summaryReports",
  "defectReports",
  "uatSignoff",
  "testData",
  "incidentReports",
];
const ROLE_KEYS = ["testManager", "tester", "automation", "productOwner"];

interface FormState {
  title: string;
  version: string;
  planDate: string;
  status: string;
  summary: string;
  scopeIn: string[];
  scopeOut: string[];
  testTypes: string[];
  methodologyType: "agile" | "traditional";
  sprintWeeks: number;
  ceremonies: string[];
  phases: string[];
  testLevels: string[];
  deliverables: string[];
  environmentConfig: string;
  environmentRequirements: string;
  tools: string[];
  automationStrategy: string;
  testDataManagement: string;
  defectManagement: string;
  roles: RoleItem[];
  sprints: ScheduleSprint[];
  milestones: ScheduleMilestone[];
  risks: RiskItem[];
  communicationPlan: string;
  closureCriteria: ClosureCriterion[];
  purpose: string;
  conclusion: string;
}

interface Props {
  planId: string | null;
  onClose: () => void;
}

export function TestPlanWizard({ planId, onClose }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [plan, setPlan] = useState<TestPlan | null>(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (planId) {
        const p = await testPlanApi.get(planId);
        if (p && !cancelled) {
          setPlan(p);
          setForm(fromPlan(p));
        }
      } else if (!cancelled) {
        setForm(defaults(t));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planId, t]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  async function save() {
    if (!form) return;
    setSaving(true);
    const author = plan?.author ?? (user ? `${user.firstName} ${user.lastName}` : "");
    const input: TestPlanInput = {
      title: form.title,
      version: form.version,
      planDate: form.planDate || null,
      status: form.status,
      author,
      data: {
        summary: form.summary,
        scopeIn: form.scopeIn,
        scopeOut: form.scopeOut,
        testTypes: form.testTypes,
        methodologyType: form.methodologyType,
        sprintWeeks: form.sprintWeeks,
        ceremonies: form.ceremonies,
        phases: form.phases,
        testLevels: form.testLevels,
        deliverables: form.deliverables,
        environmentConfig: form.environmentConfig,
        environmentRequirements: form.environmentRequirements,
        tools: form.tools,
        automationStrategy: form.automationStrategy,
        testDataManagement: form.testDataManagement,
        defectManagement: form.defectManagement,
        roles: form.roles,
        sprints: form.sprints,
        milestones: form.milestones,
        risks: form.risks,
        communicationPlan: form.communicationPlan,
        closureCriteria: form.closureCriteria,
        purpose: form.purpose,
        conclusion: form.conclusion,
      },
    };
    if (plan) await testPlanApi.update(plan.id, input);
    else await testPlanApi.create(input);
    setSaving(false);
    onClose();
  }

  const steps: { id: string; body: ReactNode }[] = useMemo(() => {
    if (!form) return [];
    return [
      // 1. Title
      {
        id: "title",
        body: (
          <TextField
            label={t("testPlan.fieldTitle")}
            value={form.title}
            onChange={(v) => set("title", v)}
          />
        ),
      },
      // 2. Version / 3. Date / 4. Author
      {
        id: "meta",
        body: (
          <>
            <TextField
              label={t("testPlan.version")}
              value={form.version}
              onChange={(v) => set("version", v)}
            />
            <label className="tp-field">
              <span>{t("testPlan.date")}</span>
              <input
                type="date"
                value={form.planDate}
                onChange={(e) => set("planDate", e.target.value)}
              />
            </label>
            <label className="tp-field">
              <span>{t("testPlan.author")}</span>
              <input
                value={plan?.author ?? (user ? `${user.firstName} ${user.lastName}` : "")}
                readOnly
              />
            </label>
          </>
        ),
      },
      // 5. Summary
      {
        id: "summary",
        body: (
          <AreaField
            label={t("testPlan.summary")}
            value={form.summary}
            onChange={(v) => set("summary", v)}
          />
        ),
      },
      // 6. Scope in / out
      {
        id: "scope",
        body: (
          <>
            <FieldLabel text={t("testPlan.scopeIn")} />
            <ListField items={form.scopeIn} onChange={(v) => set("scopeIn", v)} />
            <FieldLabel text={t("testPlan.scopeOut")} />
            <ListField items={form.scopeOut} onChange={(v) => set("scopeOut", v)} />
          </>
        ),
      },
      // 7. Test types
      {
        id: "types",
        body: (
          <CheckboxGroup
            options={TEST_TYPES}
            selected={form.testTypes}
            onChange={(v) => set("testTypes", v)}
            labelFor={(k) => t(`testPlan.typeLabel.${k}`)}
          />
        ),
      },
      // 8. Methodology
      {
        id: "methodology",
        body: (
          <>
            <label className="tp-field">
              <span>{t("testPlan.methodology")}</span>
              <select
                value={form.methodologyType}
                onChange={(e) =>
                  set("methodologyType", e.target.value as "agile" | "traditional")
                }
              >
                <option value="agile">{t("testPlan.agile")}</option>
                <option value="traditional">{t("testPlan.traditional")}</option>
              </select>
            </label>
            {form.methodologyType === "agile" ? (
              <>
                <label className="tp-field">
                  <span>{t("testPlan.sprintWeeks")}</span>
                  <select
                    value={form.sprintWeeks}
                    onChange={(e) => set("sprintWeeks", Number(e.target.value))}
                  >
                    {[1, 2, 3, 4].map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </label>
                <FieldLabel text={t("testPlan.ceremonies")} />
                <CheckboxGroup
                  options={CEREMONIES}
                  selected={form.ceremonies}
                  onChange={(v) => set("ceremonies", v)}
                  labelFor={(k) => t(`testPlan.ceremonyLabel.${k}`)}
                />
              </>
            ) : (
              <>
                <FieldLabel text={t("testPlan.phases")} />
                <ListField items={form.phases} onChange={(v) => set("phases", v)} />
              </>
            )}
          </>
        ),
      },
      // 9. Test levels
      {
        id: "levels",
        body: (
          <CheckboxGroup
            options={TEST_LEVELS}
            selected={form.testLevels}
            onChange={(v) => set("testLevels", v)}
            labelFor={(k) => t(`testPlan.levelLabel.${k}`)}
          />
        ),
      },
      // 10. Deliverables
      {
        id: "deliverables",
        body: (
          <ListField
            items={form.deliverables}
            onChange={(v) => set("deliverables", v)}
          />
        ),
      },
      // 11. Environment
      {
        id: "environment",
        body: (
          <>
            <AreaField
              label={t("testPlan.environmentConfig")}
              value={form.environmentConfig}
              onChange={(v) => set("environmentConfig", v)}
            />
            <AreaField
              label={t("testPlan.environmentRequirements")}
              value={form.environmentRequirements}
              onChange={(v) => set("environmentRequirements", v)}
            />
          </>
        ),
      },
      // 12. Tools & automation
      {
        id: "tools",
        body: (
          <>
            <FieldLabel text={t("testPlan.tools")} />
            <CheckboxGroup
              options={TOOLS}
              selected={form.tools}
              onChange={(v) => set("tools", v)}
              labelFor={(k) => t(`testPlan.toolLabel.${k}`)}
            />
            <AreaField
              label={t("testPlan.automationStrategy")}
              value={form.automationStrategy}
              onChange={(v) => set("automationStrategy", v)}
            />
          </>
        ),
      },
      // 13. Test data management
      {
        id: "testData",
        body: (
          <AreaField
            label={t("testPlan.testDataManagement")}
            value={form.testDataManagement}
            onChange={(v) => set("testDataManagement", v)}
          />
        ),
      },
      // 14. Defect management
      {
        id: "defects",
        body: (
          <AreaField
            label={t("testPlan.defectManagement")}
            value={form.defectManagement}
            onChange={(v) => set("defectManagement", v)}
          />
        ),
      },
      // 15. Roles & responsibilities
      {
        id: "roles",
        body: (
          <PairListField
            items={form.roles}
            keys={["role", "responsibility"]}
            labels={[t("testPlan.roleCol"), t("testPlan.responsibilityCol")]}
            onChange={(v) => set("roles", v)}
          />
        ),
      },
      // 16. Schedule (calendar UI arrives in task 25)
      {
        id: "schedule",
        body: (
          <>
            <FieldLabel text={t("testPlan.sprints")} />
            {form.sprints.map((s, i) => (
              <div className="tp-sched-row" key={i}>
                <input
                  placeholder={t("testPlan.sprintName")}
                  value={s.name}
                  onChange={(e) => {
                    const next = [...form.sprints];
                    next[i] = { ...s, name: e.target.value };
                    set("sprints", next);
                  }}
                />
                <input
                  type="date"
                  value={s.start}
                  onChange={(e) => {
                    const next = [...form.sprints];
                    next[i] = { ...s, start: e.target.value };
                    set("sprints", next);
                  }}
                />
                <input
                  type="date"
                  value={s.end}
                  onChange={(e) => {
                    const next = [...form.sprints];
                    next[i] = { ...s, end: e.target.value };
                    set("sprints", next);
                  }}
                />
                <button
                  type="button"
                  className="tp-list-field__del"
                  onClick={() =>
                    set("sprints", form.sprints.filter((_, j) => j !== i))
                  }
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="tp-list-field__add"
              onClick={() =>
                set("sprints", [...form.sprints, { name: "", start: "", end: "" }])
              }
            >
              + {t("testPlan.addRow")}
            </button>
            <FieldLabel text={t("testPlan.milestones")} />
            {form.milestones.map((m, i) => (
              <div className="tp-sched-row" key={i}>
                <input
                  placeholder={t("testPlan.milestoneName")}
                  value={m.name}
                  onChange={(e) => {
                    const next = [...form.milestones];
                    next[i] = { ...m, name: e.target.value };
                    set("milestones", next);
                  }}
                />
                <input
                  type="date"
                  value={m.date}
                  onChange={(e) => {
                    const next = [...form.milestones];
                    next[i] = { ...m, date: e.target.value };
                    set("milestones", next);
                  }}
                />
                <button
                  type="button"
                  className="tp-list-field__del"
                  onClick={() =>
                    set("milestones", form.milestones.filter((_, j) => j !== i))
                  }
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="tp-list-field__add"
              onClick={() =>
                set("milestones", [...form.milestones, { name: "", date: "" }])
              }
            >
              + {t("testPlan.addRow")}
            </button>
          </>
        ),
      },
      // 17. Risks
      {
        id: "risks",
        body: (
          <PairListField
            items={form.risks}
            keys={["risk", "mitigation"]}
            labels={[t("testPlan.riskCol"), t("testPlan.mitigationCol")]}
            onChange={(v) => set("risks", v)}
          />
        ),
      },
      // 18. Communication plan
      {
        id: "communication",
        body: (
          <AreaField
            label={t("testPlan.communicationPlan")}
            value={form.communicationPlan}
            onChange={(v) => set("communicationPlan", v)}
          />
        ),
      },
      // 19. Closure criteria
      {
        id: "closure",
        body: (
          <PairListField
            items={form.closureCriteria}
            keys={["criterion", "metric"]}
            labels={[t("testPlan.criterionCol"), t("testPlan.metricCol")]}
            onChange={(v) => set("closureCriteria", v)}
          />
        ),
      },
      // 20. Purpose
      {
        id: "purpose",
        body: (
          <AreaField
            label={t("testPlan.purpose")}
            hint={t("testPlan.purposeHint")}
            value={form.purpose}
            onChange={(v) => set("purpose", v)}
          />
        ),
      },
      // 21. Conclusion
      {
        id: "conclusion",
        body: (
          <AreaField
            label={t("testPlan.conclusion")}
            value={form.conclusion}
            onChange={(v) => set("conclusion", v)}
          />
        ),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, t, plan, user]);

  if (!form) return <p className="tp__muted">{t("common.loading")}</p>;

  const current = steps[step];

  return (
    <section className="tp-wizard">
      <header className="tp-wizard__top">
        <button type="button" className="tp-editor__back" onClick={onClose}>
          ← {t("testPlan.back")}
        </button>
        <h1>{plan ? t("testPlan.editTitle") : t("testPlan.newTitle")}</h1>
        {plan && (
          <span className="tp-editor__rev">
            {t("testPlan.revShort")} {plan.revision}
          </span>
        )}
        <button
          type="button"
          className="tp-editor__save"
          onClick={save}
          disabled={saving || !form.title}
        >
          {saving ? t("testPlan.saving") : t("testPlan.save")}
        </button>
      </header>

      <div className="tp-wizard__body">
        <nav className="tp-wizard__steps" aria-label={t("testPlan.steps")}>
          {steps.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className="tp-wizard__step"
              data-active={i === step}
              onClick={() => setStep(i)}
            >
              <span className="tp-wizard__step-n">{i + 1}</span>
              {t(`testPlan.step.${s.id}`)}
            </button>
          ))}
        </nav>

        <div className="tp-wizard__content">
          <h2 className="tp-wizard__step-title">
            {step + 1}. {t(`testPlan.step.${current.id}`)}
          </h2>
          <div className="tp-wizard__fields">{current.body}</div>
          <div className="tp-wizard__nav">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
            >
              ← {t("testPlan.prev")}
            </button>
            <span className="tp-wizard__progress">
              {step + 1} / {steps.length}
            </span>
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
              disabled={step === steps.length - 1}
            >
              {t("testPlan.next")} →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function FieldLabel({ text }: { text: string }) {
  return <p className="tp-field__grouplabel">{text}</p>;
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="tp-field">
      <span>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function AreaField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="tp-field">
      <span>{label}</span>
      {hint && <span className="tp-field__hint">{hint}</span>}
      <textarea rows={4} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function defaults(t: (k: string) => string): FormState {
  return {
    title: t("testPlan.defaultTitle"),
    version: "1.0",
    planDate: new Date().toISOString().slice(0, 10),
    status: "draft",
    summary: "",
    scopeIn: [],
    scopeOut: [],
    testTypes: [],
    methodologyType: "agile",
    sprintWeeks: 2,
    ceremonies: ["daily", "review", "retrospective"],
    phases: [],
    testLevels: [],
    deliverables: DELIVERABLE_KEYS.map((k) => t(`testPlan.deliverableLabel.${k}`)),
    environmentConfig: "",
    environmentRequirements: "",
    tools: [],
    automationStrategy: "",
    testDataManagement: "",
    defectManagement: "",
    roles: ROLE_KEYS.map((k) => ({
      role: t(`testPlan.roleName.${k}`),
      responsibility: "",
    })),
    sprints: [],
    milestones: [],
    risks: [],
    communicationPlan: "",
    closureCriteria: [],
    purpose: "",
    conclusion: "",
  };
}

function fromPlan(p: TestPlan): FormState {
  const d = p.data ?? {};
  return {
    title: p.title,
    version: p.version,
    planDate: p.planDate ?? "",
    status: p.status,
    summary: d.summary ?? "",
    scopeIn: d.scopeIn ?? [],
    scopeOut: d.scopeOut ?? [],
    testTypes: d.testTypes ?? [],
    methodologyType: d.methodologyType ?? "agile",
    sprintWeeks: d.sprintWeeks ?? 2,
    ceremonies: d.ceremonies ?? [],
    phases: d.phases ?? [],
    testLevels: d.testLevels ?? [],
    deliverables: d.deliverables ?? [],
    environmentConfig: d.environmentConfig ?? "",
    environmentRequirements: d.environmentRequirements ?? "",
    tools: d.tools ?? [],
    automationStrategy: d.automationStrategy ?? "",
    testDataManagement: d.testDataManagement ?? "",
    defectManagement: d.defectManagement ?? "",
    roles: d.roles ?? [],
    sprints: d.sprints ?? [],
    milestones: d.milestones ?? [],
    risks: d.risks ?? [],
    communicationPlan: d.communicationPlan ?? "",
    closureCriteria: d.closureCriteria ?? [],
    purpose: d.purpose ?? "",
    conclusion: d.conclusion ?? "",
  };
}
