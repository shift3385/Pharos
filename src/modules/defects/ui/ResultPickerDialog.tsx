import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { logClientError } from "@shared/diagnostics";
import { Dialog } from "@shared/ui/Dialog";
import { LoadError } from "@shared/ui/LoadError";
import { StatusPill } from "@shared/ui/StatusPill";
import { defectsApi } from "../api/defectsApi";
import type { ResultCandidate } from "../model/types";

/**
 * Picks a failed attempt of the project's runs (newest first): to create a
 * defect from it, or to link it to one. Desktop only: results live there
 * until the API queries them (INT-02).
 */
export function ResultPickerDialog({
  projectId,
  userId,
  purpose,
  exclude = [],
  onPick,
  onClose,
}: {
  projectId: string;
  userId: string;
  purpose: "create" | "link";
  /** Results already linked. */
  exclude?: string[];
  onPick: (r: ResultCandidate) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<ResultCandidate[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [query, setQuery] = useState("");
  useEffect(() => {
    let live = true;
    defectsApi
      .results(projectId, userId)
      .then((list) => {
        if (live) setResults(list);
      })
      .catch((e: unknown) => {
        if (!live) return;
        logClientError(e, "defect result picker");
        setLoadFailed(true);
      });
    return () => {
      live = false;
    };
  }, [projectId, userId, loadAttempt]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (results ?? [])
      .filter((r) => !exclude.includes(r.resultId))
      .filter((r) => !q || [r.runKey, r.runTitle, r.caseKey ?? "", r.testKey].some((v) => v.toLowerCase().includes(q)));
  }, [results, query, exclude]);
  const when = (s: string) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(s.includes("T") ? s : `${s.replace(" ", "T")}Z`),
    );

  return (
    <Dialog labelledBy={`${id}-title`} describedBy={`${id}-msg`} onClose={onClose} initialFocus={inputRef} className="cd df-picker">
      <h3 id={`${id}-title`} className="cd__title">
        {t("defects.results.title")}
      </h3>
      <p id={`${id}-msg`} className="cd__msg">
        {purpose === "create" ? t("defects.results.pickToCreate") : t("defects.results.pickToLink")}
      </p>
      <label className="ui-search df-picker__search">
        <Search size={16} aria-hidden="true" />
        <span className="sr-only">{t("defects.results.searchLabel")}</span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder={t("defects.results.search")}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {loadFailed ? (
        <LoadError
          message={t("defects.results.loadFailed")}
          onRetry={() => {
            setLoadFailed(false);
            setLoadAttempt((n) => n + 1);
          }}
        />
      ) : results === null ? (
        <p className="df-muted">{t("common.loading")}</p>
      ) : shown.length === 0 ? (
        <p className="df-muted">{t("defects.results.empty")}</p>
      ) : (
        <ul className="df-picker__list" aria-label={t("defects.results.title")}>
          {shown.map((r) => (
            <li key={r.resultId} className="df-picker__item">
              <div className="df-picker__what">
                <span className="df-key">{r.runKey}</span>
                <span className="df-picker__case">{r.caseKey ?? r.testKey}</span>
                <StatusPill tone={r.status === "failed" ? "error" : "warning"} dot>
                  {t(`defects.resultStatus.${r.status}`, { defaultValue: r.status })}
                </StatusPill>
                <span className="df-muted">
                  {t("defects.results.attempt", { n: r.attempt })} · {when(r.createdAt)}
                </span>
              </div>
              <button
                type="button"
                className="ui-btn ui-btn--small"
                onClick={() => onPick(r)}
                aria-label={`${t("defects.results.choose")}: ${r.runKey} ${r.caseKey ?? r.testKey}`}
              >
                {t("defects.results.choose")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="cd__actions">
        <button type="button" className="cd__cancel" onClick={onClose}>
          {t("defects.results.close")}
        </button>
      </div>
    </Dialog>
  );
}
