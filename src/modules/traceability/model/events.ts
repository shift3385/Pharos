/** Fired on `window` after requirements are created, edited, imported,
 *  migrated, applied from AI proposals or deleted, so the project header
 *  reloads its «N requisitos» count at once (NC-038, MAN-03; the same as
 *  FIX-13 for cases: projects composes traceability and listens). */
export const REQUIREMENTS_CHANGED_EVENT = "pharos:requirements-changed";

/** Tells the listeners that the project's requirements changed. */
export function announceRequirementsChanged(): void {
  window.dispatchEvent(new Event(REQUIREMENTS_CHANGED_EVENT));
}
