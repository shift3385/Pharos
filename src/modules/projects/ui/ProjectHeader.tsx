import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import {
  HeaderActionsContext,
  useHeaderActionsSlot,
} from "@shared/ui/headerActions";
import { StatusPill } from "@shared/ui/StatusPill";
import { planTone, prefixBadge } from "../model/projectTable";
import "./ProjectHeader.css";

export interface ProjectHeaderInfo {
  name: string;
  caseIdPrefix: string;
  /** Plan status key; null when the project has no plan; undefined while it
   *  is not known yet (no pill, so «Sin plan» never flashes). */
  planStatus?: string | null;
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
  const { actions, slot } = useHeaderActionsSlot();
  return (
    <HeaderActionsContext.Provider value={slot}>
      <ProjectHeader info={info} actions={actions} />
      {children}
    </HeaderActionsContext.Provider>
  );
}

/** The `title` tooltip only while the text is cut with «…» (SPEC §3). */
function useTitleWhenTruncated<T extends HTMLElement>(text: string) {
  const ref = useRef<T>(null);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setCut(el.scrollWidth > el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);
  return { ref, title: cut ? text : undefined };
}

export function ProjectHeader({
  info,
  actions,
}: {
  info: ProjectHeaderInfo;
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  const mobile = useBreakpoint() === "mobile";
  const name = useTitleWhenTruncated<HTMLHeadingElement>(info.name);
  const badge = prefixBadge(info.caseIdPrefix);

  if (mobile) {
    // Without actions only the hidden heading is left: no empty row (gap).
    if (!actions) return <h1 className="sr-only">{info.name}</h1>;
    return (
      <header className="pj-header pj-header--mobile">
        <h1 className="sr-only">{info.name}</h1>
        <div className="pj-header__actions">{actions}</div>
      </header>
    );
  }

  const status =
    info.planStatus === undefined ? undefined : (info.planStatus ?? "none");
  return (
    <header className="pj-header">
      {badge && (
        <span className="pj-header__badge t-id" aria-hidden="true">
          {badge}
        </span>
      )}
      <div className="pj-header__titles">
        <h1
          ref={name.ref}
          className="pj-header__name u-truncate"
          title={name.title}
        >
          {info.name}
        </h1>
        <div className="pj-header__meta">
          {status && (
            <StatusPill
              tone={planTone(info.planStatus ?? null)}
              dot
              strike={status === "obsolete"}
            >
              {t(`projects.header.plan.${status}`)}
            </StatusPill>
          )}
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
