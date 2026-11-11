// Acceso a la billetera (ver docs/requisitos-acceso.md).
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;
export const REMEMBER_ME_DAYS = 30;

export interface Credentials {
  user: string;
  password: string;
  rememberMe: boolean;
}

/** Los dos campos son obligatorios. */
export function missingFields(c: Credentials): string[] {
  const missing: string[] = [];
  if (!c.user.trim()) missing.push("user");
  if (!c.password) missing.push("password");
  return missing;
}

/** Bloquea la cuenta tras demasiados intentos fallidos. */
export function isLocked(failedAttempts: number): boolean {
  return failedAttempts >= MAX_FAILED_ATTEMPTS;
}
