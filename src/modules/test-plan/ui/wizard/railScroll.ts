// Where the plan's step list scrolls so the current step is seen (FIX-44).

/** The rail's scroll that shows `step` whole: unchanged when it already is,
 *  else the step centred in the rail. */
export function railScrollFor(rail: HTMLElement, step: HTMLElement): number {
  const box = rail.getBoundingClientRect();
  const at = step.getBoundingClientRect();
  if (at.top >= box.top && at.bottom <= box.bottom) return rail.scrollTop;
  return Math.max(0, rail.scrollTop + at.top - box.top - (box.height - at.height) / 2);
}
