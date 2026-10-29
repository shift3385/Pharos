import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Logo } from "@shared/ui/Logo";
import {
  INVALID_RECOVERY_KEY,
  KEY_MISMATCH_ERROR,
  NEWER_DB_ERROR,
  WRONG_RECOVERY_KEY,
  isKeyError,
  recoverDb,
} from "./dbStatus";
import "./AppSplash.css";

/** Full-screen, blocking explanation shown instead of the app when the local
 *  database could not be opened (SEC-06). The file is never modified here.
 *  When the key is missing or wrong, the recovery key opens it (SEC-03). */
export function DbErrorScreen({
  error,
  onRecovered,
}: {
  error: string;
  onRecovered?: () => void;
}) {
  const { t } = useTranslation();
  const newer = error.startsWith(NEWER_DB_ERROR);
  const keyError = isKeyError(error);
  const [title, body] = newer
    ? ["dbError.newerTitle", "dbError.newerBody"]
    : keyError
      ? error.startsWith(KEY_MISMATCH_ERROR)
        ? ["dbError.keyMismatchTitle", "dbError.keyBody"]
        : ["dbError.keyMissingTitle", "dbError.keyBody"]
      : ["dbError.title", "dbError.body"];
  return (
    <div className="app-splash" role="alert" data-testid="db-error">
      <Logo size={48} />
      <h1 className="app-splash__title">{t(title)}</h1>
      <p className="app-splash__text">{t(body)}</p>
      {keyError && onRecovered && <RecoveryForm onRecovered={onRecovered} />}
      <code className="app-splash__detail">{error}</code>
    </div>
  );
}

/** Entering the recovery key. The typed key stays in this form only: it is
 *  sent to `db_recover` and never logged or shown in an error. */
function RecoveryForm({ onRecovered }: { onRecovered: () => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure(null);
    try {
      await recoverDb(value);
      setValue("");
      onRecovered();
    } catch (e) {
      const message = String(e);
      setFailure(
        message.startsWith(INVALID_RECOVERY_KEY)
          ? t("dbError.recovery.invalid")
          : message.startsWith(WRONG_RECOVERY_KEY)
            ? t("dbError.recovery.wrong")
            : message.startsWith(NEWER_DB_ERROR)
              ? t("dbError.newerBody")
              : t("dbError.recovery.failed", { detail: message }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="db-recovery" onSubmit={onSubmit}>
      <label className="db-recovery__label" htmlFor="recovery-key">
        {t("dbError.recovery.label")}
      </label>
      <textarea
        id="recovery-key"
        className="db-recovery__input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="XXXX-XXXX-XXXX-…"
        rows={3}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        required
      />
      <p className="db-recovery__hint">{t("dbError.recovery.hint")}</p>
      {failure && (
        <p className="db-recovery__error" role="status">
          {failure}
        </p>
      )}
      <button
        className="db-recovery__submit"
        type="submit"
        disabled={busy || !value.trim()}
      >
        {busy ? t("dbError.recovery.opening") : t("dbError.recovery.submit")}
      </button>
    </form>
  );
}
