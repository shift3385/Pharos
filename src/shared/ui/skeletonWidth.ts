const WIDTHS = ["72%", "48%", "86%", "60%", "78%", "54%"];

/** Varied but stable widths, so a list of placeholders looks like text. */
export const skeletonWidth = (index: number) => WIDTHS[index % WIDTHS.length];
