// Toasts from code outside React (saveFile, PDF rendering): a window event the
// ToastProvider listens to. `ReportedError` marks a failure whose toast was
// already shown, so callers can stop quietly instead of showing it twice or
// leaving an unhandled rejection.

export type ToastKind = "success" | "warning" | "error";

export const TOAST_EVENT = "pharos:toast";

export interface ToastDetail {
  message: string;
  kind: ToastKind;
}

export function notify(message: string, kind: ToastKind = "success"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { message, kind } }),
  );
}

/** A failure the user has already been told about (see `notify`). */
export class ReportedError extends Error {
  readonly reported = true;
  constructor(message: string) {
    super(message);
    this.name = "ReportedError";
  }
}

/** Awaits `promise`; a `ReportedError` resolves to `undefined` (the toast is
 *  already up), anything else is rethrown. */
export async function unlessReported<T>(
  promise: Promise<T>,
): Promise<T | undefined> {
  try {
    return await promise;
  } catch (e) {
    if (e instanceof ReportedError) return undefined;
    throw e;
  }
}
