import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import type { MatrixSort } from "../model/matrix";
import { NO_FILTERS, type MatrixFilters } from "../model/matrixFilters";
import "@shared/ui/buttons.css";

export interface FilterOption {
  value: string;
  label: string;
}

/**
 * The filter bar above the matrix: cycle, configuration, build and
 * environment (only the last final result of the runs that match counts), and
 * the order (risk, the default, or requirement ID). The redesign SPEC has no
 * design for it: built with the native selects of the forms (`tp-field`).
 */
export function ExecutionFilters({
  value,
  onChange,
  cycles,
  configurations,
  builds,
  environments,
}: {
  value: MatrixFilters;
  onChange: (next: MatrixFilters) => void;
  cycles: FilterOption[];
  configurations: FilterOption[];
  builds: string[];
  environments: string[];
}) {
  const { t } = useTranslation();
  const any = t("traceability.filters.any");
  const active =
    value.cycleId || value.configurationId || value.build || value.environment;
  const select = (
    key: Exclude<keyof MatrixFilters, "sort">,
    label: string,
    options: FilterOption[],
  ) => (
    <label className="tz-filter">
      <span className="tz-filter__label">{label}</span>
      <select
        value={value[key]}
        data-testid={`trace-filter-${key === "cycleId" ? "cycle" : key === "configurationId" ? "configuration" : key}`}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        disabled={options.length === 0 && !value[key]}
      >
        <option value="">{any}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  const plain = (list: string[]) => list.map((v) => ({ value: v, label: v }));
  return (
    <div
      className="tz-filters"
      role="group"
      aria-label={t("traceability.filters.label")}
    >
      {select("cycleId", t("traceability.filters.cycle"), cycles)}
      {select(
        "configurationId",
        t("traceability.filters.configuration"),
        configurations,
      )}
      {select("build", t("traceability.filters.build"), plain(builds))}
      {select(
        "environment",
        t("traceability.filters.environment"),
        plain(environments),
      )}
      <label className="tz-filter">
        <span className="tz-filter__label">
          {t("traceability.filters.sort")}
        </span>
        <select
          value={value.sort}
          data-testid="trace-sort"
          onChange={(e) =>
            onChange({ ...value, sort: e.target.value as MatrixSort })
          }
        >
          <option value="risk">{t("traceability.filters.sortRisk")}</option>
          <option value="key">{t("traceability.filters.sortKey")}</option>
        </select>
      </label>
      {active && (
        <button
          type="button"
          className="ui-btn ui-btn--small tz-filters__clear"
          data-testid="trace-filters-clear"
          onClick={() => onChange({ ...NO_FILTERS, sort: value.sort })}
        >
          <X size={14} aria-hidden="true" />
          {t("traceability.filters.clear")}
        </button>
      )}
      <p className="tz-filters__hint">{t("traceability.filters.hint")}</p>
    </div>
  );
}
