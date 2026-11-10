import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Hash } from "lucide-react";
import { FormField } from "@shared/ui/FormField";
import type { Issue } from "@shared/validation";
import { DIGITS, sampleKey } from "../model/numbering";

/**
 * The general data of a project (ScrAjustesProyecto › General): name, case-id
 * prefix and digits, and how the cases will be numbered. The same fields in
 * «Ajustes del proyecto» and in step «Datos generales» of «Nuevo proyecto»
 * (UX-29); the caller keeps the values and says what is wrong with them.
 */
export function ProjectGeneralFields({
  idPrefix,
  name,
  onName,
  prefix,
  onPrefix,
  digits,
  onDigits,
  nameIssue,
  prefixIssue,
  prefixFree = false,
  prefixPlaceholder = "ATS_",
  prefixHint,
  digitsCopiedFrom,
  nameRef,
  onEnter,
}: {
  /** `pj` (settings) or `pj-new` (wizard): the controls are `<idPrefix>-name`,
   *  `-prefix` and `-digits`. */
  idPrefix: string;
  name: string;
  onName: (value: string) => void;
  prefix: string;
  onPrefix: (value: string) => void;
  digits: number;
  onDigits: (value: number) => void;
  nameIssue: Issue | null;
  prefixIssue: Issue | null;
  /** Says «✓ Libre» under a prefix no other project overlaps (NC-030). */
  prefixFree?: boolean;
  prefixPlaceholder?: string;
  prefixHint?: string;
  /** The digits came from this project (UX-29): marked «copiado de …». */
  digitsCopiedFrom?: string | null;
  nameRef?: Ref<HTMLInputElement>;
  /** Enter in the name or the prefix (the wizard creates with it). */
  onEnter?: () => void;
}) {
  const { t } = useTranslation();
  const enter = onEnter
    ? (e: React.KeyboardEvent) => e.key === "Enter" && onEnter()
    : undefined;
  return (
    <>
      <FormField
        id={`${idPrefix}-name`}
        label={t("projects.name")}
        issue={nameIssue}
        required
      >
        {(p) => (
          <input
            {...p}
            ref={nameRef}
            className="pj-input"
            value={name}
            autoComplete="off"
            onChange={(e) => onName(e.target.value)}
            onKeyDown={enter}
          />
        )}
      </FormField>
      <div className="pj-settings__row">
        <FormField
          id={`${idPrefix}-prefix`}
          label={t("projects.caseIdPrefix")}
          issue={prefixIssue}
          hint={
            !prefixIssue && prefixFree ? (
              <span className="pj-free">
                <Check size={14} aria-hidden="true" />
                {t("projects.prefix.free")}
              </span>
            ) : (
              prefixHint
            )
          }
        >
          {(p) => (
            <input
              {...p}
              className="pj-input t-id"
              value={prefix}
              placeholder={prefixPlaceholder}
              autoComplete="off"
              spellCheck={false}
              data-testid={`${idPrefix}-prefix`}
              onChange={(e) => onPrefix(e.target.value)}
              onKeyDown={enter}
            />
          )}
        </FormField>
        <FormField
          id={`${idPrefix}-digits`}
          label={t("projects.caseIdDigits")}
          hint={
            digitsCopiedFrom ? (
              <span className="pj-copied">
                <Copy size={12} aria-hidden="true" />
                {t("projects.wizard.copiedFrom", { name: digitsCopiedFrom })}
              </span>
            ) : undefined
          }
        >
          {(p) => (
            <select
              {...p}
              className="pj-input"
              value={digits}
              onChange={(e) => onDigits(Number(e.target.value))}
            >
              {DIGITS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
        </FormField>
      </div>
      <p className="pj-settings__preview">
        <Hash size={15} aria-hidden="true" />
        <span>{t("projects.prefixHint")}</span>
        <code className="t-id" data-strong="">
          {sampleKey(prefix, digits, 1)}
        </code>
        <code className="t-id">{sampleKey(prefix, digits, 2)}</code>
        <code className="t-id" data-faint="">
          {sampleKey(prefix, digits, 3)}…
        </code>
      </p>
    </>
  );
}
