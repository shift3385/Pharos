import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ListField } from "@shared/ui/fields";
import { plannerApi } from "../api/plannerApi";
import {
  CARD_KINDS,
  CARD_PRIORITIES,
  type AttachmentSummary,
  type CardKind,
  type CardPriority,
  type CardStatus,
  type PlannerCard,
} from "../model/types";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per attachment

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Create/edit a planner card, including its attachments (stored encrypted). */
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
  const [kind, setKind] = useState<CardKind>(card?.kind ?? "task");
  const [title, setTitle] = useState(card?.title ?? "");
  const [priority, setPriority] = useState<CardPriority>(card?.priority ?? "medium");
  const [description, setDescription] = useState(card?.data.description ?? "");
  const [labels, setLabels] = useState<string[]>(card?.data.labels ?? []);
  const [attachments, setAttachments] = useState<AttachmentSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (card) void plannerApi.attachmentList(card.id).then(setAttachments);
  }, [card]);

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
      data: { description, labels: labels.map((l) => l.trim()).filter(Boolean) },
    };
    if (card) await plannerApi.update(card.id, input);
    else await plannerApi.create(input);
    setSaving(false);
    onClose();
  }

  async function addFiles(files: FileList | null) {
    if (!files || !card) return;
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        alert(t("planner.attachTooLarge", { name: file.name }));
        continue;
      }
      const b64 = await fileToBase64(file);
      await plannerApi.attachmentAdd(card.id, ownerId, file.name, file.type || null, b64);
    }
    setAttachments(await plannerApi.attachmentList(card.id));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function download(a: AttachmentSummary) {
    const d = await plannerApi.attachmentGet(a.id);
    if (!d) return;
    const bytes = Uint8Array.from(atob(d.dataBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: d.mime ?? "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = d.name;
    document.body.appendChild(el);
    el.click();
    el.remove();
    URL.revokeObjectURL(url);
  }

  async function removeAttachment(id: string) {
    await plannerApi.attachmentDelete(id);
    if (card) setAttachments(await plannerApi.attachmentList(card.id));
  }

  return (
    <div className="pl-editor">
      <header className="tc-editor__top">
        <button type="button" className="tp-editor__back" onClick={onClose}>
          ← {t("planner.back")}
        </button>
        <h2>{card ? t("planner.editCard") : t("planner.newCard")}</h2>
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
        <ListField items={labels} onChange={setLabels} />

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
              onChange={(e) => void addFiles(e.target.files)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
