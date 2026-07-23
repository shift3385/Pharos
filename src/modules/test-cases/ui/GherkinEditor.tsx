import { useRef } from "react";
import { useTranslation } from "react-i18next";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-gherkin";

// Keyword palette (spec §5.3 "autocompletado de palabras clave"): clicking a chip
// inserts the keyword at the caret. Text includes the trailing space/colon so it
// is ready to type after.
const KEYWORDS: { label: string; insert: string }[] = [
  { label: "Given", insert: "Given " },
  { label: "When", insert: "When " },
  { label: "Then", insert: "Then " },
  { label: "And", insert: "And " },
  { label: "But", insert: "But " },
  { label: "Scenario", insert: "Scenario: " },
  { label: "Scenario Outline", insert: "Scenario Outline: " },
  { label: "Examples", insert: "Examples:\n" },
  { label: "Background", insert: "Background:\n" },
  { label: "Rule", insert: "Rule: " },
];

/** Syntax-highlighted Gherkin editor with a keyword palette (spec §5.3). Colors
 *  come from the Faro Nocturno design tokens (see TestCase.css). */
export function GherkinEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement>(null);

  const textarea = () =>
    wrapRef.current?.querySelector<HTMLTextAreaElement>("textarea") ?? null;

  const insert = (text: string) => {
    const ta = textarea();
    const start = ta ? ta.selectionStart : value.length;
    const end = ta ? ta.selectionEnd : value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    if (ta) {
      const caret = start + text.length;
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(caret, caret);
      });
    }
  };

  return (
    <div className="tc-gherkin" ref={wrapRef}>
      <div className="tc-kw-palette" role="toolbar" aria-label={t("testCase.keywords")}>
        {KEYWORDS.map((k) => (
          <button
            key={k.label}
            type="button"
            className="tc-kw"
            title={t("testCase.insertKeyword")}
            onClick={() => insert(k.insert)}
          >
            {k.label}
          </button>
        ))}
      </div>
      <Editor
        value={value}
        onValueChange={onChange}
        highlight={(code) =>
          Prism.highlight(code, Prism.languages.gherkin, "gherkin")
        }
        padding={16}
        tabSize={2}
        insertSpaces
        textareaClassName="tc-gherkin__ta"
        preClassName="tc-gherkin__pre"
        className="tc-gherkin__editor"
      />
    </div>
  );
}
