// Catalog keys ↔ labels for deliverables and tools (ADR-0030). A plan stores
// catalog keys plus the team's own entries as typed; labels are only for show,
// export and import.
import esLocale from "@shared/i18n/locales/es.json";
import enLocale from "@shared/i18n/locales/en.json";
import { reverse, toKey } from "@shared/import/xlsx";
import { DELIVERABLE_KEYS, TEST_LEVELS, TEST_TYPES, TOOL_NAMES, TYPE_GROUPS, toolName } from "./catalogs";

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

export const toolLabels = (list: string[] | undefined) =>
  normalizeTools(list ?? []).map(toolName);

/** Tools typed as text before the catalog («Jest», «GitHub Actions») become
 *  its keys; the rest stay as the team's own. Order is kept and repeats are
 *  dropped (ADR-0030). */
export function normalizeTools(list: string[]): string[] {
  return [...new Set(list.map((d) => toKey(d, TOOL_REV)).filter(Boolean))];
}

/** Catalog keys in catalog order, then the team's own in their order; repeats
 *  dropped. Exports follow the step's groups whatever order they were ticked. */
function byCatalog(list: string[], keys: string[]): string[] {
  const set = new Set(list);
  return [...keys.filter((k) => set.has(k)), ...new Set(list.filter((v) => !keys.includes(v)))];
}

/** Test types as the exports show them (UX-31): by group, catalog entries
 *  in the export's language, own ones as typed. */
export const typeLabels = (list: string[] | undefined, t: Translate) =>
  byCatalog(list ?? [], TEST_TYPES).map((k) => (TEST_TYPES.includes(k) ? t(`testPlan.typeLabel.${k}`) : k));

/** Test levels as the exports show them, from unit to acceptance. */
export const levelLabels = (list: string[] | undefined, t: Translate) =>
  byCatalog(list ?? [], TEST_LEVELS).map((k) => (TEST_LEVELS.includes(k) ? t(`testPlan.levelLabel.${k}`) : k));

/** The types one line per group of the step, for the PDF: «Funcionales:
 *  Funcionales, Exploratorias», …, «Propios: …». Empty groups are left out. */
export function typeGroupLines(list: string[] | undefined, t: Translate): string[] {
  const chosen = new Set(list ?? []);
  const groups = TYPE_GROUPS.map((g) => ({
    title: t(`testPlan.typeGroup.${g.id}`),
    items: g.keys.filter((k) => chosen.has(k)).map((k) => t(`testPlan.typeLabel.${k}`)),
  }));
  const own = [...chosen].filter((v) => !TEST_TYPES.includes(v));
  groups.push({ title: t("testPlan.typeGroup.own"), items: own });
  return groups.filter((g) => g.items.length > 0).map((g) => `${g.title}: ${g.items.join(", ")}`);
}
