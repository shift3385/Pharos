import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Dialog } from "@shared/ui/Dialog";
import { LoadError } from "@shared/ui/LoadError";
import { libraryApi } from "../../api/libraryApi";
import { columnsOfItem, rowsOfItem, type LibraryItem } from "../../model/types";

/** «Vincular dataset…» (boceto 6): pick an active dataset of the project for
 *  the case's Examples table. */
export function DatasetPickerDialog({
  projectId,
  userId,
  onPick,
  onClose,
}: {
  projectId: string;
  userId: string;
  onPick: (item: LibraryItem) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  useEffect(() => {
    let live = true;
    libraryApi
      .list(projectId, "dataset", userId)
      .then((l) => live && setItems(l.filter((i) => i.status !== "obsolete")))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [projectId, userId, attempt]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((i) => !q || i.name.toLowerCase().includes(q));
  }, [items, query]);
  return (
    <Dialog
      labelledBy={`${id}-title`}
      describedBy={`${id}-msg`}
      onClose={onClose}
      initialFocus={searchRef}
      className="cd lb-insert"
    >
      <h3 id={`${id}-title`} className="cd__title">
        {t("library.bind.title")}
      </h3>
      <p id={`${id}-msg`} className="cd__msg">
        {t("library.bind.help")}
      </p>
      <label className="ui-search">
        <Search size={16} aria-hidden="true" />
        <span className="sr-only">{t("library.bind.search")}</span>
        <input
          ref={searchRef}
          type="search"
          value={query}
          placeholder={t("library.bind.search")}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {failed ? (
        <LoadError
          message={t("library.bind.loadFailed")}
          onRetry={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        />
      ) : items === null ? (
        <p className="lb-muted">{t("common.loading")}</p>
      ) : shown.length === 0 ? (
        <p className="lb-muted">
          {items.length === 0 ? t("library.bind.none") : t("library.noMatch")}
        </p>
      ) : (
        <ul className="lb-pick" aria-label={t("library.tab.datasets")}>
          {shown.map((i) => (
            <li key={i.id} className="lb-pick__item">
              <div className="lb-pick__what">
                <b>{i.name}</b>
                <span className="lb-muted">
                  v{i.version} ·{" "}
                  {t("library.rowsCount", { count: rowsOfItem(i.body).length })}{" "}
                  ·{" "}
                  {columnsOfItem(i.definition)
                    .map((c) => c.name)
                    .join(", ")}
                </span>
              </div>
              <button
                type="button"
                className="ui-btn ui-btn--small"
                onClick={() => onPick(i)}
              >
                {t("library.bind.choose")}
                <span className="sr-only"> · {i.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="cd__actions">
        <button type="button" className="cd__cancel" onClick={onClose}>
          {t("common.cancel")}
        </button>
      </div>
    </Dialog>
  );
}

/** «Elegir filas…»: the dataset's rows the case runs (all, or a subset). */
export function RowsDialog({
  dataset,
  selected,
  onConfirm,
  onClose,
}: {
  dataset: LibraryItem;
  /** Undefined: all rows. */
  selected?: string[];
  onConfirm: (rowIds: string[] | undefined) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const columns = columnsOfItem(dataset.definition);
  const rows = rowsOfItem(dataset.body);
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(selected ?? rows.map((r) => r.id)),
  );
  const toggle = (rowId: string) =>
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  const summary = (values: Record<string, string>) =>
    columns
      .slice(0, 3)
      .map((c) => `${c.name} = ${values[c.id] ?? ""}`)
      .join(" · ");
  return (
    <Dialog
      labelledBy={`${id}-title`}
      describedBy={`${id}-msg`}
      onClose={onClose}
      className="cd lb-insert"
    >
      <h3 id={`${id}-title`} className="cd__title">
        {t("library.rows.title", { name: dataset.name })}
      </h3>
      <p id={`${id}-msg`} className="cd__msg">
        {t("library.rows.help", { count: chosen.size, total: rows.length })}
      </p>
      <fieldset className="lb-rows">
        <legend className="sr-only">{t("library.rows.legend")}</legend>
        {rows.map((r, i) => (
          <label key={r.id} className="lb-rows__item">
            <input
              type="checkbox"
              checked={chosen.has(r.id)}
              onChange={() => toggle(r.id)}
            />
            <span>
              {t("library.rows.row", { n: i + 1 })} · {summary(r.values)}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="cd__actions">
        <button type="button" className="cd__cancel" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="cd__confirm"
          disabled={chosen.size === 0}
          onClick={() =>
            onConfirm(
              chosen.size === rows.length
                ? undefined
                : rows.filter((r) => chosen.has(r.id)).map((r) => r.id),
            )
          }
        >
          {t("library.rows.confirm")}
        </button>
      </div>
    </Dialog>
  );
}
