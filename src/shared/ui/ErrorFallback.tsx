import { useState } from "react";
import { useTranslation } from "react-i18next";
import { exportDiagnostics, logClientError } from "@shared/diagnostics";
import { APP_VERSION } from "@shared/version";
import "./ErrorBoundary.css";

type ExportStatus =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; file: string }
  | { kind: "failed" };

/** What `ErrorBoundary` shows instead of a crashed subtree. */
export function ErrorFallback({
  error,
  variant,
  onRetry,
}: {
  error: Error;
  variant: "app" | "page";
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ExportStatus>({ kind: "idle" });

  async function onExport() {
    setStatus({ kind: "busy" });
    try {
      setStatus({ kind: "done", file: await exportDiagnostics() });
    } catch (e) {
      logClientError(e, "diagnostic export");
      setStatus({ kind: "failed" });
    }
  }

  return (
    <div className={`err-boundary err-boundary--${variant}`} role="alert">
      <div className="err-boundary__card">
        <h1 className="err-boundary__title">{t("errorBoundary.title")}</h1>
        <p className="err-boundary__message">{t("errorBoundary.message")}</p>
        <div className="err-boundary__actions">
          <button
            type="button"
            className="err-boundary__primary"
            onClick={onRetry}
          >
            {t("errorBoundary.retry")}
          </button>
          <button
            type="button"
            className="err-boundary__btn"
            onClick={() => window.location.reload()}
          >
            {t("errorBoundary.reload")}
          </button>
          <button
            type="button"
            className="err-boundary__btn"
            onClick={() => void onExport()}
            disabled={status.kind === "busy"}
          >
            {status.kind === "busy"
              ? t("diagnostics.exporting")
              : t("diagnostics.export")}
          </button>
        </div>
        {status.kind === "done" && (
          <p className="err-boundary__status">
            {t("diagnostics.exported", { file: status.file })}
          </p>
        )}
        {status.kind === "failed" && (
          <p className="err-boundary__status err-boundary__status--error">
            {t("diagnostics.failed")}
          </p>
        )}
        <details className="err-boundary__details">
          <summary>{t("errorBoundary.details")}</summary>
          <pre>{`${error.name}: ${error.message}`}</pre>
        </details>
        <p className="err-boundary__version">
          {t("app.version", { version: APP_VERSION })}
        </p>
      </div>
    </div>
  );
}
