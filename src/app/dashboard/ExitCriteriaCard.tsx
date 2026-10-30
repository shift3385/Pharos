import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight, CalendarClock, ChevronDown, Search } from "lucide-react";
import { projectPath } from "@modules/projects";
import { MenuItem, MenuLabel, ResponsiveMenu } from "@shared/ui/Menu";
import { usePopover } from "@shared/ui/usePopover";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import {
  exitCriteriaChoices,
  shortDate,
  type HomeProject,
} from "./model/homeData";

/** «Criterios de salida» (SPEC §8): the closing date and the criteria of the
 *  chosen project's plan, real today; whether each one is met needs runs
 *  (RED-W6), so the ring and every criterion say «Sin datos». The picker
 *  searches, filters and sorts by closing date (SPEC §6 long lists). */
export function ExitCriteriaCard({
  projects,
  selected,
  onSelect,
}: {
  projects: HomeProject[];
  selected: HomeProject | null;
  onSelect: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;

  return (
    <section className="home-card home-exit" aria-labelledby="home-exit-title">
      <div className="home-card__head home-card__head--nowrap">
        <div className="home-card__titles">
          <h2 id="home-exit-title" className="home-card__title">
            {t("dashboard.exit.title")}
          </h2>
          <p className="home-card__sub">{t("dashboard.exit.subtitle")}</p>
        </div>
        {selected && (
          <ExitProjectPicker
            projects={projects}
            selected={selected}
            onSelect={onSelect}
          />
        )}
      </div>

      {!selected ? (
        <p className="home-empty">{t("dashboard.exit.empty")}</p>
      ) : (
        <>
          <div className="home-exit__summary">
            <div
              className="home-ring"
              role="img"
              aria-label={t("dashboard.exit.ringLabel")}
            >
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r="42" />
              </svg>
              <span className="home-ring__text" aria-hidden="true">
                <span className="home-ring__value">—</span>
                <span className="home-ring__label">
                  {t("dashboard.exit.executed")}
                </span>
              </span>
            </div>
            <div className="home-exit__text">
              <span className="home-exit__headline">
                {t("dashboard.exit.headline")}
              </span>
              <span>{t("dashboard.exit.sub")}</span>
              <span className="home-exit__date">
                <CalendarClock size={14} aria-hidden="true" />
                {selected.closeDate
                  ? t("dashboard.exit.close", {
                      date: shortDate(selected.closeDate, lang),
                    })
                  : t("dashboard.exit.noDate")}
              </span>
            </div>
          </div>

          {!selected.hasPlan || selected.criteria.length === 0 ? (
            <p className="home-empty home-empty--left">
              {selected.hasPlan
                ? t("dashboard.exit.noCriteria")
                : t("dashboard.exit.noPlan")}{" "}
              <Link to={projectPath(selected.id, "plan")} className="home-link">
                {t("dashboard.exit.openPlan")}
              </Link>
            </p>
          ) : (
            <ul className="home-exit__criteria" data-testid="home-criteria">
              {selected.criteria.map((c, i) => (
                <li key={i}>
                  <span className="home-exit__criterion">{c.criterion}</span>
                  {c.metric && (
                    <span className="home-exit__metric t-id">{c.metric}</span>
                  )}
                  <span className="home-pill" data-tone="neutral">
                    {t("dashboard.exit.noData")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function ExitProjectPicker({
  projects,
  selected,
  onSelect,
}: {
  projects: HomeProject[];
  selected: HomeProject;
  onSelect: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const menu = usePopover(useBreakpoint() === "mobile" ? "dialog" : "menu");
  const [query, setQuery] = useState("");
  const choices = exitCriteriaChoices(projects, query);
  const soon = t("dashboard.exit.filterSoon");
  const close = () => {
    menu.close();
    setQuery("");
  };

  return (
    <>
      <button
        type="button"
        className="home-picker"
        {...menu.triggerProps}
        title={t("dashboard.exit.choose")}
        data-testid="exit-picker"
      >
        <span className="sr-only">{t("dashboard.exit.choose")}: </span>
        {selected.key && (
          <span className="home-picker__key t-id">{selected.key}</span>
        )}
        <span className="home-picker__name u-truncate">{selected.name}</span>
        <ChevronDown
          size={12}
          className="home-picker__chev"
          aria-hidden="true"
        />
      </button>
      <ResponsiveMenu
        open={menu.open}
        onClose={close}
        anchorRef={menu.anchorRef}
        id={menu.id}
        label={t("dashboard.exit.menuLabel")}
        title={t("dashboard.exit.choose")}
        placement="bottom-end"
        className="home-picker-menu"
        focusHeader
        header={
          <div className="home-picker__head">
            <label className="home-search">
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">{t("dashboard.exit.searchLabel")}</span>
              <input
                type="search"
                value={query}
                placeholder={t("dashboard.exit.search", {
                  count: projects.length,
                })}
                onChange={(e) => setQuery(e.target.value)}
                data-testid="exit-search"
              />
            </label>
            {/* «En riesgo» and «Cumplen» need run results (RED-W6). */}
            <div
              className="home-chips"
              role="group"
              aria-label={t("dashboard.exit.filters")}
            >
              <button type="button" className="home-chip" aria-pressed="true">
                {t("dashboard.exit.all")}
                <span className="home-chip__count">{projects.length}</span>
              </button>
              <button
                type="button"
                className="home-chip"
                aria-pressed="false"
                disabled
                title={soon}
              >
                {t("dashboard.exit.risk")}
              </button>
              <button
                type="button"
                className="home-chip"
                aria-pressed="false"
                disabled
                title={soon}
              >
                {t("dashboard.exit.ok")}
              </button>
            </div>
            {/* In the header: a menu may only hold menu items. */}
            <p className="home-picker__none" role="status">
              {choices.length === 0
                ? t("dashboard.exit.noMatch", { query: query.trim() })
                : ""}
            </p>
          </div>
        }
      >
        <MenuLabel>{t("dashboard.exit.byClose")}</MenuLabel>
        <div className="home-picker__list">
          {choices.map((p) => (
            <MenuItem
              key={p.id}
              selected={p.id === selected.id}
              testId={`exit-choice-${p.id}`}
              onSelect={() => {
                onSelect(p.id);
                setQuery("");
              }}
            >
              <span className="home-choice">
                <span className="home-choice__key t-id">{p.key}</span>
                <span className="home-choice__main">
                  <span className="home-choice__name u-truncate">{p.name}</span>
                  <span className="home-choice__close">
                    {p.closeDate
                      ? t("dashboard.exit.closes", {
                          date: shortDate(p.closeDate, i18n.resolvedLanguage),
                        })
                      : t("dashboard.exit.noDate")}
                  </span>
                </span>
              </span>
            </MenuItem>
          ))}
        </div>
        <MenuItem icon={ArrowRight} onSelect={() => navigate("/projects")}>
          {t("dashboard.exit.viewAll", { count: projects.length })}
        </MenuItem>
      </ResponsiveMenu>
    </>
  );
}
