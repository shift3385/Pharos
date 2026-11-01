import { useId, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Dialog } from "@shared/ui/Dialog";
import { FormField } from "@shared/ui/FormField";
import { ATTRIBUTE_KEYS, type AttributeKey, type Configuration, type ConfigurationInput } from "../model/types";
import "@shared/ui/ConfirmDialog.css";
import "./Cycles.css";

/** New or edit configuration (CYC-01): a name, the four attributes and the
 *  labels an import recognizes it by. The labels are chips: Enter or a comma
 *  adds the typed one, its button removes it. */
export function ConfigurationDialog({
  configuration,
  projectId,
  userId,
  error,
  onSave,
  onCancel,
}: {
  configuration: Configuration | null;
  projectId: string;
  userId: string;
  /** The last refusal of the repository, in words. */
  error?: string;
  onSave: (input: ConfigurationInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [name, setName] = useState(configuration?.name ?? "");
  const [attributes, setAttributes] = useState<Record<AttributeKey, string>>(() => {
    const a = (configuration?.attributes ?? {}) as Record<string, string>;
    return { browser: a.browser ?? "", os: a.os ?? "", device: a.device ?? "", locale: a.locale ?? "" };
  });
  const [labels, setLabels] = useState<string[]>(configuration?.matchLabels ?? []);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const missingName = name.trim() === "";

  const addLabel = (raw: string) => {
    const l = raw.trim();
    if (!l) return;
    if (!labels.some((x) => x.toLowerCase() === l.toLowerCase())) setLabels([...labels, l]);
    setDraft("");
  };
  const onLabelKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addLabel(draft);
    } else if (e.key === "Backspace" && draft === "" && labels.length > 0) {
      setLabels(labels.slice(0, -1));
    }
  };

  async function save() {
    setTried(true);
    if (missingName) return;
    setBusy(true);
    const pending = draft.trim() ? [...labels, draft.trim()] : labels;
    try {
      await onSave({
        projectId,
        name: name.trim(),
        attributes: Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, attributes[k].trim() || null])),
        matchLabels: pending,
        userId,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog className="cd cy-dialog" labelledBy={`${id}-title`} onClose={onCancel} dismissable={!busy}>
      <h3 id={`${id}-title`} className="cd__title">
        {configuration ? t("configurations.editTitle") : t("configurations.newTitle")}
      </h3>
      <p className="cd__msg">{t("configurations.dialogHint")}</p>
      <form
        className="cy-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <FormField
          label={t("configurations.name")}
          required
          issue={tried && missingName ? { severity: "error", code: "required" } : null}
        >
          {(p) => (
            <input
              {...p}
              value={name}
              maxLength={200}
              placeholder={t("configurations.namePlaceholder")}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </FormField>
        <div className="cy-form__grid">
          {ATTRIBUTE_KEYS.map((k) => (
            <FormField key={k} label={t(`configurations.attr.${k}`)}>
              {(p) => (
                <input
                  {...p}
                  value={attributes[k]}
                  maxLength={200}
                  placeholder={t(`configurations.attrPlaceholder.${k}`)}
                  onChange={(e) => setAttributes({ ...attributes, [k]: e.target.value })}
                />
              )}
            </FormField>
          ))}
        </div>
        <FormField label={t("configurations.labels")} hint={t("configurations.labelsHint")}>
          {(p) => (
            <div className="cy-chips">
              {labels.map((l) => (
                <span key={l} className="cy-chip">
                  <span className="cy-chip__text">{l}</span>
                  <button
                    type="button"
                    className="cy-chip__remove"
                    aria-label={t("configurations.removeLabel", { label: l })}
                    onClick={() => setLabels(labels.filter((x) => x !== l))}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </span>
              ))}
              <input
                {...p}
                className="cy-chips__input"
                value={draft}
                maxLength={200}
                placeholder={labels.length ? "" : t("configurations.labelsPlaceholder")}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onLabelKey}
                onBlur={() => addLabel(draft)}
              />
            </div>
          )}
        </FormField>
        {error && (
          <p className="cy-error" role="alert">
            {error}
          </p>
        )}
        <div className="cd__actions">
          <button type="button" className="cd__cancel" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="cd__confirm" disabled={busy}>
            {busy ? t("configurations.saving") : t("configurations.save")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
