import { useTranslation } from "react-i18next";
import { BadgeCheck, CirclePlay, ClipboardList, Database, FileText, type LucideIcon } from "lucide-react";
import { DELIVERABLE_GROUPS } from "../../model/catalogs";
import { toKey } from "@shared/import/xlsx";
import { DELIVERABLE_REV, isCatalogDeliverable } from "../../model/catalogLabels";
import { CheckColumns } from "./CheckColumns";

const GROUP_ICON: Record<string, LucideIcon> = {
  management: ClipboardList,
  specification: FileText,
  dataEnvironment: Database,
  execution: CirclePlay,
  acceptance: BadgeCheck,
};

/**
 * «Entregables» (RED-V2, UX-31): the ISO/IEC/IEEE 29119-3 deliverables as
 * checkboxes in columns by group; the sixth cell, «Propios», holds the
 * team's own ones (each with ✕) and the field to add another. Stores catalog
 * keys and own entries as typed.
 */
export function DeliverablesStep({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const own = value.filter((v) => !isCatalogDeliverable(v));
  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key]);
  const add = (text: string) => {
    // A catalog label (es or en) ticks that entry instead of adding a copy.
    const v = toKey(text, DELIVERABLE_REV);
    if (v && !value.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...value, v]);
  };

  return (
    <CheckColumns
      className="tpw-deliv"
      testId="plan-deliverables"
      columns={DELIVERABLE_GROUPS.map((g) => ({
        id: g.id,
        title: t(`testPlan.deliverableGroup.${g.id}`),
        icon: GROUP_ICON[g.id] ?? FileText,
        options: g.keys.map((k) => ({ key: k, label: t(`testPlan.deliverableLabel.${k}`) })),
      }))}
      isChecked={(k) => value.includes(k)}
      onToggle={toggle}
      own={{
        title: t("testPlan.deliverableGroup.own"),
        items: own,
        onRemove: (v) => onChange(value.filter((x) => x !== v)),
        onAdd: add,
        fieldLabel: t("testPlan.deliverables.other"),
        placeholder: t("testPlan.deliverables.otherPlaceholder"),
        addLabel: t("testPlan.deliverables.add"),
        testId: "plan-deliverables-own",
      }}
    />
  );
}
