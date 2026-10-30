/** The page buttons to show for `page` of `pages` (1-based): the first, the
 *  last and the current one with its neighbours, the first three at the start
 *  and the last three at the end. A gap of one page shows that page; a longer
 *  one shows «…». E.g. page 1 of 24 → 1 2 3 … 24. */
export function pageWindow(page: number, pages: number): (number | "…")[] {
  if (pages <= 0) return [];
  const p = Math.min(Math.max(page, 1), pages);
  const keep = new Set([1, pages, p - 1, p, p + 1]);
  if (p <= 3) [1, 2, 3].forEach((n) => keep.add(n));
  if (p >= pages - 2) [pages - 2, pages - 1, pages].forEach((n) => keep.add(n));
  const nums = [...keep].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  nums.forEach((n, i) => {
    const prev = nums[i - 1];
    if (prev !== undefined && n - prev === 2) out.push(prev + 1);
    else if (prev !== undefined && n - prev > 2) out.push("…");
    out.push(n);
  });
  return out;
}
