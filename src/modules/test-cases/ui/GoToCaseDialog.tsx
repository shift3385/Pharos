import { useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Dialog } from "@shared/ui/Dialog";
import { filterCases, EMPTY_FILTERS, type ListedCase } from "../model/caseList";

const MAX = 50;

/**
 * «Ir a un caso… (Ctrl P)» (SPEC §8): a search over the cases of the list
 * (ID, title or requirement) as a combobox: ↑/↓ move, Enter opens, Escape
 * closes. It shows at most 50 matches; typing narrows them.
 */
export function GoToCaseDialog({
  cases,
  currentId,
  onGo,
  onClose,
}: {
  cases: ListedCase[];
  currentId?: string;
  onGo: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const matches = useMemo(() => filterCases(cases, { ...EMPTY_FILTERS, query }).slice(0, MAX), [cases, query]);
  const at = Math.min(active, Math.max(matches.length - 1, 0));

  const go = (c: ListedCase | undefined) => {
    if (!c) return;
    onClose();
    if (c.id !== currentId) onGo(c.id);
  };

  return (
    <Dialog labelledBy={`${id}-title`} onClose={onClose} initialFocus={inputRef} className="cd tc-goto">
      <h3 id={`${id}-title`} className="cd__title">
        {t("testCase.nav.goToTitle")}
      </h3>
      <div className="tc-goto__field">
        <Search size={16} aria-hidden="true" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded="true"
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={matches[at] ? `${id}-opt-${matches[at].id}` : undefined}
          aria-label={t("testCase.nav.goToTitle")}
          placeholder={t("testCase.list.search")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive(Math.min(at + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive(Math.max(at - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(matches[at]);
            }
          }}
        />
      </div>
      <ul id={`${id}-list`} role="listbox" aria-label={t("testCase.title")} className="tc-goto__list">
        {matches.map((c, i) => (
          <li
            key={c.id}
            id={`${id}-opt-${c.id}`}
            role="option"
            aria-selected={i === at}
            className="tc-goto__opt"
            data-current={c.id === currentId || undefined}
            onMouseEnter={() => setActive(i)}
            onClick={() => go(c)}
          >
            <span className="cl-id">{c.scenarioId}</span>
            <span className="tc-goto__title">{c.title}</span>
          </li>
        ))}
      </ul>
      {matches.length === 0 && <p className="tc-goto__none">{t("testCase.list.noMatch")}</p>}
      <p className="tc-goto__hint">{t("testCase.nav.goToHint")}</p>
    </Dialog>
  );
}
