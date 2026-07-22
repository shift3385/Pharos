import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { ListField } from "@shared/ui/fields";
import { testCaseApi } from "../api/testCaseApi";
import type { RevisionSummary, TestCase, TestCaseInput } from "../model/types";
import { SortableSteps } from "./SortableSteps";
import { fromGherkin, toGherkin } from "./gherkin";
import "./TestCase.css";

type Tab = "editor" | "gherkin" | "split";

interface FormState {
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
}

function emptyForm(): FormState {
  return {
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
  };
}

function fromCase(c: TestCase): FormState {
  const d = c.data ?? {};
  return {
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
  };
}

export function TestCaseEditor({
  caseId,
  onClose,
}: {
  caseId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [testCase, setTestCase] = useState<TestCase | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [gherkin, setGherkin] = useState("");
  const [tab, setTab] = useState<Tab>("editor");
  const [saving, setSaving] = useState(false);
  const [revisions, setRevisions] = useState<RevisionSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (caseId) {
        const c = await testCaseApi.get(caseId);
        if (c && !cancelled) {
          setTestCase(c);
          const f = fromCase(c);
          setForm(f);
          setGherkin(toGherkin(f.title, f));
        }
      } else {
        const f = emptyForm();
        f.title = t("testCase.defaultTitle");
        setForm(f);
        setGherkin(toGherkin(f.title, f));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId, t]);

  // Editor edits: update form and regenerate the Gherkin view.
  const update = (patch: Partial<FormState>) => {
    const next = { ...form, ...patch };
    setForm(next);
    setGherkin(toGherkin(next.title, next));
  };

  // Gherkin edits: parse back into the mapped fields without reformatting text.
  const onGherkinInput = (text: string) => {
    setGherkin(text);
    const parsed = fromGherkin(text);
    setForm((f) => ({
      ...f,
      title: parsed.title ?? f.title,
      preconditions: parsed.preconditions,
      steps: parsed.steps,
      expectedResult: parsed.expectedResult,
    }));
  };

  async function save() {
    setSaving(true);
    const author = testCase?.author ?? (user ? `${user.firstName} ${user.lastName}` : "");
    const clean = (a: string[]) => a.map((s) => s.trim()).filter(Boolean);
    const input: TestCaseInput = {
      scenarioId: form.scenarioId.trim() || undefined,
      title: form.title.trim(),
      version: form.version,
      status: form.status,
      priority: form.priority,
      author,
      data: {
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
      },
    };
    if (testCase) await testCaseApi.update(testCase.id, input);
    else await testCaseApi.create(input);
    setSaving(false);
    onClose();
  }

  function exportFeature() {
    const content = toGherkin(form.title, form);
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

  const editor = (
    <div className="tc-form">
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
          <select
            value={form.priority}
            onChange={(e) => update({ priority: e.target.value })}
          >
            {["low", "medium", "high", "critical"].map((p) => (
              <option key={p} value={p}>
                {t(`testCase.priorityLabel.${p}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="tp-field">
          <span>{t("testCase.status")}</span>
          <select
            value={form.status}
            onChange={(e) => update({ status: e.target.value })}
          >
            {["draft", "reviewed", "approved", "obsolete"].map((s) => (
              <option key={s} value={s}>
                {t(`testCase.statusLabel.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="tp-field">
          <span>{t("testCase.version")}</span>
          <input
            value={form.version}
            onChange={(e) => update({ version: e.target.value })}
          />
        </label>
      </div>

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

      <label className="tp-field">
        <span>{t("testCase.testData")}</span>
        <textarea
          rows={2}
          value={form.testData}
          onChange={(e) => update({ testData: e.target.value })}
        />
      </label>
      <label className="tp-field">
        <span>{t("testCase.notes")}</span>
        <textarea
          rows={2}
          value={form.notes}
          onChange={(e) => update({ notes: e.target.value })}
        />
      </label>
    </div>
  );

  const gherkinView = (
    <div className="tc-gherkin">
      <textarea
        className="tc-gherkin__area"
        spellCheck={false}
        value={gherkin}
        onChange={(e) => onGherkinInput(e.target.value)}
      />
    </div>
  );

  return (
    <section className={`tc-editor${tab === "split" ? " tc-editor--wide" : ""}`}>
      <header className="tc-editor__top">
        <button type="button" className="tp-editor__back" onClick={onClose}>
          ← {t("testCase.back")}
        </button>
        <h1>{testCase ? t("testCase.editTitle") : t("testCase.newTitle")}</h1>
        {form.scenarioId && (
          <span className="tc-editor__id">{form.scenarioId}</span>
        )}
        <div className="tc-editor__actions">
          {testCase && (
            <button type="button" className="tp-wizard__revbtn" onClick={toggleRevisions}>
              {t("testCase.revisions")}
            </button>
          )}
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
        {(["editor", "gherkin", "split"] as Tab[]).map((tabId) => (
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
          <div className="tc-split__pane tc-split__pane--gherkin">
            {gherkinView}
          </div>
        </div>
      )}
    </section>
  );
}
