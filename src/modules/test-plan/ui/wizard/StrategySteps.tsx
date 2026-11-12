// The steps a plan gained with ISO/IEC/IEEE 29119-3 and CTFL v4 §5.1.1
// (PLN-06): «Supuestos y restricciones», «Técnicas de prueba», independence
// and training (inside «Roles…»), «Estimación y presupuesto» and «Entrada,
// suspensión y reanudación». Metrics and the exit criteria have their own
// files (`MetricsStep`, `ClosureStep`).
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Eye, FlaskConical, Lightbulb, Users, type LucideIcon } from "lucide-react";
import { ListField, PairListField } from "@shared/ui/fields";
import { FormField } from "@shared/ui/FormField";
import { Select } from "@shared/ui/Select";
import { toKey } from "@shared/import/xlsx";
import { AiSuggestList, suggestPlanLists, withProvenance, type PlanListGroup } from "@modules/ai";
import { ESTIMATION_TECHNIQUES, INDEPENDENCE_LEVELS, TECHNIQUE_GROUPS, TECHNIQUE_KEYS } from "../../model/catalogs";
import { TECHNIQUE_REV } from "../../model/catalogLabels";
import { threePoint } from "../../export/planStrategy";
import type { Estimation, EstimationTechnique } from "../../model/types";
import { CheckColumns } from "./CheckColumns";
import { planBrief, type FormState, type PlanListField } from "./formState";
import { AreaField, FieldLabel, TextField, type StepProps } from "./stepProps";

/** The lists of each AI group, in the order the step shows them. */
const GROUP_LISTS: Record<PlanListGroup, PlanListField[]> = {
  assumptions: ["assumptions", "constraints"],
  entry: ["entryCriteria", "suspensionCriteria", "resumptionCriteria"],
};
/** The provenance key of each group (one mark for the step's lists). */
const GROUP_FIELD = { assumptions: "assumptionsConstraints", entry: "entrySuspension" } as const;

/** «Sugerir con IA» for the lists of one step: each proposal names its list. */
function SuggestLists({ group, buttonLabel, ...props }: StepProps & { group: PlanListGroup; buttonLabel: string }) {
  const { t, i18n } = useTranslation();
  const { form, setForm, aiReady, review } = props;
  const lists = GROUP_LISTS[group];
  const field = GROUP_FIELD[group];
  return (
    <AiSuggestList
      available={aiReady}
      buttonLabel={buttonLabel}
      run={() =>
        suggestPlanLists(
          group,
          planBrief(form),
          lists.flatMap((l) => form[l]).filter((s) => s.trim()),
          i18n.resolvedLanguage ?? "es",
        )
      }
      renderItem={(item) => (
        <>
          {item.text}
          <span className="assist__pick-sub">{t(`testPlan.listName.${item.list}`)}</span>
        </>
      )}
      provenance={form.aiProvenance[field]}
      onAdd={(items, provenance) =>
        setForm((f) => {
          if (!f) return f;
          const next: FormState = { ...f, aiProvenance: withProvenance(f.aiProvenance, field, provenance) };
          for (const l of lists) {
            const added = items.filter((i) => i.list === l).map((i) => i.text);
            if (added.length) next[l] = [...f[l].filter((s) => s.trim()), ...added];
          }
          return next;
        })
      }
      onReview={review(field)}
    />
  );
}

/** Two or three text lists side by side, each with its label. */
function Lists({ fields, form, set }: { fields: PlanListField[] } & Pick<StepProps, "form" | "set">) {
  const { t } = useTranslation();
  return (
    <div className="tpw-lists">
      {fields.map((f) => (
        <div key={f} className="tpw-lists__col" data-testid={`plan-${f}`}>
          <FieldLabel text={t(`testPlan.${f}`)} />
          <ListField label={t(`testPlan.${f}`)} items={form[f]} onChange={(v) => set(f, v)} />
        </div>
      ))}
    </div>
  );
}

export function AssumptionsStep(props: StepProps) {
  const { t } = useTranslation();
  return (
    <>
      <Lists fields={["assumptions", "constraints"]} form={props.form} set={props.set} />
      <SuggestLists {...props} group="assumptions" buttonLabel={t("testPlan.suggestAssumptions")} />
    </>
  );
}

export function EntryStep(props: StepProps) {
  const { t } = useTranslation();
  return (
    <>
      <Lists fields={["entryCriteria"]} form={props.form} set={props.set} />
      <Lists fields={["suspensionCriteria", "resumptionCriteria"]} form={props.form} set={props.set} />
      <SuggestLists {...props} group="entry" buttonLabel={t("testPlan.suggestEntry")} />
    </>
  );
}

const TECHNIQUE_ICON: Record<string, LucideIcon> = {
  blackBox: FlaskConical,
  whiteBox: Eye,
  experience: Lightbulb,
  collaborative: Users,
};

/** «Técnicas de prueba»: the CTFL v4 techniques by group, plus the team's own. */
export function TechniquesStep({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const { t } = useTranslation();
  const own = value.filter((v) => !TECHNIQUE_KEYS.includes(v));
  const toggle = (key: string) => onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key]);
  const add = (text: string) => {
    // A catalog label (es or en) ticks that technique instead of adding a copy.
    const v = toKey(text, TECHNIQUE_REV);
    if (v && !value.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...value, v]);
  };
  return (
    <CheckColumns
      className="tpw-tech"
      testId="plan-techniques"
      columns={TECHNIQUE_GROUPS.map((g) => ({
        id: g.id,
        title: t(`testPlan.techniqueGroup.${g.id}`),
        icon: TECHNIQUE_ICON[g.id] ?? FlaskConical,
        options: g.keys.map((k) => ({ key: k, label: t(`testPlan.techniqueLabel.${k}`) })),
      }))}
      isChecked={(k) => value.includes(k)}
      onToggle={toggle}
      own={{
        title: t("testPlan.techniqueGroup.own"),
        items: own,
        onRemove: (v) => onChange(value.filter((x) => x !== v)),
        onAdd: add,
        fieldLabel: t("testPlan.techniqueList.other"),
        placeholder: t("testPlan.techniqueList.otherPlaceholder"),
        addLabel: t("testPlan.techniqueList.add"),
        testId: "plan-techniques-own",
      }}
    />
  );
}

/** Independence of testing (a scale, least to most) and the team's training
 *  needs, under the roles table. */
export function StaffingFields({ form, set }: Pick<StepProps, "form" | "set">) {
  const { t } = useTranslation();
  const name = useId();
  return (
    <>
      <fieldset className="tpw-scale" data-testid="plan-independence">
        <legend className="tp-field__grouplabel">{t("testPlan.independence")}</legend>
        <div className="tpw-scale__options">
          {INDEPENDENCE_LEVELS.map((level) => (
            <label key={level} className="tpw-scale__option">
              <input
                type="radio"
                name={name}
                value={level}
                checked={form.independence === level}
                onChange={() => set("independence", level)}
              />
              <span>{t(`testPlan.independenceLevel.${level}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <TextField
        label={t("testPlan.independenceNote")}
        value={form.independenceNote}
        onChange={(v) => set("independenceNote", v)}
      />
      <FieldLabel text={t("testPlan.training")} />
      <PairListField
        label={t("testPlan.training")}
        items={form.training}
        keys={["need", "when"]}
        labels={[t("testPlan.trainingNeedCol"), t("testPlan.trainingWhenCol")]}
        wideFirst
        onChange={(v) => set("training", v)}
      />
    </>
  );
}

/** A number field that keeps "" as «not written» (undefined). */
function NumberField({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  testId?: string;
}) {
  return (
    <label className="tp-field">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        step="0.5"
        inputMode="decimal"
        data-testid={testId}
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value.replace(",", ".");
          const n = raw === "" ? undefined : Number(raw);
          onChange(n === undefined || Number.isNaN(n) ? undefined : n);
        }}
      />
    </label>
  );
}

/** «Estimación y presupuesto» (CTFL v4 §5.1.4). */
export function EstimationStep({ form, set }: Pick<StepProps, "form" | "set">) {
  const { t, i18n } = useTranslation();
  const e = form.estimation;
  const put = (patch: Partial<Estimation>) => set("estimation", { ...e, ...patch });
  const lang = i18n.resolvedLanguage ?? "es";
  const fmt = (n: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(n);
  const result = e.technique === "threePoint" ? threePoint(e) : null;
  return (
    <>
      <FormField id="tp-estimation-technique" label={t("testPlan.estimationTechnique")} className="tp-field">
        {(p) => (
          <Select<EstimationTechnique | "">
            {...p}
            value={e.technique ?? ""}
            placeholder="—"
            onChange={(v) => put({ technique: v || undefined })}
            data-testid="plan-estimation-technique"
            options={ESTIMATION_TECHNIQUES.map((k) => ({
              value: k,
              label: t(`testPlan.estimationTechniqueLabel.${k}`),
            }))}
          />
        )}
      </FormField>
      {e.technique === "threePoint" ? (
        <>
          <div className="tpw-grid tpw-grid--3">
            <NumberField label={t("testPlan.optimistic")} value={e.optimistic} onChange={(v) => put({ optimistic: v })} testId="plan-est-o" />
            <NumberField label={t("testPlan.likely")} value={e.likely} onChange={(v) => put({ likely: v })} testId="plan-est-m" />
            <NumberField label={t("testPlan.pessimistic")} value={e.pessimistic} onChange={(v) => put({ pessimistic: v })} testId="plan-est-p" />
          </div>
          <p className="tpw-calc" role="status" data-testid="plan-est-result">
            {result
              ? t("testPlan.threePointResult", {
                  o: e.optimistic,
                  m: e.likely,
                  p: e.pessimistic,
                  e: fmt(result.e),
                  sd: fmt(result.sd),
                })
              : t("testPlan.threePointIncomplete")}
          </p>
        </>
      ) : (
        e.technique && (
          <NumberField label={t("testPlan.effort")} value={e.effort} onChange={(v) => put({ effort: v })} testId="plan-est-effort" />
        )
      )}
      <TextField label={t("testPlan.budget")} value={e.budget ?? ""} onChange={(v) => put({ budget: v })} />
      <AreaField label={t("testPlan.estimationNotes")} value={e.notes ?? ""} onChange={(v) => put({ notes: v })} />
    </>
  );
}
