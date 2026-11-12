import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2, Paperclip, Trash2, X } from "lucide-react";
import { Alert } from "@shared/ui/Alert";
import {
  CustomFieldsSection,
  customFieldApi,
  customFieldIssues,
  type CustomField,
  type CustomValues,
} from "@modules/custom-fields";
import { capabilities } from "@shared/platform";
import { saveVia } from "@shared/export/saveFile";
import { ListField } from "@shared/ui/fields";
import { notify, unlessReported } from "@shared/ui/notify";
import { Select } from "@shared/ui/Select";
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
import { useConfirm } from "@shared/ui/useConfirm";
import { ResultPickerDialog } from "./ResultPickerDialog";
import { StatusBadge } from "./badges";
import "@shared/ui/buttons.css";
import { TextArea } from "@shared/ui/TextArea";

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
  const { confirm, dialog: confirmDialog } = useConfirm();
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
    // A defect field (FLD-03) blocks the save like a case field: a required
    // one without a value, or a value that does not fit its field (a value
    // the defect already holds, such as an archived option, still does).
    // The section names it once `attempted` is set.
    const customIssues = customFieldIssues(
      fields,
      "standard",
      form.custom,
      (current?.data.custom as CustomValues | undefined) ?? {},
    );
    if (!form.title.trim() || (needs && !form.resolution) || customIssues.length) return;
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
    try {
      const next = await defectsApi.link(current.id, userId, { targetKind: "result", targetId: resultId }, linked);
      if (next) setCurrent(next);
    } catch {
      // NC-013: a failed link or unlink is said; the defect stays as it was.
      notify(t(linked ? "defects.links.linkFailed" : "defects.links.unlinkFailed"), "error");
    }
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

  /** Deleting the defect from its editor, the one place every view reaches
   *  (table, board, phone card; NC-015): the same critical confirmation as the
   *  table's trash button. */
  async function removeDefect() {
    if (!current) return;
    const ok = await confirm({
      title: t("defects.deleteTitle"),
      message: t("defects.deleteMessage", { defect: `${current.defectKey} ${current.title}` }),
      confirmLabel: t("defects.deleteConfirm"),
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await defectsApi.remove(current.id, userId);
      onClose();
    } catch {
      toast(t("defects.deleteFailed"), "error");
    }
  }

  /** Removing an evidence deletes it for good: a critical confirmation
   *  (NC-012, NC-014). */
  async function removeAttachment(a: { id: string; name: string }) {
    const ok = await confirm({
      title: t("common.removeEvidenceTitle"),
      message: t("common.removeEvidenceConfirm", { name: a.name }),
      confirmLabel: t("common.remove"),
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await defectsApi.attachmentDelete(a.id, userId);
      if (current) setAttachments(await defectsApi.attachmentList(current.id, userId));
    } catch {
      toast(t("common.removeEvidenceFailed"), "error");
    }
  }

  /** Unlinking a result asks first (NC-012, a normal confirmation). */
  async function unlinkResult(l: { targetId: string; label?: string | null }) {
    const label = l.label ?? l.targetId;
    const ok = await confirm({
      title: t("defects.links.removeTitle"),
      message: t("defects.links.removeConfirm", { label }),
      confirmLabel: t("defects.links.removeAction"),
      danger: true,
    });
    if (ok) await linkResult(l.targetId, false);
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
      {confirmDialog}
      <header className="tc-editor__top">
        <button type="button" className="tp-editor__back" onClick={onClose}>
          ← {t("defects.back")}
        </button>
        <h2>{current ? t("defects.editDefect") : t("defects.newDefect")}</h2>
        {current && <span className="tc-editor__id">{current.defectKey}</span>}
        {current && <StatusBadge defect={current} />}
        <div className="tc-editor__actions">
          {current && (
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              onClick={() => void removeDefect()}
              disabled={saving}
            >
              <Trash2 size={15} aria-hidden="true" />
              <span className="ui-btn__text">{t("defects.delete")}</span>
            </button>
          )}
          <button type="button" className="tp-editor__save" onClick={save} disabled={saving}>
            {saving ? t("defects.saving") : t("defects.save")}
          </button>
        </div>
      </header>

      {fromLabel && (
        <Alert kind="info" className="df-banner">
          {t(desktop ? "defects.fromResultBanner" : "defects.fromResultBannerWeb", { label: fromLabel })}
        </Alert>
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
              <Select<DefectSeverity>
                value={form.severity}
                aria-describedby={`${uid}-sev-hint`}
                onChange={(severity) => update({ severity })}
                options={DEFECT_SEVERITIES.map((s) => ({ value: s, label: t(`defects.severity.${s}`) }))}
              />
              {/* Under its own field, not after the whole row (NC-051). */}
              <span id={`${uid}-sev-hint`} className="tp-field__hint">
                {t("defects.field.severityHint")}
              </span>
            </label>
            <label className="tp-field">
              <span>{t("defects.field.priority")}</span>
              <Select<DefectPriority>
                value={form.priority}
                onChange={(priority) => update({ priority })}
                options={DEFECT_PRIORITIES.map((p) => ({ value: p, label: t(`defects.priority.${p}`) }))}
              />
            </label>
            <label className="tp-field">
              <span>{t("defects.field.status")}</span>
              <Select<DefectStatus>
                value={form.status}
                onChange={(status) => {
                  update({ status, resolution: needsResolution(status) ? form.resolution || (status === "closed" ? "fixed" : "") : "" });
                }}
                options={statusOptions.map((s) => ({ value: s, label: t(`defects.status.${s}`) }))}
              />
            </label>
            {needs && (
              <label className="tp-field">
                <span>{t("defects.resolution.label")}</span>
                <Select<DefectResolution | "">
                  value={form.resolution}
                  aria-invalid={(attempted && !form.resolution) || undefined}
                  onChange={(resolution) => update({ resolution })}
                  options={[
                    { value: "", label: t("defects.resolution.none") },
                    ...DEFECT_RESOLUTIONS.map((r) => ({ value: r, label: t(`defects.resolution.${r}`) })),
                  ]}
                />
              </label>
            )}
          </div>
          <label className="tp-field">
            <span>{t("defects.field.description")}</span>
            <TextArea size="description" value={form.description} onChange={(e) => update({ description: e.target.value })} />
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
            <TextArea
              size="description"
              value={form.stepsToReproduce}
              onChange={(e) => update({ stepsToReproduce: e.target.value })}
            />
          </label>
          <div className="tc-form__grid df-grid df-grid--2">
            <label className="tp-field">
              <span>{t("defects.field.expected")}</span>
              <TextArea size="short" value={form.expected} onChange={(e) => update({ expected: e.target.value })} />
            </label>
            <label className="tp-field">
              <span>{t("defects.field.actual")}</span>
              <TextArea size="short" value={form.actual} onChange={(e) => update({ actual: e.target.value })} />
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
                    onClick={() => void unlinkResult(l)}
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
              labelledBy={`${uid}-custom`}
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
                      onClick={() => void removeAttachment(a)}
                      aria-label={`${t("common.remove")}: ${a.name}`}
                      title={`${t("common.remove")}: ${a.name}`}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <button
              type="button"
              className="ui-btn ui-btn--secondary ui-btn--small pl-attach__pick"
              aria-describedby={`${uid}-limit`}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip size={14} aria-hidden="true" />
              {t("planner.attachFiles")}
            </button>
            {/* The native picker stays hidden (NC-037): the button opens it. */}
            <input
                ref={fileRef}
                type="file"
                multiple
                hidden
                className="pl-attach__input"
                aria-label={t("defects.section.attachments")}
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
