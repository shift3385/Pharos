// Catalog keys ↔ labels for deliverables and tools (ADR-0030). A plan stores
// catalog keys plus the team's own entries as typed; labels are only for show,
// export and import.
import esLocale from "@shared/i18n/locales/es.json";
import enLocale from "@shared/i18n/locales/en.json";
import { reverse, toKey } from "@shared/import/xlsx";
import { DELIVERABLE_KEYS, TOOL_NAMES, toolName } from "./catalogs";

type Translate = (key: string) => string;

/** Label (es or en, any case) or key → deliverable key. */
export const DELIVERABLE_REV = reverse(
  esLocale.testPlan.deliverableLabel,
  enLocale.testPlan.deliverableLabel,
);
/** Brand name (any case) or key → tool key. */
export const TOOL_REV = reverse(TOOL_NAMES);

/** Plans saved before 0.1.x kept deliverables as translated labels: those that
 *  name a catalog entry become its key, the rest stay as the team's own. Order
 *  is kept and repeats are dropped. */
export function normalizeDeliverables(list: string[]): string[] {
  return [...new Set(list.map((d) => toKey(d, DELIVERABLE_REV)).filter(Boolean))];
}

export const isCatalogDeliverable = (value: string) => DELIVERABLE_KEYS.includes(value);

/** Deliverables as the export shows them: catalog entries in the language of
 *  the export, own entries as typed. */
export const deliverableLabels = (list: string[] | undefined, t: Translate) =>
  normalizeDeliverables(list ?? []).map((d) =>
    isCatalogDeliverable(d) ? t(`testPlan.deliverableLabel.${d}`) : d,
  );

export const toolLabels = (list: string[] | undefined) => (list ?? []).map(toolName);
