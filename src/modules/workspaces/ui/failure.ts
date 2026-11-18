import type { TFunction } from "i18next";
import { errorCode } from "../api/workspacesApi";

/** What to tell the person when a workspace request fails, by the server's
 *  code (ADR-0042 §2); the network being away is «needs the server». */
export function failureMessage(t: TFunction, e: unknown): string {
  switch (errorCode(e)) {
    case "forbidden":
    case "workspace_revoked":
    case "workspace_not_found":
      return t("workspaces.errors.forbidden");
    case "last_test_manager":
      return t("workspaces.errors.lastManager");
    case "personal_workspace":
      return t("workspaces.errors.personal");
    case "invitation_invalid":
      return t("workspaces.join.invalid");
    case "already_member":
      return t("workspaces.join.already");
    default:
      return e instanceof TypeError || (e instanceof Error && e.message === "not-authenticated")
        ? t("workspaces.errors.offline")
        : t("workspaces.errors.generic");
  }
}
