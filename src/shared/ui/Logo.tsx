/** Pharos beacon mark. Colors come from theme tokens (amber + navy). */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Pharos"
      className="app-logo"
    >
      <path
        d="M16 5 L7 12 M16 5 L25 12"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M12 27 L13 13 H19 L20 27 Z"
        fill="var(--color-navy-100)"
        stroke="var(--color-navy-300)"
        strokeWidth="1"
      />
      <rect
        x="13"
        y="8"
        width="6"
        height="5"
        rx="1"
        fill="var(--color-accent)"
      />
    </svg>
  );
}
