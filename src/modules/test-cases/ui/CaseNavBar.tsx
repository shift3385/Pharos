import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronLeft, ChevronRight, CircleDot, CloudCheck, Search } from "lucide-react";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import type { ListedCase } from "../model/caseList";

/** Where the open case sits in the list the user came from (its filters and
 *  order), for «‹ anterior | 142 de 240 | siguiente ›». */
export interface CaseNav {
  /** 1-based. */
  position: number;
  total: number;
  prev?: ListedCase;
  next?: ListedCase;
  /** The list has filters on (shown as «Filtro: activo»). */
  filtered: boolean;
  /** The listed cases, for «Ir a un caso…». */
  cases: ListedCase[];
  onGo: (id: string) => void;
}

export type SaveState = "saved" | "dirty" | "new";

/** The editor's top bar (SPEC §8): back to the list, previous / N de M /
 *  next, «Ir a un caso… Ctrl P», the save state, more actions and «Guardar».
 *  On mobile the walk moves to `CaseNavFooter`. */
export function CaseNavBar({
  nav,
  saveState,
  onBack,
  onGo,
  onGoTo,
  more,
  save,
}: {
  nav?: CaseNav;
  saveState: SaveState;
  onBack: () => void;
  onGo: (id: string) => void;
  onGoTo: () => void;
  more: ReactNode;
  save: ReactNode;
}) {
  const { t } = useTranslation();
  const mobile = useBreakpoint() === "mobile";
  return (
    <div className="tc-nav">
      <button type="button" className="cl-btn cl-btn--ghost tc-nav__back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        <span className="cl-btn__text">{t("testCase.nav.allCases")}</span>
      </button>
      {nav && !mobile && (
        <>
          <span className="tc-nav__sep" aria-hidden="true" />
          <div className="tc-nav__walk" role="group" aria-label={t("testCase.nav.walk")}>
            <button
              type="button"
              className="tc-nav__step"
              disabled={!nav.prev}
              title={t("testCase.nav.prev")}
              onClick={() => nav.prev && onGo(nav.prev.id)}
            >
              <ChevronLeft size={16} aria-hidden="true" />
              <span className="sr-only">{t("testCase.nav.prev")}: </span>
              <span className="tc-nav__key">{nav.prev?.scenarioId ?? "—"}</span>
            </button>
            <span className="tc-nav__pos">{t("testCase.nav.position", { n: nav.position, total: nav.total })}</span>
            <button
              type="button"
              className="tc-nav__step"
              disabled={!nav.next}
              title={t("testCase.nav.next")}
              onClick={() => nav.next && onGo(nav.next.id)}
            >
              <span className="sr-only">{t("testCase.nav.next")}: </span>
              <span className="tc-nav__key">{nav.next?.scenarioId ?? "—"}</span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
          <span className="tc-nav__filter">
            {nav.filtered ? t("testCase.nav.filterOn") : t("testCase.nav.filterAll")}
          </span>
          <button type="button" className="tc-nav__goto" onClick={onGoTo}>
            <Search size={15} aria-hidden="true" />
            <span className="cl-btn__text">{t("testCase.nav.goTo")}</span>
            <kbd className="tc-nav__kbd">{t("testCase.nav.goToShortcut")}</kbd>
          </button>
        </>
      )}
      <span className="tc-nav__spacer" />
      <span className="tc-nav__state" data-state={saveState} role="status">
        {saveState === "saved" ? (
          <CloudCheck size={15} aria-hidden="true" />
        ) : (
          <CircleDot size={15} aria-hidden="true" />
        )}
        <span className="cl-btn__text">{t(`testCase.nav.state.${saveState}`)}</span>
      </span>
      {more}
      {save}
    </div>
  );
}

/** Mobile foot of the editor: «‹ Anterior | 142 de 240 | Siguiente ›». */
export function CaseNavFooter({ nav, onGo }: { nav: CaseNav; onGo: (id: string) => void }) {
  const { t } = useTranslation();
  return (
    <nav className="tc-navfoot" aria-label={t("testCase.nav.walk")}>
      <button
        type="button"
        className="cl-btn"
        disabled={!nav.prev}
        onClick={() => nav.prev && onGo(nav.prev.id)}
      >
        <ChevronLeft size={16} aria-hidden="true" />
        {t("testCase.nav.prevShort")}
      </button>
      <span className="tc-navfoot__pos">{t("testCase.nav.position", { n: nav.position, total: nav.total })}</span>
      <button
        type="button"
        className="cl-btn"
        disabled={!nav.next}
        onClick={() => nav.next && onGo(nav.next.id)}
      >
        {t("testCase.nav.nextShort")}
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
}
