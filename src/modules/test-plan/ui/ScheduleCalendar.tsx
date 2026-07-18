import { useState } from "react";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import { useTranslation } from "react-i18next";
import { es } from "react-day-picker/locale";
import type { ScheduleSprint } from "../model/types";
import "react-day-picker/style.css";

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Interactive calendar (spec §5.1 step 16): pick a date range and add it as a
 *  sprint. Existing sprint ranges are highlighted. */
export function ScheduleCalendar({
  sprints,
  onAdd,
}: {
  sprints: ScheduleSprint[];
  onAdd: (sprint: ScheduleSprint) => void;
}) {
  const { t, i18n } = useTranslation();
  const [range, setRange] = useState<DateRange | undefined>();

  const sprintRanges = sprints
    .filter((s) => s.start && s.end)
    .map((s) => ({
      from: new Date(`${s.start}T00:00:00`),
      to: new Date(`${s.end}T00:00:00`),
    }));

  return (
    <div className="tp-cal">
      <DayPicker
        mode="range"
        selected={range}
        onSelect={setRange}
        locale={i18n.resolvedLanguage === "es" ? es : undefined}
        modifiers={{ sprint: sprintRanges }}
        modifiersClassNames={{ sprint: "tp-cal__sprint" }}
      />
      <button
        type="button"
        className="tp-list-field__add"
        disabled={!range?.from || !range?.to}
        onClick={() => {
          if (range?.from && range?.to) {
            onAdd({
              name: `Sprint ${sprints.length + 1}`,
              start: fmt(range.from),
              end: fmt(range.to),
            });
            setRange(undefined);
          }
        }}
      >
        + {t("testPlan.addSprintFromRange")}
      </button>
    </div>
  );
}
