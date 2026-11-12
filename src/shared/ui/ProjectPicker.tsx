import { useState, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { ChevronsUpDown, Search } from "lucide-react";
import { MenuItem, ResponsiveMenu } from "./Menu";
import { useBreakpoint } from "./useBreakpoint";
import { usePopover } from "./usePopover";
import "./projectPicker.css";

export interface ProjectChoice {
  id: string;
  name: string;
  /** The project's key prefix (`BM_`), shown before its name. */
  caseIdPrefix?: string;
  /** A short fact after its name, such as «12 casos» (UX-29). */
  detail?: string;
}

/** The way to choose a project across the app (SPEC §6): a search field fixed on
 *  top and a scrolling list (≈260 px), by name or prefix, with the current one
 *  checked. `footer` adds entries below the list. A bottom sheet on mobile. */
export function ProjectMenu({
  open,
  onClose,
  anchorRef,
  id,
  label,
  projects,
  selectedId,
  onSelect,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  id?: string;
  label: string;
  projects: ProjectChoice[];
  selectedId: string | null | undefined;
  onSelect: (id: string) => void;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const q = query.trim().toLocaleLowerCase();
  const shown = projects.filter(
    (p) => !q || p.name.toLocaleLowerCase().includes(q) || p.caseIdPrefix?.toLocaleLowerCase().includes(q),
  );
  return (
    <ResponsiveMenu
      title={label}
      open={open}
      onClose={() => {
        onClose();
        setQuery("");
      }}
      anchorRef={anchorRef}
      id={id}
      label={label}
      className="project-menu"
      focusHeader
      header={
        <label className="project-menu__search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder={t("shell.searchProjects")}
            aria-label={t("shell.searchProjects")}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      }
    >
      <div className="project-menu__list" role="group" aria-label={t("nav.projects")}>
        {shown.length === 0 && <p className="project-menu__empty">{t("shell.noProjects")}</p>}
        {shown.map((p) => (
          <MenuItem key={p.id} selected={p.id === selectedId} onSelect={() => onSelect(p.id)}>
            {p.caseIdPrefix && <span className="project-menu__prefix t-id">{p.caseIdPrefix}</span>} {p.name}
            {p.detail && <span className="project-menu__detail">{p.detail}</span>}
          </MenuItem>
        ))}
      </div>
      {footer}
    </ResponsiveMenu>
  );
}

/**
 * A form control that chooses a project with `ProjectMenu`, where a screen shows
 * or changes something per project. `label` names it for assistive technology
 * together with the chosen project; give the same text to its visible label.
 */
export function ProjectSelect({
  id,
  label,
  projects,
  value,
  onChange,
  disabled,
  testId,
}: {
  id?: string;
  label: string;
  projects: ProjectChoice[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  testId?: string;
}) {
  const menu = usePopover(useBreakpoint() === "mobile" ? "dialog" : "menu");
  const current = projects.find((p) => p.id === value);
  return (
    <>
      <button
        {...menu.triggerProps}
        type="button"
        id={id}
        className="project-select"
        aria-label={current ? `${label}: ${current.name}` : label}
        title={current?.name}
        disabled={disabled}
        data-testid={testId}
      >
        {current?.caseIdPrefix && <span className="project-menu__prefix t-id">{current.caseIdPrefix}</span>}
        <span className="project-select__name">{current?.name ?? "…"}</span>
        {current?.detail && <span className="project-menu__detail">{current.detail}</span>}
        <ChevronsUpDown size={14} aria-hidden="true" />
      </button>
      <ProjectMenu
        open={menu.open}
        onClose={menu.close}
        anchorRef={menu.anchorRef}
        id={menu.id}
        label={label}
        projects={projects}
        selectedId={value}
        onSelect={onChange}
      />
    </>
  );
}
