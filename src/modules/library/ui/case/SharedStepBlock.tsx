import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  libraryLink,
  type LibraryRefStatus,
  type LibraryStep,
  type SharedRef,
} from "../../model/types";
import { StepText } from "../StepText";

export interface BlockActions {
  /** Pin to the current version, or follow the latest again. */
  onToggleFollow: (ref: SharedRef) => void;
  onEditArgs: (ref: SharedRef) => void;
  /** The copy stays as the case's own steps; the call goes. */
  onUnlink: (ref: SharedRef) => void;
  /** «Actualizar» (pinned and outdated) and «Restaurar» (modified). */
  onRefresh: (ref: SharedRef, how: "update" | "restore") => void;
}

/** A call of a shared step inside a case (boceto 4): its copied steps,
 *  read-only, with the name, the version («sigue la última» or «Fijado»),
 *  and what can be done with it. Its steps are edited in the library, or
 *  unlinked to become the case's own. */
export function SharedStepBlock({
  projectId,
  sharedRef,
  steps,
  start,
  status,
  actions,
}: {
  projectId: string;
  sharedRef: SharedRef;
  steps: LibraryStep[];
  /** Number of steps before the block (for the numbering). */
  start: number;
  status?: LibraryRefStatus;
  actions: BlockActions;
}) {
  const { t } = useTranslation();
  const name = sharedRef.name || status?.name || t("library.ref.unnamed");
  const version = sharedRef.version ?? status?.version ?? 0;
  const label = t("library.ref.blockLabel", { name, version });
  return (
    <div
      className="lb-block"
      role="group"
      aria-label={label}
      data-testid="shared-step-block"
    >
      <div className="lb-block__head">
        <span className="lb-tag">{t("library.ref.sharedStep")}</span>
        <b className="lb-block__name">{name}</b>
        <span className="lb-pill-muted">
          {sharedRef.follow
            ? t("library.ref.follows", { version })
            : t("library.ref.pinned", { version })}
        </span>
        <span className="lb-block__actions">
          <Link
            className="ui-btn ui-btn--small ui-btn--ghost"
            to={libraryLink(projectId, "steps", sharedRef.sharedStepId)}
          >
            {t("library.ref.open")}
            <span className="sr-only"> · {name}</span>
          </Link>
          <button
            type="button"
            className="ui-btn ui-btn--small ui-btn--ghost"
            onClick={() => actions.onToggleFollow(sharedRef)}
          >
            {sharedRef.follow
              ? t("library.ref.pin", { version })
              : t("library.ref.follow")}
            <span className="sr-only"> · {name}</span>
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--small ui-btn--ghost"
            onClick={() => actions.onEditArgs(sharedRef)}
          >
            {t("library.ref.editArgs")}
            <span className="sr-only"> · {name}</span>
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--small ui-btn--ghost"
            onClick={() => actions.onUnlink(sharedRef)}
          >
            {t("library.ref.unlink")}
            <span className="sr-only"> · {name}</span>
          </button>
        </span>
      </div>
      {status && status.state !== "ok" && (
        <div className="lb-block__state" data-state={status.state} role="note">
          {status.state === "outdated" && (
            <>
              <span>
                {t("library.ref.outdated", {
                  version: status.latestVersion ?? version,
                })}
              </span>
              <button
                type="button"
                className="ui-btn ui-btn--small"
                onClick={() => actions.onRefresh(sharedRef, "update")}
              >
                {t("library.ref.update")}
              </button>
            </>
          )}
          {status.state === "modified" && (
            <>
              <span>{t("library.ref.modified")}</span>
              <button
                type="button"
                className="ui-btn ui-btn--small"
                onClick={() => actions.onRefresh(sharedRef, "restore")}
              >
                {t("library.ref.restore")}
              </button>
            </>
          )}
          {status.state === "deleted" && (
            <span>{t("library.ref.deleted")}</span>
          )}
          {status.state === "missing" && (
            <span>{t("library.ref.missing")}</span>
          )}
        </div>
      )}
      {steps.length > 0 && (
        <ol className="lb-block__steps" start={start + 1}>
          {steps.map((s) => (
            <li key={s.id} className="lb-block__step">
              <StepText text={s.text} />
              {s.expected && (
                <div className="lb-expected">
                  {t("library.step.expectedShort")}:{" "}
                  <StepText text={s.expected} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
