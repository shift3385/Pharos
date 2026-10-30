import type { LucideIcon } from "lucide-react";
import "@shared/ui/filters.css";

// TEMPORARY (RED-V3): same API as V1's shared `SegmentedControl`
// (`<SegmentedControl label options value onChange size />`). Replace this
// import with `@shared/ui/SegmentedControl` once V1 publishes it.

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

/** One-of-N switch (Editor / Gherkin / Vista dividida) as pressed buttons. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  size = "md",
}: {
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div role="group" aria-label={label} className="chips tc-seg" data-size={size}>
      {options.map(({ value: v, label: text, icon: Icon }) => (
        <button
          key={v}
          type="button"
          className="chips__chip"
          aria-pressed={v === value}
          onClick={() => onChange(v)}
        >
          {Icon && <Icon size={15} aria-hidden="true" />}
          {text}
        </button>
      ))}
    </div>
  );
}
