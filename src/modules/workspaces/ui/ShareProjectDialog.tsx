import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSyncStatus } from "@modules/sync-offline";
import { Dialog } from "@shared/ui/Dialog";
import { FormField } from "@shared/ui/FormField";
import { Select } from "@shared/ui/Select";
import { useToast } from "@shared/ui/Toast";
import { errorCode, workspacesApi } from "../api/workspacesApi";
import { can } from "../model/roles";
import { failureMessage } from "./failure";
import { useWorkspace } from "./workspaceContext";
import "@shared/ui/ConfirmDialog.css";

/** «Compartir con un workspace…» (SYNC-07, boceto 5): moves the project, with
 *  everything under it, to a shared workspace the person manages. The server
 *  does it atomically (ADR-0042 §5); the desktop sends its pending changes
 *  first and pulls the move afterwards. */
export function ShareProjectDialog({
  projectId,
  projectName,
  onDone,
  onCancel,
}: {
  projectId: string;
  projectName: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const id = useId();
  const sync = useSyncStatus();
  const { workspaces, reload, setCurrent } = useWorkspace();
  const shared = useMemo(() => workspaces.filter((w) => w.kind === "shared"), [workspaces]);
  const allowed = shared.filter((w) => can(w.role, "members.manage"));
  const [destination, setDestination] = useState(allowed[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  // The list may arrive after the dialog opens.
  const first = allowed[0]?.id ?? "";
  useEffect(() => {
    if (!destination && first) setDestination(first);
  }, [destination, first]);

  async function share() {
    setBusy(true);
    try {
      const target = allowed.find((w) => w.id === destination);
      await workspacesApi.moveProject(destination, projectId);
      toast(t("workspaces.share.done", { name: projectName, workspace: target?.name ?? "" }), "success");
      sync?.runSync();
      await reload();
      setCurrent(destination);
      onDone();
    } catch (e) {
      if (errorCode(e) === "not_found") {
        // Created on this computer and not sent yet: the server cannot move
        // it. Send it now and say so (FIX-34).
        sync?.runSync();
        toast(t("workspaces.share.notSynced", { name: projectName }), "error");
      } else {
        toast(failureMessage(t, e), "error");
      }
      setBusy(false);
    }
  }

  return (
    <Dialog labelledBy={`${id}-title`} onClose={onCancel} dismissable={!busy}>
      <h3 id={`${id}-title`} className="cd__title">
        {t("workspaces.share.title", { name: projectName })}
      </h3>
      {allowed.length === 0 ? (
        <p className="cd__msg">{t("workspaces.share.noDestination")}</p>
      ) : (
        <>
          <FormField label={t("workspaces.share.destination")}>
            {(p) => (
              <Select<string>
                id={p.id}
                value={destination}
                onChange={setDestination}
                options={shared.map((w) => {
                  const manages = can(w.role, "members.manage");
                  return {
                    value: w.id,
                    label: w.name,
                    disabled: !manages,
                    reason: manages ? undefined : t("workspaces.share.notManager", { role: t(`workspaces.roles.${w.role}`) }),
                  };
                })}
                data-testid="share-destination"
              />
            )}
          </FormField>
          <ul className="cd__msg">
            <li>{t("workspaces.share.what")}</li>
            <li>{t("workspaces.share.who")}</li>
          </ul>
          <p className="ui-alert ui-alert--warning">{t("workspaces.share.online")}</p>
        </>
      )}
      <div className="cd__actions">
        <button type="button" className="cd__cancel" onClick={onCancel} disabled={busy}>
          {t("common.cancel")}
        </button>
        {allowed.length > 0 && (
          <button
            type="button"
            className="cd__confirm"
            onClick={() => void share()}
            disabled={busy || !destination}
            data-testid="share-submit"
          >
            {t("workspaces.share.submit")}
          </button>
        )}
      </div>
    </Dialog>
  );
}
