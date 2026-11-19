import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { LoadError } from "@shared/ui/LoadError";
import { StatusPill } from "@shared/ui/StatusPill";
import { libraryApi } from "../api/libraryApi";
import {
  caseHref,
  columnsOfItem,
  rowsOfItem,
  stepsOfItem,
  type LibraryImpact,
  type LibraryItem,
  type LibraryVersion,
} from "../model/types";
import { StepText } from "./StepText";

const statusTone = (s: string) =>
  s === "approved" ? "success" : s === "reviewed" ? "info" : "neutral";

/** «Usado en» (boceto 2): the live cases that use the item, following the
 *  latest version or pinned to one. */
export function UsagePanel({
  item,
  userId,
}: {
  item: LibraryItem;
  userId: string;
}) {
  const { t } = useTranslation();
  const [impact, setImpact] = useState<LibraryImpact | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    libraryApi
      .impact(item.id, userId)
      .then((i) => live && setImpact(i))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [item.id, item.version, userId, attempt]);
  if (failed)
    return (
      <LoadError
        message={t("library.usage.loadFailed")}
        onRetry={() => {
          setFailed(false);
          setAttempt((n) => n + 1);
        }}
      />
    );
  if (!impact) return <p className="lb-muted">{t("common.loading")}</p>;
  if (impact.cases.length === 0)
    return <p className="lb-muted">{t("library.usage.none")}</p>;
  const following = impact.cases.filter((c) => c.follow).length;
  return (
    <div className="lb-usage">
      <dl className="lb-kv">
        <dt>{t("library.usage.following")}</dt>
        <dd>{t("library.casesCount", { count: following })}</dd>
        <dt>{t("library.usage.pinned")}</dt>
        <dd>
          {t("library.casesCount", { count: impact.cases.length - following })}
        </dd>
      </dl>
      <ul className="lb-usage__list" aria-label={t("library.usage.listLabel")}>
        {impact.cases.map((c) => (
          <li key={c.id} className="lb-usage__case">
            <Link
              to={caseHref(item.projectId, c.id)}
              className="lb-usage__link"
            >
              <span className="lb-key">{c.scenarioId}</span> · {c.title}
            </Link>
            <StatusPill tone={statusTone(c.status)}>
              {t(`testCase.statusLabel.${c.status}`, {
                defaultValue: c.status,
              })}
            </StatusPill>
            <span className="lb-muted">
              {c.follow
                ? t("library.ref.follows", { version: c.version })
                : t("library.ref.pinned", { version: c.version })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** «Versiones» (boceto 2): the item's immutable versions, newest first; one
 *  is shown read-only when picked. */
export function VersionsPanel({
  item,
  userId,
  when,
}: {
  item: LibraryItem;
  userId: string;
  when: (s: string) => string;
}) {
  const { t } = useTranslation();
  const [versions, setVersions] = useState<LibraryVersion[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    libraryApi
      .versions(item.id, userId)
      .then(
        (v) =>
          live && setVersions([...v].sort((a, b) => b.version - a.version)),
      )
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [item.id, item.version, userId, attempt]);
  if (failed)
    return (
      <LoadError
        message={t("library.versions.loadFailed")}
        onRetry={() => {
          setFailed(false);
          setAttempt((n) => n + 1);
        }}
      />
    );
  if (!versions) return <p className="lb-muted">{t("common.loading")}</p>;
  if (versions.length === 0)
    return <p className="lb-muted">{t("library.versions.none")}</p>;
  return (
    <ul className="lb-versions" aria-label={t("library.versions.listLabel")}>
      {versions.map((v) => {
        const shown = open === v.id;
        return (
          <li key={v.id} className="lb-versions__item">
            <div className="lb-versions__row">
              <span className="lb-version">v{v.version}</span>
              <span className="lb-versions__name">{v.name}</span>
              <span className="lb-muted">{when(v.createdAt)}</span>
              {v.version === item.version && (
                <span className="lb-muted">
                  {t("library.versions.current")}
                </span>
              )}
              <button
                type="button"
                className="ui-btn ui-btn--small ui-btn--ghost"
                aria-expanded={shown}
                onClick={() => setOpen(shown ? null : v.id)}
              >
                {shown
                  ? t("library.versions.hide")
                  : t("library.versions.show")}
                <span className="sr-only"> v{v.version}</span>
              </button>
            </div>
            {shown && <VersionContent kind={item.kind} version={v} />}
          </li>
        );
      })}
    </ul>
  );
}

function VersionContent({
  kind,
  version,
}: {
  kind: string;
  version: LibraryVersion;
}) {
  const { t } = useTranslation();
  if (kind === "dataset") {
    const cols = columnsOfItem(version.definition);
    const rows = rowsOfItem(version.body);
    return (
      <div className="lb-scroll">
        <table className="lb-readonly-table">
          <caption className="sr-only">
            {t("library.versions.contentOf", { version: version.version })}
          </caption>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.id} scope="col">
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {cols.map((c) => (
                  <td key={c.id}>{r.values[c.id] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <ol
      className="lb-readonly-steps"
      aria-label={t("library.versions.contentOf", { version: version.version })}
    >
      {stepsOfItem(version.body).map((s) => (
        <li key={s.id}>
          <StepText text={s.text} />
          {s.expected && (
            <div className="lb-expected">
              {t("library.step.expectedShort")}: <StepText text={s.expected} />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
