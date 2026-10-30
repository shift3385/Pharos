/** An email, path, ID or file name (SPEC §3): never broken across lines or
 *  hyphenated; when it does not fit it ends in «…» and the full value is in
 *  the `title` tooltip. */
export function TruncatedText({
  value,
  className = "",
  mono,
}: {
  value: string;
  className?: string;
  /** Monospace, for IDs and code. */
  mono?: boolean;
}) {
  return (
    <span className={`u-truncate${mono ? " t-id" : ""} ${className}`.trim()} title={value}>
      {value}
    </span>
  );
}
