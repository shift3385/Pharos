import { useTranslation } from "react-i18next";
import { wordDiff, type FieldChange } from "../model/caseDiff";

/** One text with its removed and inserted words marked. */
function Marked({ before = "", after = "" }: { before?: string; after?: string }) {
  return (
    <span className="tc-diff__text">
      {wordDiff(before, after).map((p, i) =>
        p.op === "del" ? (
          <del key={i}>{p.text}</del>
        ) : p.op === "ins" ? (
          <ins key={i}>{p.text}</ins>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
}

/** The field-by-field changes of a case (CAS-02): the reviewer's «what
 *  changed» and one case of a baseline comparison. */
export function CaseChanges({ changes }: { changes: FieldChange[] }) {
  const { t } = useTranslation();
  if (changes.length === 0) return <p className="tc-diff__none">{t("testCase.diff.none")}</p>;
  return (
    <ul className="tc-diff" data-testid="case-changes">
      {changes.map((c, i) => {
        const field = t(`testCase.diff.field.${c.field}`);
        const where = c.position ? t("testCase.diff.at", { field, n: c.position }) : field;
        const label = c.name ? `${c.name} · ${where}` : where;
        // «Precondición 2 añadida», «Notas cambiadas»: the kind agrees with
        // the field where the language needs it (FIX-41).
        const kind = t(`testCase.diff.kind.${c.kind}`, {
          context: t(`testCase.diff.gender.${c.field}`, { defaultValue: "" }),
        });
        return (
          <li key={i} className="tc-diff__item" data-kind={c.kind}>
            <span className="tc-diff__label">
              {label} <span className="tc-diff__kind">{kind}</span>
            </span>
            {c.kind === "added" ? (
              <ins className="tc-diff__text">{c.after}</ins>
            ) : c.kind === "removed" ? (
              <del className="tc-diff__text">{c.before}</del>
            ) : c.kind === "moved" ? (
              <span className="tc-diff__text">{c.after}</span>
            ) : (
              <Marked before={c.before} after={c.after} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
