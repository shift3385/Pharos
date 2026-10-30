import "./filters.css";

export interface FilterChipOption {
  value: string;
  label: string;
  /** Shown after the label in mono (e.g. «Borrador 12»). */
  count?: number;
  /** A filter that cannot be used yet; `title` says why (SPEC §4). */
  disabled?: boolean;
  title?: string;
}

/**
 * One-of-N quick filters with counts, as a segmented group of toggle buttons
 * (`aria-pressed`). It never wraps: when it does not fit it scrolls sideways
 * (mobile). Used for the case states, the planner card kinds and the
 * Requisitos / Matriz switch.
 */
export function FilterChips({
  options,
  value,
  onChange,
  label,
  className = "",
}: {
  options: FilterChipOption[];
  value: string;
  onChange: (value: string) => void;
  /** Accessible name of the group (e.g. «Estado del caso»). */
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`chips ${className}`.trim()}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="chips__chip"
          aria-pressed={o.value === value}
          aria-disabled={o.disabled || undefined}
          title={o.title}
          onClick={() => {
            if (!o.disabled) onChange(o.value);
          }}
        >
          {o.label}
          {o.count !== undefined && <span className="chips__count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
