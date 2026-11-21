import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { accountApi, personName, type AdminUser, type DisableImpact } from "@modules/auth";
import { Alert } from "@shared/ui/Alert";
import { Dialog } from "@shared/ui/Dialog";
import { Select } from "@shared/ui/Select";
import "@shared/ui/ConfirmDialog.css";

// «Desactivar cuenta…» (SEC-12, ADR-0045 amendment B): what happens, an
// optional reason, a new Test Manager for each shared workspace the account
// manages alone, and the email typed to confirm. The server checks it all
// again; this only guides.

export function DisableAccountDialog({
  target,
  onClose,
  onDone,
  failureKey,
}: {
  target: AdminUser;
  onClose: () => void;
  onDone: () => void;
  failureKey: (e: unknown) => string;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [impact, setImpact] = useState<DisableImpact | null>(null);
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [successors, setSuccessors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    accountApi
      .disableImpact(target.id)
      .then(setImpact)
      .catch((e: unknown) => setError(t(failureKey(e))));
  }, [target.id, t, failureKey]);

  const needing = (impact?.managedAlone ?? []).filter(
    (w) => w.candidates.length > 0,
  );
  const ready =
    impact !== null &&
    !impact.lastAdmin &&
    needing.every((w) => successors[w.workspaceId]) &&
    confirmText.trim().toLowerCase() === target.email.toLowerCase();

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await accountApi.setDisabled(target.id, {
        disabled: true,
        reason: reason.trim() || null,
        successors: needing.map((w) => ({
          workspaceId: w.workspaceId,
          userId: successors[w.workspaceId],
        })),
      });
      onDone();
    } catch (e) {
      setError(t(failureKey(e)));
      setBusy(false);
    }
  }

  return (
    <Dialog labelledBy={`${id}-title`} onClose={onClose} dismissable={!busy}>
      <h3 id={`${id}-title`} className="cd__title">
        {t("admin.users.disableTitle", { name: personName(target) })}
      </h3>
      <ul className="usr-list">
        <li>{t("admin.users.disablePoint1")}</li>
        <li>{t("admin.users.disablePoint2")}</li>
        <li>{t("admin.users.disablePoint3")}</li>
      </ul>
      {impact?.lastAdmin && (
        <Alert kind="error">{t("admin.users.disableLastAdmin")}</Alert>
      )}
      <div className="usr-field">
        <label htmlFor={`${id}-reason`}>{t("admin.users.disableReason")}</label>
        <input
          id={`${id}-reason`}
          className="usr-input"
          maxLength={200}
          placeholder={t("admin.users.disableReasonPh")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      {impact && impact.managedAlone.length > 0 && (
        <>
          <Alert kind="warning">
            {t("admin.users.disableManaged", {
              count: impact.managedAlone.length,
            })}
          </Alert>
          {impact.managedAlone.map((w) => (
            <div
              key={w.workspaceId}
              className="usr-ws"
              data-testid={`managed-${w.workspaceId}`}
            >
              <strong>
                {w.name}{" "}
                <span className="usr-muted">
                  {t("admin.users.disableMembers", { count: w.members })}
                </span>
              </strong>
              {w.candidates.length === 0 ? (
                <span className="usr-muted">
                  {t("admin.users.disableNoCandidates")}
                </span>
              ) : (
                <div className="usr-field">
                  <span id={`${id}-${w.workspaceId}`}>
                    {t("admin.users.disableSuccessor")}
                  </span>
                  <Select
                    aria-labelledby={`${id}-${w.workspaceId}`}
                    value={successors[w.workspaceId] ?? ""}
                    placeholder={t("admin.users.disableSuccessorPh")}
                    onChange={(v) =>
                      setSuccessors((s) => ({ ...s, [w.workspaceId]: v }))
                    }
                    options={w.candidates.map((c) => ({
                      value: c.userId,
                      label: c.displayName,
                      description: t(`workspaces.role.${c.role}`, {
                        defaultValue: c.role,
                      }),
                    }))}
                  />
                </div>
              )}
            </div>
          ))}
        </>
      )}
      <div className="usr-field">
        <label htmlFor={`${id}-confirm`}>
          {t("admin.users.disableConfirmLabel", { email: target.email })}
        </label>
        <input
          id={`${id}-confirm`}
          className="usr-input"
          autoComplete="off"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
        />
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      <div className="cd__actions">
        <button
          type="button"
          className="cd__cancel"
          disabled={busy}
          onClick={onClose}
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="cd__confirm cd__confirm--danger"
          disabled={busy || !ready}
          onClick={() => void submit()}
        >
          {t("admin.users.disableConfirm")}
        </button>
      </div>
    </Dialog>
  );
}
