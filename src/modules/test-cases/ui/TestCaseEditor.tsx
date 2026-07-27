import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { ListField } from "@shared/ui/fields";
import { testCaseApi } from "../api/testCaseApi";
import type {
  ExampleTable,
  Flow,
  GherkinLevel,
  RevisionSummary,
  TestCase,
  TestCaseData,
  TestCaseInput,
} from "../model/types";
import { SortableSteps } from "./SortableSteps";
import { ExamplesTable } from "./ExamplesTable";
import { FlowsEditor } from "./FlowsEditor";
import { GherkinEditor } from "./GherkinEditor";
import { LevelPicker } from "./LevelPicker";
import {
  detectLevel,
  flowsToGherkin,
  fromGherkin,
  levelRank,
  newFlow,
  parseFeatureFlows,
  placeholdersIn,
  toGherkin,
} from "./gherkin";
import "./TestCase.css";

type Tab = "split" | "editor" | "gherkin";
const TABS: Tab[] = ["split", "editor", "gherkin"];

interface FormState {
  gherkinLevel: GherkinLevel;
  scenarioId: string;
  title: string;
  version: string;
  status: string;
  priority: string;
  mappedUseCase: string;
  caseDate: string;
  description: string;
  preconditions: string[];
  steps: string[];
  expectedResult: string;
  postconditions: string[];
  acceptanceCriteria: string[];
  testData: string;
  notes: string;
  traceability: string;
  dataRequirements: string;
  environmentRequirements: string;
  examples: ExampleTable;
  background: string[];
  flows: Flow[];
  featureSource: string;
}

function emptyForm(): FormState {
  return {
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
    traceability: "",
    dataRequirements: "",
    environmentRequirements: "",
    examples: { headers: [], rows: [] },
    background: [],
    flows: [],
    featureSource: "",
  };
}

function fromCase(c: TestCase): FormState {
  const d = c.data ?? {};
  return {
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
    traceability: d.traceability ?? "",
    dataRequirements: d.dataRequirements ?? "",
    environmentRequirements: d.environmentRequirements ?? "",
    examples: d.examples ?? { headers: [], rows: [] },
    background:
      d.background ??
      (d.featureSource ? parseFeatureFlows(d.featureSource).background : []),
    flows:
      d.flows ??
      (d.featureSource ? parseFeatureFlows(d.featureSource).flows : []),
    featureSource: d.featureSource ?? "",
  };
}

/** Non-destructively adds an Examples column for every <placeholder> used in the
 *  steps/expected result that has no column yet (proposal 3b). */
function withPlaceholderColumns(f: FormState): ExampleTable {
  const names = placeholdersIn([...f.steps, f.expectedResult]);
  const headers = [...f.examples.headers];
  for (const name of names) if (!headers.includes(name)) headers.push(name);
  if (headers.length === f.examples.headers.length) return f.examples;
  const rows = f.examples.rows.map((r) => {
    const next = [...r];
    while (next.length < headers.length) next.push("");
    return next;
  });
  return { headers, rows };
}

/** Projects the form onto the data shape the Gherkin mapper reads. */
function formToData(f: FormState): TestCaseData {
  return {
    gherkinLevel: f.gherkinLevel,
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
 *  fields. */
function buildGherkin(f: FormState): string {
  return f.gherkinLevel === "advanced"
    ? flowsToGherkin(f.title, f.background, f.flows)
    : toGherkin(f.title, formToData(f));
}

export function TestCaseEditor({
  projectId,
  caseIdPrefix = "ATS_",
  caseIdDigits = 3,
  caseId,
  onClose,
}: {
  projectId: string;
  caseIdPrefix?: string;
  caseIdDigits?: number;
  caseId: string | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [testCase, setTestCase] = useState<TestCase | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [gherkin, setGherkin] = useState("");
  const [tab, setTab] = useState<Tab>("split");
  const [saving, setSaving] = useState(false);
  const [revisions, setRevisions] = useState<RevisionSummary[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // New cases start on the level picker; existing cases skip it.
  const [picking, setPicking] = useState(caseId === null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (caseId) {
        const c = await testCaseApi.get(caseId);
        if (c && !cancelled) {
          setTestCase(c);
          const f = fromCase(c);
          setForm(f);
          setGherkin(buildGherkin(f));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId]);

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
  const onGherkinInput = (text: string) => {
    setGherkin(text);
    const detected = detectLevel(text);
    if (detected === "advanced") {
      const parsed = parseFeatureFlows(text);
      setForm((f) => ({
        ...f,
        gherkinLevel: "advanced",
        title: parsed.title ?? f.title,
        background: parsed.background,
        flows: parsed.flows,
        featureSource: text,
      }));
      return;
    }
    const parsed = fromGherkin(text);
    setForm((f) => ({
      ...f,
      gherkinLevel: detected,
      background: [],
      flows: [],
      featureSource: "",
      title: parsed.title ?? f.title,
      preconditions: parsed.preconditions,
      steps: parsed.steps,
      expectedResult: parsed.expectedResult,
      examples: parsed.examples ?? f.examples,
    }));
  };

  const pickLevel = (chosen: GherkinLevel) => {
    const f = { ...emptyForm(), gherkinLevel: chosen, title: t("testCase.defaultTitle") };
    if (chosen === "advanced") f.flows = [newFlow(t("testCase.flow.mainName"))];
    setForm(f);
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
        next.background = f.preconditions;
        next.flows = [
          {
            ...newFlow(t("testCase.flow.mainName")),
            steps: f.steps,
            expectedResult: f.expectedResult,
            examples: f.examples,
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
    const cleanExamples = (ex: ExampleTable): ExampleTable => ({
      headers: ex.headers.map((h) => h.trim()),
      rows: ex.rows.filter((r) => r.some((c) => c.trim())),
    });
    const data: TestCaseData = {
      gherkinLevel: form.gherkinLevel,
      mappedUseCase: form.mappedUseCase,
      caseDate: form.caseDate || undefined,
      description: form.description,
      preconditions: clean(form.preconditions),
      steps: clean(form.steps),
      expectedResult: form.expectedResult,
      postconditions: clean(form.postconditions),
      acceptanceCriteria: clean(form.acceptanceCriteria),
      testData: form.testData,
      notes: form.notes,
      traceability: form.traceability,
      dataRequirements: form.dataRequirements,
      environmentRequirements: form.environmentRequirements,
    };
    if (form.gherkinLevel === "outline") data.examples = cleanExamples(form.examples);
    if (form.gherkinLevel === "advanced") {
      data.background = clean(form.background);
      data.flows = form.flows;
      data.featureSource = buildGherkin(form);
    }
    const input: TestCaseInput = {
      projectId,
      caseIdPrefix,
      caseIdDigits,
      scenarioId: form.scenarioId.trim() || undefined,
      title: form.title.trim(),
      version: form.version,
      status: form.status,
      priority: form.priority,
      author,
      data,
    };
    if (testCase) await testCaseApi.update(testCase.id, input);
    else await testCaseApi.create(input);
    setSaving(false);
    onClose();
  }

  async function exportXlsx() {
    const { exportCaseXlsx } = await import("../export/caseXlsx");
    const author =
      testCase?.author ?? (user ? `${user.firstName} ${user.lastName}` : "");
    const name = await exportCaseXlsx(
      {
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
          traceability: form.traceability,
        },
      },
      i18n.resolvedLanguage ?? "es",
    );
    setNotice(t("testCase.exportDone", { name }));
    window.setTimeout(() => setNotice(null), 5000);
  }

  function exportFeature() {
    const content = toGherkin(form.title, formToData(form));
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form.scenarioId || "scenario"}.feature`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function toggleRevisions() {
    if (revisions !== null) {
      setRevisions(null);
      return;
    }
    setRevisions(testCase ? await testCaseApi.revisions(testCase.id) : []);
  }

  if (picking) {
    return <LevelPicker onPick={pickLevel} onCancel={onClose} />;
  }

  const metaGrid = (
    <div className="tc-form__grid">
      <label className="tp-field">
        <span>{t("testCase.scenarioId")}</span>
        <input
          value={form.scenarioId}
          placeholder={t("testCase.scenarioIdAuto")}
          onChange={(e) => update({ scenarioId: e.target.value })}
        />
      </label>
      <label className="tp-field">
        <span>{t("testCase.priority")}</span>
        <select value={form.priority} onChange={(e) => update({ priority: e.target.value })}>
          {["low", "medium", "high", "critical"].map((p) => (
            <option key={p} value={p}>
              {t(`testCase.priorityLabel.${p}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="tp-field">
        <span>{t("testCase.status")}</span>
        <select value={form.status} onChange={(e) => update({ status: e.target.value })}>
          {["draft", "reviewed", "approved", "obsolete"].map((s) => (
            <option key={s} value={s}>
              {t(`testCase.statusLabel.${s}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="tp-field">
        <span>{t("testCase.version")}</span>
        <input value={form.version} onChange={(e) => update({ version: e.target.value })} />
      </label>
    </div>
  );

  const identityFields = (
    <>
      <label className="tp-field">
        <span>{t("testCase.fieldTitle")}</span>
        <input value={form.title} onChange={(e) => update({ title: e.target.value })} />
      </label>
      <label className="tp-field">
        <span>{t("testCase.mappedUseCase")}</span>
        <input
          value={form.mappedUseCase}
          onChange={(e) => update({ mappedUseCase: e.target.value })}
        />
      </label>
      <label className="tp-field">
        <span>{t("testCase.traceability")}</span>
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
    level === "outline" ? placeholdersIn([...form.steps, form.expectedResult]) : [];
  const orphanColumns =
    level === "outline"
      ? form.examples.headers.filter(
          (h) => h.trim() && !placeholders.includes(h.trim()),
        )
      : [];

  const editor = (
    <div className="tc-form">
      {metaGrid}
      {identityFields}

      {level === "advanced" ? (
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
          <ListField
            items={form.preconditions}
            onChange={(v) => update({ preconditions: v })}
          />

          <p className="tp-field__grouplabel">{t("testCase.steps")}</p>
          <SortableSteps steps={form.steps} onChange={(v) => update({ steps: v })} />

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
            items={form.postconditions}
            onChange={(v) => update({ postconditions: v })}
          />
          <p className="tp-field__grouplabel">{t("testCase.acceptanceCriteria")}</p>
          <ListField
            items={form.acceptanceCriteria}
            onChange={(v) => update({ acceptanceCriteria: v })}
          />
          {docFields}
        </>
      )}
    </div>
  );

  const gherkinView = <GherkinEditor value={gherkin} onChange={onGherkinInput} />;

  return (
    <section className={`tc-editor${tab === "split" ? " tc-editor--wide" : ""}`}>
      <header className="tc-editor__top">
        <button type="button" className="tp-editor__back" onClick={onClose}>
          ← {t("testCase.back")}
        </button>
        <h1>{testCase ? t("testCase.editTitle") : t("testCase.newTitle")}</h1>
        {form.scenarioId && <span className="tc-editor__id">{form.scenarioId}</span>}
        <div className="tc-editor__actions">
          <label className="tc-editor__level">
            <span>{t("testCase.level.label")}</span>
            <select
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
                <option
                  key={l}
                  value={l}
                  disabled={levelRank(l) < levelRank(requiredLevel)}
                >
                  {t(`testCase.level.${l}.name`)}
                </option>
              ))}
            </select>
          </label>
          {testCase && (
            <button type="button" className="tp-wizard__revbtn" onClick={toggleRevisions}>
              {t("testCase.revisions")}
            </button>
          )}
          <button type="button" className="tp-wizard__revbtn" onClick={() => void exportXlsx()}>
            {t("testCase.exportXlsx")}
          </button>
          <button type="button" className="tp-wizard__revbtn" onClick={exportFeature}>
            {t("testCase.exportFeature")}
          </button>
          <button
            type="button"
            className="tp-editor__save"
            onClick={save}
            disabled={saving || !form.title}
          >
            {saving ? t("testCase.saving") : t("testCase.save")}
          </button>
        </div>
      </header>

      {notice && <p className="tc-notice">✓ {notice}</p>}

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
                  <span className="tp-revs__date">{r.createdAt}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <nav className="tc-tabs" role="tablist">
        {TABS.map((tabId) => (
          <button
            key={tabId}
            type="button"
            role="tab"
            className="tc-tabs__tab"
            data-active={tab === tabId}
            onClick={() => setTab(tabId)}
          >
            {t(`testCase.tab.${tabId}`)}
          </button>
        ))}
      </nav>

      {tab === "editor" && editor}
      {tab === "gherkin" && gherkinView}
      {tab === "split" && (
        <div className="tc-split">
          <div className="tc-split__pane">{editor}</div>
          <div className="tc-split__divider" aria-hidden="true" />
          <div className="tc-split__pane tc-split__pane--gherkin">{gherkinView}</div>
        </div>
      )}
    </section>
  );
}
