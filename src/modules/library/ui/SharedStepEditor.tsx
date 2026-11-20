import { useId } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useAuth } from "@modules/auth";
import { InfoTip } from "@shared/ui/InfoTip";
import { LoadError } from "@shared/ui/LoadError";
import { FormSkeleton } from "@shared/ui/Skeleton";
import type { TFunction } from "i18next";
import { paramRows } from "../model/sharedStep";
import { validName } from "../model/table";
import {
  LIMITS,
  newId,
  paramsOfItem,
  stepsOfItem,
  type LibraryItem,
  type LibraryStep,
  type SharedParam,
} from "../model/types";
import { ItemEditorFrame } from "./ItemEditorFrame";
import { ParamChip } from "./StepText";
import { useItemEditor } from "./useItemEditor";

interface StepForm {
  name: string;
  description: string;
  steps: LibraryStep[];
  /** Declared parameters (with their default); detected ones are added. */
  params: SharedParam[];
}

const emptyForm = (): StepForm => ({
  name: "",
  description: "",
  steps: [{ id: newId(), text: "" }],
  params: [],
});

const fromItem = (item: LibraryItem): StepForm => ({
  name: item.name,
  description: item.description,
  steps: stepsOfItem(item.body),
  params: paramsOfItem(item.definition),
});

const liveSteps = (steps: LibraryStep[]) =>
  steps
    .map((s) => ({
      ...s,
      text: s.text.trim(),
      expected: s.expected?.trim() || undefined,
    }))
    .filter((s) => s.text);

const definitionOf = (form: StepForm) =>
  paramRows(form).map((p) => ({
    ...(p.id ? { id: p.id } : {}),
    name: p.name,
    ...(p.default ? { default: p.default } : {}),
  }));

const bodyOf = (form: StepForm) =>
  liveSteps(form.steps).map((s) => ({
    id: s.id,
    text: s.text,
    ...(s.expected ? { expected: s.expected } : {}),
  }));

const contentKey = (form: StepForm) =>
  JSON.stringify([
    form.name.trim(),
    definitionOf(form).map((p) => [p.name, p.default ?? ""]),
    bodyOf(form).map((s) => [s.id, s.text, s.expected ?? ""]),
  ]);

/** Problems that stop saving, as sentences. */
function issuesOf(form: StepForm, t: TFunction): string[] {
  const out: string[] = [];
  if (!form.name.trim()) out.push(t("library.error.empty_name"));
  const steps = liveSteps(form.steps);
  if (steps.length === 0) out.push(t("library.error.no_steps"));
  if (steps.length > LIMITS.steps) out.push(t("library.error.too_many_steps"));
  const params = paramRows(form);
  if (params.length > LIMITS.params)
    out.push(t("library.error.too_many_params"));
  for (const p of params)
    if (!validName(p.name))
      out.push(t("library.step.badParam", { name: p.name }));
  if (
    steps.some(
      (s) =>
        s.text.length > LIMITS.stepText ||
        (s.expected?.length ?? 0) > LIMITS.stepText,
    )
  )
    out.push(t("library.error.too_long_step"));
  return out;
}

/** Editing a shared step (boceto 2): name, description, ordered steps with an
 *  optional expected result, and the parameters found in them (`<name>`),
 *  each with an optional value proposed when it is inserted. */
export function SharedStepEditor({
  projectId,
  itemId,
  when,
  onSaved,
  onClose,
}: {
  projectId: string;
  itemId: string | null;
  when: (s: string) => string;
  onSaved: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const baseId = useId();
  const ed = useItemEditor<StepForm>({
    projectId,
    itemId,
    kind: "shared_step",
    userId,
    empty: emptyForm,
    fromItem,
    toBody: (f) => ({ definition: definitionOf(f), body: bodyOf(f) }),
    contentKey,
    onSaved,
    onClose,
  });
  if (ed.loading) return <FormSkeleton />;
  if (ed.failed)
    return (
      <LoadError message={t("library.loadItemFailed")} onRetry={ed.retry} />
    );

  const form = ed.content;
  const set = (patch: Partial<StepForm>) =>
    ed.setContent({ ...form, ...patch });
  const setStep = (i: number, patch: Partial<LibraryStep>) =>
    set({
      steps: form.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    });
  const move = (i: number, by: number) => {
    const next = [...form.steps];
    const [s] = next.splice(i, 1);
    next.splice(i + by, 0, s);
    set({ steps: next });
  };
  const setDefault = (name: string, value: string) => {
    const has = form.params.some((p) => p.name === name);
    set({
      params: has
        ? form.params.map((p) =>
            p.name === name ? { ...p, default: value || undefined } : p,
          )
        : [...form.params, { name, default: value || undefined }],
    });
  };
  const params = paramRows(form);
  const issues = issuesOf(form, t);

  return (
    <>
      <ItemEditorFrame
        item={ed.item}
        title={form.name.trim() || ed.item?.name || t("library.step.newTitle")}
        contentLabel={t("library.editor.steps")}
        userId={userId}
        saving={ed.saving}
        canSave={issues.length === 0}
        onBack={() => void ed.back()}
        onSave={() => void ed.save()}
        onToggleStatus={() => void ed.toggleStatus()}
        onDelete={() => void ed.remove()}
        when={when}
      >
        <div className="lb-split">
          <div className="lb-form">
            <label className="lb-field">
              <span>{t("library.field.name")}</span>
              <input
                value={form.name}
                maxLength={LIMITS.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </label>
            <label className="lb-field">
              <span>{t("library.field.description")}</span>
              <textarea
                rows={2}
                value={form.description}
                maxLength={LIMITS.description}
                onChange={(e) => set({ description: e.target.value })}
              />
            </label>
            <div
              role="group"
              aria-labelledby={`${baseId}-steps`}
              className="lb-steps-edit"
            >
              <div className="lb-heading">
                <h3 id={`${baseId}-steps`} className="lb-subtitle">
                  {t("library.editor.steps")}
                </h3>
                <InfoTip
                  id={`${baseId}-steps-help`}
                  label={t("library.editor.steps")}
                >
                  {t("library.step.paramHint")}
                </InfoTip>
              </div>
              <ol className="lb-steps-edit__list">
                {form.steps.map((s, i) => {
                  const n = t("library.step.n", { n: i + 1 });
                  return (
                    <li key={s.id} className="lb-step-edit">
                      <span className="lb-step-edit__n" aria-hidden="true">
                        {i + 1}
                      </span>
                      <div className="lb-step-edit__fields">
                        <input
                          aria-label={n}
                          value={s.text}
                          placeholder={t("library.step.textPlaceholder")}
                          onChange={(e) => setStep(i, { text: e.target.value })}
                        />
                        <input
                          aria-label={`${t("library.step.expected")} · ${n}`}
                          value={s.expected ?? ""}
                          placeholder={t("library.step.expected")}
                          className="lb-step-edit__expected"
                          onChange={(e) =>
                            setStep(i, { expected: e.target.value })
                          }
                        />
                      </div>
                      <div className="lb-step-edit__tools">
                        <button
                          type="button"
                          className="ui-iconbtn"
                          aria-label={`${t("library.step.up")}: ${n}`}
                          title={t("library.step.up")}
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                        >
                          <ArrowUp size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="ui-iconbtn"
                          aria-label={`${t("library.step.down")}: ${n}`}
                          title={t("library.step.down")}
                          disabled={i === form.steps.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          <ArrowDown size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="ui-iconbtn"
                          aria-label={`${t("common.remove")}: ${n}`}
                          title={t("common.remove")}
                          onClick={() =>
                            set({ steps: form.steps.filter((_, j) => j !== i) })
                          }
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <div className="lb-row">
                <button
                  type="button"
                  className="ui-btn ui-btn--small"
                  disabled={form.steps.length >= LIMITS.steps}
                  onClick={() =>
                    set({
                      steps: [
                        ...form.steps,
                        {
                          id: newId(new Set(form.steps.map((s) => s.id))),
                          text: "",
                        },
                      ],
                    })
                  }
                >
                  + {t("library.step.add")}
                </button>
              </div>
            </div>
          </div>
          <aside className="lb-side" aria-labelledby={`${baseId}-params`}>
            <div className="lb-heading">
              <h3 id={`${baseId}-params`} className="lb-subtitle">
                {t("library.params.title")}
              </h3>
              <InfoTip
                id={`${baseId}-params-help`}
                label={t("library.params.title")}
              >
                {t("library.params.help")}
              </InfoTip>
            </div>
            {params.length === 0 ? (
              <p className="lb-muted">{t("library.params.none")}</p>
            ) : (
              <table className="lb-params">
                <thead>
                  <tr>
                    <th scope="col">{t("library.params.name")}</th>
                    <th scope="col">{t("library.params.default")}</th>
                  </tr>
                </thead>
                <tbody>
                  {params.map((p) => (
                    <tr key={p.name}>
                      <th scope="row">
                        <ParamChip name={p.name} />
                        {p.unused && (
                          <span className="lb-warn-text">
                            {" "}
                            {t("library.params.unused")}{" "}
                            <button
                              type="button"
                              className="ui-btn ui-btn--small ui-btn--ghost"
                              onClick={() =>
                                set({
                                  params: form.params.filter(
                                    (x) => x.name !== p.name,
                                  ),
                                })
                              }
                            >
                              {t("common.remove")}
                              <span className="sr-only"> {`<${p.name}>`}</span>
                            </button>
                          </span>
                        )}
                      </th>
                      <td>
                        <input
                          aria-label={t("library.params.defaultOf", {
                            name: p.name,
                          })}
                          value={p.default ?? ""}
                          placeholder={t("library.params.empty")}
                          onChange={(e) => setDefault(p.name, e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </aside>
        </div>
        {issues.length > 0 && ed.dirty && (
          <ul className="lb-issues" aria-label={t("library.editor.issues")}>
            {issues.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </ItemEditorFrame>
      {ed.dialogs}
    </>
  );
}
