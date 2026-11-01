// Words for the cycles screens: refusals of the repository, date ranges and
// the toast after an addition (CYC-01).

import { errorCode, type AddOutcome } from "./types";

type T = (k: string, o?: Record<string, unknown>) => string;

/** A refused save in words: a known code of the repository, anything else
 *  generic. */
export function configurationError(t: T, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const code = errorCode(msg);
  if (code === "match-label-taken") {
    const detail = msg.replace(/^match-label-taken:\s*/, "");
    return t("configurations.error.labelTaken", { detail });
  }
  return t("configurations.saveFailed");
}

/** A refused cycle save or «Ejecutar» in words; an item that cannot be run
 *  is named by its case key (`cycle-item-case-gone: ATS_004`). */
export function cycleError(t: T, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const item = /(cycle-item-case-gone|cycle-item-flow-gone|cycle-item-row-gone|case-key-conflict):\s*(\S+)/.exec(msg);
  if (item) {
    const which = { "cycle-item-case-gone": "caseGone", "cycle-item-flow-gone": "flowGone", "cycle-item-row-gone": "rowGone", "case-key-conflict": "keyConflict" }[item[1]];
    return t(`cycles.error.${which}`, { key: item[2] });
  }
  if (msg.includes("no-configuration-chosen")) return t("cycles.error.noConfigurationChosen");
  if (msg.includes("configuration-missing")) return t("cycles.error.configurationMissing");
  if (msg.includes("dates-out-of-order")) return t("cycles.error.dates");
  if (msg.includes("configuration-archived")) return t("cycles.error.archivedConfiguration");
  if (msg.includes("cycle-closed")) return t("cycles.error.closed");
  if (msg.includes("cycle-empty")) return t("cycles.error.empty");
  if (msg.includes("no-configuration")) return t("cycles.error.noConfiguration");
  return t("cycles.saveFailed");
}

/** «7 nov – 21 nov» from two plan days (read as local days). */
export function dateRange(from: string | null, to: string | null, lang = "es"): string {
  const fmt = (d: string) => {
    const day = new Date(`${d}T00:00:00`);
    if (Number.isNaN(day.getTime())) return d;
    return new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(day).replace(".", "");
  };
  if (from && to) return `${fmt(from)} – ${fmt(to)}`;
  return from ? fmt(from) : to ? fmt(to) : "";
}

/** The toast after an addition: how many, how many were already there, and
 *  which cases are not approved. */
export function addedMessage(t: T, out: AddOutcome): string {
  return [
    t("cycles.add.addedToast", { count: out.added.length }),
    out.skipped ? t("cycles.add.skippedToast", { count: out.skipped }) : "",
    out.overlapping.length ? t("cycles.add.overlappingToast", { keys: out.overlapping.join(", ") }) : "",
    out.notApproved.length ? t("cycles.add.notApprovedToast", { keys: out.notApproved.join(", ") }) : "",
  ]
    .filter(Boolean)
    .join(" ");
}
