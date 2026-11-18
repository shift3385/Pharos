import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@shared/ui/Toast";
import { workspacesApi } from "../api/workspacesApi";
import { useWorkspace } from "./workspaceContext";
import "./workspaces.css";

interface Revoked {
  id: string;
  name: string;
  projects: number;
  pending: number;
}

/** The shell's workspace notices (SYNC-07, bocetos 6 and 7): «Solo lectura»
 *  for a role that changes nothing (a Viewer: the exit criterion «un auditor
 *  no edita»), and a card for each workspace the account lost, whose copy is
 *  deleted only when the person confirms (ADR-0019 decision 2). */
export function WorkspaceNotices() {
  const { t } = useTranslation();
  const toast = useToast();
  const { current, role, reload } = useWorkspace();
  const [revoked, setRevoked] = useState<Revoked[]>([]);

  useEffect(() => {
    const onRevoked = (e: Event) => {
      const lost = (e as CustomEvent<{ workspaces: Revoked[] }>).detail?.workspaces ?? [];
      setRevoked((before) => [...before.filter((r) => !lost.some((l) => l.id === r.id)), ...lost]);
    };
    window.addEventListener("pharos:workspaces-revoked", onRevoked);
    return () => window.removeEventListener("pharos:workspaces-revoked", onRevoked);
  }, []);

  async function drop(w: Revoked) {
    try {
      await workspacesApi.dropCopy(w.id);
      toast(t("workspaces.revoked.dropped", { name: w.name }), "success");
      setRevoked((list) => list.filter((r) => r.id !== w.id));
      await reload();
      window.dispatchEvent(new CustomEvent("pharos:synced"));
    } catch {
      toast(t("workspaces.errors.generic"), "error");
    }
  }

  const readOnly = current && role === "viewer";
  if (!readOnly && revoked.length === 0) return null;
  return (
    <div className="ws-notices">
      {revoked.map((w) => (
        <div key={w.id} className="ui-alert ui-alert--error ws-notice" role="alert" data-testid={`revoked-${w.id}`}>
          <p>
            <strong>{t("workspaces.revoked.title", { name: w.name })}</strong> {t("workspaces.revoked.body")}
          </p>
          <div className="ws-actions">
            <button type="button" className="ui-btn ui-btn--small" onClick={() => setRevoked((l) => l.filter((r) => r.id !== w.id))}>
              {t("workspaces.revoked.later")}
            </button>
            <button type="button" className="ui-btn ui-btn--small ui-btn--danger" onClick={() => void drop(w)} data-testid={`revoked-drop-${w.id}`}>
              {t("workspaces.revoked.drop")}
            </button>
          </div>
        </div>
      ))}
      {readOnly && (
        <p className="ui-alert ui-alert--info ws-notice" role="status" data-testid="workspace-read-only">
          {t("workspaces.readOnly", { name: current.name, role: t(`workspaces.roles.${role}`) })}
        </p>
      )}
    </div>
  );
}
