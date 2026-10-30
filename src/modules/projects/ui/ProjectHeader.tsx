import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { HeaderActionsContext } from "@shared/ui/headerActions";
import "./ProjectHeader.css";

/** Plan status → state colour (SPEC §4: Borrador neutral, Revisado info,
 *  Aprobado success, Obsoleto neutral struck through). */
const PLAN_TONE: Record<string, string> = {
  draft: "neutral",
  reviewed: "info",
  approved: "success",
  obsolete: "neutral",
};

export interface ProjectHeaderInfo {
  name: string;
  caseIdPrefix: string;
  /** Plan status key, or null when the project has no plan yet. */
  planStatus: string | null;
  /** Counts and dates after the status («240 casos · 48 requisitos · …»);
   *  each one is left out while it is unknown. */
  meta: string[];
}

/**
 * The header of every project section (SPEC §7/§8): prefix badge, project
 * name, plan status and meta line, and the section's actions. It replaces the
 * old «← Proyectos <nombre>» bar. On mobile the shell's top bar already shows
 * the section and the project, so the card is not drawn: the name stays as a
 * visually hidden `h1` and only the actions row is shown.
 */
export function ProjectHeaderLayout({
  info,
  children,
}: {
  info: ProjectHeaderInfo;
  /** The section's page. */
  children: ReactNode;
}) {
  const [actions, setActions] = useState<ReactNode>(null);
  return (
    <HeaderActionsContext.Provider value={setActions}>
      <ProjectHeader info={info} actions={actions} />
      {children}
    </HeaderActionsContext.Provider>
  );
}

export function ProjectHeader({ info, actions }: { info: ProjectHeaderInfo; actions?: ReactNode }) {
  const { t } = useTranslation();
  const mobile = useBreakpoint() === "mobile";
  const status = info.planStatus ?? "none";
  // «ATS_» → «ATS»: the badge shows the prefix without its separator.
  const badge = info.caseIdPrefix.replace(/[^\p{L}\p{N}]+$/u, "").slice(0, 4);

  if (mobile) {
    return (
      <header className="pj-header pj-header--mobile">
        <h1 className="sr-only">{info.name}</h1>
        {actions && <div className="pj-header__actions">{actions}</div>}
      </header>
    );
  }

  return (
    <header className="pj-header">
      {badge && (
        <span className="pj-header__badge t-id" aria-hidden="true">
          {badge}
        </span>
      )}
      <div className="pj-header__titles">
        <h1 className="pj-header__name u-truncate" title={info.name}>
          {info.name}
        </h1>
        <div className="pj-header__meta">
          <span
            className="pj-header__status"
            data-tone={PLAN_TONE[status] ?? "neutral"}
            data-strike={status === "obsolete" || undefined}
          >
            <span className="pj-header__dot" aria-hidden="true" />
            {t(`projects.header.plan.${status}`)}
          </span>
          {info.meta.map((m, i) => (
            <span key={i} className="pj-header__meta-item">
              {m}
            </span>
          ))}
        </div>
      </div>
      {actions && <div className="pj-header__actions">{actions}</div>}
    </header>
  );
}
