import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown } from "lucide-react";
import { Popover } from "@shared/ui/Popover";

/**
 * The model of a provider (ADR-0033): a free text field that, once «Listar
 * modelos» has found some, also opens the list. It opens with every model, even
 * with one already written, and typing searches them. The text stays free: a
 * compatible endpoint may offer a model that it does not list.
 * The field keeps the focus: ↑/↓ move, Enter chooses, Escape and Tab close.
 */
export function ModelCombobox({
  id,
  value,
  onChange,
  options,
  open,
  onOpenChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Only what is typed with the list in use filters it, never the saved model.
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = `${id}-list`;
  const hasOptions = options.length > 0;
  const isOpen = open && hasOptions;

  const shown = useMemo(() => {
    const query = value.trim().toLowerCase();
    return searching && query ? options.filter((o) => o.toLowerCase().includes(query)) : options;
  }, [options, searching, value]);

  // On opening, by any way, the field has the focus and the current model is marked.
  useEffect(() => {
    if (!isOpen) return;
    // Without scrolling: a scroll outside the panel closes it (Popover).
    inputRef.current?.focus({ preventScroll: true });
    setActive(searching ? -1 : options.indexOf(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && active >= 0) document.getElementById(`${id}-opt-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [active, id, isOpen]);

  function close() {
    setSearching(false);
    setActive(-1);
    onOpenChange(false);
  }

  function choose(option: string) {
    onChange(option);
    close();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!hasOptions) return;
      e.preventDefault();
      if (!isOpen) onOpenChange(true);
      else setActive((a) => (e.key === "ArrowDown" ? Math.min(a + 1, shown.length - 1) : Math.max(a - 1, 0)));
    } else if (e.key === "Enter" && isOpen) {
      e.preventDefault();
      if (shown[active] !== undefined) choose(shown[active]);
      else close();
    } else if (e.key === "Tab" && isOpen) {
      close();
    }
  }

  return (
    <div ref={anchorRef} className="adm-input--with-btn ai-combo">
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={isOpen && shown[active] !== undefined ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setSearching(true);
          setActive(-1);
          if (hasOptions) onOpenChange(true);
        }}
        onClick={() => {
          if (hasOptions) onOpenChange(true);
        }}
        onKeyDown={onKeyDown}
      />
      {hasOptions && (
        <button
          type="button"
          tabIndex={-1}
          className="adm-icon-btn"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listId : undefined}
          aria-label={t(isOpen ? "ai.modelsHide" : "ai.modelsShow")}
          title={t(isOpen ? "ai.modelsHide" : "ai.modelsShow")}
          // The field keeps the focus, ready to search.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (isOpen) return close();
            onOpenChange(true);
            inputRef.current?.select();
          }}
        >
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      )}
      <Popover open={isOpen} onClose={close} anchorRef={anchorRef} className="ai-combo__panel">
        <ul
          id={listId}
          role="listbox"
          aria-label={t("ai.model")}
          className="ai-combo__list"
          style={{ width: anchorRef.current?.offsetWidth }}
        >
          {shown.map((option, i) => (
            <li
              key={option}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={option === value}
              className="menu__item"
              data-active={i === active || undefined}
              data-selected={option === value || undefined}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(option)}
            >
              <span className="menu__text">{option}</span>
              {option === value && <Check size={15} className="menu__check" aria-hidden="true" />}
            </li>
          ))}
        </ul>
        {shown.length === 0 && <p className="adm-hint ai-combo__none">{t("ai.modelsNoMatch")}</p>}
      </Popover>
    </div>
  );
}
