// How a project numbers its case keys: a literal prefix and a zero-padded
// number (spec §5.1). Shared by Ajustes › General and «Nuevo proyecto».

/** Digits a case key can be padded to. */
export const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8];

/** A sample key: `BM_` and 4 digits → `BM_0001`. */
export const sampleKey = (prefix: string, digits: number, n = 1) =>
  `${prefix}${String(n).padStart(digits, "0")}`;
