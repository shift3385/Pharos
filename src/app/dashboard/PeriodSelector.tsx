import { useTranslation } from "react-i18next";
import {
  Calendar,
  CalendarRange,
  ChevronDown,
  Flag,
  History,
} from "lucide-react";
import {
  MenuItem,
  MenuLabel,
  MenuSeparator,
  ResponsiveMenu,
} from "@shared/ui/Menu";
import { usePopover } from "@shared/ui/usePopover";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { PERIODS, type Period } from "./model/homeData";

/** «Periodo» of the Home (SPEC §8): a menu on tablet/desktop and a bottom sheet
 *  «Periodo de los datos» on mobile. Test cycles and a custom range need the
 *  plan's sprints from a range (wave 5) and the comparison needs runs
 *  (RED-W4): they are shown disabled with the reason in their title. */
export function PeriodSelector({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  const { t } = useTranslation();
  const menu = usePopover(useBreakpoint() === "mobile" ? "dialog" : "menu");
  const soon = t("dashboard.period.soonTitle");

  return (
    <>
      <button
        type="button"
        className="home-btn"
        {...menu.triggerProps}
        data-testid="home-period"
      >
        <Calendar size={16} className="home-btn__icon" aria-hidden="true" />
        <span className="sr-only">{t("dashboard.period.trigger")}: </span>
        <span className="home-btn__text">{t(`dashboard.period.${value}`)}</span>
        <ChevronDown size={14} className="home-btn__chev" aria-hidden="true" />
      </button>
      <ResponsiveMenu
        open={menu.open}
        onClose={menu.close}
        anchorRef={menu.anchorRef}
        id={menu.id}
        label={t("dashboard.period.label")}
        title={t("dashboard.period.sheetTitle")}
        placement="bottom-end"
        className="home-period"
      >
        <MenuLabel>{t("dashboard.period.label")}</MenuLabel>
        {PERIODS.map((p) => (
          <MenuItem
            key={p}
            selected={value === p}
            testId={`period-${p}`}
            onSelect={() => onChange(p)}
          >
            {t(`dashboard.period.${p}`)}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuLabel>{t("dashboard.period.cycles")}</MenuLabel>
        <MenuItem icon={Flag} disabled title={soon} onSelect={() => {}}>
          {t("dashboard.period.cycleCurrent")}
        </MenuItem>
        <MenuItem icon={History} disabled title={soon} onSelect={() => {}}>
          {t("dashboard.period.cyclePrevious")}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          icon={CalendarRange}
          disabled
          title={soon}
          onSelect={() => {}}
        >
          {t("dashboard.period.custom")}
        </MenuItem>
        <MenuSeparator />
        {/* A menu holds menu items only, so the comparison is an item with a
            switch drawn on it; it turns into a real toggle with RED-W4. */}
        <MenuItem
          disabled
          title={t("dashboard.period.compareTitle")}
          testId="period-compare"
          onSelect={() => {}}
        >
          <span className="home-compare">
            <span className="home-compare__track" aria-hidden="true">
              <span className="home-compare__knob" />
            </span>
            {t("dashboard.period.compare")}
          </span>
        </MenuItem>
      </ResponsiveMenu>
    </>
  );
}
