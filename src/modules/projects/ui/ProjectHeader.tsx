import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { StatusPill } from "@shared/ui/StatusPill";
import { planTone, prefixBadge } from "../model/projectTable";
import { HeaderActionsContext } from "@shared/ui/headerActions";
import "./ProjectHeader.css";

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
  const badge = prefixBadge(info.caseIdPrefix);

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
          <StatusPill tone={planTone(info.planStatus)} dot strike={status === "obsolete"}>
            {t(`projects.header.plan.${status}`)}
          </StatusPill>
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
