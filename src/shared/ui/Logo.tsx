/** Pharos lighthouse mark (redesign, SPEC §11; port of `docs/rediseno/logo/Logo.jsx`):
 *  an open ring and three beams. From 28 px up it is the full mark; below that,
 *  the compact one (no windows, two beams, thicker strokes). The tower is
 *  navy 500 on light surfaces and navy 300 on navy ones (`surface="navy"`);
 *  the gold parts are the accent. Colors only come from tokens. */
export function Logo({
  size = 32,
  surface = "light",
  title = "Pharos",
}: {
  size?: number;
  /** "navy" lightens the tower for navy backgrounds (sidebar, mobile bar). */
  surface?: "light" | "navy";
  title?: string;
}) {
  const gold = "var(--color-accent)";
  const tower = surface === "navy" ? "var(--color-navy-300)" : "var(--color-navy-500)";
  const compact = size < 28;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={title}
      className="app-logo"
      data-variant={compact ? "compact" : "full"}
      style={{ display: "block", flex: "none", overflow: "visible" }}
    >
      <path
        d="M30.92 9.22 A19 19 0 1 0 40.81 23.36"
        fill="none"
        stroke={gold}
        strokeWidth={compact ? 3 : 1.8}
        strokeLinecap="round"
      />
      {compact ? (
        <>
          <path d="M27.5 15 L45.5 9" stroke={gold} strokeWidth="2.6" strokeLinecap="round" />
          <path
            d="M27.5 16.5 L45.5 19"
            stroke={gold}
            strokeWidth="2.6"
            strokeLinecap="round"
            opacity="0.7"
          />
        </>
      ) : (
        <>
          <path d="M27.5 14.6 L46 7.6" stroke={gold} strokeWidth="1.6" strokeLinecap="round" />
          <path
            d="M27.5 15.8 L47 13.4"
            stroke={gold}
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.75"
          />
          <path
            d="M27.5 17 L46 19.6"
            stroke={gold}
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.5"
          />
        </>
      )}
      <path d="M13.5 16.4 L22 9.2 L30.5 16.4 Z" fill={gold} />
      {!compact && <circle cx="22" cy="8.4" r="1.1" fill={gold} />}
      <rect data-part="tower" x="18.2" y="16.4" width="7.6" height="5" fill={tower} />
      <rect x="19.9" y="17.5" width="4.2" height="2.9" rx="0.5" fill={gold} />
      <rect x="15.8" y="21.4" width="12.4" height="2.1" rx="0.7" fill={gold} />
      <path d="M17.4 23.5 H26.6 L28.6 39.2 H15.4 Z" fill={tower} />
      {!compact && (
        <>
          <rect data-part="window" x="21.1" y="26.4" width="1.8" height="2.8" rx="0.9" fill={gold} />
          <rect
            data-part="window"
            x="21.1"
            y="30.6"
            width="1.8"
            height="2.8"
            rx="0.9"
            fill={gold}
            opacity="0.8"
          />
        </>
      )}
      <path d="M20.1 39.2 V36.4 A1.9 1.9 0 0 1 23.9 36.4 V39.2 Z" fill={gold} />
      <rect x="12" y="39.2" width="20" height="2.6" rx="1.3" fill={tower} />
    </svg>
  );
}
