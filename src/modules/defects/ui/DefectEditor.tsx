import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Info, Link2, Paperclip, X } from "lucide-react";
import { CustomFieldsSection, customFieldApi, type CustomField, type CustomValues } from "@modules/custom-fields";
import { capabilities } from "@shared/platform";
import { saveVia } from "@shared/export/saveFile";
import { ListField } from "@shared/ui/fields";
import { notify, unlessReported } from "@shared/ui/notify";
import { useToast } from "@shared/ui/Toast";
import { MAX_ATTACHMENT_MB, defectsApi } from "../api/defectsApi";
import { NEXT_STATUSES, needsResolution } from "../model/lifecycle";
import {
  DEFECT_PRIORITIES,
  DEFECT_RESOLUTIONS,
  DEFECT_SEVERITIES,
  type Defect,
  type DefectAttachment,
  type DefectInput,
  type DefectPriority,
  type DefectResolution,
  type DefectSeverity,
  type DefectStatus,
  type LinkTarget,
  type LinkableItem,
} from "../model/types";
import { ResultPickerDialog } from "./ResultPickerDialog";
import { StatusBadge } from "./badges";
import "@shared/ui/buttons.css";

const MAX_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;

/** The text for an evidence store error (evidence.rs prefixes). */
function explainEvidence(t: (key: string, o?: Record<string, unknown>) => string, reason: string) {
  if (reason.startsWith("evidence-missing")) return t("planner.attachMissing");
  if (reason.startsWith("evidence-unreadable")) return t("planner.attachUnreadable");
  if (reason.startsWith("evidence-newer-than-app")) return t("planner.attachNewer");
  if (reason.startsWith("evidence-too-large")) return t("planner.attachLimit", { mb: MAX_ATTACHMENT_MB });
  return reason;
}

interface Form {
  title: string;
  description: string;
  stepsToReproduce: string;
  expected: string;
  actual: string;
  severity: DefectSeverity;
  priority: DefectPriority;
  status: DefectStatus;
  resolution: DefectResolution | "";
  foundInBuild: string;
  foundInEnvironment: string;
  fixedInBuild: string;
  assignee: string;
  externalKey: string;
  externalUrl: string;
  labels: string[];
  custom: CustomValues;
}

function formOf(d: Defect | null, draft?: DefectInput): Form {
  const src = d ?? draft;
  return {
    title: src?.title ?? "",
    description: src?.description ?? "",
    stepsToReproduce: src?.stepsToReproduce ?? "",
    expected: src?.expected ?? "",
    actual: src?.actual ?? "",
    severity: (src?.severity as DefectSeverity) ?? "major",
    priority: (src?.priority as DefectPriority) ?? "medium",
    status: (src?.status as DefectStatus) ?? "new",
    resolution: (src?.resolution as DefectResolution) ?? "",
    foundInBuild: src?.foundInBuild ?? "",
    foundInEnvironment: src?.foundInEnvironment ?? "",
    fixedInBuild: src?.fixedInBuild ?? "",
    assignee: src?.assignee ?? "",
    externalKey: src?.externalKey ?? "",
    externalUrl: src?.externalUrl ?? "",
    labels: (src?.data?.labels as string[] | undefined) ?? [],
    custom: (src?.data?.custom as CustomValues | undefined) ?? {},
  };
}

const ids = (d: Defect | null, kind: string) =>
  (d?.links ?? []).filter((l) => l.targetKind === kind).map((l) => l.targetId);

/**
 * Create or edit a defect (DEF-01): its fields, the cases and requirements it
 * is linked to, the results it was seen in, its evidence (desktop) and the
 * project's custom fields for defects. A draft from a failed result arrives
 * prefilled (`draft`); saving it links the result and its case and adds the
 * result's evidence. Built with the primitives of the case and card editors:
 * `docs/rediseno/` has no design for it.
 */
export function DefectEditor({
  projectId,
  userId,
  defect,
  draft,
  fromLabel,
  cases = [],
  requirements = [],
  onClose,
}: {
  projectId: string;
  userId: string;
  defect: Defect | null;
  draft?: DefectInput;
  fromLabel?: string;
  cases?: LinkableItem[];
  requirements?: LinkableItem[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const uid = useId();
  const [current, setCurrent] = useState<Defect | null>(defect);
  const [form, setForm] = useState<Form>(() => formOf(defect, draft));
  const [caseIds, setCaseIds] = useState<string[]>(() => ids(defect, "test_case"));
  const [requirementIds, setRequirementIds] = useState<string[]>(() => ids(defect, "requirement"));
  const [attachments, setAttachments] = useState<DefectAttachment[]>([]);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [picking, setPicking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const desktop = capabilities.attachments();
  const update = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (current && desktop) void defectsApi.attachmentList(current.id, userId).then(setAttachments);
  }, [current, userId, desktop]);
  useEffect(() => {
    void customFieldApi
      .list(projectId, userId, "defect")
      .then(setFields)
      .catch(() => setFields([]));
  }, [projectId, userId]);

  const from = (current?.status ?? "new") as DefectStatus;
  const statusOptions: DefectStatus[] = current ? [from, ...NEXT_STATUSES[from]] : ["new", "open"];
  const needs = needsResolution(form.status);
  const titleMissing = attempted && !form.title.trim();
  const results = useMemo(() => (current?.links ?? []).filter((l) => l.targetKind === "result"), [current]);

  function input(): DefectInput {
    const opt = (v: string) => (v.trim() ? v.trim() : undefined);
    return {
      projectId,
      userId,
      title: form.title.trim(),
      description: form.description,
      stepsToReproduce: form.stepsToReproduce,
      expected: opt(form.expected),
      actual: opt(form.actual),
      severity: form.severity,
      priority: form.priority,
      status: form.status,
      resolution: needs && form.resolution ? form.resolution : undefined,
      foundInRunId: current?.foundInRunId ?? draft?.foundInRunId ?? undefined,
      foundInBuild: opt(form.foundInBuild),
      foundInEnvironment: opt(form.foundInEnvironment),
      fixedInBuild: opt(form.fixedInBuild),
      assignee: opt(form.assignee),
      externalSystem: current?.externalSystem ?? undefined,
      externalKey: opt(form.externalKey),
      externalUrl: opt(form.externalUrl),
      data: {
        ...(current?.data ?? {}),
        labels: form.labels.map((l) => l.trim()).filter(Boolean),
        custom: form.custom,
      },
    };
  }

  async function save() {
    setAttempted(true);
    if (!form.title.trim() || (needs && !form.resolution)) return;
    setSaving(true);
    try {
      const wanted: LinkTarget[] = [
        ...caseIds.map((id) => ({ targetKind: "test_case" as const, targetId: id })),
        ...requirementIds.map((id) => ({ targetKind: "requirement" as const, targetId: id })),
      ];
      if (current) {
        await defectsApi.update(current.id, input());
        const had = new Set(current.links.map((l) => `${l.targetKind}:${l.targetId}`));
        const want = new Set(wanted.map((l) => `${l.targetKind}:${l.targetId}`));
        for (const l of wanted) if (!had.has(`${l.targetKind}:${l.targetId}`)) await defectsApi.link(current.id, userId, l, true);
        for (const l of current.links) {
          if (l.targetKind === "result" || want.has(`${l.targetKind}:${l.targetId}`)) continue;
          await defectsApi.link(current.id, userId, { targetKind: l.targetKind as LinkTarget["targetKind"], targetId: l.targetId }, false);
        }
      } else {
        await defectsApi.create({ ...input(), links: wanted, fromResult: draft?.fromResult });
      }
      toast(t("defects.savedToast"));
      onClose();
    } catch (e) {
      notify(t("defects.saveFailed", { reason: e instanceof Error ? e.message : String(e) }), "error");
    } finally {
      setSaving(false);
    }
  }

  async function linkResult(resultId: string, linked: boolean) {
    if (!current) return;
    setPicking(false);
    const next = await defectsApi.link(current.id, userId, { targetKind: "result", targetId: resultId }, linked);
    if (next) setCurrent(next);
  }

  async function addFiles(files: FileList | null) {
    if (!files || !current) return;
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        notify(t("planner.attachTooLarge", { name: file.name, mb: MAX_ATTACHMENT_MB }), "error");
        continue;
      }
      try {
        await defectsApi.attachmentAdd(current.id, userId, file);
      } catch (e) {
        const reason = explainEvidence(t, e instanceof Error ? e.message : String(e));
        notify(t("planner.attachFailed", { name: file.name, reason }), "error");
      }
    }
    setAttachments(await defectsApi.attachmentList(current.id, userId));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function download(a: DefectAttachment) {
    const path = await unlessReported(
      saveVia(
        a.name,
        () => defectsApi.attachmentSave(a.id, userId),
        (reason) => explainEvidence(t, reason),
      ),
    );
    if (path) toast(t("downloads.saved", { path }));
  }

  async function removeAttachment(id: string) {
    await defectsApi.attachmentDelete(id, userId);
    if (current) setAttachments(await defectsApi.attachmentList(current.id, userId));
  }

  const checkList = (items: LinkableItem[], chosen: string[], set: (v: string[]) => void, empty: string) =>
    items.length === 0 ? (
      <p className="tp-field__hint">{empty}</p>
    ) : (
      <ul className="pl-links">
        {items.map((c) => (
          <li key={c.id}>
            <label className="pl-links__item">
              <input
                type="checkbox"
                checked={chosen.includes(c.id)}
                onChange={(e) => set(e.target.checked ? [...chosen, c.id] : chosen.filter((x) => x !== c.id))}
              />
              <span className="pl-links__id">{c.key}</span> {c.title}
            </label>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="df-editor">
      <header className="tc-editor__top">
        <button type="button" className="tp-editor__back" onClick={onClose}>
          ← {t("defects.back")}
        </button>
        <h2>{current ? t("defects.editDefect") : t("defects.newDefect")}</h2>
        {current && <span className="tc-editor__id">{current.defectKey}</span>}
        {current && <StatusBadge defect={current} />}
        <div className="tc-editor__actions">
          <button type="button" className="tp-editor__save" onClick={save} disabled={saving}>
            {saving ? t("defects.saving") : t("defects.save")}
          </button>
        </div>
      </header>

      {fromLabel && (
        <p className="df-banner" role="status">
          <Info size={16} aria-hidden="true" />
          {t("defects.fromResultBanner", { label: fromLabel })}
        </p>
      )}

      <div className="tc-form df-form">
        <section className="df-section" aria-labelledby={`${uid}-details`}>
          <h3 id={`${uid}-details`} className="df-section__title">
            {t("defects.section.details")}
          </h3>
          <label className="tp-field">
            <span>{t("defects.field.title")}</span>
            <input
              value={form.title}
              maxLength={500}
              aria-invalid={titleMissing || undefined}
              aria-describedby={titleMissing ? `${uid}-title-error` : undefined}
              onChange={(e) => update({ title: e.target.value })}
            />
            {titleMissing && (
              <span id={`${uid}-title-error`} className="tp-field__error">
                {t("defects.titleRequired")}
              </span>
            )}
          </label>
          <div className="tc-form__grid df-grid">
            <label className="tp-field">
              <span>{t("defects.field.severity")}</span>
              <select
                value={form.severity}
                aria-describedby={`${uid}-sev-hint`}
                onChange={(e) => update({ severity: e.target.value as DefectSeverity })}
              >
                {DEFECT_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {t(`defects.severity.${s}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="tp-field">
              <span>{t("defects.field.priority")}</span>
              <select value={form.priority} onChange={(e) => update({ priority: e.target.value as DefectPriority })}>
                {DEFECT_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`defects.priority.${p}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="tp-field">
              <span>{t("defects.field.status")}</span>
              <select
                value={form.status}
                onChange={(e) => {
                  const status = e.target.value as DefectStatus;
                  update({ status, resolution: needsResolution(status) ? form.resolution || (status === "closed" ? "fixed" : "") : "" });
                }}
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {t(`defects.status.${s}`)}
                  </option>
                ))}
              </select>
            </label>
            {needs && (
              <label className="tp-field">
                <span>{t("defects.resolution.label")}</span>
                <select
                  value={form.resolution}
                  aria-invalid={(attempted && !form.resolution) || undefined}
                  onChange={(e) => update({ resolution: e.target.value as DefectResolution | "" })}
                >
                  <option value="">{t("defects.resolution.none")}</option>
                  {DEFECT_RESOLUTIONS.map((r) => (
                    <option key={r} value={r}>
                      {t(`defects.resolution.${r}`)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <p id={`${uid}-sev-hint`} className="tp-field__hint">
            {t("defects.field.severityHint")}
          </p>
          <label className="tp-field">
            <span>{t("defects.field.description")}</span>
            <textarea rows={3} value={form.description} onChange={(e) => update({ description: e.target.value })} />
          </label>
          <p className="tp-field__grouplabel">{t("defects.field.labels")}</p>
          <ListField label={t("defects.field.labels")} items={form.labels} onChange={(labels) => update({ labels })} />
        </section>

        <section className="df-section" aria-labelledby={`${uid}-repro`}>
          <h3 id={`${uid}-repro`} className="df-section__title">
            {t("defects.section.reproduce")}
          </h3>
          <label className="tp-field">
            <span>{t("defects.field.steps")}</span>
            <textarea
              rows={5}
              value={form.stepsToReproduce}
              onChange={(e) => update({ stepsToReproduce: e.target.value })}
            />
          </label>
          <div className="tc-form__grid df-grid df-grid--2">
            <label className="tp-field">
              <span>{t("defects.field.expected")}</span>
              <textarea rows={3} value={form.expected} onChange={(e) => update({ expected: e.target.value })} />
            </label>
            <label className="tp-field">
              <span>{t("defects.field.actual")}</span>
              <textarea rows={3} value={form.actual} onChange={(e) => update({ actual: e.target.value })} />
            </label>
          </div>
        </section>

        <section className="df-section" aria-labelledby={`${uid}-found`}>
          <h3 id={`${uid}-found`} className="df-section__title">
            {t("defects.section.found")}
          </h3>
          <div className="tc-form__grid df-grid">
            <label className="tp-field">
              <span>{t("defects.field.foundInBuild")}</span>
              <input value={form.foundInBuild} maxLength={200} onChange={(e) => update({ foundInBuild: e.target.value })} />
            </label>
            <label className="tp-field">
              <span>{t("defects.field.foundInEnvironment")}</span>
              <input
                value={form.foundInEnvironment}
                maxLength={200}
                onChange={(e) => update({ foundInEnvironment: e.target.value })}
              />
            </label>
            <label className="tp-field">
              <span>{t("defects.field.fixedInBuild")}</span>
              <input value={form.fixedInBuild} maxLength={200} onChange={(e) => update({ fixedInBuild: e.target.value })} />
            </label>
            <label className="tp-field">
              <span>{t("defects.field.assignee")}</span>
              <input value={form.assignee} maxLength={200} onChange={(e) => update({ assignee: e.target.value })} />
            </label>
          </div>
        </section>

        <section className="df-section" aria-labelledby={`${uid}-links`}>
          <h3 id={`${uid}-links`} className="df-section__title">
            {t("defects.section.links")}
          </h3>
          <p className="tp-field__grouplabel">{t("defects.links.cases")}</p>
          {checkList(cases, caseIds, setCaseIds, t("defects.links.noCases"))}
          <p className="tp-field__grouplabel">{t("defects.links.requirements")}</p>
          {checkList(requirements, requirementIds, setRequirementIds, t("defects.links.noRequirements"))}
          <p className="tp-field__grouplabel">{t("defects.links.results")}</p>
          {draft?.fromResult && !current && <p className="tp-field__hint">{fromLabel}</p>}
          {current && results.length === 0 && <p className="tp-field__hint">{t("defects.links.noResults")}</p>}
          {results.length > 0 && (
            <ul className="df-chips">
              {results.map((l) => (
                <li key={l.id} className="df-chip">
                  <Link2 size={13} aria-hidden="true" />
                  {l.label ?? l.targetId}
                  <button
                    type="button"
                    className="df-chip__del"
                    aria-label={t("defects.links.remove", { label: l.label ?? l.targetId })}
                    onClick={() => void linkResult(l.targetId, false)}
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {capabilities.results() &&
            (current ? (
              <button type="button" className="ui-btn ui-btn--small" onClick={() => setPicking(true)}>
                {t("defects.links.addResult")}
              </button>
            ) : (
              !draft?.fromResult && <p className="tp-field__hint">{t("defects.links.afterSave")}</p>
            ))}
        </section>

        <section className="df-section" aria-labelledby={`${uid}-ext`}>
          <h3 id={`${uid}-ext`} className="df-section__title">
            {t("defects.section.external")}
          </h3>
          <div className="tc-form__grid df-grid df-grid--2">
            <label className="tp-field">
              <span>{t("defects.field.externalKey")}</span>
              <input value={form.externalKey} maxLength={200} onChange={(e) => update({ externalKey: e.target.value })} />
            </label>
            <label className="tp-field">
              <span>{t("defects.field.externalUrl")}</span>
              <input
                type="url"
                value={form.externalUrl}
                maxLength={2000}
                onChange={(e) => update({ externalUrl: e.target.value })}
              />
            </label>
          </div>
          <p className="tp-field__hint">{t("defects.field.externalHint")}</p>
        </section>

        {fields.length > 0 && (
          <section className="df-section" aria-labelledby={`${uid}-custom`}>
            <h3 id={`${uid}-custom`} className="df-section__title">
              {t("defects.section.custom")}
            </h3>
            <CustomFieldsSection
              fields={fields}
              caseType="standard"
              values={form.custom}
              previous={(current?.data.custom as CustomValues | undefined) ?? undefined}
              attempted={attempted}
              onChange={(custom) => update({ custom })}
            />
          </section>
        )}

        <section className="df-section" aria-labelledby={`${uid}-att`}>
          <h3 id={`${uid}-att`} className="df-section__title">
            {t("defects.section.attachments")}
          </h3>
          {!desktop ? (
            <p className="tp-field__hint">{t("defects.webOnlyDesktop")}</p>
          ) : !current ? (
            <p className="tp-field__hint">{t("defects.attachAfterSave")}</p>
          ) : (
            <div className="pl-attach">
              <ul className="pl-attach__list">
                {attachments.map((a) => (
                  <li key={a.id} className="pl-attach__item">
                    <button type="button" className="pl-attach__open" onClick={() => download(a)} disabled={a.purged}>
                      <Paperclip size={14} aria-hidden="true" /> {a.name}
                    </button>
                    <span className="pl-attach__size">{(a.size / 1024).toFixed(1)} KB</span>
                    <button
                      type="button"
                      className="pl-attach__del"
                      onClick={() => removeAttachment(a.id)}
                      aria-label={`${t("common.delete")}: ${a.name}`}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="pl-attach__input"
                aria-label={t("defects.section.attachments")}
                aria-describedby={`${uid}-limit`}
                onChange={(e) => void addFiles(e.target.files)}
              />
              <p id={`${uid}-limit`} className="tp-field__hint">
                {t("planner.attachLimit", { mb: MAX_ATTACHMENT_MB })}
              </p>
            </div>
          )}
        </section>
      </div>

      {picking && current && (
        <ResultPickerDialog
          projectId={projectId}
          userId={userId}
          purpose="link"
          exclude={results.map((l) => l.targetId)}
          onPick={(r) => void linkResult(r.resultId, true)}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
