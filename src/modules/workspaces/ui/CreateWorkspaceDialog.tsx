import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "@shared/ui/Dialog";
import { FormField } from "@shared/ui/FormField";
import { useToast } from "@shared/ui/Toast";
import { required, type Issue } from "@shared/validation";
import { workspacesApi, type Workspace } from "../api/workspacesApi";
import { failureMessage } from "./failure";
import "@shared/ui/ConfirmDialog.css";

/** «Crear workspace» (SYNC-07): a shared workspace whose Test Manager is the
 *  person who creates it. Needs the server. */
export function CreateWorkspaceDialog({
  onCreated,
  onCancel,
}: {
  onCreated: (w: Workspace) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const id = useId();
  const [name, setName] = useState("");
  const [issue, setIssue] = useState<Issue | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    const missing = required(name);
    if (missing) {
      setIssue(missing);
      return;
    }
    setBusy(true);
    try {
      const created = await workspacesApi.create(name.trim());
      toast(t("workspaces.create.created", { name: created.name }), "success");
      onCreated(created);
    } catch (e) {
      toast(failureMessage(t, e), "error");
      setBusy(false);
    }
  }

  return (
    <Dialog labelledBy={`${id}-title`} describedBy={`${id}-hint`} onClose={onCancel} dismissable={!busy}>
      <form
        className="ws-dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <h3 id={`${id}-title`} className="cd__title">
          {t("workspaces.create.title")}
        </h3>
        <p id={`${id}-hint`} className="cd__msg">
          {t("workspaces.create.hint")}
        </p>
        <FormField label={t("workspaces.create.name")} issue={issue} required>
          {(p) => (
            <input
              {...p}
              value={name}
              maxLength={120}
              autoFocus
              onChange={(e) => {
                setName(e.target.value);
                setIssue(null);
              }}
            />
          )}
        </FormField>
        <div className="cd__actions">
          <button type="button" className="cd__cancel" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="cd__confirm" disabled={busy}>
            {t("workspaces.create.submit")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
