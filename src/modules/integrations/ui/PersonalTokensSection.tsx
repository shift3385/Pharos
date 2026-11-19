import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "@shared/ui/Alert";
import { useToast } from "@shared/ui/Toast";
import { useConfirm } from "@shared/ui/useConfirm";
import { tokensApi, type ApiToken, type IssuedToken } from "../api/tokensApi";
import { tokenFailure } from "./failure";
import { UseInCliHint } from "./ConnectCiSection";
import { NewTokenDialog, TokenCreatedDialog, type TokenTarget } from "./TokenDialogs";
import { TokensTable } from "./TokensTable";
import "./integrations.css";

/** «Mi perfil › Tokens personales» (INT-02, boceto 8): the person's own
 *  tokens for the CLI. `workspaces`: theirs, to limit a token to one. */
export function PersonalTokensSection({ workspaces }: { workspaces: TokenTarget[] }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<IssuedToken | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setTokens(await tokensApi.mine());
      setError(null);
    } catch (e) {
      setError(tokenFailure(t, e));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(tok: ApiToken) {
    const ok = await confirm({
      title: t("integrations.tokens.revokeTitle", { name: tok.name }),
      message: t("integrations.tokens.revokePersonalBody"),
      confirmLabel: t("integrations.tokens.revoke"),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await tokensApi.revokeMine(tok.id);
      toast(t("integrations.tokens.revoked", { name: tok.name }), "success");
      await load();
    } catch (e) {
      toast(tokenFailure(t, e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="profile-card int-personal" aria-labelledby="int-personal-tokens" data-testid="personal-tokens">
      <div className="int-head">
        <h2 id="int-personal-tokens" className="profile-card__title">
          {t("integrations.tokens.personalTitle")}
        </h2>
        <button type="button" className="ui-btn ui-btn--primary" onClick={() => setCreating(true)} data-testid="personal-token-new">
          {t("integrations.tokens.newPersonal")}
        </button>
      </div>
      <p className="tp__muted">{t("integrations.tokens.personalHint")}</p>
      <UseInCliHint />
      {error && <Alert kind="error">{error}</Alert>}
      {tokens && tokens.length === 0 && <p className="tp__muted">{t("integrations.tokens.nonePersonal")}</p>}
      {tokens && tokens.length > 0 && (
        <TokensTable
          tokens={tokens}
          testId="personal-tokens-table"
          columns={{ workspace: true, ip: true }}
          actions={(tok) => (
            <button type="button" className="ui-btn ui-btn--small ui-btn--danger" disabled={busy} onClick={() => void revoke(tok)}>
              {t("integrations.tokens.revoke")}
            </button>
          )}
        />
      )}
      {creating && (
        <NewTokenDialog
          kind="personal"
          targets={workspaces}
          allTargetsLabel={t("integrations.tokens.allWorkspaces")}
          create={({ name, target, scopes, expiresAt }) => tokensApi.createPersonal({ name, workspaceId: target, scopes, expiresAt })}
          onCreated={(x) => {
            setCreating(false);
            setIssued(x);
            void load();
          }}
          onCancel={() => setCreating(false)}
        />
      )}
      {issued && <TokenCreatedDialog issued={issued} onDone={() => setIssued(null)} />}
      {dialog}
    </section>
  );
}
