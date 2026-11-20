import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ApiToken } from "../api/tokensApi";

/** The state of a token as a pill: active, expiring soon, inactive (with why),
 *  expired or revoked. */
export function TokenStatusPill({ token }: { token: ApiToken }) {
  const { t, i18n } = useTranslation();
  if (token.status === "active" && token.expiringSoon) {
    const days = Math.max(1, Math.ceil((new Date(token.expiresAt).getTime() - Date.now()) / 86_400_000));
    return <span className="int-pill int-pill--warn">{t("integrations.status.expiring", { count: days })}</span>;
  }
  const tone = token.status === "active" ? "ok" : token.status === "inactive" ? "err" : "mute";
  const when =
    token.status === "revoked" && token.revokedAt
      ? new Date(token.revokedAt).toLocaleDateString(i18n.language, { dateStyle: "medium" })
      : "";
  return (
    <span className={`int-pill int-pill--${tone}`}>
      {token.status === "revoked" ? t("integrations.status.revokedOn", { date: when }) : t(`integrations.status.${token.status}`)}
    </span>
  );
}

/** A list of tokens. `columns` picks the optional columns; `actions` draws
 *  the buttons of a row (none for someone who only reads). */
export function TokensTable({
  tokens,
  columns,
  actions,
  testId,
}: {
  tokens: ApiToken[];
  columns: { project?: boolean; workspace?: boolean; owner?: boolean; ip?: boolean };
  actions?: (token: ApiToken) => ReactNode;
  testId?: string;
}) {
  const { t, i18n } = useTranslation();
  const date = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "short" }) : t("integrations.tokens.never");
  return (
    <div className="ws-table-wrap">
      <table className="ws-table int-table" data-testid={testId}>
        <thead>
          <tr>
            <th scope="col">{t("integrations.tokens.name")}</th>
            {columns.project && <th scope="col">{t("integrations.tokens.project")}</th>}
            {columns.workspace && <th scope="col">{t("integrations.tokens.workspaces")}</th>}
            <th scope="col">{t("integrations.tokens.scopes")}</th>
            {columns.owner && <th scope="col">{t("integrations.tokens.owner")}</th>}
            <th scope="col">{t("integrations.tokens.expires")}</th>
            <th scope="col">{t("integrations.tokens.lastUsed")}</th>
            <th scope="col">{t("integrations.tokens.status")}</th>
            {actions && <th scope="col">{t("integrations.tokens.actions")}</th>}
          </tr>
        </thead>
        <tbody>
          {tokens.map((tok) => (
            <tr key={tok.id} data-testid={`token-${tok.id}`}>
              <td className="int-nowrap">
                {tok.name}
                <br />
                <code className="int-prefix">{tok.displayPrefix}…</code>
              </td>
              {columns.project && <td>{tok.projectName ?? tok.projectId}</td>}
              {columns.workspace && <td className="int-nowrap">{tok.workspaceName ?? t("integrations.tokens.allWorkspaces")}</td>}
              <td className="int-scopes">
                {tok.scopes.map((s) => (
                  <code key={s} className="int-chip">
                    {s}
                  </code>
                ))}
              </td>
              {columns.owner && <td className="int-nowrap">{tok.owner.name}</td>}
              <td className="int-num">
                {tok.status === "revoked" ? "—" : new Date(tok.expiresAt).toLocaleDateString(i18n.language, { dateStyle: "medium" })}
              </td>
              <td className="int-num">
                {date(tok.lastUsedAt)}
                {columns.ip && tok.lastUsedIp && (
                  <>
                    <br />
                    <span className="int-muted">{tok.lastUsedIp}</span>
                  </>
                )}
              </td>
              <td>
                <TokenStatusPill token={tok} />
                {tok.status === "inactive" && (
                  <>
                    <br />
                    <span className="int-muted">{t(tok.inactiveReason === "owner_disabled" ? "integrations.status.ownerDisabled" : "integrations.status.ownerLeft", {
                        name: tok.owner.name,
                      })}</span>
                  </>
                )}
              </td>
              {actions && <td>{tok.status === "revoked" || tok.status === "expired" ? null : actions(tok)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
