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
};
