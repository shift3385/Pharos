import type { KeyboardEvent, ReactNode } from "react";
import { panelId, tabId, tabPanelProps } from "./tabPanel";
import "./controls.css";

export interface TabItem {
  id: string;
  label: string;
  /** Count bubble (SPEC §8 «Inicio · móvil»): red = problems, navy = pending;
   *  muted is a plain counter (underline tabs). `title` explains it. */
  badge?: { count: number; tone: "danger" | "navy" | "muted"; title?: string };
  disabled?: boolean;
  title?: string;
}

/** A panel element wired to its tab. */
export function TabPanel({
  id,
  idPrefix,
  className,
  children,
}: {
  id: string;
  idPrefix?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className} {...tabPanelProps(id, idPrefix)}>
      {children}
    </div>
  );
}

/**
 * Tabs (WAI-ARIA tabs pattern, SPEC §10): `tablist` named by `label`, one
 * Tab stop on the current tab, arrows/Home/End move and select (automatic
 * activation), disabled tabs are skipped and keep a `title` with the reason.
 * `segmented` is the pill track of the mobile Home; `underline` is the strip
 * above a list. Render each panel with `TabPanel`, or spread `tabPanelProps(id)` from
 * `./tabPanel` on your own element.
 */
export function Tabs({
  label,
  items,
  value,
  onChange,
  variant = "segmented",
  idPrefix = "",
  className = "",
}: {
  label: string;
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  variant?: "segmented" | "underline";
  /** Keeps the tab/panel ids unique when a page has two tab sets. */
  idPrefix?: string;
  className?: string;
}) {
  const enabled = items.filter((i) => !i.disabled);

  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = enabled.findIndex((i) => i.id === value);
    const go = (n: number) => {
      e.preventDefault();
      const next = enabled[(n + enabled.length) % enabled.length];
      if (!next) return;
      onChange(next.id);
      document.getElementById(tabId(next.id, idPrefix))?.focus();
    };
    if (e.key === "ArrowRight") go(at + 1);
    else if (e.key === "ArrowLeft") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(enabled.length - 1);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={`tabs tabs--${variant} ${className}`.trim()}
      onKeyDown={move}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={tabId(item.id, idPrefix)}
            aria-selected={selected}
            aria-controls={selected ? panelId(item.id, idPrefix) : undefined}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            title={item.title}
            className="tabs__tab"
            data-testid={`tab-${item.id}`}
            onClick={() => onChange(item.id)}
          >
            <span className="tabs__label">{item.label}</span>
            {item.badge && item.badge.count > 0 && (
              <span className="tabs__badge" data-tone={item.badge.tone} title={item.badge.title}>
                {item.badge.count}
                {item.badge.title && <span className="sr-only"> · {item.badge.title}</span>}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
