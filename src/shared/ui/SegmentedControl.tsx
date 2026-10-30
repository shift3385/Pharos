import { Fragment, useId, useRef, type KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";
import "./controls.css";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** Shown but not selectable; give the reason in `title` (SPEC §4). */
  disabled?: boolean;
  title?: string;
}

/**
 * One choice out of a few, as a pill track (Perfil: Idioma, Tema; Casos:
 * Editor / Gherkin / Dividida). A `radiogroup` named by `label` with a roving
 * tabindex: Tab enters on the selected option, the arrows (and Home/End) move
 * and select, skipping disabled options. The track scrolls sideways rather
 * than wrapping when it does not fit.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  size = "md",
  className = "",
  testId,
}: {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** sm 28 px · md 30 px (44 px on mobile) · lg 36 px (44 px on mobile). */
  size?: "sm" | "md" | "lg";
  className?: string;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reasonBase = useId();
  const enabled = options.filter((o) => !o.disabled);
  // The Tab stop: the selected option, or the first enabled one.
  const stop = enabled.some((o) => o.value === value)
    ? value
    : enabled[0]?.value;

  // From the focused option; -1 (none) counts as "before the first one".
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const focused = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-value]",
    );
    const at = enabled.findIndex((o) => o.value === focused?.dataset.value);
    const go = (i: number) => {
      e.preventDefault();
      const next = enabled[(i + enabled.length) % enabled.length];
      if (!next) return;
      onChange(next.value);
      ref.current
        ?.querySelector<HTMLElement>(`[data-value="${CSS.escape(next.value)}"]`)
        ?.focus();
    };
    if (e.key === "ArrowRight" || e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      go(at < 0 ? enabled.length - 1 : at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(enabled.length - 1);
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      className={`segmented segmented--${size} ${className}`.trim()}
      onKeyDown={move}
      data-testid={testId}
    >
      {options.map(
        ({ value: v, label: text, icon: Icon, disabled, title }, i) => {
          const checked = v === value;
          // A disabled option leaves the Tab order; its reason stays in the
          // accessibility tree as its description (not only a mouse tooltip).
          const reasonId = disabled && title ? `${reasonBase}-${i}` : undefined;
          return (
            <Fragment key={v}>
              <button
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={v === stop ? 0 : -1}
                disabled={disabled}
                title={title}
                aria-describedby={reasonId}
                data-value={v}
                className="segmented__option"
                onClick={() => onChange(v)}
              >
                {Icon && <Icon size={14} aria-hidden="true" />}
                {text}
              </button>
              {/* Outside the button, so it describes the option without joining its name. */}
              {reasonId && (
                <span id={reasonId} className="sr-only">
                  {title}
                </span>
              )}
            </Fragment>
          );
        },
      )}
    </div>
  );
}
