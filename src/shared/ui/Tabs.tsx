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
  // The one Tab stop: the selected tab, or the first enabled one when `value`
  // names a disabled or missing tab.
  const stop = enabled.some((i) => i.id === value) ? value : enabled[0]?.id;

  // Arrows move from the focused tab over every tab, so a disabled one can be
  // reached and its reason heard; only an enabled tab is selected.
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const focused = (e.target as HTMLElement).closest<HTMLElement>(
      '[role="tab"]',
    );
    const from = items.findIndex((i) => tabId(i.id, idPrefix) === focused?.id);
    const go = (n: number) => {
      e.preventDefault();
      const next = items[(n + items.length) % items.length];
      if (!next) return;
      if (!next.disabled) onChange(next.id);
      document.getElementById(tabId(next.id, idPrefix))?.focus();
    };
    if (e.key === "ArrowRight") go(from < 0 ? 0 : from + 1);
    else if (e.key === "ArrowLeft") go(from < 0 ? items.length - 1 : from - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
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
        const { badge } = item;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={tabId(item.id, idPrefix)}
            aria-selected={selected}
            aria-controls={selected ? panelId(item.id, idPrefix) : undefined}
            tabIndex={item.id === stop ? 0 : -1}
            // aria-disabled, not disabled: the tab stays focusable, so its
            // reason (`title`, the accessible description) is reachable.
            aria-disabled={item.disabled || undefined}
            title={item.title}
            className="tabs__tab"
            data-testid={`tab-${idPrefix}${item.id}`}
            onClick={() => {
              if (!item.disabled) onChange(item.id);
            }}
          >
            <span className="tabs__label">{item.label}</span>
            {badge && badge.count > 0 && (
              <span
                className="tabs__badge"
                data-tone={badge.tone}
                title={badge.title}
              >
                {/* Read once, with context: the title (which says the count)
                    or «(N)» after the label; the bubble itself is silent. */}
                <span aria-hidden="true">{badge.count}</span>
                <span className="sr-only">
                  {badge.title ? ` · ${badge.title}` : ` (${badge.count})`}
                </span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
