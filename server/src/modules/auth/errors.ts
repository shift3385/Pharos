/** Application error mapped to an HTTP status + stable machine-readable code. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
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
