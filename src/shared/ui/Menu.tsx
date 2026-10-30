import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Check, X, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Popover, type PopoverPlacement } from "./Popover";
import { Dialog } from "./Dialog";
import { useBreakpoint } from "./useBreakpoint";
import "./popover.css";

interface MenuContextValue {
  close: () => void;
  /** "menu" items are `menuitem`s; "sheet" items are plain buttons in a dialog. */
  kind: "menu" | "sheet";
}
const MenuContext = createContext<MenuContextValue>({ close: () => {}, kind: "menu" });

const ITEM = "[data-menu-item]:not([disabled])";

function items(root: HTMLElement | null): HTMLElement[] {
  return root ? Array.from(root.querySelectorAll<HTMLElement>(ITEM)) : [];
}

/** Arrow keys move through the items (looping), Home/End jump to the ends and
 *  Tab closes the menu (SPEC §10). */
function onMenuKeyDown(e: KeyboardEvent<HTMLElement>, close: () => void) {
  const list = items(e.currentTarget);
  if (list.length === 0) return;
  const at = list.indexOf(document.activeElement as HTMLElement);
  const go = (i: number) => {
    e.preventDefault();
    list[(i + list.length) % list.length].focus();
  };
  if (e.key === "ArrowDown") go(at + 1);
  else if (e.key === "ArrowUp") go(at < 0 ? list.length - 1 : at - 1);
  else if (e.key === "Home") go(0);
  else if (e.key === "End") go(list.length - 1);
  else if (e.key === "Tab") close();
}

/**
 * Dropdown menu (SPEC §6/§10) on top of `Popover`: `role="menu"`, the focus
 * starts on the selected item (or the first) and the arrow keys move it;
 * choosing an item closes the menu. Pair it with `usePopover()` for the
 * trigger. Items are `MenuItem`, `MenuLabel` and `MenuSeparator`.
 */
export function Menu({
  open,
  onClose,
  anchorRef,
  id,
  label,
  placement,
  className = "",
  header,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  id?: string;
  label: string;
  placement?: PopoverPlacement;
  className?: string;
  /** Non-item content above the items (e.g. the user's name and email). */
  header?: ReactNode;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const list = items(panelRef.current);
    (list.find((el) => el.getAttribute("aria-checked") === "true") ?? list[0])?.focus();
  }, [open]);

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      placement={placement}
      id={id}
      className={`menu ${className}`.trim()}
      panelRef={panelRef}
      onKeyDown={(e) => onMenuKeyDown(e, onClose)}
    >
      {header}
      <div role="menu" aria-label={label} className="menu__list">
        <MenuContext.Provider value={{ close: onClose, kind: "menu" }}>
          {children}
        </MenuContext.Provider>
      </div>
    </Popover>
  );
}

/** One option. `selected` (true/false) makes it a radio option with a ✓;
 *  `tone="danger"` colours destructive entries (e.g. «Cerrar sesión»). A
 *  disabled option keeps a `title` that explains why (SPEC §4). */
export function MenuItem({
  icon: Icon,
  onSelect,
  selected,
  disabled,
  title,
  tone,
  testId,
  children,
}: {
  icon?: LucideIcon;
  onSelect: () => void;
  selected?: boolean;
  disabled?: boolean;
  title?: string;
  tone?: "danger";
  testId?: string;
  children: ReactNode;
}) {
  const { close, kind } = useContext(MenuContext);
  const radio = selected !== undefined;
  const role = kind === "menu" ? (radio ? "menuitemradio" : "menuitem") : undefined;
  return (
    <button
      type="button"
      role={role}
      aria-checked={kind === "menu" && radio ? selected : undefined}
      aria-pressed={kind === "sheet" && radio ? selected : undefined}
      data-menu-item=""
      data-selected={selected || undefined}
      data-tone={tone}
      data-testid={testId}
      className={`menu__item${kind === "sheet" ? " menu__item--sheet" : ""}`}
      tabIndex={kind === "menu" ? -1 : undefined}
      disabled={disabled}
      title={title}
      onClick={() => {
        close();
        onSelect();
      }}
    >
      {Icon && <Icon className="menu__icon" size={16} aria-hidden="true" />}
      <span className="menu__text">{children}</span>
      {selected && <Check className="menu__check" size={16} aria-hidden="true" />}
    </button>
  );
}

/** A group title inside a menu (e.g. «Idioma»). */
export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="menu__label" role="presentation">
      {children}
    </div>
  );
}

export function MenuSeparator() {
  return <div className="menu__sep" role="separator" />;
}

/**
 * Mobile bottom sheet (SPEC §6): handle, title, ✕ button and options of at
 * least 46 px. It is a modal dialog (focus trapped, Escape closes); a tap on
 * the backdrop or the ✕ closes it; choosing an option closes it.
 */
export function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <Dialog
      labelledBy={titleId}
      onClose={onClose}
      className="bs"
      overlayClassName="bs-overlay"
    >
      <span className="bs__handle" aria-hidden="true" />
      <div className="bs__head">
        <h2 id={titleId} className="bs__title">
          {title}
        </h2>
        <button
          type="button"
          className="bs__close"
          aria-label={t("common.close")}
          title={t("common.close")}
          onClick={onClose}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="bs__body">
        <MenuContext.Provider value={{ close: onClose, kind: "sheet" }}>
          {children}
        </MenuContext.Provider>
      </div>
    </Dialog>
  );
}

/** A `Menu` on tablet and desktop and a `BottomSheet` on mobile, with the same
 *  `MenuItem` children, so screens never branch on the breakpoint themselves. */
export function ResponsiveMenu({
  title,
  ...menu
}: Parameters<typeof Menu>[0] & { title: string }) {
  const breakpoint = useBreakpoint();
  if (breakpoint !== "mobile") return <Menu {...menu} />;
  if (!menu.open) return null;
  return (
    <BottomSheet title={title} onClose={menu.onClose}>
      {menu.header}
      {menu.children}
    </BottomSheet>
  );
}
