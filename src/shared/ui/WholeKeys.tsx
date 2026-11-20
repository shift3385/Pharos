import { keyPieces } from "@shared/export/wholeKeys";

// Inline too, so the rule holds where typography.css is not loaded.
const NO_WRAP = { whiteSpace: "nowrap" } as const;

/** A text whose keys («RUN-001», «TP-PH-0600») and versions («0.6.0-beta.1»)
 *  never break at their hyphens (FIX-43, FIX-46). A key shown on its own
 *  uses the same class directly: `<span className="t-key">` (typography.css). */
export function WholeKeys({ text }: { text: string }) {
  return (
    <>
      {keyPieces(text).map((p, i) =>
        p.key ? (
          <span key={i} className="t-key" style={NO_WRAP}>
            {p.text}
          </span>
        ) : (
          p.text
        ),
      )}
    </>
  );
}
