import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerInfo } from "@modules/server-picker";
import { Dialog } from "@shared/ui/Dialog";
import { FormField } from "@shared/ui/FormField";
import { Select } from "@shared/ui/Select";
import { useToast } from "@shared/ui/Toast";
import { workspacesApi, type ExpiryDays, type Invitation } from "../api/workspacesApi";
import { ROLE_ORDER, type WorkspaceRole } from "../model/roles";
import { failureMessage } from "./failure";
import "@shared/ui/ConfirmDialog.css";
import "./workspaces.css";

const EXPIRY: ExpiryDays[] = [1, 7, 30];

/** «Invitar» (SYNC-07, boceto 3): a one-time code with a role. The code is
 *  shown once (the server keeps its hash), with the server's address, so the
 *  person invited reaches the same server. No e-mail is sent. */
export function InviteDialog({
  workspaceId,
  workspaceName,
  onDone,
  onCancel,
}: {
  workspaceId: string;
  workspaceName: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const id = useId();
  const { info } = useServerInfo();
  const [role, setRole] = useState<WorkspaceRole>("test_analyst");
  const [note, setNote] = useState("");
  const [expires, setExpires] = useState<ExpiryDays>(7);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<(Invitation & { code: string }) | null>(null);

  async function create() {
    setBusy(true);
    try {
      setCreated(
        await workspacesApi.invite(workspaceId, {
          role,
          ...(note.trim() ? { note: note.trim() } : {}),
          expiresInDays: expires,
        }),
      );
    } catch (e) {
      toast(failureMessage(t, e), "error");
    } finally {
      setBusy(false);
    }
  }

  const text = created
    ? t("workspaces.invite.text", { name: workspaceName, url: info.origin, code: created.code })
    : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast(t("workspaces.invite.copied"), "success");
    } catch {
      document.getElementById(`${id}-code`)?.focus();
    }
  }

  if (created) {
    const date = new Date(created.expiresAt).toLocaleDateString(i18n.language);
    return (
      <Dialog labelledBy={`${id}-done`} describedBy={`${id}-hint`} onClose={onDone}>
        <h3 id={`${id}-done`} className="cd__title">
          {t("workspaces.invite.createdTitle")}
        </h3>
        <p id={`${id}-hint`} className="cd__msg">
          {t("workspaces.invite.createdHint", { date })}
        </p>
        <p className="ws-code" id={`${id}-code`} tabIndex={-1} aria-label={t("workspaces.invite.codeLabel")}>
          {created.code}
        </p>
        <p className="tp__muted">{t("workspaces.invite.server", { url: info.origin })}</p>
        <p className="tp__muted">{t("workspaces.invite.once")}</p>
        <div className="cd__actions">
          <button type="button" className="cd__cancel" onClick={onDone}>
            {t("common.close")}
          </button>
          <button type="button" className="cd__confirm" onClick={() => void copy()} data-testid="invite-copy">
            {t("workspaces.invite.copy")}
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog labelledBy={`${id}-title`} onClose={onCancel} dismissable={!busy}>
      <h3 id={`${id}-title`} className="cd__title">
        {t("workspaces.invite.title", { name: workspaceName })}
      </h3>
      <FormField label={t("workspaces.invite.role")} hint={t(`workspaces.roleHints.${role}`)}>
        {(p) => (
          <Select<WorkspaceRole>
            id={p.id}
            aria-describedby={p["aria-describedby"]}
            value={role}
            onChange={setRole}
            options={ROLE_ORDER.map((r) => ({ value: r, label: t(`workspaces.roles.${r}`) }))}
            data-testid="invite-role"
          />
        )}
      </FormField>
      <FormField label={t("workspaces.invite.note")}>
        {(p) => <input {...p} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />}
      </FormField>
      <FormField label={t("workspaces.invite.expires")}>
        {(p) => (
          <Select<string>
            id={p.id}
            value={String(expires)}
            onChange={(v) => setExpires(Number(v) as ExpiryDays)}
            options={EXPIRY.map((d) => ({ value: String(d), label: t(`workspaces.invite.days.${d}`) }))}
          />
        )}
      </FormField>
      <div className="cd__actions">
        <button type="button" className="cd__cancel" onClick={onCancel} disabled={busy}>
          {t("common.cancel")}
        </button>
        <button type="button" className="cd__confirm" onClick={() => void create()} disabled={busy} data-testid="invite-create">
          {t("workspaces.invite.submit")}
        </button>
      </div>
    </Dialog>
  );
}
