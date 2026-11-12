import { projectRiskBands } from "@shared/risk/bands";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, FilePlus } from "lucide-react";
import { logClientError } from "@shared/diagnostics";
import { isTauri } from "@shared/platform";
import { Dialog } from "@shared/ui/Dialog";
import { ErrorSummary, FormField } from "@shared/ui/FormField";
import { useSaveGuard } from "@shared/ui/fieldProps";
import { ReportedError } from "@shared/ui/notify";
import { ProjectSelect } from "@shared/ui/ProjectPicker";
import { StatusPill } from "@shared/ui/StatusPill";
import { useToast } from "@shared/ui/Toast";
import { useConfirm } from "@shared/ui/useConfirm";
import { required } from "@shared/validation";
import { projectApi } from "../api/projectApi";
import {
  COPY_PARTS,
  copyAfterCreate,
  copyFailed,
  copyParts,
  loadSourceFacts,
  newProjectInput,
  partOffered,
  type CopyOutcome,
  type CopyPart,
  type SourceFacts,
} from "../model/copySettings";
import { prefixIssue, suggestPrefix } from "../model/prefix";
import type { ProjectRow } from "../model/projectTable";
import type { Project } from "../model/types";
import { sampleKey } from "../model/numbering";
import { ProjectGeneralFields } from "./ProjectGeneralFields";
import "@shared/ui/ConfirmDialog.css";
import "./Projects.css";
import "./NewProjectWizard.css";

type Start = "blank" | "existing";
type Step = "start" | "copy" | "general";

/** The digits of a project created from scratch (as the desktop and the server). */
const DEFAULT_DIGITS = 3;

/**
 * «Nuevo proyecto» (UX-29): a wizard in a dialog, full screen on mobile.
 *
 * 1. «Cómo empezar»: a blank project or one from another of the user's.
 * 2. «Qué copiar» (from another one only): the source and a checkbox per
 *    setting with its real value there (UX-25); never the name, the prefix
 *    or any data.
 * 3. «Datos generales»: the fields of Ajustes › General, with a free prefix
 *    suggested from the name (NC-030) and the copied digits marked.
 *
 * Cancel and Escape create nothing; with something typed or chosen they ask
 * first (NC-017). A copy that fails keeps the project and says what is missing.
 */
export function NewProjectWizard({
  projects,
  ownerId,
  onClose,
  onCreated,
}: {
  /** The user's projects: the sources to copy from and the prefixes in use. */
  projects: ProjectRow[];
  ownerId: string;
  onClose: () => void;
  onCreated: (project: Project | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const id = useId();
  const desktop = isTauri();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const sources = useMemo(
    () =>
      [...projects].sort((a, b) =>
        a.name.localeCompare(b.name, i18n.resolvedLanguage ?? "es"),
      ),
    [projects, i18n.resolvedLanguage],
  );
  const [step, setStep] = useState<Step>("start");
  const [start, setStart] = useState<Start>("blank");
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [parts, setParts] = useState<ReadonlySet<CopyPart>>(
    () => new Set(copyParts(desktop)),
  );
  const [facts, setFacts] = useState<SourceFacts | null>(null);
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [prefixTouched, setPrefixTouched] = useState(false);
  const [digits, setDigits] = useState(DEFAULT_DIGITS);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const source =
    start === "existing"
      ? (sources.find((p) => p.id === sourceId) ?? null)
      : null;
  const steps: Step[] =
    start === "existing" ? ["start", "copy", "general"] : ["start", "general"];
  const index = steps.indexOf(step);

  // What the source has of each setting, shown next to its checkbox.
  useEffect(() => {
    if (start !== "existing" || !sourceId) return;
    let live = true;
    setFacts(null);
    void loadSourceFacts(sourceId, ownerId, desktop).then(
      (read) => live && setFacts(read),
    );
    return () => {
      live = false;
    };
  }, [start, sourceId, ownerId, desktop]);

  // NC-030: a free prefix suggested from the name until the user types one.
  const shownPrefix = prefixTouched
    ? prefix
    : name.trim()
      ? suggestPrefix(name, projects)
      : "";
  const prefixProblem =
    name.trim() || prefixTouched ? prefixIssue(shownPrefix, projects) : null;
  const nameProblem = required(name);
  // A blank name or a taken prefix is explained (and announced) on «Crear
  // proyecto», as in Ajustes › General, instead of a disabled button.
  const { guard, showSummary, attempted, summaryRef } = useSaveGuard(
    nameProblem !== null || prefixProblem !== null,
  );
  const nameIssue = attempted ? nameProblem : null;
  const digitsCopied =
    source !== null && parts.has("digits") && digits === source.caseIdDigits;

  const dirty =
    start !== "blank" ||
    name.trim() !== "" ||
    prefixTouched ||
    digits !== DEFAULT_DIGITS;
  const confirmDiscard = async () =>
    !dirty ||
    (await confirm({
      title: t("projects.wizard.discard.title"),
      message: t("projects.wizard.discard.message"),
      confirmLabel: t("projects.wizard.discard.confirm"),
      cancelLabel: t("projects.wizard.discard.keep"),
      danger: true,
    }));
  const cancel = () => void confirmDiscard().then((ok) => ok && onClose());

  // Each step starts on its first control.
  const startRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (step === "start")
      startRef.current
        ?.querySelector<HTMLInputElement>("input:checked")
        ?.focus();
    else if (step === "copy") document.getElementById(`${id}-source`)?.focus();
    else nameRef.current?.focus();
  }, [step, id]);

  function next() {
    if (step === "start") {
      setStep(start === "existing" ? "copy" : "general");
      if (start === "blank") setDigits(DEFAULT_DIGITS);
    } else if (step === "copy" && source) {
      // The copied digits are put in the form, marked and editable.
      setDigits(parts.has("digits") ? source.caseIdDigits : DEFAULT_DIGITS);
      setStep("general");
    }
  }
  function back() {
    if (index > 0) setStep(steps[index - 1]);
  }
  function togglePart(part: CopyPart, on: boolean) {
    const nextParts = new Set(parts);
    if (on) nextParts.add(part);
    else nextParts.delete(part);
    setParts(nextParts);
  }

  async function create() {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    const chosen: ReadonlySet<CopyPart> = source ? new Set(parts) : new Set();
    let project: Project | null;
    try {
      project = await projectApi.create(
        newProjectInput(
          { name, prefix: shownPrefix, digits },
          ownerId,
          source,
          chosen,
        ),
      );
    } catch (e) {
      setSaving(false);
      // A refusal the user was already told about (a toast) is not repeated.
      if (e instanceof ReportedError) return;
      logClientError(e, "project create");
      setFailed(true);
      return;
    }
    if (project && source) {
      // The project exists: a copy that fails is said, never undone.
      const outcome = await copyAfterCreate(
        source.id,
        project.id,
        ownerId,
        chosen,
      );
      if (copyFailed(outcome)) {
        logClientError(
          new Error("project settings copy incomplete"),
          "project create",
        );
        toast(
          t("projects.copySettings.failedToast", { parts: missing(outcome) }),
          "warning",
        );
      } else {
        toast(
          t("projects.copySettings.copiedToast", { name: source.name }),
          "success",
        );
      }
    }
    onCreated(project);
  }

  /** What the copy left out, in words («campos personalizados de requisitos»). */
  function missing(outcome: CopyOutcome): string {
    const list: string[] = [];
    if (outcome.fieldsFailed.length) {
      const entities = outcome.fieldsFailed
        .map((e) => t(`projects.copySettings.entity.${e}`))
        .join(", ");
      list.push(t("projects.copySettings.failedFields", { entities }));
    }
    if (outcome.retentionFailed)
      list.push(t("projects.copySettings.failedRetention"));
    return list.join("; ");
  }

  const historyMode = (p: { planExportHistory?: string } | null) =>
    t(`testPlan.historyMode.${p?.planExportHistory ?? "current"}`);

  /** The source's real value of one setting. */
  function partValue(part: CopyPart): string {
    if (!source) return "";
    if (part === "digits")
      return `${source.caseIdDigits} · ${sampleKey(source.caseIdPrefix, source.caseIdDigits)}`;
    if (part === "planHistory") return historyMode(source);
    if (part === "riskBands") return t("projects.wizard.value.riskBands", { ...projectRiskBands(source) });
    if (part === "retention") {
      if (!desktop) return t("projects.wizard.value.desktopOnly");
      if (!facts) return t("projects.wizard.value.loading");
      if (!facts.retention) return t("projects.wizard.value.unread");
      const own = facts.retention.kinds.filter((k) => k.custom);
      if (own.length === 0) return t("projects.wizard.value.retentionDefault");
      return own
        .map((k) =>
          t("projects.wizard.value.retentionKind", {
            kind: t(`admin.evidence.retention.kinds.${k.kind}`),
            days:
              k.days === null
                ? t("admin.evidence.usage.rawAlways")
                : t("admin.evidence.usage.rawDays", { count: k.days }),
          }),
        )
        .join(" · ");
    }
    if (!facts) return t("projects.wizard.value.loading");
    if (!facts.fields) return t("projects.wizard.value.unread");
    const counts = Object.entries(facts.fields);
    if (counts.length === 0) return t("projects.wizard.value.fieldsNone");
    return counts
      .map(([entity, count]) =>
        t("projects.wizard.value.fieldsOf", {
          count,
          entity: t(`projects.copySettings.entity.${entity}`),
        }),
      )
      .join(", ");
  }

  /** «Se copiarán de …»: what goes besides the general data. */
  const summaryParts = source
    ? COPY_PARTS.filter(
        (part) =>
          parts.has(part) &&
          partOffered(part, desktop) &&
          (part !== "digits" || digitsCopied),
      ).map((part) =>
        t(`projects.wizard.summaryPart.${part}`, {
          digits: source.caseIdDigits,
          mode: historyMode(source),
          ...projectRiskBands(source),
        }),
      )
    : [];

  const primary =
    step === "general" ? (
      <button
        type="button"
        className="cd__confirm"
        disabled={saving}
        onClick={() => guard(() => void create())}
      >
        {saving ? t("projects.wizard.creating") : t("projects.wizard.create")}
      </button>
    ) : (
      <button type="button" className="cd__confirm" onClick={next}>
        {t("projects.wizard.next")}
      </button>
    );

  return (
    <Dialog
      className="cd pj-wizard"
      overlayClassName="cd-overlay pj-wizard-overlay"
      labelledBy={`${id}-title`}
      describedBy={`${id}-step`}
      onClose={onClose}
      confirmClose={confirmDiscard}
      dismissable={!saving}
    >
      <h2 id={`${id}-title`} className="cd__title">
        {t("projects.wizard.title")}
      </h2>
      <ol
        className="pj-wizard__steps"
        aria-label={t("projects.wizard.stepsLabel")}
      >
        {steps.map((s, i) => (
          <li
            key={s}
            className="pj-wizard__step"
            aria-current={s === step ? "step" : undefined}
            data-done={i < index ? "" : undefined}
          >
            <span className="pj-wizard__num" aria-hidden="true">
              {i < index ? <Check size={12} /> : i + 1}
            </span>
            <span>{t(`projects.wizard.step.${s}`)}</span>
          </li>
        ))}
      </ol>
      {/* The indicator already shows the step: its title is for assistive tech. */}
      <h3 id={`${id}-step`} className="sr-only">
        <span className="sr-only">
          {t("projects.wizard.stepOf", { n: index + 1, total: steps.length })}
          :{" "}
        </span>
        {t(`projects.wizard.step.${step}`)}
      </h3>

      <div className="pj-wizard__body">
        {step === "start" && (
          <div
            ref={startRef}
            role="radiogroup"
            aria-labelledby={`${id}-step`}
            className="pj-wizard__starts"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                next();
              }
            }}
          >
            {(["blank", "existing"] as const).map((kind) => {
              const disabled = kind === "existing" && sources.length === 0;
              const Icon = kind === "blank" ? FilePlus : Copy;
              return (
                <label
                  key={kind}
                  className="pj-start"
                  data-checked={start === kind ? "" : undefined}
                  data-disabled={disabled ? "" : undefined}
                >
                  <input
                    type="radio"
                    className="pj-start__radio"
                    name={`${id}-start`}
                    value={kind}
                    checked={start === kind}
                    disabled={disabled}
                    aria-describedby={`${id}-${kind}-desc`}
                    data-testid={`pj-new-start-${kind}`}
                    onChange={() => setStart(kind)}
                  />
                  <span className="pj-start__icon" aria-hidden="true">
                    <Icon size={22} />
                  </span>
                  <span className="pj-start__text">
                    <span className="pj-start__title">
                      {t(`projects.wizard.${kind}.title`)}
                    </span>
                    <span id={`${id}-${kind}-desc`} className="pj-start__desc">
                      {disabled
                        ? t("projects.wizard.existing.none")
                        : t(`projects.wizard.${kind}.desc`)}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {step === "copy" && source && (
          <>
            <FormField id={`${id}-source`} label={t("projects.wizard.source")}>
              {(p) => (
                <ProjectSelect
                  id={p.id}
                  label={t("projects.wizard.source")}
                  projects={sources.map((s) => ({
                    id: s.id,
                    name: s.name,
                    caseIdPrefix: s.caseIdPrefix,
                    detail: t("projects.wizard.cases", { count: s.cases }),
                  }))}
                  value={sourceId}
                  onChange={setSourceId}
                  testId="pj-new-source"
                />
              )}
            </FormField>
            <fieldset className="pj-parts">
              <legend className="pj-parts__legend">
                {t("projects.wizard.take")}
              </legend>
              {COPY_PARTS.map((part) => {
                const offered = partOffered(part, desktop);
                return (
                  <label
                    key={part}
                    className="pj-part"
                    data-disabled={offered ? undefined : ""}
                  >
                    <input
                      type="checkbox"
                      checked={offered && parts.has(part)}
                      disabled={!offered}
                      aria-describedby={`${id}-${part}-value`}
                      data-testid={`pj-new-copy-${part}`}
                      onChange={(e) => togglePart(part, e.target.checked)}
                    />
                    <span className="pj-part__text">
                      <span className="pj-part__label">
                        {t(`projects.wizard.part.${part}`)}
                      </span>
                      <span
                        id={`${id}-${part}-value`}
                        className="pj-part__value"
                      >
                        {partValue(part)}
                      </span>
                    </span>
                    <StatusPill tone="neutral">
                      {t("projects.wizard.settingsTag")}
                    </StatusPill>
                  </label>
                );
              })}
            </fieldset>
            <p className="pj-wizard__note">{t("projects.wizard.never")}</p>
          </>
        )}

        {step === "general" && (
          <>
            <ProjectGeneralFields
              idPrefix="pj-new"
              name={name}
              onName={setName}
              prefix={shownPrefix}
              onPrefix={(value) => {
                setPrefixTouched(true);
                setPrefix(value);
              }}
              digits={digits}
              onDigits={setDigits}
              nameIssue={nameIssue}
              prefixIssue={prefixProblem}
              prefixFree={shownPrefix.trim() !== "" && !prefixProblem}
              prefixPlaceholder={t("projects.prefix.placeholder")}
              prefixHint={t("projects.prefix.suggestedHint")}
              digitsCopiedFrom={digitsCopied ? source?.name : null}
              nameRef={nameRef}
              onEnter={() => guard(() => void create())}
            />
            {showSummary && (
              <ErrorSummary
                ref={summaryRef}
                items={[
                  ...(nameProblem
                    ? [
                        {
                          label: t("projects.name"),
                          issue: nameProblem,
                          fieldId: "pj-new-name",
                        },
                      ]
                    : []),
                  ...(prefixProblem
                    ? [
                        {
                          label: t("projects.caseIdPrefix"),
                          issue: prefixProblem,
                          fieldId: "pj-new-prefix",
                        },
                      ]
                    : []),
                ]}
              />
            )}
            {source && (
              <p className="pj-wizard__summary" data-testid="pj-new-summary">
                <Copy size={15} aria-hidden="true" />
                <span>
                  {summaryParts.length
                    ? t("projects.wizard.summary", {
                        name: source.name,
                        parts: summaryParts.join(", "),
                      })
                    : t("projects.wizard.summaryNothing", {
                        name: source.name,
                      })}
                </span>
              </p>
            )}
            {failed && (
              <p role="alert" className="pj-wizard__error">
                {t("projects.wizard.createFailed")}
              </p>
            )}
          </>
        )}
      </div>

      <div className="cd__actions pj-wizard__actions">
        <button
          type="button"
          className="cd__cancel"
          onClick={cancel}
          disabled={saving}
        >
          {t("common.cancel")}
        </button>
        <span className="pj-wizard__spacer" />
        {index > 0 && (
          <button
            type="button"
            className="cd__cancel"
            onClick={back}
            disabled={saving}
          >
            {t("projects.wizard.back")}
          </button>
        )}
        {primary}
      </div>
      {confirmDialog}
    </Dialog>
  );
}
