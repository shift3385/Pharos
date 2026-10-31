import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { MenuItem, ResponsiveMenu } from "@shared/ui/Menu";
import { usePopover } from "@shared/ui/usePopover";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { PriorityFlag } from "@shared/ui/PriorityFlag";
import { StatusPill } from "@shared/ui/StatusPill";
import {
  AUTOMATION_STATUSES,
  effectiveAutomation,
} from "@modules/custom-fields";
import { CASE_PRIORITIES, CASE_STATUSES } from "../model/caseList";
import { automationTone, priorityTone, statusTone } from "./caseTones";

/** A labelled field whose value is chosen from a menu (a sheet on mobile),
 *  each option with its explanation (SPEC §8 «Prioridad y Estado con
 *  explicación de cada opción»). */
function MenuField({
  label,
  sheetTitle,
  value,
  current,
  options,
  onChange,
}: {
  label: string;
  sheetTitle: string;
  value: string;
  current: ReactNode;
  options: { value: string; label: ReactNode; description: string }[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  const mobile = useBreakpoint() === "mobile";
  const menu = usePopover(mobile ? "dialog" : "menu");
  return (
    <div className="tc-meta">
      <span id={`${id}-label`} className="tc-meta__label">
        {label}
      </span>
      <button
        type="button"
        className="tc-meta__trigger"
        aria-labelledby={`${id}-label ${id}-value`}
        {...menu.triggerProps}
      >
        <span id={`${id}-value`} className="tc-meta__value">
          {current}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <ResponsiveMenu
        open={menu.open}
        onClose={menu.close}
        anchorRef={menu.anchorRef}
        id={menu.id}
        label={label}
        title={sheetTitle}
        className="tc-meta__menu"
      >
        {options.map((o) => (
          <MenuItem
            key={o.value}
            selected={o.value === value}
            description={o.description}
            onSelect={() => onChange(o.value)}
          >
            {o.label}
          </MenuItem>
        ))}
      </ResponsiveMenu>
    </div>
  );
}

export function PriorityField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const label = (p: string) => t(`testCase.priorityLabel.${p}`);
  return (
    <MenuField
      label={t("testCase.priority")}
      sheetTitle={t("testCase.priority")}
      value={value}
      current={<PriorityFlag tone={priorityTone(value)} label={label(value)} showLabel />}
      options={CASE_PRIORITIES.map((p) => ({
        value: p,
        label: label(p),
        description: t(`testCase.priorityHelp.${p}`),
      }))}
      onChange={onChange}
    />
  );
}

export function StatusField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const label = (s: string) => t(`testCase.statusLabel.${s}`);
  return (
    <MenuField
      label={t("testCase.status")}
      sheetTitle={t("testCase.statusSheet")}
      value={value}
      current={
        <StatusPill tone={statusTone(value)} strike={value === "obsolete"}>
          {label(value)}
        </StatusPill>
      }
      options={CASE_STATUSES.map((s) => ({
        value: s,
        label: label(s),
        description: t(`testCase.statusHelp.${s}`),
      }))}
      onChange={onChange}
    />
  );
}

/** «Automatización» (FLD-01): manual / por automatizar / automatizado, each
 *  with its explanation. A case that never set it reads as manual. */
export function AutomationField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const current = effectiveAutomation(value);
  const label = (s: string) => t(`testCase.automationLabel.${s}`);
  return (
    <MenuField
      label={t("testCase.automation")}
      sheetTitle={t("testCase.automationSheet")}
      value={current}
      current={
        <StatusPill tone={automationTone(current)}>{label(current)}</StatusPill>
      }
      options={AUTOMATION_STATUSES.map((s) => ({
        value: s,
        label: label(s),
        description: t(`testCase.automationHelp.${s}`),
      }))}
      onChange={onChange}
    />
  );
}
