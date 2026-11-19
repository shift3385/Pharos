/** A step's text with its `<param>` placeholders marked as chips. */
export function StepText({ text }: { text: string }) {
  const parts: { param: boolean; text: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(/<([^>\s][^>]*)>/g)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ param: false, text: text.slice(last, at) });
    parts.push({ param: true, text: m[0] });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push({ param: false, text: text.slice(last) });
  return (
    <>
      {parts.map((p, i) =>
        p.param ? (
          <code key={i} className="lb-param">
            {p.text}
          </code>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** A parameter name as a `<name>` chip. */
export const ParamChip = ({ name }: { name: string }) => (
  <code className="lb-param">{`<${name}>`}</code>
);
