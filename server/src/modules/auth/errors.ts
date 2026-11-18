/** Application error mapped to an HTTP status + stable machine-readable code.
 *  `details` are extra fields of the error body (e.g. the server's current
 *  version of an item on a 409). */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const AuthErrors = {
  emailInUse: () =>
    new AppError(409, "email_in_use", "That email is already registered."),
  invalidCredentials: () =>
    new AppError(401, "invalid_credentials", "Invalid email or password."),
  invalidRefreshToken: () =>
    new AppError(
      401,
      "invalid_refresh_token",
      "The refresh token is invalid or expired.",
    ),
  unauthorized: () =>
    new AppError(401, "unauthorized", "Authentication is required."),
  // Account recovery (SEC-08/09, ADR-0045). None is a 401: the clients take a
  // 401 as "the session is over".
  wrongPassword: () =>
    new AppError(403, "wrong_password", "The current password is not correct."),
  samePassword: () =>
    new AppError(
      400,
      "same_password",
      "The new password must differ from the current one.",
    ),
  invalidRecovery: () =>
    new AppError(400, "invalid_recovery", "Invalid email or recovery code."),
  invalidResetToken: () =>
    new AppError(
      400,
      "invalid_reset_token",
      "The reset link is invalid or has expired.",
    ),
  emailResetDisabled: () =>
    new AppError(
      409,
      "email_reset_disabled",
      "This server does not send email.",
    ),
  tooManyAttempts: () =>
    new AppError(
      429,
      "rate_limited",
      "Too many attempts. Try again in 15 minutes.",
    ),
};
