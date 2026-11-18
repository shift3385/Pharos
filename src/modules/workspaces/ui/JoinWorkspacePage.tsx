import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { useSyncStatus } from "@modules/sync-offline";
import { FormField } from "@shared/ui/FormField";
import { useToast } from "@shared/ui/Toast";
import { workspacesApi } from "../api/workspacesApi";
import type { WorkspaceRole } from "../model/roles";
import { failureMessage } from "./failure";
import { useWorkspace } from "./workspaceContext";
import "./workspaces.css";

/** «Unirse a un workspace» (SYNC-07, boceto 4). The code is checked first
 *  (read only: workspace, role and who invited) and used only on «Unirme».
 *  `/workspaces/join?code=…` fills it in (an invitation notification). */
export function JoinWorkspacePage() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { reload, setCurrent } = useWorkspace();
  const sync = useSyncStatus();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [preview, setPreview] = useState<{ workspaceName: string; role: WorkspaceRole; invitedBy: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPreview(null);
    setError(null);
  }, [code]);

  async function check() {
    setBusy(true);
    try {
      setPreview(await workspacesApi.preview(code.trim()));
    } catch (e) {
      setError(failureMessage(t, e));
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    setBusy(true);
    try {
      const joined = await workspacesApi.accept(code.trim());
      toast(t("workspaces.join.joined", { name: joined.name }), "success");
      // Its projects arrive with a sync (desktop); the web reads the server.
      sync?.runSync();
      await reload();
      setCurrent(joined.id);
      void navigate("/projects");
    } catch (e) {
      setError(failureMessage(t, e));
      setBusy(false);
    }
  }

  return (
    <section className="ws-page ws-page--narrow" aria-labelledby="ws-join-title">
      <h1 id="ws-join-title" className="ws-page__title">
        {t("workspaces.join.title")}
      </h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void (preview ? join() : check());
        }}
      >
        <FormField label={t("workspaces.join.code")}>
          {(p) => (
            <input
              {...p}
              value={code}
              autoComplete="off"
              spellCheck={false}
              placeholder="PHX-…"
              onChange={(e) => setCode(e.target.value)}
              data-testid="join-code"
            />
          )}
        </FormField>
        {error && (
          <p className="ws-error" role="alert">
            {error}
          </p>
        )}
        {preview && (
          <div className="ui-alert ui-alert--info" role="status">
            <p>
              {t("workspaces.join.preview", {
                name: preview.workspaceName,
                role: t(`workspaces.roles.${preview.role}`),
                by: preview.invitedBy,
              })}
            </p>
            <p className="tp__muted">{t("workspaces.join.note")}</p>
          </div>
        )}
        <div className="ws-actions">
          <button type="button" className="ui-btn" onClick={() => void navigate(-1)} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="ui-btn ui-btn--primary" disabled={busy || !code.trim()} data-testid="join-submit">
            {preview ? t("workspaces.join.submit") : t("workspaces.join.check")}
          </button>
        </div>
      </form>
    </section>
  );
}
