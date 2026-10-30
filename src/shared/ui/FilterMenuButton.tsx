import type { ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MenuCheckItem, MenuItem, MenuSeparator, ResponsiveMenu } from "./Menu";
import { usePopover } from "./usePopover";
import { useBreakpoint } from "./useBreakpoint";
import "./filters.css";

export interface FilterMenuOption {
  value: string;
  label: string;
  description?: ReactNode;
}

/**
 * A filter button («Prioridad ▾») that opens a menu of check options (a
 * bottom sheet on mobile). Several options can be chosen; the button shows how
 * many are. A filter that cannot be used yet stays focusable with
 * `aria-disabled` and its `disabledReason` as tooltip (SPEC §4).
 */
export function FilterMenuButton({
  label,
  icon: Icon,
  options,
  selected,
  onChange,
  disabled,
  disabledReason,
}: {
  label: string;
  icon?: LucideIcon;
  options: FilterMenuOption[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const { t } = useTranslation();
  const mobile = useBreakpoint() === "mobile";
  const menu = usePopover(mobile ? "dialog" : "menu");
  const count = options.filter((o) => selected.has(o.value)).length;

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  return (
    <>
      <button
        type="button"
        className="fmb"
        data-active={count > 0 || undefined}
        {...menu.triggerProps}
        aria-disabled={disabled || undefined}
        title={disabled ? disabledReason : undefined}
        onClick={() => {
          if (!disabled) menu.setOpen((o) => !o);
        }}
      >
        {Icon && <Icon className="fmb__icon" size={16} aria-hidden="true" />}
        {label}
        {count > 0 && (
          <span className="fmb__count">
            <span className="sr-only">: </span>
            {count}
          </span>
        )}
        <ChevronDown className="fmb__chevron" size={14} aria-hidden="true" />
      </button>
      <ResponsiveMenu
        open={menu.open && !disabled}
        onClose={menu.close}
        anchorRef={menu.anchorRef}
        id={menu.id}
        label={label}
        title={label}
        className="fmb__menu"
      >
        {options.map((o) => (
          <MenuCheckItem
            key={o.value}
            checked={selected.has(o.value)}
            onToggle={() => toggle(o.value)}
            description={o.description}
          >
            {o.label}
          </MenuCheckItem>
        ))}
        {count > 0 && (
          <>
            <MenuSeparator />
            <MenuItem onSelect={() => onChange(new Set())}>{t("table.filter.clear")}</MenuItem>
          </>
        )}
      </ResponsiveMenu>
    </>
  );
}
