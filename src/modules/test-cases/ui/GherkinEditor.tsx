import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-gherkin";
import { ArrowLeftRight, Copy, FileCode, PencilLine } from "lucide-react";
import { useToast } from "@shared/ui/Toast";
import "@shared/ui/buttons.css";

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

// The bar over the mobile keyboard (SPEC §8): the most used keywords and the
// characters a phone keyboard hides (|, <>, @, indent).
const KEYBOARD_KEYS: { label: string; insert: string; name?: string }[] = [
  { label: "Given", insert: "Given " },
  { label: "When", insert: "When " },
  { label: "Then", insert: "Then " },
  { label: "And", insert: "And " },
  { label: "But", insert: "But " },
  { label: "Scenario", insert: "Scenario: " },
  { label: "Examples", insert: "Examples:\n" },
  { label: "|", insert: "| " },
  { label: "<>", insert: "<>" },
  { label: "@tag", insert: "@" },
  { label: "⇥", insert: "  ", name: "indent" },
];

const highlight = (code: string) => Prism.highlight(code, Prism.languages.gherkin, "gherkin");
/** One span per line, so CSS can number them (mobile editing). */
const numbered = (code: string) =>
  code
    .split("\n")
    .map((line) => `<span class="tc-ln">${highlight(line)}</span>`)
    .join("\n");

/** The bar above the code: `PCL-0142.feature`, its state and «Copiar». */
function FileBar({
  fileName,
  status,
  icon = "file",
  value,
  children,
}: {
  fileName: string;
  status?: ReactNode;
  icon?: "file" | "edit";
  value: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const Icon = icon === "edit" ? PencilLine : FileCode;
  return (
    <div className="tc-gherkin__bar">
      <Icon size={15} aria-hidden="true" />
      <span className="tc-gherkin__file" title={fileName}>
        {fileName}
      </span>
      {status && <span className="tc-gherkin__status">{status}</span>}
      <span className="tc-gherkin__spacer" />
      {children}
      <button
        type="button"
        className="tc-gherkin__copy"
        aria-label={t("testCase.gherkin.copy")}
        title={t("testCase.gherkin.copy")}
        onClick={() =>
          void navigator.clipboard
            ?.writeText(value)
            .then(() => toast(t("testCase.gherkin.copied")))
            .catch(() => {})
        }
      >
        <Copy size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Syntax-highlighted Gherkin editor with a keyword palette (spec §5.3). Colors
 *  come from the Faro Nocturno design tokens (see TestCase.css). Tab indents
 *  inside it; Escape then Tab leaves it, which a hint tells keyboard and
 *  screen-reader users (WCAG 2.1.2, UX-05). On mobile (`keyboardBar`) the
 *  palette sits right above the on-screen keyboard and lines are numbered. */
export function GherkinEditor({
  value,
  onChange,
  fileName,
  status,
  keyboardBar,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Shows the file bar (`PCL-0142.feature`, state, copy). */
  fileName?: string;
  status?: ReactNode;
  keyboardBar?: boolean;
}) {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const keyboard = useKeyboardInset(Boolean(keyboardBar));

  // The editor does not forward aria-* to its textarea, so link the hint here.
  useEffect(() => {
    textarea()?.setAttribute("aria-describedby", `${id}-keys`);
  }, [id]);

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

  const keys = keyboardBar ? KEYBOARD_KEYS : KEYWORDS;
  const palette = (
    <div
      className={`tc-kw-palette${keyboardBar ? " tc-kw-palette--keyboard" : ""}`}
      role="toolbar"
      aria-label={t("testCase.keywords")}
      style={keyboardBar ? { bottom: keyboard } : undefined}
    >
      {keys.map((k) => (
        <button
          key={k.label}
          type="button"
          className="tc-kw"
          title={t("testCase.insertKeyword")}
          // Keep the focus (and the keyboard) in the editor.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert(k.insert)}
        >
          {"name" in k && k.name ? (
            <>
              <span aria-hidden="true">{k.label}</span>
              <span className="sr-only">{t("testCase.gherkin.indent")}</span>
            </>
          ) : (
            k.label
          )}
        </button>
      ))}
    </div>
  );

  return (
    <div className={`tc-gherkin${keyboardBar ? " tc-gherkin--mobile" : ""}`} ref={wrapRef}>
      {fileName && (
        <FileBar fileName={fileName} status={status} icon={keyboardBar ? "edit" : "file"} value={value} />
      )}
      {!keyboardBar && palette}
      <label htmlFor={`${id}-ta`} className="sr-only">
        {t("testCase.gherkinEditor")}
      </label>
      <p id={`${id}-keys`} className={keyboardBar ? "sr-only" : "tp-field__hint"}>
        {t("testCase.gherkinKeys")}
      </p>
      <Editor
        textareaId={`${id}-ta`}
        value={value}
        onValueChange={onChange}
        highlight={keyboardBar ? numbered : highlight}
        padding={16}
        tabSize={2}
        insertSpaces
        textareaClassName="tc-gherkin__ta"
        preClassName="tc-gherkin__pre"
        className="tc-gherkin__editor"
      />
      {keyboardBar && palette}
    </div>
  );
}

/** Read-only Gherkin (mobile «Gherkin» view): highlighted code that scrolls
 *  sideways, with «Editar» to open the editing mode. */
export function GherkinReadView({
  value,
  fileName,
  status,
  onEdit,
}: {
  value: string;
  fileName: string;
  status?: ReactNode;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="tc-gherkin tc-gherkin--read">
      <FileBar fileName={fileName} status={status} value={value}>
        <button type="button" className="ui-btn ui-btn--small" onClick={onEdit}>
          <PencilLine size={15} aria-hidden="true" />
          {t("testCase.gherkin.edit")}
        </button>
      </FileBar>
      <pre className="tc-gherkin__code" tabIndex={0} aria-label={t("testCase.gherkinEditor")}>
        <code dangerouslySetInnerHTML={{ __html: highlight(value) }} />
      </pre>
      <p className="tc-gherkin__swipe">
        <ArrowLeftRight size={14} aria-hidden="true" />
        {t("testCase.gherkin.swipe")}
      </p>
    </div>
  );
}

/** Height of the on-screen keyboard (the part of the layout viewport the
 *  visual viewport does not show), so a bar can sit right above it. */
function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    const update = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);
  return inset;
}
