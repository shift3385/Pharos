import { useState } from "react";
import { useTranslation } from "react-i18next";
import { recoveryKeyApi } from "../api/recoveryKeyApi";
import "./RecoveryKeySection.css";

type Step = "idle" | "confirm" | "shown";

/** Exporting the recovery key of the local database (SEC-03, ADR-0024). The
 *  key is asked for only after a confirmation, shown once in a dialog, copied
 *  only on an explicit click and dropped from memory when the dialog closes. */
export function RecoveryKeySection() {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState<Step>("idle");
  const [key, setKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [shownAt, setShownAt] = useState(recoveryKeyApi.lastShownAt);
  const available = recoveryKeyApi.available();

  async function reveal() {
    setFailed(false);
    try {
      setKey(await recoveryKeyApi.reveal());
      setStep("shown");
    } catch {
      setFailed(true);
      setStep("idle");
    }
  }

  async function copy() {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function close() {
    setKey(null);
    setSaved(false);
    setCopied(false);
    setStep("idle");
    setShownAt(recoveryKeyApi.markShown());
  }

  return (
    <section className="recovery" aria-labelledby="recovery-title">
      <h2 id="recovery-title" className="recovery__title">
        {t("recoveryKey.title")}
      </h2>
      <p className="recovery__text">{t("recoveryKey.intro")}</p>
      {shownAt && (
        <p className="recovery__meta">
          {t("recoveryKey.lastShown", {
            date: new Date(shownAt).toLocaleString(i18n.language),
          })}
        </p>
      )}
      {!available && (
        <p className="recovery__meta">{t("recoveryKey.desktopOnly")}</p>
      )}
      {failed && (
        <p className="recovery__error" role="alert">
          {t("recoveryKey.failed")}
        </p>
      )}
      <button
        type="button"
        className="recovery__show"
        disabled={!available}
        onClick={() => setStep("confirm")}
      >
        {t("recoveryKey.show")}
      </button>

      {step === "confirm" && (
        <div
          className="recovery-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recovery-confirm"
        >
          <div className="recovery-dialog">
            <h3 id="recovery-confirm" className="recovery-dialog__title">
              {t("recoveryKey.confirmTitle")}
            </h3>
            <p>{t("recoveryKey.confirmBody")}</p>
            <div className="recovery-dialog__actions">
              <button
                type="button"
                className="recovery-dialog__secondary"
                onClick={() => setStep("idle")}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="recovery-dialog__primary"
                onClick={() => void reveal()}
              >
                {t("recoveryKey.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "shown" && key && (
        <div
          className="recovery-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recovery-shown"
        >
          <div className="recovery-dialog">
            <h3 id="recovery-shown" className="recovery-dialog__title">
              {t("recoveryKey.shownTitle")}
            </h3>
            <ol
              className="recovery-key"
              aria-label={t("recoveryKey.title")}
              data-testid="recovery-key"
            >
              {key.split("-").map((group, i) => (
                <li key={i}>
                  <code>{group}</code>
                </li>
              ))}
            </ol>
            <ul className="recovery-dialog__guidance">
              <li>{t("recoveryKey.guidePaper")}</li>
              <li>{t("recoveryKey.guideManager")}</li>
              <li>{t("recoveryKey.guideRisk")}</li>
              <li>{t("recoveryKey.guideBackup")}</li>
            </ul>
            <button
              type="button"
              className="recovery-dialog__secondary"
              onClick={() => void copy()}
            >
              {copied ? t("recoveryKey.copied") : t("recoveryKey.copy")}
            </button>
            {copied && (
              <p className="recovery__meta">{t("recoveryKey.copiedHint")}</p>
            )}
            <label className="recovery-dialog__check">
              <input
                type="checkbox"
                checked={saved}
                onChange={(e) => setSaved(e.target.checked)}
              />
              {t("recoveryKey.savedCheck")}
            </label>
            <div className="recovery-dialog__actions">
              <button
                type="button"
                className="recovery-dialog__primary"
                disabled={!saved}
                onClick={close}
              >
                {t("recoveryKey.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
