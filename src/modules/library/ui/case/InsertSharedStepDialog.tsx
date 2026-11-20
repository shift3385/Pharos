import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Dialog } from "@shared/ui/Dialog";
import { InfoTip } from "@shared/ui/InfoTip";
import { LoadError } from "@shared/ui/LoadError";
import { libraryApi } from "../../api/libraryApi";
import {
  paramsOfItem,
  stepsOfItem,
  type LibraryItem,
  type SharedRef,
} from "../../model/types";
import { ParamChip, StepText } from "../StepText";

export interface InsertChoice {
  item: LibraryItem;
  args: Record<string, string>;
  list: SharedRef["list"];
}

/** «Insertar paso compartido…» (boceto 4): pick an active shared step of the
 *  project, then give each parameter an argument (empty passes `<name>` on
 *  to the case; a literal is written into the copy; `<other>` renames it)
 *  and the list it goes to. With `editing`, only the arguments of that call
 *  are changed. */
export function InsertSharedStepDialog({
  projectId,
  userId,
  editing,
  onConfirm,
  onClose,
}: {
  projectId: string;
  userId: string;
  editing?: SharedRef;
  onConfirm: (choice: InsertChoice) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<LibraryItem | null>(null);
  const [args, setArgs] = useState<Record<string, string>>(editing?.args ?? {});
  const [list, setList] = useState<SharedRef["list"]>(editing?.list ?? "steps");

  useEffect(() => {
    let live = true;
    const load = editing
      ? libraryApi.get(editing.sharedStepId, userId).then((it) => {
          if (live) setPicked(it);
          return [it];
        })
      : libraryApi.list(projectId, "shared_step", userId);
    load
      .then(
        (l) =>
          live && setItems(l.filter((i) => editing || i.status !== "obsolete")),
      )
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [projectId, userId, editing, attempt]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter(
      (i) =>
        !q ||
        i.name.toLowerCase().includes(q) ||
        stepsOfItem(i.body).some((s) => s.text.toLowerCase().includes(q)),
    );
  }, [items, query]);

  const pick = (item: LibraryItem) => {
    setPicked(item);
    // A parameter's default value only fills its field (ADR-0055 §3).
    const next: Record<string, string> = {};
    for (const p of paramsOfItem(item.definition))
      next[p.name] = editing?.args[p.name] ?? p.default ?? "";
    setArgs(next);
  };

  const params = picked ? paramsOfItem(picked.definition) : [];
  const argsHelp = picked !== null && params.length > 0;
  const title = editing
    ? t("library.insert.editTitle", {
        name: editing.name ?? picked?.name ?? "",
      })
    : picked
      ? t("library.insert.argsTitle", { name: picked.name })
      : t("library.insert.title");

  return (
    <Dialog
      labelledBy={`${id}-title`}
      describedBy={`${id}-msg`}
      onClose={onClose}
      initialFocus={picked ? undefined : searchRef}
      className="cd lb-insert"
    >
      {argsHelp ? (
        // How an argument works is long, secondary help: it sits behind the
        // title's «?» instead of taking the dialog's first lines (FIX-44).
        <div className="ui-title-row">
          <h3 id={`${id}-title`} className="cd__title">
            {title}
          </h3>
          <InfoTip id={`${id}-msg`} label={title}>
            {t("library.insert.argsHelp")}
          </InfoTip>
        </div>
      ) : (
        <>
          <h3 id={`${id}-title`} className="cd__title">
            {title}
          </h3>
          <p id={`${id}-msg`} className="cd__msg">
            {!picked ? t("library.insert.pickHelp") : t("library.insert.noParams")}
          </p>
        </>
      )}
      {failed ? (
        <LoadError
          message={t("library.insert.loadFailed")}
          onRetry={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        />
      ) : !picked ? (
        <>
          <label className="ui-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">{t("library.insert.search")}</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder={t("library.insert.search")}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {items === null ? (
            <p className="lb-muted">{t("common.loading")}</p>
          ) : shown.length === 0 ? (
            <p className="lb-muted">
              {items.length === 0
                ? t("library.insert.none")
                : t("library.noMatch")}
            </p>
          ) : (
            <ul className="lb-pick" aria-label={t("library.tab.steps")}>
              {shown.map((i) => (
                <li key={i.id} className="lb-pick__item">
                  <div className="lb-pick__what">
                    <b>{i.name}</b>
                    <span className="lb-muted">
                      v{i.version} ·{" "}
                      {t("library.stepsCount", {
                        count: stepsOfItem(i.body).length,
                      })}
                    </span>
                    <span className="lb-chips">
                      {paramsOfItem(i.definition).map((p) => (
                        <ParamChip key={p.name} name={p.name} />
                      ))}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="ui-btn ui-btn--small"
                    onClick={() => pick(i)}
                  >
                    {t("library.insert.choose")}
                    <span className="sr-only"> · {i.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <ol className="lb-readonly-steps">
            {stepsOfItem(picked.body).map((s) => (
              <li key={s.id}>
                <StepText text={s.text} />
              </li>
            ))}
          </ol>
          {params.map((p) => (
            <label key={p.name} className="lb-field">
              <span>
                <ParamChip name={p.name} />
              </span>
              <input
                value={args[p.name] ?? ""}
                placeholder={t("library.insert.argPlaceholder")}
                aria-label={t("library.insert.argOf", { name: p.name })}
                onChange={(e) => setArgs({ ...args, [p.name]: e.target.value })}
              />
            </label>
          ))}
          {!editing && (
            <fieldset className="lb-radios">
              <legend>{t("library.insert.list")}</legend>
              <label>
                <input
                  type="radio"
                  name={`${id}-list`}
                  checked={list === "steps"}
                  onChange={() => setList("steps")}
                />
                {t("library.insert.listSteps")}
              </label>
              <label>
                <input
                  type="radio"
                  name={`${id}-list`}
                  checked={list === "preconditions"}
                  onChange={() => setList("preconditions")}
                />
                {t("library.insert.listPreconditions")}
              </label>
            </fieldset>
          )}
        </>
      )}
      <div className="cd__actions">
        {picked && !editing && (
          <button
            type="button"
            className="cd__cancel"
            onClick={() => setPicked(null)}
          >
            {t("library.insert.back")}
          </button>
        )}
        <button type="button" className="cd__cancel" onClick={onClose}>
          {t("common.cancel")}
        </button>
        {picked && (
          <button
            type="button"
            className="cd__confirm"
            onClick={() => onConfirm({ item: picked, args, list })}
          >
            {editing
              ? t("library.insert.saveArgs")
              : t("library.insert.confirm")}
          </button>
        )}
      </div>
    </Dialog>
  );
}
