import { useEffect, useState } from "react";
import { ArrowLeft, Columns2, FileCode, MoreHorizontal, PencilLine, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { ListField } from "@shared/ui/fields";
import { ErrorSummary, FormField } from "@shared/ui/FormField";
import { useSaveGuard } from "@shared/ui/fieldProps";
import { duplicateRows, required } from "@shared/validation";
import { testCaseApi } from "../api/testCaseApi";
import type { ExportableCase } from "../export/caseXlsx";
import { customSheetLabels, customSheetRows } from "../export/customSheet";
import type { ImportedCase } from "../import/caseImport";
import type {
  ExampleTable,
  Flow,
  GherkinLevel,
  RequirementOption,
  RevisionSummary,
  Step,
  TestCase,
  TestCaseData,
  TestCaseInput,
} from "../model/types";
import { SortableSteps } from "./SortableSteps";
import { StepListField } from "./StepListField";
import {
  newStepId,
  reconcileFlows,
  reconcileSteps,
  reconcileTable,
  stepsOf,
  texts,
  withStableSteps,
} from "../model/steps";
import { ExamplesTable } from "./ExamplesTable";
import { FlowsEditor } from "./FlowsEditor";
import { GherkinEditor } from "./GherkinEditor";
import { LevelPicker } from "./LevelPicker";
import { RequirementLinks } from "./RequirementLinks";
import { useToast } from "@shared/ui/Toast";
import { saveFile } from "@shared/export/saveFile";
import { unlessReported } from "@shared/ui/notify";
import {
  AiSuggestList,
  AssistButton,
  ProvenanceBadge,
  aiAvailable,
  markReviewed,
  suggestPreconditions,
  withProvenance,
  type AiProvenance,
  type ProvenanceMap,
} from "@modules/ai";
import {
  detectLevel,
  flowsToGherkin,
  fromGherkin,
  levelRank,
  newFlow,
  parseFeatureFlows,
  placeholdersIn,
  splitFeatureTags,
  toGherkin,
  userScenarioTags,
  type TagContext,
} from "./gherkin";
import { MenuItem, ResponsiveMenu } from "@shared/ui/Menu";
import { usePopover } from "@shared/ui/usePopover";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { StatusPill } from "@shared/ui/StatusPill";
import { useHideMobileChrome } from "@shared/ui/useShellChrome";
import { useUnsavedChangesGuard } from "@shared/ui/useUnsavedChangesGuard";
import { CaseNavBar, CaseNavFooter, type CaseNav, type SaveState } from "./CaseNavBar";
import { GoToCaseDialog } from "./GoToCaseDialog";
import { AutomationField, PriorityField, StatusField } from "./CaseMetaMenus";
import {
  CASE_TYPES,
  CustomFieldsSection,
  customFieldApi,
  customFieldIssues,
  defaultValues,
  effectiveCaseType,
  fieldControlId,
  type AutomationStatus,
  type CaseType,
  type CustomField,
  type CustomValues,
} from "@modules/custom-fields";
import { SegmentedControl } from "@shared/ui/SegmentedControl";
import { GherkinReadView } from "./GherkinEditor";
import { stampLabel, statusTone } from "./caseTones";
import "@shared/ui/buttons.css";
import "./TestCase.css";
import "./CaseList.css";

export type { CaseNav } from "./CaseNavBar";

type Tab = "split" | "editor" | "gherkin";

interface FormState {
  /** As stored: null = never set, reads as standard (FLD-01). Sent back
   *  unchanged unless the user picks one. */
  caseType: CaseType | null;
  automationStatus: AutomationStatus | null;
  /** `data.custom`, every key kept (unknown and archived ones too). */
  custom: CustomValues;
  gherkinLevel: GherkinLevel;
  scenarioId: string;
  title: string;
  version: string;
  status: string;
  priority: string;
  mappedUseCase: string;
  caseDate: string;
  description: string;
  // Given/When steps and Outline rows keep stable ids (DAT-02).
  preconditions: Step[];
  steps: Step[];
  expectedResult: string;
  postconditions: string[];
  acceptanceCriteria: string[];
  testData: string;
  notes: string;
  requirementKeys: string[];
  featureTags: string[];
  scenarioTags: string[];
  traceability: string;
  dataRequirements: string;
  environmentRequirements: string;
  aiProvenance: ProvenanceMap;
  examples: ExampleTable;
  background: Step[];
  flows: Flow[];
  featureSource: string;
}

function emptyForm(): FormState {
  return {
    caseType: "standard",
    automationStatus: "manual",
    custom: {},
    gherkinLevel: "basic",
    scenarioId: "",
    title: "",
    version: "1.0",
    status: "draft",
    priority: "medium",
    mappedUseCase: "",
    caseDate: new Date().toISOString().slice(0, 10),
    description: "",
    preconditions: [],
    steps: [],
    expectedResult: "",
    postconditions: [],
    acceptanceCriteria: [],
    testData: "",
    notes: "",
    requirementKeys: [],
    featureTags: [],
    scenarioTags: [],
    traceability: "",
    dataRequirements: "",
    environmentRequirements: "",
    aiProvenance: {},
    examples: { headers: [], rows: [] },
    background: [],
    flows: [],
    featureSource: "",
  };
}

function fromCase(c: TestCase): FormState {
  const d = withStableSteps(c.data ?? {});
  return {
    caseType: c.caseType ?? null,
    automationStatus: c.automationStatus ?? null,
    custom: d.custom ?? {},
    gherkinLevel: d.gherkinLevel ?? "basic",
    scenarioId: c.scenarioId,
    title: c.title,
    version: c.version,
    status: c.status,
    priority: c.priority,
    mappedUseCase: d.mappedUseCase ?? "",
    caseDate: d.caseDate ?? "",
    description: d.description ?? "",
    preconditions: d.preconditions ?? [],
    steps: d.steps ?? [],
    expectedResult: d.expectedResult ?? "",
    postconditions: d.postconditions ?? [],
    acceptanceCriteria: d.acceptanceCriteria ?? [],
    testData: d.testData ?? "",
    notes: d.notes ?? "",
    requirementKeys: d.requirementKeys ?? [],
    featureTags: d.featureTags ?? [],
    scenarioTags: d.scenarioTags ?? [],
    traceability: d.traceability ?? "",
    dataRequirements: d.dataRequirements ?? "",
    environmentRequirements: d.environmentRequirements ?? "",
    aiProvenance: d.aiProvenance ?? {},
    examples: d.examples ?? { headers: [], rows: [] },
    background:
      d.background ??
      (d.featureSource
        ? stepsOf(parseFeatureFlows(d.featureSource).background)
        : []),
    flows:
      d.flows ??
      (d.featureSource
        ? reconcileFlows(undefined, parseFeatureFlows(d.featureSource).flows)
        : []),
    featureSource: d.featureSource ?? "",
  };
}

/** Non-destructively adds an Examples column for every <placeholder> used in the
 *  steps/expected result that has no column yet (proposal 3b). */
function withPlaceholderColumns(f: FormState): ExampleTable {
  const names = placeholdersIn([...texts(f.steps), f.expectedResult]);
  const headers = [...f.examples.headers];
  for (const name of names) if (!headers.includes(name)) headers.push(name);
  if (headers.length === f.examples.headers.length) return f.examples;
  const rows = f.examples.rows.map((r) => {
    const values = [...r.values];
    while (values.length < headers.length) values.push("");
    return { ...r, values };
  });
  return { headers, rows };
}

/** Projects the form onto the data shape the Gherkin mapper reads. */
function formToData(f: FormState): TestCaseData {
  return {
    gherkinLevel: f.gherkinLevel,
    requirementKeys: f.requirementKeys,
    featureTags: f.featureTags,
    scenarioTags: f.scenarioTags,
    preconditions: f.preconditions,
    steps: f.steps,
    expectedResult: f.expectedResult,
    examples: f.examples,
    background: f.background,
    flows: f.flows,
    featureSource: f.featureSource,
  };
}

/** Advanced cases generate their Gherkin from the flows; others from the flat
 *  fields. Both carry the case ID and requirement tags (TRZ-03). */
function buildGherkin(f: FormState): string {
  return f.gherkinLevel === "advanced"
    ? flowsToGherkin(f.title, f.background, f.flows, {
        scenarioId: f.scenarioId,
        requirementKeys: f.requirementKeys,
        featureTags: f.featureTags,
      })
    : toGherkin(f.title, formToData(f), f.scenarioId);
}

/** Number of warnings a case is saved with: repeated list items and
 *  Examples columns or rows. Shown in the save toast so they are not missed. */
function caseWarnings(f: FormState): number {
  const text = (v: string) => v;
  const lists = (l: string[][]) => l.reduce((n, list) => n + duplicateRows(list, text).size, 0);
  const examples = (ex: ExampleTable | undefined) =>
    ex
      ? duplicateRows(ex.headers, text).size +
        duplicateRows(ex.rows, (r) =>
          r.values.some((c) => c.trim())
            ? r.values.map((c) => c.trim()).join(" | ")
            : "",
        ).size
      : 0;
  return (
    lists([
      texts(f.preconditions),
      f.postconditions,
      f.acceptanceCriteria,
      texts(f.background),
    ]) +
    examples(f.examples) +
    f.flows.reduce(
      (n, fl) => n + lists([texts(fl.preconditions)]) + examples(fl.examples),
      0,
    )
  );
}

export function TestCaseEditor({
  projectId,
  caseIdPrefix = "ATS_",
  caseIdDigits = 3,
  caseId,
  seed = null,
  requirements = [],
  nav,
  onSaved,
  onClose,
}: {
  projectId: string;
  caseIdPrefix?: string;
  caseIdDigits?: number;
  caseId: string | null;
  /** Prefilled content from an .xlsx import (new case, skips the level picker). */
  seed?: ImportedCase | null;
  /** The project's requirements, for the requirement links picker. */
  requirements?: RequirementOption[];
  /** Position in the list the user came from (existing cases). */
  nav?: CaseNav;
  /** After a save; a new case gets its id here (the page then opens it). */
  onSaved?: (saved: TestCase | null) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const toast = useToast();
  const [testCase, setTestCase] = useState<TestCase | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [gherkin, setGherkin] = useState("");
  const [tab, setTab] = useState<Tab>("split");
  const [saving, setSaving] = useState(false);
  const [revisions, setRevisions] = useState<RevisionSummary[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // New cases start on the level picker; existing/imported cases skip it.
  const [picking, setPicking] = useState(caseId === null && !seed);
  const [aiReady, setAiReady] = useState(false);
  // The form as last loaded or saved: «Guardado» vs «Cambios sin guardar», and
  // leaving with changes asks first.
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [goingTo, setGoingTo] = useState(false);
  const [gherkinEditing, setGherkinEditing] = useState(false);
  const [fields, setFields] = useState<CustomField[]>([]);
  const mobile = useBreakpoint() === "mobile";
  // A checklist has no Gherkin: only the editor view (FLD-01).
  const caseType = effectiveCaseType(form.caseType);
  const checklist = caseType === "checklist";
  const view: Tab = checklist
    ? "editor"
    : mobile && tab === "split"
      ? "editor"
      : tab;
  useHideMobileChrome(mobile && gherkinEditing && view === "gherkin");
  // undefined while an existing case loads; null when it does not exist.
  const [found, setFound] = useState<boolean | undefined>(caseId ? undefined : true);
  // The title, and the project's custom fields (a value of the wrong type,
  // a required one without a value; ADR-0018 amendment), block saving a case
  // (draft rule, ADR-0027).
  const titleIssue = required(form.title);
  const customIssues = customFieldIssues(
    fields,
    caseType,
    form.custom,
    testCase?.data.custom ?? {},
  );
  const { guard, showSummary, attempted, summaryRef } = useSaveGuard(
    titleIssue !== null || customIssues.length > 0,
  );

  useEffect(() => {
    let cancelled = false;
    void customFieldApi
      .list(projectId, userId)
      .catch(() => [])
      .then((list) => {
        if (!cancelled) setFields(list);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, userId]);

  useEffect(() => {
    void aiAvailable().then(setAiReady);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (caseId) {
        const c = await testCaseApi.get(caseId, userId).catch(() => null);
        if (cancelled) return;
        setFound(Boolean(c));
        if (c) {
          setTestCase(c);
          const f = fromCase(c);
          setForm(f);
          setSnapshot(JSON.stringify(f));
          setGherkin(buildGherkin(f));
        }
      } else if (seed && !cancelled) {
        // Imported case: seed the form (scenario id auto-assigned on save).
        const f = fromCase({
          ...seed,
          scenarioId: "",
          id: "",
          workspaceId: "",
          createdAt: "",
          updatedAt: "",
          revision: 0,
        } as TestCase);
        setForm(f);
        // Nothing of it is saved yet: leaving asks first.
        setSnapshot(JSON.stringify(emptyForm()));
        setGherkin(buildGherkin(f));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId, seed, userId]);

  const level = form.gherkinLevel;
  // Lowest level the current content can live in — you cannot pick below it.
  const requiredLevel = detectLevel(gherkin);

  // Editor edits: update form and (for basic/outline) regenerate the Gherkin. In
  // outline level, editing steps auto-adds matching Examples columns from their
  // <placeholders> (proposal 3b), non-destructively.
  const update = (patch: Partial<FormState>) => {
    let next = { ...form, ...patch };
    if (
      next.gherkinLevel === "outline" &&
      ("steps" in patch || "expectedResult" in patch)
    ) {
      next = { ...next, examples: withPlaceholderColumns(next) };
    }
    setForm(next);
    setGherkin(buildGherkin(next));
  };

  // Gherkin edits: the level is derived from the code so the case is always in a
  // level that can represent it. Advanced parses into flows + background;
  // basic/outline parse back into the flat fields.
  // Tags: the case ID tag is ignored (the ID field owns it), feature tags that
  // are requirement keys become links, and every other tag is kept as typed.
  const tagContext = (f: FormState): TagContext => ({
    scenarioId: f.scenarioId,
    caseIdPrefix,
    knownRequirementKeys: requirements.map((r) => r.requirementKey),
    linkedRequirementKeys: f.requirementKeys,
  });
  const onGherkinInput = (text: string) => {
    setGherkin(text);
    const detected = detectLevel(text);
    if (detected === "advanced") {
      const parsed = parseFeatureFlows(text);
      setForm((f) => {
        const ctx = tagContext(f);
        return {
          ...f,
          ...splitFeatureTags(parsed.featureTags, ctx),
          gherkinLevel: "advanced",
          title: parsed.title ?? f.title,
          // Each step keeps its id per scenario, position and text (rule 9).
          background: reconcileSteps(f.background, parsed.background),
          flows: reconcileFlows(f.flows, parsed.flows).map((fl) => ({
            ...fl,
            tags: userScenarioTags(fl.tags ?? [], ctx),
          })),
          featureSource: text,
        };
      });
      return;
    }
    const parsed = fromGherkin(text);
    setForm((f) => ({
      ...f,
      ...splitFeatureTags(parsed.featureTags, tagContext(f)),
      scenarioTags: userScenarioTags(parsed.scenarioTags, tagContext(f)),
      gherkinLevel: detected,
      background: [],
      flows: [],
      featureSource: "",
      title: parsed.title ?? f.title,
      preconditions: reconcileSteps(f.preconditions, parsed.preconditions),
      steps: reconcileSteps(f.steps, parsed.steps),
      expectedResult: parsed.expectedResult,
      examples: parsed.examples
        ? reconcileTable(f.examples, parsed.examples)
        : f.examples,
    }));
  };

  // A person marks AI content as reviewed (IA-01).
  const review = (field: string) =>
    setForm((f) => ({ ...f, aiProvenance: markReviewed(f.aiProvenance, field, user?.id ?? "") }));

  const pickLevel = (chosen: GherkinLevel) => {
    const f = {
      ...emptyForm(),
      gherkinLevel: chosen,
      title: t("testCase.defaultTitle"),
      custom: defaultValues(fields, "standard"),
    };
    if (chosen === "advanced") f.flows = [newFlow(t("testCase.flow.mainName"))];
    setForm(f);
    setSnapshot(JSON.stringify(f));
    setGherkin(buildGherkin(f));
    setPicking(false);
  };

  // Switch level on an existing draft. Downgrading below what the content needs
  // is blocked (proposal 2). Switching to advanced seeds a main flow.
  const changeLevel = (chosen: GherkinLevel) => {
    if (levelRank(chosen) < levelRank(requiredLevel)) return;
    setForm((f) => {
      const next = { ...f, gherkinLevel: chosen };
      if (chosen === "advanced" && next.flows.length === 0) {
        // Copies with ids of their own: the flat fields keep theirs, and an id
        // is unique within the case (DAT-02).
        const copy = (list: Step[]) =>
          list.map((s) => ({ ...s, id: newStepId() }));
        next.background = copy(f.preconditions);
        next.flows = [
          {
            ...newFlow(t("testCase.flow.mainName")),
            steps: copy(f.steps),
            expectedResult: f.expectedResult,
            examples: {
              ...f.examples,
              rows: f.examples.rows.map((r) => ({ ...r, id: newStepId() })),
            },
          },
        ];
      }
      setGherkin(buildGherkin(next));
      return next;
    });
  };

  async function save() {
    setSaving(true);
    const author = testCase?.author ?? (user ? `${user.firstName} ${user.lastName}` : "");
    const clean = (a: string[]) => a.map((s) => s.trim()).filter(Boolean);
    // A step keeps its id when its text is trimmed; empty ones are dropped.
    const cleanSteps = (a: Step[]) =>
      a.map((s) => ({ ...s, text: s.text.trim() })).filter((s) => s.text);
    const cleanExamples = (ex: ExampleTable): ExampleTable => ({
      headers: ex.headers.map((h) => h.trim()),
      rows: ex.rows.filter((r) => r.values.some((c) => c.trim())),
    });
    const data: TestCaseData = {
      gherkinLevel: form.gherkinLevel,
      mappedUseCase: form.mappedUseCase,
      caseDate: form.caseDate || undefined,
      description: form.description,
      preconditions: cleanSteps(form.preconditions),
      steps: cleanSteps(form.steps),
      expectedResult: form.expectedResult,
      postconditions: clean(form.postconditions),
      acceptanceCriteria: clean(form.acceptanceCriteria),
      testData: form.testData,
      notes: form.notes,
      requirementKeys: form.requirementKeys,
      featureTags: form.featureTags,
      scenarioTags: form.scenarioTags,
      traceability: form.traceability,
      dataRequirements: form.dataRequirements,
      environmentRequirements: form.environmentRequirements,
      aiProvenance: form.aiProvenance,
    };
    if (form.gherkinLevel === "outline") data.examples = cleanExamples(form.examples);
    if (form.gherkinLevel === "advanced") {
      data.background = cleanSteps(form.background);
      data.flows = form.flows;
      data.featureSource = buildGherkin(form);
    }
    // Always sent, so `{}` clears them; unknown keys travel back untouched.
    data.custom = form.custom;
    const input: TestCaseInput = {
      projectId,
      caseIdPrefix,
      caseIdDigits,
      scenarioId: form.scenarioId.trim() || undefined,
      title: form.title.trim(),
      version: form.version,
      status: form.status,
      priority: form.priority,
      // Never set and not touched: omitted, so the stored null stays.
      caseType: form.caseType ?? undefined,
      automationStatus: form.automationStatus ?? undefined,
      author,
      data,
      userId,
    };
    const warnings = caseWarnings(form);
    try {
      const saved = testCase
        ? await testCaseApi.update(testCase.id, input)
        : await testCaseApi.create(input);
      toast(
        warnings > 0
          ? `${t("testCase.savedToast")} ${t("validation.savedWithWarnings", { count: warnings })}`
          : t("testCase.savedToast"),
      );
      if (saved) {
        setTestCase(saved);
        const f = fromCase(saved);
        setForm(f);
        setSnapshot(JSON.stringify(f));
        setGherkin(buildGherkin(f));
      } else {
        setSnapshot(JSON.stringify(form));
      }
      // Opening a new case by its id right after saving is not «leaving».
      unsaved.bypass(() => onSaved?.(saved));
    } finally {
      setSaving(false);
    }
  }

  /** Maps the current form to the export shape, shared by .xlsx and .pdf. */
  function buildExportableCase(): ExportableCase {
    const author =
      testCase?.author ?? (user ? `${user.firstName} ${user.lastName}` : "");
    return {
      scenarioId: form.scenarioId,
      title: form.title,
      version: form.version,
      priority: t(`testCase.priorityLabel.${form.priority}`),
      status: t(`testCase.statusLabel.${form.status}`),
      author,
      level,
      gherkin,
      background: form.background,
      flows: form.flows,
      altFlowLabel: t("testCase.flow.altUpper"),
      examplesLabel: t("testCase.examples.title"),
      data: {
        mappedUseCase: form.mappedUseCase,
        caseDate: form.caseDate,
        description: form.description,
        preconditions: form.preconditions,
        steps: form.steps,
        expectedResult: form.expectedResult,
        postconditions: form.postconditions,
        acceptanceCriteria: form.acceptanceCriteria,
        testData: form.testData,
        notes: form.notes,
        examples: form.examples,
        requirementKeys: form.requirementKeys,
        traceability: form.traceability,
      },
      customRows: customSheetRows(form, fields, t),
      customSheet: customSheetLabels(t),
    };
  }

  async function exportXlsx() {
    const { exportCaseXlsx } = await import("../export/caseXlsx");
    const name = await unlessReported(
      exportCaseXlsx(buildExportableCase(), i18n.resolvedLanguage ?? "es"),
    );
    if (name) showExportDone(name);
  }

  async function exportPdf() {
    const { exportCasePdf } = await import("../export/casePdf");
    const name = await unlessReported(exportCasePdf(buildExportableCase(), t));
    if (name) showExportDone(name);
  }

  async function exportFeature() {
    const name = await unlessReported(
      saveFile(
        `${form.scenarioId || "scenario"}.feature`,
        buildGherkin(form),
        "text/plain;charset=utf-8",
      ),
    );
    if (name) showExportDone(name);
  }

  function showExportDone(name: string) {
    setNotice(t("testCase.exportDone", { name }));
    window.setTimeout(() => setNotice(null), 5000);
  }

  async function toggleRevisions() {
    if (revisions !== null) {
      setRevisions(null);
      return;
    }
    setRevisions(testCase ? await testCaseApi.revisions(testCase.id, userId) : []);
  }

  // Ctrl P / ⌘P: «Ir a un caso…» (SPEC §8), unless a dialog is open.
  useEffect(() => {
    if (!nav) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "p" || e.altKey || e.shiftKey) return;
      if (e.defaultPrevented || document.querySelector("[aria-modal='true']")) return;
      e.preventDefault();
      setGoingTo(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);

  const dirty = snapshot !== null && JSON.stringify(form) !== snapshot;
  const saveState: SaveState = !testCase ? "new" : dirty ? "dirty" : "saved";
  // Every way out that changes the address (the bar's buttons, links, the
  // sidebar and pills, the system «Atrás») and closing the window ask first
  // while there are unsaved changes (RED-V3k).
  const unsaved = useUnsavedChangesGuard(dirty, t("testCase.nav.discardMessage"));
  const goTo = (id: string) => nav?.onGo(id);

  if (found === false) {
    return (
      <section className="tc-editor tc-missing" aria-labelledby="tc-missing-title">
        <h2 id="tc-missing-title">{t("testCase.nav.notFoundTitle")}</h2>
        <p>{t("testCase.nav.notFound")}</p>
        <button type="button" className="ui-btn" onClick={onClose}>
          <ArrowLeft size={16} aria-hidden="true" />
          {t("testCase.nav.allCases")}
        </button>
      </section>
    );
  }
  if (found === undefined) return <p className="tp__muted">{t("common.loading")}</p>;

  if (picking) {
    return <LevelPicker onPick={pickLevel} onCancel={onClose} />;
  }

  const fileName = `${form.scenarioId || "scenario"}.feature`;
  const levelSelect = (
    <label className="tc-meta">
      <span className="tc-meta__label">{t("testCase.level.label")}</span>
      <select
        className="tc-meta__select"
        value={level}
        onChange={(e) => changeLevel(e.target.value as GherkinLevel)}
        title={
          requiredLevel !== "basic"
            ? t("testCase.level.locked", {
                level: t(`testCase.level.${requiredLevel}.name`),
              })
            : undefined
        }
      >
        {(["basic", "outline", "advanced"] as GherkinLevel[]).map((l) => (
          <option key={l} value={l} disabled={levelRank(l) < levelRank(requiredLevel)}>
            {t(`testCase.level.${l}.name`)}
          </option>
        ))}
      </select>
    </label>
  );

  const caseTypeControl = (
    <div className="tc-meta">
      <span className="tc-meta__label" aria-hidden="true">
        {t("testCase.caseType")}
      </span>
      <SegmentedControl<CaseType>
        label={t("testCase.caseType")}
        size="sm"
        value={caseType}
        onChange={(v) => update({ caseType: v })}
        options={CASE_TYPES.map((c) => ({
          value: c,
          label: t(`testCase.caseTypeLabel.${c}`),
        }))}
        testId="tc-case-type"
      />
    </div>
  );

  const metaGrid = (
    <div className="tc-meta-row">
      <PriorityField value={form.priority} onChange={(v) => update({ priority: v })} />
      <StatusField value={form.status} onChange={(v) => update({ status: v })} />
      {caseTypeControl}
      <AutomationField
        value={form.automationStatus}
        onChange={(v) => update({ automationStatus: v as AutomationStatus })}
      />
      {!checklist && levelSelect}
      <label className="tc-meta tc-meta--narrow">
        <span className="tc-meta__label">{t("testCase.version")}</span>
        <input
          className="tc-meta__input"
          value={form.version}
          onChange={(e) => update({ version: e.target.value })}
        />
      </label>
      <label className="tc-meta">
        <span className="tc-meta__label">{t("testCase.scenarioId")}</span>
        <input
          className="tc-meta__input tc-meta__input--mono"
          value={form.scenarioId}
          placeholder={t("testCase.scenarioIdAuto")}
          readOnly={testCase != null}
          title={testCase ? t("testCase.scenarioIdFixed") : undefined}
          onChange={(e) => update({ scenarioId: e.target.value })}
        />
      </label>
    </div>
  );

  const identityFields = (
    <>
      <FormField id="tc-title" label={t("testCase.fieldTitle")} issue={attempted ? titleIssue : null} required>
        {(p) => <input {...p} value={form.title} onChange={(e) => update({ title: e.target.value })} />}
      </FormField>
      <RequirementLinks
        value={form.requirementKeys}
        options={requirements}
        onChange={(v) => update({ requirementKeys: v })}
      />
      <label className="tp-field">
        <span>{t("testCase.mappedUseCase")}</span>
        <input
          value={form.mappedUseCase}
          onChange={(e) => update({ mappedUseCase: e.target.value })}
        />
      </label>
      <label className="tp-field">
        <span>{t("testCase.otherReferences")}</span>
        <input
          value={form.traceability}
          onChange={(e) => update({ traceability: e.target.value })}
        />
      </label>
      <label className="tp-field">
        <span>{t("testCase.description")}</span>
        <textarea
          rows={2}
          value={form.description}
          onChange={(e) => update({ description: e.target.value })}
        />
      </label>
      <AssistButton
        available={aiReady}
        instruction="the Description of a software test case (what it verifies)"
        notes={form.description}
        context={`Test case title: ${form.title}`}
        provenance={form.aiProvenance.description}
        onUse={(v: string, p: AiProvenance) =>
          update({ description: v, aiProvenance: withProvenance(form.aiProvenance, "description", p) })
        }
        onReview={() => review("description")}
      />
    </>
  );

  // Test data only makes sense at the basic level: the other levels express it
  // with the Examples table.
  const docFields = (
    <>
      {level === "basic" && (
        <label className="tp-field">
          <span>{t("testCase.testData")}</span>
          <textarea
            rows={2}
            value={form.testData}
            onChange={(e) => update({ testData: e.target.value })}
          />
        </label>
      )}
      <label className="tp-field">
        <span>{t("testCase.notes")}</span>
        <textarea
          rows={2}
          value={form.notes}
          onChange={(e) => update({ notes: e.target.value })}
        />
      </label>
    </>
  );

  // Outline: placeholders in steps and any columns that no longer match one.
  const placeholders =
    level === "outline"
      ? placeholdersIn([...texts(form.steps), form.expectedResult])
      : [];
  const orphanColumns =
    level === "outline"
      ? form.examples.headers.filter(
          (h) => h.trim() && !placeholders.includes(h.trim()),
        )
      : [];

  const customSection = (
    <CustomFieldsSection
      fields={fields}
      caseType={caseType}
      values={form.custom}
      previous={testCase?.data.custom}
      attempted={attempted}
      onChange={(custom) => update({ custom })}
    />
  );

  // What a checklist hides is still stored (switching back shows it).
  const hiddenByChecklist =
    level !== "basic" ||
    form.preconditions.length > 0 ||
    form.expectedResult.trim() !== "" ||
    form.postconditions.length > 0 ||
    form.acceptanceCriteria.length > 0;

  const editor = (
    <div className="tc-form">
      {metaGrid}
      {identityFields}
      {customSection}

      {checklist ? (
        <>
          <p className="tp-field__grouplabel">
            {t("testCase.checklist.items")}
          </p>
          <p className="tp-field__hint">{t("testCase.checklist.hint")}</p>
          <SortableSteps
            label={t("testCase.checklist.items")}
            steps={form.steps}
            onChange={(v) => update({ steps: v })}
          />
          {hiddenByChecklist && (
            <p className="tp-field__hint" role="note">
              {t("testCase.checklist.kept")}
            </p>
          )}
          <label className="tp-field">
            <span>{t("testCase.notes")}</span>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => update({ notes: e.target.value })}
            />
          </label>
        </>
      ) : level === "advanced" ? (
        <>
          <FlowsEditor
            background={form.background}
            flows={form.flows}
            onBackgroundChange={(v) => update({ background: v })}
            onFlowsChange={(v) => update({ flows: v })}
          />
          {docFields}
        </>
      ) : (
        <>
          <p className="tp-field__grouplabel">{t("testCase.preconditions")}</p>
          <StepListField
            label={t("testCase.preconditions")}
            items={form.preconditions}
            onChange={(v) => update({ preconditions: v })}
          />
          <AiSuggestList
            available={aiReady}
            buttonLabel={t("testCase.suggestPreconditions")}
            run={() =>
              suggestPreconditions(
                [
                  `Test case title: ${form.title}`,
                  form.description.trim() &&
                    `Description: ${form.description.trim()}`,
                  texts(form.steps).filter((s) => s.trim()).length &&
                    `Steps:\n${texts(form.steps)
                      .filter((s) => s.trim())
                      .map((s, i) => `${i + 1}. ${s}`)
                      .join("\n")}`,
                ]
                  .filter(Boolean)
                  .join("\n"),
                texts(form.preconditions).filter((p) => p.trim()),
                i18n.resolvedLanguage ?? "es",
              )
            }
            renderItem={(p) => p}
            provenance={form.aiProvenance.preconditions}
            onAdd={(items, p) =>
              update({
                // Replace the empty starter row instead of keeping it.
                preconditions: [
                  ...form.preconditions.filter((x) => x.text.trim()),
                  ...stepsOf(items),
                ],
                aiProvenance: withProvenance(
                  form.aiProvenance,
                  "preconditions",
                  p,
                ),
              })
            }
            onReview={() => review("preconditions")}
          />

          <p className="tp-field__grouplabel">{t("testCase.steps")}</p>
          <SortableSteps
            label={t("testCase.steps")}
            steps={form.steps}
            onChange={(v) => update({ steps: v })}
          />

          <label className="tp-field">
            <span>{t("testCase.expectedResult")}</span>
            <textarea
              rows={2}
              value={form.expectedResult}
              onChange={(e) => update({ expectedResult: e.target.value })}
            />
          </label>

          {level === "outline" && (
            <>
              <p className="tp-field__grouplabel">{t("testCase.examples.title")}</p>
              <p className="tp-field__hint">{t("testCase.examples.hint")}</p>
              {placeholders.length > 0 && (
                <p className="tp-field__hint">
                  {t("testCase.examples.placeholders")}:{" "}
                  {placeholders.map((p) => `<${p}>`).join(", ")}
                </p>
              )}
              {orphanColumns.length > 0 && (
                <p className="tc-warn">
                  {t("testCase.examples.orphanColumns", {
                    cols: orphanColumns.join(", "),
                  })}
                </p>
              )}
              <ExamplesTable
                value={form.examples}
                onChange={(v) => update({ examples: v })}
              />
            </>
          )}

          <p className="tp-field__grouplabel">{t("testCase.postconditions")}</p>
          <ListField
            label={t("testCase.postconditions")}
            items={form.postconditions}
            onChange={(v) => update({ postconditions: v })}
          />
          <p className="tp-field__grouplabel">{t("testCase.acceptanceCriteria")}</p>
          <ListField
            label={t("testCase.acceptanceCriteria")}
            items={form.acceptanceCriteria}
            onChange={(v) => update({ acceptanceCriteria: v })}
          />
          {docFields}
        </>
      )}
    </div>
  );

  const synced = t("testCase.gherkin.synced");
  const gherkinView = mobile ? (
    <GherkinReadView
      value={gherkin}
      fileName={fileName}
      status={synced}
      onEdit={() => setGherkinEditing(true)}
    />
  ) : (
    <GherkinEditor value={gherkin} onChange={onGherkinInput} fileName={fileName} status={synced} />
  );

  const views = mobile
    ? [
        { value: "editor" as Tab, label: t("testCase.tab.editor"), icon: PencilLine },
        { value: "gherkin" as Tab, label: t("testCase.tab.gherkin"), icon: FileCode },
      ]
    : [
        { value: "editor" as Tab, label: t("testCase.tab.editor") },
        { value: "gherkin" as Tab, label: t("testCase.tab.gherkin") },
        { value: "split" as Tab, label: t("testCase.tab.split"), icon: Columns2 },
      ];
  const viewSwitch = (
    <SegmentedControl
      label={t("testCase.views")}
      options={views}
      value={view}
      onChange={(v) => {
        setTab(v);
        setGherkinEditing(false);
      }}
      size={mobile ? "md" : "sm"}
    />
  );

  const saveButton = (
    <button
      type="button"
      className="ui-btn ui-btn--primary"
      onClick={() => guard(() => void save())}
      disabled={saving}
    >
      <Save size={16} aria-hidden="true" />
      <span className="ui-btn__text">{saving ? t("testCase.saving") : t("testCase.save")}</span>
    </button>
  );

  const dialogs = (
    <>
      {goingTo && nav && (
        <GoToCaseDialog
          cases={nav.cases}
          currentId={testCase?.id}
          onGo={goTo}
          onClose={() => setGoingTo(false)}
        />
      )}
      {unsaved.dialog}
    </>
  );

  // Mobile Gherkin editing (SPEC §7/§8): the code fills the screen, the
  // keyword bar sits over the keyboard and the bottom bar hides.
  if (mobile && gherkinEditing && view === "gherkin") {
    return (
      <section className="tc-editor tc-editor--gherkin-edit" aria-labelledby="tc-edit-title">
        <div className="tc-mobile-edit__top">
          <span className="cl-id">{form.scenarioId}</span>
          <h2 id="tc-edit-title" className="tc-mobile-edit__title" title={form.title}>
            {form.title}
          </h2>
          <button type="button" className="ui-btn ui-btn--primary ui-btn--small" onClick={() => setGherkinEditing(false)}>
            {t("testCase.gherkin.done")}
          </button>
        </div>
        {viewSwitch}
        <GherkinEditor
          value={gherkin}
          onChange={onGherkinInput}
          fileName={`${fileName} · ${t("testCase.gherkin.editing")}`}
          keyboardBar
        />
        {dialogs}
      </section>
    );
  }

  return (
    <section className="tc-editor" data-view={view} aria-labelledby="tc-head-title">
      <CaseNavBar
        nav={nav}
        saveState={saveState}
        onBack={onClose}
        onGo={goTo}
        onGoTo={() => setGoingTo(true)}
        more={
          <MoreActions
            hasCase={testCase != null}
            onRevisions={() => void toggleRevisions()}
            onXlsx={() => void exportXlsx()}
            onPdf={() => void exportPdf()}
            onFeature={checklist ? undefined : () => void exportFeature()}
          />
        }
        save={saveButton}
      />

      <header className="tc-head">
        <div className="tc-head__ids">
          {form.scenarioId && <span className="cl-id">{form.scenarioId}</span>}
          <StatusPill tone={statusTone(form.status)} strike={form.status === "obsolete"}>
            {t(`testCase.statusLabel.${form.status}`)}
          </StatusPill>
          <span className="tc-head__level">
            {checklist
              ? t("testCase.caseTypeLabel.checklist")
              : t(`testCase.level.${level}.name`)}
          </span>
        </div>
        <h2 id="tc-head-title" className="tc-head__title">
          {form.title.trim() || (testCase ? t("testCase.editTitle") : t("testCase.newTitle"))}
        </h2>
        {!checklist && viewSwitch}
      </header>

      {showSummary && (
        <ErrorSummary
          ref={summaryRef}
          items={[
            ...(titleIssue
              ? [
                  {
                    label: t("testCase.fieldTitle"),
                    issue: titleIssue,
                    fieldId: "tc-title",
                  },
                ]
              : []),
            ...customIssues.map(({ field, issue }) => ({
              label: field.label,
              issue,
              fieldId: fieldControlId(field.fieldKey),
            })),
          ]}
        />
      )}

      {notice && (
        <p className="tc-notice" role="status">
          <span aria-hidden="true">✓ </span>
          {notice}
        </p>
      )}

      {form.aiProvenance.case && (
        <div className="tc-ai-case">
          <span>{t("testCase.aiPendingCase")}</span>
          <ProvenanceBadge provenance={form.aiProvenance.case} onReview={() => review("case")} />
        </div>
      )}

      {revisions !== null && (
        <div className="tp-revs-panel">
          <h3>{t("testCase.revisions")}</h3>
          {revisions.length === 0 ? (
            <p className="tp__muted">{t("testCase.noRevisions")}</p>
          ) : (
            <ul className="tp-revs">
              {revisions.map((r) => (
                <li key={r.id} className="tp-revs__item">
                  <span className="tp-revs__rev">
                    {t("testCase.revShort")} {r.revision}
                  </span>
                  <span className="tp-revs__title">{r.title}</span>
                  <span className="tp-revs__date">{stampLabel(r.createdAt, i18n.resolvedLanguage ?? "es")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {view === "editor" && <div className="tc-body">{editor}</div>}
      {view === "gherkin" && <div className="tc-body">{gherkinView}</div>}
      {view === "split" && (
        <div className="tc-split">
          <div className="tc-split__pane tc-body">{editor}</div>
          <div className="tc-split__pane tc-split__pane--gherkin">{gherkinView}</div>
        </div>
      )}

      {mobile && nav && <CaseNavFooter nav={nav} onGo={goTo} />}
      {dialogs}
    </section>
  );
}

/** Revisions and the per-case exports, out of the way in one menu. */
function MoreActions({
  hasCase,
  onRevisions,
  onXlsx,
  onPdf,
  onFeature,
}: {
  hasCase: boolean;
  onRevisions: () => void;
  onXlsx: () => void;
  onPdf: () => void;
  /** None for a checklist: it has no Gherkin (FLD-01). */
  onFeature?: () => void;
}) {
  const { t } = useTranslation();
  const mobile = useBreakpoint() === "mobile";
  const menu = usePopover(mobile ? "dialog" : "menu");
  const label = t("testCase.nav.more");
  return (
    <>
      <button type="button" className="ui-iconbtn" title={label} aria-label={label} {...menu.triggerProps}>
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      <ResponsiveMenu
        open={menu.open}
        onClose={menu.close}
        anchorRef={menu.anchorRef}
        id={menu.id}
        label={label}
        title={label}
        placement="bottom-end"
      >
        {hasCase && <MenuItem onSelect={onRevisions}>{t("testCase.revisions")}</MenuItem>}
        <MenuItem onSelect={onXlsx}>{t("testCase.exportXlsx")}</MenuItem>
        <MenuItem onSelect={onPdf}>{t("testCase.exportPdf")}</MenuItem>
        {onFeature && (
          <MenuItem onSelect={onFeature}>
            {t("testCase.exportFeature")}
          </MenuItem>
        )}
      </ResponsiveMenu>
    </>
  );
}
