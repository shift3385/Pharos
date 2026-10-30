import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Plus, Search } from "lucide-react";
import { MORE_TOOL_GROUPS, MORE_TOOLS, TOOL_NAMES, TOP_TOOLS, toolName } from "../../model/catalogs";

/** Case- and accent-insensitive match for the tool search. */
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Step 10 (RED-V2): the ten most used tools, «Más herramientas (65)» with a
 * search over the rest of the catalog by category, and a free field for a
 * tool that is not listed (marked «Propia»). Stores catalog keys and own
 * names as typed.
 */
export function ToolsStep({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const customId = useId();
  const panelId = useId();
  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key]);
  // Picked from «Más herramientas» or typed: shown next to the ten.
  const extra = value.filter((v) => !TOP_TOOLS.includes(v));
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    // A typed catalog name selects that entry.
    const key = Object.keys(TOOL_NAMES).find((k) => TOOL_NAMES[k].toLowerCase() === v.toLowerCase()) ?? v;
    if (!value.some((x) => x.toLowerCase() === key.toLowerCase())) onChange([...value, key]);
    setDraft("");
  };
  const groups = MORE_TOOL_GROUPS.map((g) => ({
    ...g,
    tools: g.tools.filter((k) => !query.trim() || fold(TOOL_NAMES[k]).includes(fold(query.trim()))),
  })).filter((g) => g.tools.length > 0);

  const pill = (key: string, own = false) => (
    <button
      key={key}
      type="button"
      className="tp-pill"
      data-active={value.includes(key)}
      aria-pressed={value.includes(key)}
      onClick={() => toggle(key)}
    >
      {toolName(key)}
      {own && <span className="tpw-own">{t("testPlan.toolsPicker.own")}</span>}
    </button>
  );

  return (
    <div className="tpw-tools">
      <div className="tpw-tools__head">
        <span className="tp-field__grouplabel">{t("testPlan.tools")}</span>
        <span className="tpw-count" aria-live="polite">
          {t("testPlan.toolsPicker.selected", { count: value.length })}
        </span>
      </div>
      <div role="group" aria-label={t("testPlan.toolsPicker.top")} className="tpw-tools__block">
        <p className="tpw-group-title">{t("testPlan.toolsPicker.top")}</p>
        <div className="tp-pills">
          {TOP_TOOLS.map((k) => pill(k))}
          {extra.map((k) => pill(k, !MORE_TOOLS.includes(k)))}
        </div>
      </div>
      <button
        type="button"
        className="tpw-link"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        {open ? t("testPlan.toolsPicker.less") : t("testPlan.toolsPicker.more", { count: MORE_TOOLS.length })}
      </button>
      {open && (
        <div id={panelId} className="tpw-tools__more">
          <label className="tpw-search">
            <Search size={15} aria-hidden="true" />
            <span className="sr-only">{t("testPlan.toolsPicker.search", { count: MORE_TOOLS.length })}</span>
            <input
              type="search"
              value={query}
              placeholder={t("testPlan.toolsPicker.search", { count: MORE_TOOLS.length })}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {groups.length === 0 ? (
            <p className="tpw-hint">{t("testPlan.toolsPicker.noMatch", { query: query.trim() })}</p>
          ) : (
            groups.map((g) => (
              <div key={g.id} role="group" aria-label={t(`testPlan.toolCategory.${g.id}`)}>
                <p className="tpw-group-title">{t(`testPlan.toolCategory.${g.id}`)}</p>
                <div className="tp-pills">{g.tools.map((k) => pill(k))}</div>
              </div>
            ))
          )}
        </div>
      )}
      <div className="tpw-other">
        <label htmlFor={customId} className="tpw-other__label">
          {t("testPlan.toolsPicker.notListed")}
        </label>
        <div className="tpw-other__row">
          <input
            id={customId}
            className="tpw-input"
            value={draft}
            placeholder={t("testPlan.toolsPicker.customPlaceholder")}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" className="header-action" onClick={add}>
            <Plus size={16} aria-hidden="true" />
            {t("testPlan.toolsPicker.add")}
          </button>
        </div>
      </div>
    </div>
  );
}
