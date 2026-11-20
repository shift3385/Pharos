import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { Alert } from "@shared/ui/Alert";
import { InfoTip } from "@shared/ui/InfoTip";
import { useToast } from "@shared/ui/Toast";
import { useConfirm } from "@shared/ui/useConfirm";
import { tokensApi, type ApiToken, type IssuedToken, type WorkspaceProject } from "../api/tokensApi";
import { tokenFailure } from "./failure";
import { NewTokenDialog, RotateTokenDialog, TokenCreatedDialog } from "./TokenDialogs";
import { TokensTable } from "./TokensTable";
import "./integrations.css";

/** «Workspace › Integraciones › Tokens de proyecto» (INT-02, bocetos 1, 2, 3
 *  and 7). Every member sees the list; only a Test Manager (`manager`)
 *  creates, rotates, reassigns and revokes. The server checks all of it. */
export function ProjectTokensSection({
  workspace,
  manager,
}: {
  workspace: { id: string; name: string };
  manager: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const { confirm, dialog } = useConfirm();
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [rotating, setRotating] = useState<ApiToken | null>(null);
  const [issued, setIssued] = useState<IssuedToken | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await tokensApi.workspace(workspace.id);
      setTokens(res.tokens);
      setProjects(res.projects);
      setError(null);
    } catch (e) {
      setError(tokenFailure(t, e));
    }
  }, [workspace.id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast(done, "success");
      await load();
    } catch (e) {
      toast(tokenFailure(t, e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(tok: ApiToken) {
    const ok = await confirm({
      title: t("integrations.tokens.revokeTitle", { name: tok.name }),
      message: t("integrations.tokens.revokeProjectBody"),
      confirmLabel: t("integrations.tokens.revoke"),
      danger: true,
    });
    if (ok) await run(() => tokensApi.revokeProject(workspace.id, tok.id), t("integrations.tokens.revoked", { name: tok.name }));
  }

  async function reassign(tok: ApiToken) {
    const ok = await confirm({
      title: t("integrations.tokens.reassignTitle", { name: tok.name }),
      message: t("integrations.tokens.reassignBody", { owner: tok.owner.name }),
      confirmLabel: t("integrations.tokens.reassign"),
    });
    if (ok) await run(() => tokensApi.reassignProject(workspace.id, tok.id), t("integrations.tokens.reassigned", { name: tok.name }));
  }

  return (
    <section className="ws-section" aria-labelledby="int-project-tokens" data-testid="project-tokens">
      <div className="int-head">
        <div className="ui-title-row">
          <h2 id="int-project-tokens" className="ws-section__title">
            {t("integrations.tokens.projectTitle")}
          </h2>
          <InfoTip id="int-project-tokens-help" label={t("integrations.tokens.projectTitle")}>
            {t("integrations.tokens.projectHint")}
          </InfoTip>
        </div>
        {manager && (
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            onClick={() => setCreating(true)}
            disabled={projects.length === 0}
            title={projects.length === 0 ? t("integrations.tokens.noProjects") : undefined}
            data-testid="project-token-new"
          >
            {t("integrations.tokens.new")}
          </button>
        )}
      </div>
      {!manager && <Alert kind="info">{t("integrations.tokens.onlyManager")}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      {tokens && tokens.length === 0 && <p className="int-muted">{t("integrations.tokens.noneProject")}</p>}
      {tokens && tokens.length > 0 && (
        <TokensTable
          tokens={tokens}
          testId="project-tokens-table"
          columns={{ project: true, owner: true, ip: manager }}
          actions={
            manager
              ? (tok) => (
                  <div className="int-actions">
                    {tok.status === "inactive" || tok.owner.id !== user?.id ? (
                      <button type="button" className="ui-btn ui-btn--small" disabled={busy} onClick={() => void reassign(tok)}>
                        {t("integrations.tokens.reassignToMe")}
                      </button>
                    ) : null}
                    {tok.status === "active" && (
                      <button type="button" className="ui-btn ui-btn--small" disabled={busy} onClick={() => setRotating(tok)}>
                        {t("integrations.tokens.rotate")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="ui-btn ui-btn--small ui-btn--danger"
                      disabled={busy}
                      onClick={() => void revoke(tok)}
                      data-testid={`token-revoke-${tok.id}`}
                    >
                      {t("integrations.tokens.revoke")}
                    </button>
                  </div>
                )
              : undefined
          }
        />
      )}

      {creating && (
        <NewTokenDialog
          kind="project"
          workspaceName={workspace.name}
          targets={projects}
          create={({ name, target, scopes, expiresAt }) =>
            tokensApi.createProject(workspace.id, { name, projectId: target ?? "", scopes, expiresAt })
          }
          onCreated={(x) => {
            setCreating(false);
            setIssued(x);
            void load();
          }}
          onCancel={() => setCreating(false)}
        />
      )}
      {rotating && (
        <RotateTokenDialog
          name={rotating.name}
          rotate={(overlap) => tokensApi.rotateProject(workspace.id, rotating.id, overlap)}
          onRotated={(x) => {
            setRotating(null);
            setIssued(x);
            void load();
          }}
          onCancel={() => setRotating(null)}
        />
      )}
      {issued && <TokenCreatedDialog issued={issued} onDone={() => setIssued(null)} />}
      {dialog}
    </section>
  );
}
