import { keyPieces } from "@shared/export/wholeKeys";

const NO_WRAP = { whiteSpace: "nowrap" } as const;

/** A text whose keys («RUN-001») never break at their hyphen (FIX-43). */
export function WholeKeys({ text }: { text: string }) {
  return (
    <>
      {keyPieces(text).map((p, i) =>
        p.key ? (
          <span key={i} style={NO_WRAP}>
            {p.text}
          </span>
        ) : (
          p.text
        ),
      )}
    </>
  );
}
