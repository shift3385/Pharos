import { useEffect, useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  LayoutTemplate,
  LifeBuoy,
  RefreshCw,
  Shield,
  SlidersHorizontal,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { ADMIN_PANEL_ID, ADMIN_TAB_GROUPS, ADMIN_TABS, adminTabId, type AdminTab } from "../model/tabs";

const ICONS: Record<AdminTab, LucideIcon> = {
  ai: Sparkles,
  templates: LayoutTemplate,
  general: SlidersHorizontal,
  sync: RefreshCw,
  security: Shield,
  diagnostics: LifeBuoy,
};

/**
 * The grouped tabs of Administración (SPEC §8): Recursos · Aplicación ·
 * Cuenta y datos · Soporte, as pills in one strip that scrolls sideways when
 * it does not fit. One `tablist`: ←/→ move through every tab across groups,
 * Inicio/Fin jump to the ends (roving tabindex, automatic activation). Each
 * tab is described by its group's label.
 */
export function AdminTabs({
  current,
  counts,
  onSelect,
}: {
  current: AdminTab;
  counts?: Partial<Record<AdminTab, number>>;
  onSelect: (tab: AdminTab) => void;
}) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the current pill visible in the scrolling strip.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [current]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const at = ADMIN_TABS.indexOf(current);
    const go = (i: number) => {
      e.preventDefault();
      const next = ADMIN_TABS[(i + ADMIN_TABS.length) % ADMIN_TABS.length];
      onSelect(next);
      listRef.current?.querySelector<HTMLElement>(`#${adminTabId(next)}`)?.focus();
    };
    if (e.key === "ArrowRight") go(at + 1);
    else if (e.key === "ArrowLeft") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(ADMIN_TABS.length - 1);
  }

  return (
    <div
      ref={listRef}
      className="adm-tabs"
      role="tablist"
      aria-label={t("admin.tabs.label")}
      onKeyDown={onKeyDown}
    >
      {ADMIN_TAB_GROUPS.map(({ group, tabs }, gi) => (
        <div key={group} className="adm-tabs__group" role="none">
          {gi > 0 && <span className="adm-tabs__sep" role="none" />}
          <span id={`admin-group-${group}`} className="adm-tabs__label t-group-label" aria-hidden="true">
            {t(`admin.groups.${group}`)}
          </span>
          <div className="adm-tabs__row" role="none">
            {tabs.map((tab) => {
              const Icon = ICONS[tab];
              const selected = tab === current;
              const count = counts?.[tab];
              return (
                <button
                  key={tab}
                  id={adminTabId(tab)}
                  type="button"
                  role="tab"
                  className="adm-tab"
                  aria-selected={selected}
                  aria-controls={ADMIN_PANEL_ID}
                  aria-describedby={`admin-group-${group}`}
                  tabIndex={selected ? 0 : -1}
                  data-testid={adminTabId(tab)}
                  onClick={() => onSelect(tab)}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{t(`admin.tabs.${tab}`)}</span>
                  {count != null && <span className="adm-tab__count u-num">{count}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
