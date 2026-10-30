import { useId } from "react";
import "./controls.css";

/**
 * On/off switch (SPEC §9 «Interruptores», §10): a `button` with
 * `role="switch"` and `aria-checked`; the knob slides in 150 ms (with
 * reduced motion it moves without sliding). It is named by the visible
 * `label` or, without one, by `ariaLabel`: one of the two is required. A
 * disabled switch keeps a `title` with the reason (SPEC §4).
 */
type SwitchName = { label: string; ariaLabel?: never } | { ariaLabel: string; label?: never };

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
}: SwitchName & {
  checked: boolean;
  onChange: (checked: boolean) => void;
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
