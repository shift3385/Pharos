import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { useAuth } from "@modules/auth";
import { Alert } from "@shared/ui/Alert";
import { Select } from "@shared/ui/Select";
import { Switch } from "@shared/ui/Switch";
import { TabPanel, Tabs } from "@shared/ui/Tabs";
import { ProjectTokensSection } from "@modules/integrations";
import { useSyncStatus } from "@modules/sync-offline";
import { isTauri } from "@shared/platform";
import { useToast } from "@shared/ui/Toast";
import { useConfirm } from "@shared/ui/useConfirm";
import { workspacesApi, type Invitation, type Member } from "../api/workspacesApi";
import { can, ROLE_ORDER, type WorkspaceRole } from "../model/roles";
import { failureMessage } from "./failure";
import { InviteDialog } from "./InviteDialog";
import { useWorkspace } from "./workspaceContext";
import "./workspaces.css";

const nameOf = (m: Member) => m.displayName || [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email;

/** «Miembros y roles» (SYNC-07, boceto 2). Everyone sees the members; only a
 *  Test Manager changes roles, removes people and handles invitations. The
 *  server guards all of it (never without a Test Manager). The tab
 *  «Integraciones» holds the workspace's project tokens (INT-02, ADR-0052). */
export function WorkspaceMembersPage() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const { confirm, dialog } = useConfirm();
  const [params, setParams] = useSearchParams();
  // «Miembros» or «Integraciones» (INT-02, ADR-0052): `?tab=integrations`.
  const tab = params.get("tab") === "integrations" ? "integrations" : "members";
  const { workspaces, current, reload } = useWorkspace();
  const sync = useSyncStatus();
  const workspace = workspaces.find((w) => w.id === params.get("id")) ?? current;
  const manager = workspace?.kind === "shared" && can(workspace.role, "members.manage");
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviting, setInviting] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!workspace) return;
    try {
      setMembers(await workspacesApi.members(workspace.id));
    } catch {
      // Offline: what the last sync brought.
      setMembers(workspace.members);
    }
    if (manager) {
      try {
        setInvitations(await workspacesApi.invitations(workspace.id));
      } catch {
        setInvitations([]);
      }
    }
  }, [workspace, manager]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!workspace) {
    return (
      <section className="ws-page">
        <h1 className="ws-page__title">{t("workspaces.switcher.members")}</h1>
        <p className="tp__muted">{t("workspaces.members.none")}</p>
      </section>
    );
  }

  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true);
    try {
      await action();
      if (done) toast(done, "success");
      await Promise.all([load(), reload()]);
    } catch (e) {
      toast(failureMessage(t, e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: Member) {
    const self = m.userId === user?.id;
    const ok = await confirm({
      title: self
        ? t("workspaces.members.leaveTitle", { workspace: workspace!.name })
        : t("workspaces.members.removeTitle", { name: nameOf(m) }),
      message: self
        ? t("workspaces.members.leaveConfirm")
        : t("workspaces.members.removeConfirm", { name: nameOf(m), workspace: workspace!.name }),
      confirmLabel: self ? t("workspaces.members.leave") : t("workspaces.members.remove"),
      danger: true,
    });
    if (!ok) return;
    await run(
      () => workspacesApi.removeMember(workspace!.id, m.userId),
      self ? undefined : t("workspaces.members.removed", { name: nameOf(m) }),
    );
  }

  /** «Aprobación independiente» (PLN-08, ADR-0049): turning it off asks
   *  first. The desktop's copy follows with a sync. */
  async function setIndependent(enabled: boolean) {
    if (!enabled) {
      const ok = await confirm({
        title: t("workspaces.rules.disableTitle"),
        message: t("workspaces.rules.disableConfirm", { workspace: workspace!.name }),
        confirmLabel: t("workspaces.rules.disable"),
      });
      if (!ok) return;
    }
    await run(
      async () => {
        await workspacesApi.setIndependentApproval(workspace!.id, enabled);
        if (isTauri()) sync?.runSync();
      },
      t(enabled ? "workspaces.rules.enabled" : "workspaces.rules.disabled"),
    );
  }

  // Only active Test Managers count (SEC-12): a disabled one is not.
  const managers = (members ?? []).filter((m) => m.role === "test_manager" && !m.disabled).length;
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(i18n.language) : "");

  return (
    <section className="ws-page" aria-labelledby="ws-members-title">
      <header className="ws-page__head">
        <h1 id="ws-members-title" className="ws-page__title">
          {t("workspaces.members.title", { name: workspace.name })}
        </h1>
        {manager && tab === "members" && (
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => setInviting(true)} data-testid="members-invite">
            {t("workspaces.members.invite")}
          </button>
        )}
      </header>
      <Tabs
        label={t("workspaces.tabs.label")}
        variant="underline"
        idPrefix="ws-"
        items={[
          { id: "members", label: t("workspaces.tabs.members") },
          { id: "integrations", label: t("workspaces.tabs.integrations") },
        ]}
        value={tab}
        onChange={(id) => {
          const next = new URLSearchParams(params);
          if (id === "members") next.delete("tab");
          else next.set("tab", id);
          setParams(next, { replace: true });
        }}
      />
      {tab === "integrations" ? (
        <TabPanel id="integrations" idPrefix="ws-">
          <ProjectTokensSection workspace={workspace} manager={can(workspace.role, "token.manage")} />
        </TabPanel>
      ) : (
      <TabPanel id="members" idPrefix="ws-">
      {workspace.kind === "personal" && <Alert kind="info">{t("workspaces.members.personal")}</Alert>}
      {workspace.kind === "shared" && !manager && <p className="tp__muted">{t("workspaces.members.readOnly")}</p>}

      <div className="ws-table-wrap">
        <table className="ws-table">
          <thead>
            <tr>
              <th scope="col">{t("workspaces.members.person")}</th>
              <th scope="col">{t("workspaces.members.email")}</th>
              <th scope="col">{t("workspaces.members.role")}</th>
              <th scope="col">{t("workspaces.members.since")}</th>
              {workspace.kind === "shared" && <th scope="col">{t("workspaces.members.actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((m) => {
              const self = m.userId === user?.id;
              const lastManager = m.role === "test_manager" && managers <= 1;
              return (
                <tr key={m.userId} data-testid={`member-${m.userId}`}>
                  <td>
                    {nameOf(m)} {self && <span className="ui-badge">{t("workspaces.members.you")}</span>}
                    {m.disabled && (
                      <span className="ui-badge" title={t("workspaces.members.disabledHint")}>
                        {t("workspaces.members.disabled")}
                      </span>
                    )}
                  </td>
                  <td>{m.email}</td>
                  <td>
                    {manager ? (
                      <Select<WorkspaceRole>
                        aria-label={t("workspaces.members.role")}
                        value={m.role}
                        disabled={busy || lastManager}
                        title={lastManager ? t("workspaces.members.lastManager") : undefined}
                        onChange={(role) =>
                          void run(
                            () => workspacesApi.setRole(workspace.id, m.userId, role),
                            t("workspaces.members.roleChanged", { name: nameOf(m), role: t(`workspaces.roles.${role}`) }),
                          )
                        }
                        options={ROLE_ORDER.map((r) => ({ value: r, label: t(`workspaces.roles.${r}`) }))}
                      />
                    ) : (
                      t(`workspaces.roles.${m.role}`)
                    )}
                  </td>
                  <td>{date(m.addedAt)}</td>
                  {workspace.kind === "shared" && (
                    <td>
                      {(manager || self) && (
                        <button
                          type="button"
                          className="ui-btn ui-btn--small ui-btn--danger"
                          disabled={busy || lastManager}
                          title={lastManager ? t("workspaces.members.lastManager") : undefined}
                          onClick={() => void remove(m)}
                        >
                          {self ? t("workspaces.members.leave") : t("workspaces.members.remove")}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="ws-section" aria-labelledby="ws-rules" data-testid="workspace-rules">
        <h2 id="ws-rules" className="ws-section__title">
          {t("workspaces.rules.title")}
        </h2>
        <div className="ws-rule">
          <Switch
            label={t("workspaces.rules.independent")}
            checked={workspace.kind === "shared" && workspace.independentApproval === true}
            disabled={busy || !manager}
            title={
              workspace.kind === "personal"
                ? t("workspaces.rules.personalLocked")
                : !manager
                  ? t("workspaces.rules.onlyManager")
                  : undefined
            }
            describedBy="ws-rule-hint"
            testId="workspace-independent-approval"
            onChange={(on) => void setIndependent(on)}
          />
          <p id="ws-rule-hint" className="ws-rule__hint">
            {t(workspace.kind === "personal" ? "workspaces.rules.personalHint" : "workspaces.rules.independentHint")}
          </p>
        </div>
      </section>

      {manager && (
        <section className="ws-section" aria-labelledby="ws-invitations">
          <h2 id="ws-invitations" className="ws-section__title">
            {t("workspaces.members.invitations")}
          </h2>
          {invitations.length === 0 ? (
            <p className="tp__muted">{t("workspaces.members.noInvitations")}</p>
          ) : (
            <div className="ws-table-wrap">
              <table className="ws-table">
                <thead>
                  <tr>
                    <th scope="col">{t("workspaces.members.invFor")}</th>
                    <th scope="col">{t("workspaces.members.role")}</th>
                    <th scope="col">{t("workspaces.members.expires")}</th>
                    <th scope="col">{t("workspaces.members.status")}</th>
                    <th scope="col">{t("workspaces.members.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((inv) => (
                    <tr key={inv.id}>
                      <td>{inv.note ?? <span className="tp__muted">{t("workspaces.members.noNote")}</span>}</td>
                      <td>{t(`workspaces.roles.${inv.role}`)}</td>
                      <td>{date(inv.expiresAt)}</td>
                      <td>
                        <span className={`ui-badge ws-status--${inv.status}`}>{t(`workspaces.members.statuses.${inv.status}`)}</span>
                      </td>
                      <td>
                        {inv.status === "pending" && (
                          <button
                            type="button"
                            className="ui-btn ui-btn--small"
                            disabled={busy}
                            onClick={() => void run(() => workspacesApi.revokeInvitation(workspace.id, inv.id))}
                          >
                            {t("workspaces.members.revoke")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <details className="ws-section">
        <summary>{t("workspaces.members.roles")}</summary>
        <dl className="ws-roles">
          {ROLE_ORDER.map((r) => (
            <div key={r}>
              <dt>{t(`workspaces.roles.${r}`)}</dt>
              <dd>{t(`workspaces.roleHints.${r}`)}</dd>
            </div>
          ))}
        </dl>
      </details>
      </TabPanel>
      )}

      {inviting && (
        <InviteDialog
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          onCancel={() => setInviting(false)}
          onDone={() => {
            setInviting(false);
            void load();
          }}
        />
      )}
      {dialog}
    </section>
  );
}
