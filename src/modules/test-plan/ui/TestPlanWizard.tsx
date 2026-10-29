import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { testPlanApi } from "../api/testPlanApi";
import type { ExportablePlan } from "../export/planXlsx";
import type {
  RoleItem,
  RiskItem,
  ClosureCriterion,
  ScheduleMilestone,
  ScheduleSprint,
  TestPlan,
  TestPlanData,
  TestPlanInput,
} from "../model/types";
import { CheckboxGroup, ListField, PairListField } from "@shared/ui/fields";
import { useToast } from "@shared/ui/Toast";
import {
  CEREMONIES,
  DELIVERABLE_KEYS,
  FUNCTIONAL_TYPES,
  NON_FUNCTIONAL_TYPES,
  ROLE_KEYS,
  TEST_LEVELS,
  TEST_TYPES,
  TOOLS,
} from "../model/catalogs";
import { ScheduleCalendar } from "./ScheduleCalendar";
import { RevisionHistory } from "./RevisionHistory";
import { ImportReportModal } from "@shared/ui/ImportReportModal";
import {
  AssistButton,
  aiAvailable,
  markReviewed,
  withProvenance,
  type AiProvenance,
  type ProvenanceMap,
} from "@modules/ai";
import type { DetectionRow, ImportResult } from "../import/planImport";
import "./TestPlan.css";

/** Per-sprint validation: an end date before the start is an error; overlapping
 *  ranges are only a warning, since parallel sprints can be legitimate. */
function sprintIssues(
  sprints: ScheduleSprint[],
): (null | "error" | "overlap")[] {
  return sprints.map((s, i) => {
    if (s.start && s.end && s.end < s.start) return "error";
    if (!s.start || !s.end) return null;
    const overlaps = sprints.some(
      (o, j) =>
        j !== i && o.start && o.end && o.start <= s.end && s.start <= o.end,
    );
    return overlaps ? "overlap" : null;
  });
}


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
  /** AI provenance of the assisted fields (IA-01). */
  aiProvenance: ProvenanceMap;
}

/** Fields the wizard can draft with AI (keys of the provenance map). */
type AssistedField = "summary" | "environmentConfig" | "environmentRequirements" | "purpose" | "conclusion";

interface Props {
  planId: string | null;
  projectId?: string | null;
  onClose: () => void;
}

export function TestPlanWizard({ planId, projectId, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const toast = useToast();
  const [plan, setPlan] = useState<TestPlan | null>(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showRev, setShowRev] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  // Snapshot of the form as loaded, to detect unsaved changes (C1).
  const initialRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<{
    fileName: string;
    parsing: boolean;
    done: number;
    total: number;
    rows: DetectionRow[];
    result: ImportResult | null;
  } | null>(null);
  const [aiReady, setAiReady] = useState(false);

  useEffect(() => {
    void aiAvailable().then(setAiReady);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (planId) {
        const p = await testPlanApi.get(planId, userId);
        if (p && !cancelled) {
          setPlan(p);
          const f = fromPlan(p);
          setForm(f);
          initialRef.current = JSON.stringify(f);
        }
      } else if (!cancelled) {
        const f = defaults(t);
        setForm(f);
        initialRef.current = JSON.stringify(f);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planId, userId, t]);

  const dirty = form !== null && JSON.stringify(form) !== initialRef.current;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  // AI drafts are applied with their provenance; the field shows "AI · pending
  // review" until a person marks it reviewed (IA-01).
  const applyDraft = (field: AssistedField) => (text: string, provenance: AiProvenance) =>
    setForm((f) =>
      f ? { ...f, [field]: text, aiProvenance: withProvenance(f.aiProvenance, field, provenance) } : f,
    );
  const review = (field: AssistedField) => () =>
    setForm((f) => (f ? { ...f, aiProvenance: markReviewed(f.aiProvenance, field, user?.id ?? "") } : f));
  const aiProps = (field: AssistedField) => ({
    provenance: form?.aiProvenance[field],
    onUse: applyDraft(field),
    onReview: review(field),
  });

  // Restore a past revision's content into the editor (A1). Version/date/status
  // are not snapshotted, so they carry on from the current values; saving then
  // creates a new revision.
  async function restore(revisionId: string) {
    if (!form) return;
    const rev = await testPlanApi.revisionDetail(revisionId, userId);
    if (!rev) return;
    if (!window.confirm(t("testPlan.restoreConfirm"))) return;
    setForm(applyRevision(form, rev.title, rev.data));
    setShowRev(false);
    setStep(0);
  }

  // Leaving with unsaved changes asks first (C1).
  const close = () => {
    if (dirty && !window.confirm(t("testPlan.discardConfirm"))) return;
    onClose();
  };

  async function save() {
    if (!form) return;
    setSaving(true);
    const author = plan?.author ?? (user ? `${user.firstName} ${user.lastName}` : "");
    // Drop empty entries so blank rows are not persisted (user feedback).
    const clean = (a: string[]) => a.map((s) => s.trim()).filter(Boolean);
    // Auto-bump the version when editing, unless the user set it by hand (A2).
    const version =
      plan && form.version === plan.version
        ? nextVersion(form.version)
        : form.version;
    const input: TestPlanInput = {
      projectId: plan?.projectId ?? projectId ?? null,
      title: form.title.trim(),
      version,
      planDate: form.planDate || null,
      status: form.status,
      author,
      data: {
        summary: form.summary,
        scopeIn: clean(form.scopeIn),
        scopeOut: clean(form.scopeOut),
        testTypes: form.testTypes,
        methodologyType: form.methodologyType,
        sprintWeeks: form.sprintWeeks,
        ceremonies: form.ceremonies,
        phases: clean(form.phases),
        testLevels: form.testLevels,
        deliverables: clean(form.deliverables),
        environmentConfig: form.environmentConfig,
        environmentRequirements: form.environmentRequirements,
        tools: form.tools,
        automationStrategy: form.automationStrategy,
        testDataManagement: form.testDataManagement,
        defectManagement: form.defectManagement,
        roles: form.roles.filter(
          (r) => r.role.trim() || r.responsibility.trim(),
        ),
        sprints: form.sprints.filter((s) => s.name.trim() || s.start || s.end),
        milestones: form.milestones.filter((m) => m.name.trim() || m.date),
        risks: form.risks.filter((r) => r.risk.trim() || r.mitigation.trim()),
        communicationPlan: form.communicationPlan,
        closureCriteria: form.closureCriteria.filter(
          (c) => c.criterion.trim() || c.metric.trim(),
        ),
        purpose: form.purpose,
        conclusion: form.conclusion,
        aiProvenance: form.aiProvenance,
      },
      userId,
    };
    try {
      if (plan) await testPlanApi.update(plan.id, input);
      else await testPlanApi.create(input);
      toast(t("testPlan.savedToast"));
      onClose();
    } finally {
      setSaving(false);
    }
  }

  /** Maps the current (possibly unsaved) form to the export shape, shared by the
   *  .xlsx and .pdf exporters so both stay in sync. */
  function buildExportablePlan(): ExportablePlan | null {
    if (!form) return null;
    // Localize option lists (predefined keys → labels; custom values as-is).
    const loc = (arr: string[], known: string[], prefix: string) =>
      arr.map((k) => (known.includes(k) ? t(`${prefix}.${k}`) : k));
    const methodology =
      form.methodologyType === "agile"
        ? `${t("testPlan.agile")} · ${t("testPlan.sprintWeeks")}: ${form.sprintWeeks} · ` +
          `${t("testPlan.ceremonies")}: ${loc(form.ceremonies, CEREMONIES, "testPlan.ceremonyLabel").join(", ")}`
        : `${t("testPlan.traditional")} · ${t("testPlan.phases")}: ${form.phases
            .filter((p) => p.trim())
            .join(", ")}`;
    return {
      filenameBase: form.title.trim() || "plan",
      version: form.version,
      planDate: form.planDate,
      author: plan?.author ?? (user ? `${user.firstName} ${user.lastName}` : ""),
      status: t(`testPlan.statusLabel.${form.status}`),
      summary: form.summary,
      purpose: form.purpose,
      scopeIn: form.scopeIn,
      scopeOut: form.scopeOut,
      testTypes: loc(form.testTypes, TEST_TYPES, "testPlan.typeLabel"),
      methodology,
      testLevels: loc(form.testLevels, TEST_LEVELS, "testPlan.levelLabel"),
      deliverables: form.deliverables,
      environmentConfig: form.environmentConfig,
      environmentRequirements: form.environmentRequirements,
      tools: loc(form.tools, TOOLS, "testPlan.toolLabel"),
      automationStrategy: form.automationStrategy,
      testDataManagement: form.testDataManagement,
      defectManagement: form.defectManagement,
      communicationPlan: form.communicationPlan,
      conclusion: form.conclusion,
      roles: form.roles.filter((r) => r.role.trim() || r.responsibility.trim()),
      sprints: form.sprints
        .filter((s) => s.name.trim() || s.start || s.end)
        .map((s) => ({ name: s.name, range: [s.start, s.end].filter(Boolean).join(" → ") })),
      risks: form.risks.filter((r) => r.risk.trim() || r.mitigation.trim()),
      closureCriteria: form.closureCriteria.filter(
        (c) => c.criterion.trim() || c.metric.trim(),
      ),
    };
  }

  async function exportXlsx() {
    const exportable = buildExportablePlan();
    if (!exportable) return;
    const { exportPlanXlsx } = await import("../export/planXlsx");
    const name = await exportPlanXlsx(exportable, i18n.resolvedLanguage ?? "es");
    toast(t("testPlan.exportedToast", { name }));
  }

  async function exportPdf() {
    const exportable = buildExportablePlan();
    if (!exportable) return;
    const { exportPlanPdf } = await import("../export/planPdf");
    const name = await exportPlanPdf(exportable, t);
    toast(t("testPlan.exportedToast", { name }));
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    const authorFallback = plan?.author ?? (user ? `${user.firstName} ${user.lastName}` : "");
    setImportState({ fileName: file.name, parsing: true, done: 0, total: 0, rows: [], result: null });
    try {
      const { parsePlanXlsx } = await import("../import/planImport");
      const buffer = await file.arrayBuffer();
      const result = await parsePlanXlsx(buffer, file.name, authorFallback, (p) =>
        setImportState((prev) =>
          prev ? { ...prev, done: p.done, total: p.total, rows: [...prev.rows, p.row] } : prev,
        ),
      );
      setImportState((prev) => (prev ? { ...prev, parsing: false, result } : prev));
    } catch {
      setImportState(null);
      toast(t("testPlan.import.error"));
    }
  }

  function applyImport() {
    if (!importState?.result || !form) return;
    setForm(fromInput(importState.result.input, t));
    setImportState(null);
    toast(t("testPlan.import.applied"));
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
          <>
            <AreaField
              label={t("testPlan.summary")}
              value={form.summary}
              onChange={(v) => set("summary", v)}
            />
            <AssistButton
              available={aiReady}
              instruction="the Summary (introduction) section of a software test plan"
              notes={form.summary}
              context={`Test plan title: ${form.title}`}
              {...aiProps("summary")}
            />
          </>
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
            allowCustom
            variant="pills"
            groups={[
              {
                title: t("testPlan.typeGroup.functional"),
                options: FUNCTIONAL_TYPES,
              },
              {
                title: t("testPlan.typeGroup.nonFunctional"),
                options: NON_FUNCTIONAL_TYPES,
              },
            ]}
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
                  variant="pills"
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
            variant="pills"
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
              allowCustom
              variant="pills"
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
            <ScheduleCalendar
              sprints={form.sprints}
              onAdd={(s) => set("sprints", [...form.sprints, s])}
            />
            <FieldLabel text={t("testPlan.sprints")} />
            {form.sprints.map((s, i) => {
              const issue = sprintIssues(form.sprints)[i];
              return (
                <div key={i}>
                  <div className="tp-sched-row">
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
                      data-invalid={issue === "error"}
                      value={s.start}
                      onChange={(e) => {
                        const next = [...form.sprints];
                        next[i] = { ...s, start: e.target.value };
                        set("sprints", next);
                      }}
                    />
                    <input
                      type="date"
                      data-invalid={issue === "error"}
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
                  {issue === "error" && (
                    <p className="tp-msg tp-msg--error">
                      {t("testPlan.sprintDateError")}
                    </p>
                  )}
                  {issue === "overlap" && (
                    <p className="tp-msg tp-msg--warn">
                      {t("testPlan.sprintOverlap")}
                    </p>
                  )}
                </div>
              );
            })}
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
        ),
      },
      // 21. Conclusion
      {
        id: "conclusion",
        body: (
          <>
            <AreaField
              label={t("testPlan.conclusion")}
              value={form.conclusion}
              onChange={(v) => set("conclusion", v)}
            />
            <AssistButton
              available={aiReady}
              instruction="the Conclusion section (summary and next steps) of a software test plan"
              notes={form.conclusion}
              context={`Test plan title: ${form.title}`}
              {...aiProps("conclusion")}
            />
          </>
        ),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, t, plan, user, aiReady]);

  if (!form) return <p className="tp__muted">{t("common.loading")}</p>;

  const current = steps[step];

  return (
    <section className="tp-wizard">
      <header className="tp-wizard__top">
        <button type="button" className="tp-editor__back" onClick={close}>
          ← {t("testPlan.back")}
        </button>
        <h1>{plan ? t("testPlan.editTitle") : t("testPlan.newTitle")}</h1>
        {plan && (
          <span className="tp-editor__rev">
            {t("testPlan.revShort")} {plan.revision}
          </span>
        )}
        {plan && (
          <button
            type="button"
            className="tp-wizard__revbtn"
            onClick={() => setShowRev((v) => !v)}
          >
            {t("testPlan.revisions")}
          </button>
        )}
        <button
          type="button"
          className="tp-wizard__revbtn"
          onClick={() => void exportXlsx()}
        >
          {t("testPlan.exportXlsx")}
        </button>
        <button
          type="button"
          className="tp-wizard__revbtn"
          onClick={() => void exportPdf()}
        >
          {t("testPlan.exportPdf")}
        </button>
        <button
          type="button"
          className="tp-wizard__revbtn"
          onClick={() => fileInputRef.current?.click()}
        >
          {t("testPlan.import.button")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          hidden
          onChange={(e) => void onImportFile(e)}
        />
        <button
          type="button"
          className="tp-editor__save"
          onClick={save}
          disabled={saving || !form.title}
        >
          {saving ? t("testPlan.saving") : t("testPlan.save")}
        </button>
      </header>

      {importState && (
        <ImportReportModal
          title={t("testPlan.import.title")}
          parsing={importState.parsing}
          done={importState.done}
          total={importState.total}
          rows={importState.rows}
          onApply={applyImport}
          onCancel={() => setImportState(null)}
        />
      )}

      {plan && showRev && (
        <div className="tp-revs-panel">
          <h3>{t("testPlan.revisions")}</h3>
          <RevisionHistory planId={plan.id} onRestore={restore} />
        </div>
      )}

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
    closureCriteria: [
      {
        criterion: t("testPlan.closureDefault.executed"),
        metric: t("testPlan.closureDefault.executedMetric"),
      },
      {
        criterion: t("testPlan.closureDefault.defects"),
        metric: t("testPlan.closureDefault.defectsMetric"),
      },
      {
        criterion: t("testPlan.closureDefault.coverage"),
        metric: t("testPlan.closureDefault.coverageMetric"),
      },
    ],
    purpose: "",
    conclusion: "",
    aiProvenance: {},
  };
}

/** Builds a form from an imported plan input, reusing the defaults for any field
 *  the import did not detect (so undetected fields keep sensible defaults). */
function fromInput(input: Omit<TestPlanInput, "userId">, t: (k: string) => string): FormState {
  const base = applyRevision(defaults(t), input.title, input.data);
  return {
    ...base,
    version: input.version ?? "1.0",
    planDate: input.planDate ?? "",
    status: input.status ?? "draft",
  };
}

/** Bumps the last dotted segment of a version (`1.0` → `1.1`, `1.9` → `1.10`). */
function nextVersion(v: string): string {
  const parts = v.split(".");
  const n = Number(parts[parts.length - 1]);
  if (!Number.isInteger(n)) return v;
  parts[parts.length - 1] = String(n + 1);
  return parts.join(".");
}

/** Overwrites the 21-field content of `base` with a revision's title + data,
 *  keeping version/date/status (not snapshotted). */
function applyRevision(base: FormState, title: string, d: TestPlanData): FormState {
  return {
    ...base,
    title,
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
    aiProvenance: d.aiProvenance ?? {},
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
    aiProvenance: d.aiProvenance ?? {},
  };
}
