import { ArrowDownUp, ChevronDown, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MenuItem, MenuLabel, MenuSeparator, ResponsiveMenu } from "./Menu";
import { usePopover } from "./usePopover";
import { useBreakpoint } from "./useBreakpoint";
import "./SortMenu.css";

export type SortDirection = "asc" | "desc";

export interface SortOption<V extends string = string> {
  value: V;
  label: string;
  icon?: LucideIcon;
  /** An order the data cannot give yet; `title` says why (SPEC §4). */
  disabled?: boolean;
  title?: string;
}

/**
 * «Orden: <opción>» button with its menu (SPEC §6/§8, Proyectos): the sort
 * keys as radio options with a ✓, a separator and the direction as a
 * two-option switch (Descendente · Ascendente). A sheet on mobile. Choosing a
 * key keeps the direction; choosing a direction keeps the key.
 */
export function SortMenu<V extends string>({
  options,
  value,
  direction,
  onChange,
  label,
  className = "",
}: {
  options: SortOption<V>[];
  value: V;
  direction: SortDirection;
  onChange: (value: V, direction: SortDirection) => void;
  /** Word before the current option on the trigger (default «Orden»). */
  label?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const breakpoint = useBreakpoint();
  const menu = usePopover(breakpoint === "mobile" ? "dialog" : "menu");
  const current = options.find((o) => o.value === value) ?? options[0];
  const title = t("sortMenu.title");

  return (
    <div className={`sort-menu ${className}`.trim()}>
      <button type="button" className="sort-menu__trigger" {...menu.triggerProps}>
        <ArrowDownUp size={15} aria-hidden="true" className="sort-menu__icon" />
        <span className="sort-menu__current">
          {t("sortMenu.trigger", { label: label ?? t("sortMenu.label"), option: current?.label })}
        </span>
        <ChevronDown size={15} aria-hidden="true" className="sort-menu__icon" />
      </button>
      <ResponsiveMenu
        open={menu.open}
        onClose={menu.close}
        anchorRef={menu.anchorRef}
        id={menu.id}
        label={title}
        title={title}
        placement="bottom-end"
        className="sort-menu__menu"
      >
        {breakpoint !== "mobile" && <MenuLabel>{title}</MenuLabel>}
        {options.map((o) => (
          <MenuItem
            key={o.value}
            icon={o.icon}
            selected={o.value === value}
            disabled={o.disabled}
            title={o.title}
            onSelect={() => onChange(o.value, direction)}
          >
            {o.label}
          </MenuItem>
        ))}
        <MenuSeparator />
        <div className="sort-menu__dir" role="group" aria-label={t("sortMenu.direction")}>
          {(["desc", "asc"] as const).map((d) => (
            <MenuItem key={d} selected={d === direction} onSelect={() => onChange(value, d)}>
              {t(`sortMenu.${d}`)}
            </MenuItem>
          ))}
        </div>
      </ResponsiveMenu>
    </div>
  );
}
