import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Download } from "lucide-react";
import { Alert } from "@shared/ui/Alert";
import { saveFile } from "@shared/export/saveFile";
import { todayIso } from "@shared/time/isoDay";
import { notify } from "@shared/ui/notify";
import "./RecoveryCodesPanel.css";

/** The account's recovery codes, shown once (SEC-08, ADR-0045): at sign-up
 *  and when the user generates new ones. Copy and the .txt are explicit
 *  actions; «Continuar» needs the user to say the codes are saved. The codes
 *  live only in the caller's state and are dropped on `onDone`. */
export function RecoveryCodesPanel({
  codes,
  email,
  doneLabel,
  onDone,
  busy = false,
}: {
  codes: string[];
  email: string;
  doneLabel: string;
  onDone: () => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  const checkId = useId();

  const asText = () =>
    [
      t("recoveryCodes.fileTitle"),
      t("recoveryCodes.fileAccount", { email }),
      t("recoveryCodes.fileDate", {
        date: todayIso(),
      }),
      "",
      ...codes.map((c, i) => `${String(i + 1).padStart(2, "0")}  ${c}`),
      "",
      t("recoveryCodes.fileNote"),
    ].join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      notify(t("recoveryCodes.copied"), "success");
    } catch {
      notify(t("recoveryCodes.copyFailed"), "error");
    }
  }

  async function download() {
    try {
      await saveFile("pharos-recovery-codes.txt", asText(), "text/plain");
    } catch {
      // saveFile already told the user.
    }
  }

  return (
    <div className="recovery-codes">
      <p className="recovery-codes__intro">{t("recoveryCodes.intro")}</p>
      <ol
        className="recovery-codes__list"
        aria-label={t("recoveryCodes.listLabel")}
        data-testid="recovery-codes"
      >
        {codes.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ol>
      <div className="recovery-codes__actions">
        <button
          type="button"
          className="recovery-codes__btn"
          onClick={() => void copy()}
        >
          <Copy size={15} aria-hidden="true" />
          {t("recoveryCodes.copy")}
        </button>
        <button
          type="button"
          className="recovery-codes__btn"
          onClick={() => void download()}
        >
          <Download size={15} aria-hidden="true" />
          {t("recoveryCodes.download")}
        </button>
      </div>
      <Alert kind="info" role="note">
        {t("recoveryCodes.keepSafe")}
      </Alert>
      <label className="recovery-codes__check" htmlFor={checkId}>
        <input
          id={checkId}
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        {t("recoveryCodes.saved")}
      </label>
      <button
        type="button"
        className="recovery-codes__done"
        disabled={!saved || busy}
        onClick={onDone}
      >
        {doneLabel}
      </button>
    </div>
  );
}
