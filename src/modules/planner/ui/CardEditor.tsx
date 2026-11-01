import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ListField } from "@shared/ui/fields";
import { useToast } from "@shared/ui/Toast";
import { saveVia } from "@shared/export/saveFile";
import { notify, unlessReported } from "@shared/ui/notify";
import { MAX_ATTACHMENT_MB, plannerApi } from "../api/plannerApi";
import {
  CARD_KINDS,
  CARD_PRIORITIES,
  type AttachmentSummary,
  type CardKind,
  type CardPriority,
  type CardStatus,
  type PlannerCard,
} from "../model/types";

const MAX_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;

/** The text for an evidence store error (evidence.rs prefixes). */
function explainEvidence(t: (key: string, o?: Record<string, unknown>) => string, reason: string) {
  if (reason.startsWith("evidence-missing")) return t("planner.attachMissing");
  if (reason.startsWith("evidence-unreadable")) return t("planner.attachUnreadable");
  if (reason.startsWith("evidence-newer-than-app")) return t("planner.attachNewer");
  if (reason.startsWith("evidence-too-large")) return t("planner.attachLimit", { mb: MAX_ATTACHMENT_MB });
  return reason;
}

/** Create/edit a planner card, including its attachments (stored encrypted in
 *  the evidence store, ADR-0014). */
export function CardEditor({
  projectId,
  ownerId,
  card,
  initialStatus,
  onClose,
}: {
  projectId: string;
  ownerId: string;
  card: PlannerCard | null;
  initialStatus: CardStatus;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [kind, setKind] = useState<CardKind>(card?.kind ?? "task");
  const [title, setTitle] = useState(card?.title ?? "");
  const [priority, setPriority] = useState<CardPriority>(card?.priority ?? "medium");
  const [description, setDescription] = useState(card?.data.description ?? "");
  const [labels, setLabels] = useState<string[]>(card?.data.labels ?? []);
  const [attachments, setAttachments] = useState<AttachmentSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (card) void plannerApi.attachmentList(card.id, ownerId).then(setAttachments);
  }, [card, ownerId]);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    const input = {
      projectId,
      ownerId,
      kind,
      title: title.trim(),
      status: card?.status ?? initialStatus,
      priority,
      data: {
        description,
        labels: labels.map((l) => l.trim()).filter(Boolean),
      },
    };
    try {
      if (card) await plannerApi.update(card.id, input);
      else await plannerApi.create(input);
      toast(t("planner.savedToast"));
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function addFiles(files: FileList | null) {
    if (!files || !card) return;
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        alert(t("planner.attachTooLarge", { name: file.name, mb: MAX_ATTACHMENT_MB }));
        continue;
      }
      try {
        await plannerApi.attachmentAdd(card.id, ownerId, file);
      } catch (e) {
        const reason = explainEvidence(t, e instanceof Error ? e.message : String(e));
        notify(t("planner.attachFailed", { name: file.name, reason }), "error");
      }
    }
    setAttachments(await plannerApi.attachmentList(card.id, ownerId));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function download(a: AttachmentSummary) {
    const path = await unlessReported(
      saveVia(
        a.name,
        () => plannerApi.attachmentSave(a.id, ownerId),
        (reason) => explainEvidence(t, reason),
      ),
    );
    if (path) toast(t("downloads.saved", { path }));
  }

  async function removeAttachment(id: string) {
    await plannerApi.attachmentDelete(id, ownerId);
    if (card) setAttachments(await plannerApi.attachmentList(card.id, ownerId));
  }

  return (
    <div className="pl-editor">
      <header className="tc-editor__top">
        <button type="button" className="tp-editor__back" onClick={onClose}>
          ← {t("planner.back")}
        </button>
        <h2>{card ? t("planner.editCard") : t("planner.newCard")}</h2>
        {card?.cardKey && <span className="tc-editor__id">{card.cardKey}</span>}
        <div className="tc-editor__actions">
          <button
            type="button"
            className="tp-editor__save"
            onClick={save}
            disabled={saving || !title.trim()}
          >
            {saving ? t("planner.saving") : t("planner.save")}
          </button>
        </div>
      </header>

      <div className="tc-form">
        <div className="tc-form__grid">
          <label className="tp-field">
            <span>{t("planner.kind")}</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as CardKind)}>
              {CARD_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`planner.kindLabel.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="tp-field">
            <span>{t("planner.priority")}</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as CardPriority)}
            >
              {CARD_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(`planner.priorityLabel.${p}`)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="tp-field">
          <span>{t("planner.cardTitle")}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="tp-field">
          <span>{t("planner.description")}</span>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <p className="tp-field__grouplabel">{t("planner.labels")}</p>
        <ListField label={t("planner.labels")} items={labels} onChange={setLabels} />

        <p className="tp-field__grouplabel">{t("planner.attachments")}</p>
        {!card ? (
          <p className="tp-field__hint">{t("planner.attachAfterSave")}</p>
        ) : (
          <div className="pl-attach">
            <ul className="pl-attach__list">
              {attachments.map((a) => (
                <li key={a.id} className="pl-attach__item">
                  <button
                    type="button"
                    className="pl-attach__open"
                    onClick={() => download(a)}
                  >
                    📎 {a.name}
                  </button>
                  <span className="pl-attach__size">
                    {(a.size / 1024).toFixed(1)} KB
                  </span>
                  <button
                    type="button"
                    className="pl-attach__del"
                    onClick={() => removeAttachment(a.id)}
                    aria-label={t("common.delete")}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="pl-attach__input"
              aria-describedby="pl-attach-limit"
              onChange={(e) => void addFiles(e.target.files)}
            />
            <p id="pl-attach-limit" className="tp-field__hint">
              {t("planner.attachLimit", { mb: MAX_ATTACHMENT_MB })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
