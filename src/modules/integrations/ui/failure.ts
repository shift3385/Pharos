import type { TFunction } from "i18next";
import { errorCode } from "../api/tokensApi";

/** What to tell the person when a token request fails, by the server's code. */
export function tokenFailure(t: TFunction, e: unknown): string {
  switch (errorCode(e)) {
    case "forbidden":
    case "workspace_revoked":
    case "workspace_not_found":
    case "admin_required":
      return t("integrations.errors.forbidden");
    case "token_limit":
      return t("integrations.errors.limit");
    case "invalid_expiry":
      return t("integrations.errors.expiry");
    case "not_found":
    case "token_not_found":
      return t("integrations.errors.notFound");
    default:
      return e instanceof TypeError || (e instanceof Error && e.message === "not-authenticated")
        ? t("integrations.errors.offline")
        : t("integrations.errors.generic");
  }
}
