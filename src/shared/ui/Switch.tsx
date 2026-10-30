import { useId } from "react";
import "./controls.css";

/**
 * On/off switch (SPEC §9 «Interruptores», §10): a `button` with
 * `role="switch"` and `aria-checked`; the knob slides in 150 ms (only fades
 * with reduced motion). With `label` the visible text names it; without it,
 * name it with `aria-label` through `ariaLabel`. A disabled switch keeps a
 * `title` with the reason (SPEC §4).
 */
export function Switch({
  checked,
  onChange,
  label,
  ariaLabel,
  id,
  disabled,
  title,
  describedBy,
  testId,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  ariaLabel?: string;
  id?: string;
  disabled?: boolean;
  title?: string;
  describedBy?: string;
  testId?: string;
}) {
  const own = useId();
  const switchId = id ?? own;
  return (
    <span className="switch" title={title} data-disabled={disabled || undefined}>
      <button
        type="button"
        role="switch"
        id={switchId}
        className="switch__control"
        aria-checked={checked}
        aria-label={label ? undefined : ariaLabel}
        aria-describedby={describedBy}
        disabled={disabled}
        data-testid={testId}
        onClick={() => onChange(!checked)}
      >
        <span className="switch__knob" aria-hidden="true" />
      </button>
      {label && (
        <label className="switch__label" htmlFor={switchId}>
          {label}
        </label>
      )}
    </span>
  );
}
