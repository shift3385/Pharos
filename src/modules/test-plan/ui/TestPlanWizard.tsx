import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@modules/auth";
import { aiAvailable, markReviewed, withProvenance, type AiProvenance } from "@modules/ai";
import { ErrorSummary } from "@shared/ui/FormField";
import { useSaveGuard } from "@shared/ui/fieldProps";
import { useHeaderActions } from "@shared/ui/headerActions";
import { ImportReportModal } from "@shared/ui/ImportReportModal";
import { unlessReported } from "@shared/ui/notify";
import { useToast } from "@shared/ui/Toast";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { useUnsavedChangesGuard } from "@shared/ui/useUnsavedChangesGuard";
import { required } from "@shared/validation";
import { testPlanApi } from "../api/testPlanApi";
import type { DetectionRow, ImportResult } from "../import/planImport";
import type { TestPlan } from "../model/types";
import { PLAN_SAVED_EVENT } from "../model/events";
import {
  applyRevision,
  defaults,
  fromInput,
  fromPlan,
  planWarnings,
  toExportable,
  toInput,
  type AssistedField,
  type FormState,
  type ReviewableField,
} from "./wizard/formState";
import { STEP_IDS, stepCompletion } from "./wizard/steps";
import { StepBody } from "./wizard/StepBody";
import { StepCompact, StepRail, StepStrip } from "./wizard/StepNav";
import { PlanIoMenu, PlanStatusPanel, RevisionsButton, RevisionsDialog } from "./wizard/PlanSidePanels";
import type { StepProps } from "./wizard/stepProps";
import { useWideApp } from "./wizard/useWideApp";
import { parseStamp } from "@shared/time/stamp";
import "./TestPlan.css";
import "./TestPlanWizard.css";

interface Props {
  planId: string | null;
  projectId?: string | null;
  /** After each save, with the saved plan (null when none came back, so the
   *  page reloads it). A new plan gets its id here, so a later reload or a
   *  language change never mistakes it for a plan still to be created. */
  onSaved?: (plan: TestPlan | null) => void;
}

/**
 * The plan's 19-step wizard (spec §5.1, SPEC §8 «Plan», ScrPlan): step
 * navigation that follows the container's width, «Paso N de 19 · Guardado ·
 * hace N min» above the step, a one-line footer («Siguiente: …»), «Estado del
 * plan» and the latest revisions beside the form, and «Revisiones»,
 * «Importar / Exportar» and «Guardar» in the project header.
 */
export function TestPlanWizard({ planId, projectId, onSaved }: Props) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const toast = useToast();
  const view = useBreakpoint();
  const wide = useWideApp();
  const [plan, setPlan] = useState<TestPlan | null>(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showRev, setShowRev] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  // Snapshot of the form as loaded or saved, to detect unsaved changes (C1).
  const initialRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [importState, setImportState] = useState<{
    fileName: string;
    parsing: boolean;
    done: number;
    total: number;
    rows: DetectionRow[];
    result: ImportResult | null;
  } | null>(null);
  const [aiReady, setAiReady] = useState(false);
  // Moving between steps puts the focus on the new step's heading (2.4.3).
  // Declared before the save guard: when a blocked save jumps to step 1, the
  // guard's effect runs last and the error summary keeps the focus.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepMounted = useRef(false);
  useEffect(() => {
    if (stepMounted.current) headingRef.current?.focus();
    stepMounted.current = true;
  }, [step]);
  // The title is the only rule that blocks saving a plan (draft rule).
  const titleIssue = form ? required(form.title) : null;
  const { guard, showSummary, attempted, summaryRef } = useSaveGuard(titleIssue !== null);

  useEffect(() => {
    void aiAvailable().then(setAiReady);
  }, []);
  // «hace N min» stays current.
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // The language only changes labels: reading it through a ref keeps a
  // language switch from reloading (and resetting) the form.
  const tRef = useRef(t);
  tRef.current = t;
  // The plan the form holds, so a planId that names it is not fetched again.
  const loadedId = useRef<string | null>(null);

  function load(p: TestPlan) {
    loadedId.current = p.id;
    setPlan(p);
    const f = fromPlan(p, tRef.current);
    setForm(f);
    initialRef.current = JSON.stringify(f);
    setSavedAt(p.updatedAt);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (planId) {
        if (planId === loadedId.current) return;
        const p = await testPlanApi.get(planId, userId);
        if (p && !cancelled) load(p);
      } else if (!cancelled && loadedId.current === null) {
        const f = defaults(tRef.current);
        setForm(f);
        initialRef.current = JSON.stringify(f);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, userId]);

  const dirty = form !== null && JSON.stringify(form) !== initialRef.current;
  // Leaving with unsaved changes asks first (sidebar, pills, «Atrás», closing
  // the window). Saving keeps the wizard on screen, so there is never a
  // navigation of its own to let through (no `bypass`).
  const { dialog: leaveDialog } = useUnsavedChangesGuard(dirty, {
    message: t("testPlan.leaveMessage"),
  });
  const author = plan?.author ?? (user ? `${user.firstName} ${user.lastName}` : "");

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  // AI drafts are applied with their provenance; the field shows "AI · pending
  // review" until a person marks it reviewed (IA-01).
  const applyDraft = (field: AssistedField) => (text: string, provenance: AiProvenance) =>
    setForm((f) =>
      f ? { ...f, [field]: text, aiProvenance: withProvenance(f.aiProvenance, field, provenance) } : f,
    );
  const review = (field: ReviewableField) => () =>
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
    setForm(applyRevision(form, rev.title, rev.data, plan?.id ?? planId));
    setShowRev(false);
    setStep(0);
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    const input = toInput(form, { plan, projectId: projectId ?? null, author, userId });
    const warnings = planWarnings(form);
    try {
      const saved = plan ? await testPlanApi.update(plan.id, input) : await testPlanApi.create(input);
      toast(
        warnings > 0
          ? `${t("testPlan.savedToast")} ${t("validation.savedWithWarnings", { count: warnings })}`
          : t("testPlan.savedToast"),
      );
      window.dispatchEvent(new Event(PLAN_SAVED_EVENT));
      // Stay on this step with the saved plan (its new version and revision).
      if (saved) load(saved);
      onSaved?.(saved);
    } finally {
      setSaving(false);
    }
  }

  const trySave = () => {
    if (titleIssue) setStep(0);
    guard(() => void save());
  };

  async function exportXlsx() {
    if (!form) return;
    const { exportPlanXlsx } = await import("../export/planXlsx");
    const name = await unlessReported(
      exportPlanXlsx(toExportable(form, author, t), i18n.resolvedLanguage ?? "es"),
    );
    if (name) toast(t("testPlan.exportedToast", { name }));
  }

  async function exportPdf() {
    if (!form) return;
    const { exportPlanPdf } = await import("../export/planPdf");
    const name = await unlessReported(exportPlanPdf(toExportable(form, author, t), t));
    if (name) toast(t("testPlan.exportedToast", { name }));
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setImportState({ fileName: file.name, parsing: true, done: 0, total: 0, rows: [], result: null });
    try {
      const { parsePlanXlsx } = await import("../import/planImport");
      const buffer = await file.arrayBuffer();
      const result = await parsePlanXlsx(buffer, file.name, author, (p) =>
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

  useHeaderActions(
    form && (
      <>
        {plan && <RevisionsButton onClick={() => setShowRev(true)} />}
        <PlanIoMenu
          onImport={() => fileInputRef.current?.click()}
          onExportPdf={() => void exportPdf()}
          onExportXlsx={() => void exportXlsx()}
        />
        <button type="button" className="header-action" data-primary="" onClick={trySave} disabled={saving}>
          <Check size={16} aria-hidden="true" />
          <span className="header-action__label">{saving ? t("testPlan.saving") : t("testPlan.save")}</span>
        </button>
      </>
    ),
  );

  if (!form) return <p className="tp__muted">{t("common.loading")}</p>;

  const completion = stepCompletion(form);
  const id = STEP_IDS[step];
  const last = step === STEP_IDS.length - 1;
  const goTo = (i: number) => setStep(Math.min(Math.max(i, 0), STEP_IDS.length - 1));
  const nav = { current: step, completion, onGo: goTo };
  const stepProps: StepProps = {
    form,
    set,
    setForm,
    aiReady,
    aiProps,
    review,
    attempted,
    author,
    completion,
    goTo,
  };
  const lang = i18n.resolvedLanguage ?? "es";
  const when = (iso: string) => relativeTime(iso, lang, t("testPlan.saveState.now"));
  const saveState = dirty
    ? t("testPlan.saveState.unsaved")
    : savedAt
      ? t("testPlan.saveState.saved", { when: when(savedAt) })
      : t("testPlan.saveState.never");
  const updated = savedAt
    ? new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(parseStamp(savedAt))
    : null;

  return (
    <section className="tpw" data-testid="plan-wizard">
      <input ref={fileInputRef} type="file" accept=".xlsx" hidden onChange={(e) => void onImportFile(e)} />
      {view === "desktop" && wide && <StepRail {...nav} />}
      <div className="tpw__main">
        {view === "mobile" ? <StepCompact {...nav} /> : !(view === "desktop" && wide) && <StepStrip {...nav} />}
        <div className="tpw__cols">
          <div className="tpw__form">
            <div className="tpw__step-head">
              <p className="tpw__status">
                <span>{t("testPlan.nav.stepOf", { n: step + 1, total: STEP_IDS.length })}</span>
                <span aria-hidden="true">·</span>
                <span data-dirty={dirty || undefined}>{saveState}</span>
              </p>
              <h2 ref={headingRef} className="tpw__title" tabIndex={-1}>
                {t(`testPlan.step.${id}`)}
              </h2>
              <p className="tpw__desc">{t(`testPlan.stepDesc.${id}`)}</p>
            </div>
            {showSummary && titleIssue && (
              <ErrorSummary
                ref={summaryRef}
                items={[{ label: t("testPlan.fieldTitle"), issue: titleIssue, fieldId: "tp-title" }]}
              />
            )}
            <div className="tpw__fields tp-wizard__fields">
              <StepBody id={id} {...stepProps} />
            </div>
            <footer className="tpw__foot">
              {step > 0 ? (
                <button type="button" className="header-action" onClick={() => goTo(step - 1)}>
                  <ChevronLeft size={16} aria-hidden="true" />
                  <span className="header-action__label">{t("testPlan.prev")}</span>
                </button>
              ) : (
                <span />
              )}
              {last ? (
                <button type="button" className="header-action tpw__next" data-primary="" onClick={trySave} disabled={saving}>
                  <Check size={16} aria-hidden="true" />
                  <span className="header-action__label">{t("testPlan.nav.finish")}</span>
                </button>
              ) : (
                <button type="button" className="header-action tpw__next" onClick={() => goTo(step + 1)}>
                  <span className="header-action__label">
                    {t("testPlan.nav.nextStep", { title: t(`testPlan.step.${STEP_IDS[step + 1]}`) })}
                  </span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              )}
            </footer>
          </div>
          {/* Beside the form when both fit, below it otherwise (SPEC §8). */}
          <PlanStatusPanel
            plan={plan}
            status={form.status}
            version={form.version}
            author={author}
            updated={updated}
            onShowRevisions={() => setShowRev(true)}
          />
        </div>
      </div>

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
      {leaveDialog}
      {plan && showRev && (
        <RevisionsDialog planId={plan.id} onRestore={(r) => void restore(r)} onClose={() => setShowRev(false)} />
      )}
    </section>
  );
}

/** «ahora mismo», «hace 5 min», «hace 2 h», else the date. */
function relativeTime(iso: string, lang: string, now: string): string {
  const then = parseStamp(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return now;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto", style: "short" });
  if (minutes < 60) return rtf.format(-minutes, "minute");
  if (minutes < 24 * 60) return rtf.format(-Math.round(minutes / 60), "hour");
  return new Intl.DateTimeFormat(lang, { dateStyle: "medium" }).format(new Date(then));
}
