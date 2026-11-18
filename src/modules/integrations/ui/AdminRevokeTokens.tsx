import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@shared/ui/Toast";
import { useConfirm } from "@shared/ui/useConfirm";
import { tokensApi } from "../api/tokensApi";
import { tokenFailure } from "./failure";

/** «Revocar sus tokens…» in «Administración › Usuarios» (INT-02, boceto 9):
 *  the server administrator cuts every live token of an account at once (a
 *  leak), without entering each workspace. It never creates tokens. */
export function AdminRevokeTokensButton({ userId, name, disabled }: { userId: string; name: string; disabled?: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const live = (await tokensApi.ofUser(userId)).filter((x) => x.status === "active" || x.status === "inactive");
      if (live.length === 0) {
        toast(t("integrations.admin.none", { name }), "info");
        return;
      }
      const ok = await confirm({
        title: t("integrations.admin.title", { name }),
        message: t("integrations.admin.body", {
          count: live.length,
          name,
          list: live.map((x) => (x.workspaceName ? `«${x.name}» (${x.workspaceName})` : `«${x.name}»`)).join(", "),
        }),
        confirmLabel: t("integrations.admin.confirm", { count: live.length }),
        danger: true,
      });
      if (!ok) return;
      const { revoked } = await tokensApi.revokeAllOf(userId);
      toast(t("integrations.admin.done", { count: revoked, name }), "success");
    } catch (e) {
      toast(tokenFailure(t, e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="ui-btn ui-btn--small"
        disabled={disabled || busy}
        onClick={() => void go()}
        data-testid={`admin-revoke-tokens-${userId}`}
      >
        {t("integrations.admin.button")}
      </button>
      {dialog}
    </>
  );
}
