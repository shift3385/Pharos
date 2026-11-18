// Removing a key on the desktop that the web also uses (IA-12, ADR-0034): the
// copy on the server goes too, so the user is told first.
import type { ConfirmOptions } from "@shared/ui/useConfirm";
import type { OnlineProviderId } from "../model/types";
import { webCopyOf } from "../api/webAccess";

/** Before the desktop removes `provider`'s key: true when the server keeps a
 *  copy for the web (it goes too) and the user agreed, false when there is no
 *  copy, null when the user cancelled. */
export async function askClearWebCopy(
  provider: OnlineProviderId,
  providerLabel: string,
  confirm: (options: ConfirmOptions) => Promise<boolean>,
  t: (key: string, options?: Record<string, unknown>) => string,
): Promise<boolean | null> {
  if (!(await webCopyOf(provider))) return false;
  const ok = await confirm({
    title: t("ai.web.clearKey.title"),
    message: t("ai.web.clearKey.message", { provider: providerLabel }),
    confirmLabel: t("ai.web.clearKey.confirm"),
    danger: true,
  });
  return ok ? true : null;
}
