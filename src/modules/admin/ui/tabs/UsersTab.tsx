import { useCallback, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Search } from "lucide-react";
import {
  accountApi,
  ApiError,
  NetworkError,
  useAuth,
  type AdminReset,
  type AdminUser,
} from "@modules/auth";
import { AdminRevokeTokensButton } from "@modules/integrations";
import { Alert } from "@shared/ui/Alert";
import { Dialog } from "@shared/ui/Dialog";
import { useToast } from "@shared/ui/Toast";
import { useConfirm } from "@shared/ui/useConfirm";
import "@shared/ui/ConfirmDialog.css";
import "./UsersTab.css";

// Administración › Usuarios (SEC-11, SEC-09 by an administrator; ADR-0045):
// every account of this server, for a server administrator. Reset a password
// with a single-use link (emailed, or shown once to hand over) and name or
// remove administrators; the last one stays. The server checks the role on
// every request; a 403 here means it was just removed.

const PAGE = 50;

function failureKey(error: unknown): string {
  if (error instanceof NetworkError) return "admin.users.error.network";
  if (error instanceof ApiError) {
    const known = [
      "admin_required",
      "last_admin",
      "admin_reset_self",
      "user_not_found",
      "email_reset_disabled",
      "rate_limited",
    ];
    if (known.includes(error.code)) return `admin.users.error.${error.code}`;
  }
  return "admin.users.error.generic";
}

export function UsersTab() {
  const { t, i18n } = useTranslation();
  const { user, offline, updateUser } = useAuth();
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const searchId = useId();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<{
    users: AdminUser[];
    total: number;
    admins: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailReset, setEmailReset] = useState(false);
  const [resetting, setResetting] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await accountApi.adminUsers(query, 0, PAGE));
      setError(null);
    } catch (e) {
      setError(t(failureKey(e)));
    }
  }, [query, t]);

  useEffect(() => {
    if (!offline) void load();
  }, [load, offline]);

  useEffect(() => {
    accountApi
      .capabilities()
      .then((c) => setEmailReset(c.emailReset))
      .catch(() => setEmailReset(false));
  }, []);

  // Searching waits for a pause in typing.
  useEffect(() => {
    const id = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(id);
  }, [search]);

  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage, {
      dateStyle: "medium",
    }).format(new Date(iso));

  async function toggleAdmin(u: AdminUser) {
    const self = u.id === user?.id;
    const ok = await confirm(
      u.isAdmin
        ? {
            title: self
              ? t("admin.users.revokeSelfTitle")
              : t("admin.users.revokeTitle", { name: u.displayName }),
            message: self
              ? t("admin.users.revokeSelfBody")
              : t("admin.users.revokeBody", { name: u.displayName }),
            confirmLabel: t("admin.users.revokeConfirm"),
            danger: true,
          }
        : {
            title: t("admin.users.grantTitle", { name: u.displayName }),
            message: t("admin.users.grantBody", { name: u.displayName }),
            confirmLabel: t("admin.users.grantConfirm"),
          },
    );
    if (!ok) return;
    setBusy(true);
    try {
      await accountApi.setAdmin(u.id, !u.isAdmin);
      toast(
        u.isAdmin
          ? t("admin.users.revoked", { name: u.displayName })
          : t("admin.users.granted", { name: u.displayName }),
        "success",
      );
      if (self) await updateUser({ isAdmin: false });
      else await load();
    } catch (e) {
      toast(t(failureKey(e)), "error");
    } finally {
      setBusy(false);
    }
  }

  if (offline) {
    return (
      <div className="adm-stack">
        <Alert kind="info">{t("admin.users.offline")}</Alert>
      </div>
    );
  }

  const lastAdmin = (data?.admins ?? 0) <= 1;

  return (
    <div className="adm-stack">
      <div className="adm-card">
        <div className="usr-head">
          <h2 className="usr-title">{t("admin.users.title")}</h2>
          {data && (
            <span className="usr-pill" data-testid="admins-count">
              {t("admin.users.adminsCount", { count: data.admins })}
            </span>
          )}
          {data && (
            <span className="usr-muted">
              {t("admin.users.total", { count: data.total })}
            </span>
          )}
        </div>
        <p className="usr-muted">{t("admin.users.intro")}</p>
        <label className="usr-search" htmlFor={searchId}>
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">{t("admin.users.search")}</span>
          <input
            id={searchId}
            type="search"
            placeholder={t("admin.users.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {error && <Alert kind="error">{error}</Alert>}
        {data && (
          <div className="usr-table-wrap">
            <table className="usr-table">
              <thead>
                <tr>
                  <th scope="col">{t("admin.users.person")}</th>
                  <th scope="col">{t("admin.users.email")}</th>
                  <th scope="col">{t("admin.users.since")}</th>
                  <th scope="col">{t("admin.users.codes")}</th>
                  <th scope="col">{t("admin.users.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => {
                  const self = u.id === user?.id;
                  const blockRevoke = u.isAdmin && lastAdmin;
                  return (
                    <tr key={u.id} data-testid={`user-${u.id}`}>
                      <td>
                        <span className="usr-name">{u.displayName}</span>{" "}
                        {self && (
                          <span className="ui-badge">
                            {t("admin.users.you")}
                          </span>
                        )}{" "}
                        {u.isAdmin && (
                          <span className="usr-pill usr-pill--admin">
                            {t("admin.users.admin")}
                          </span>
                        )}
                      </td>
                      <td>{u.email}</td>
                      <td>{date(u.createdAt)}</td>
                      <td>
                        {u.recoveryCodes.total === 0
                          ? t("admin.users.noCodes")
                          : t("admin.users.codesLeft", {
                              remaining: u.recoveryCodes.remaining,
                              total: u.recoveryCodes.total,
                            })}
                      </td>
                      <td>
                        <div className="usr-actions">
                          {!self && (
                            <button
                              type="button"
                              className="ui-btn ui-btn--small"
                              disabled={busy}
                              onClick={() => setResetting(u)}
                            >
                              <KeyRound size={14} aria-hidden="true" />
                              {t("admin.users.reset")}
                            </button>
                          )}
                          <button
                            type="button"
                            className="ui-btn ui-btn--small"
                            disabled={busy || blockRevoke}
                            title={
                              blockRevoke
                                ? t("admin.users.lastAdmin")
                                : undefined
                            }
                            onClick={() => void toggleAdmin(u)}
                          >
                            {u.isAdmin
                              ? t("admin.users.revoke")
                              : t("admin.users.grant")}
                          </button>
                          <AdminRevokeTokensButton
                            userId={u.id}
                            name={u.displayName}
                            disabled={busy}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.users.length && (
          <p className="usr-muted">
            {t("admin.users.more", {
              shown: data.users.length,
              total: data.total,
            })}
          </p>
        )}
        <p className="usr-muted">{t("admin.users.recoverHint")}</p>
      </div>
      {resetting && (
        <ResetDialog
          target={resetting}
          emailReset={emailReset}
          onClose={() => {
            setResetting(null);
            void load();
          }}
        />
      )}
      {confirmDialog}
    </div>
  );
}

/** «Restablecer contraseña…»: what happens, then the link (emailed, or shown
 *  once to hand over). The link leaves memory when the dialog closes. */
function ResetDialog({
  target,
  emailReset,
  onClose,
}: {
  target: AdminUser;
  emailReset: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const id = useId();
  const [step, setStep] = useState<"confirm" | "deliver" | "done">("confirm");
  const [result, setResult] = useState<AdminReset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locale = i18n.resolvedLanguage === "en" ? "en" : "es";
  const when = (iso: string) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));

  async function issue(delivery: "email" | "link") {
    setBusy(true);
    setError(null);
    try {
      setResult(await accountApi.adminReset(target.id, delivery, locale));
      setStep("done");
    } catch (e) {
      setError(t(failureKey(e)));
    } finally {
      setBusy(false);
    }
  }

  const handover = result?.link ?? result?.token ?? "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(handover);
      toast(t("admin.users.resetCopied"), "success");
    } catch {
      document.getElementById(`${id}-link`)?.focus();
    }
  }

  if (step === "done" && result) {
    return (
      <Dialog labelledBy={`${id}-done`} onClose={onClose} dismissable>
        {result.delivery === "email" ? (
          <>
            <h3 id={`${id}-done`} className="cd__title">
              {t("admin.users.resetSentTitle")}
            </h3>
            <Alert kind="success">
              {t("admin.users.resetSent", {
                email: target.email,
                date: when(result.expiresAt),
              })}
            </Alert>
          </>
        ) : (
          <>
            <h3 id={`${id}-done`} className="cd__title">
              {t("admin.users.resetLinkTitle", { name: target.displayName })}
            </h3>
            <p
              className="usr-code"
              id={`${id}-link`}
              tabIndex={-1}
              data-testid="admin-reset-link"
            >
              {handover}
            </p>
            {!result.link && (
              <p className="usr-muted">{t("admin.users.resetTokenHint")}</p>
            )}
            <Alert kind="warning">
              {t("admin.users.resetOnce", {
                name: target.displayName,
                date: when(result.expiresAt),
              })}
            </Alert>
          </>
        )}
        <div className="cd__actions">
          {result.delivery === "link" && (
            <button
              type="button"
              className="cd__cancel"
              onClick={() => void copy()}
            >
              {t("admin.users.resetCopy")}
            </button>
          )}
          <button type="button" className="cd__confirm" onClick={onClose}>
            {t("admin.users.done")}
          </button>
        </div>
      </Dialog>
    );
  }

  if (step === "deliver") {
    return (
      <Dialog
        labelledBy={`${id}-deliver`}
        onClose={onClose}
        dismissable={!busy}
      >
        <h3 id={`${id}-deliver`} className="cd__title">
          {t("admin.users.deliverTitle", { name: target.displayName })}
        </h3>
        <p className="cd__msg">
          {t("admin.users.deliverBody", { email: target.email })}
        </p>
        {error && <Alert kind="error">{error}</Alert>}
        <div className="cd__actions">
          <button
            type="button"
            className="cd__cancel"
            disabled={busy}
            onClick={() => void issue("link")}
          >
            {t("admin.users.deliverMyself")}
          </button>
          <button
            type="button"
            className="cd__confirm"
            disabled={busy}
            onClick={() => void issue("email")}
          >
            {t("admin.users.deliverEmail")}
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog labelledBy={`${id}-title`} onClose={onClose} dismissable={!busy}>
      <h3 id={`${id}-title`} className="cd__title">
        {t("admin.users.resetTitle", { name: target.displayName })}
      </h3>
      <p className="cd__msg">
        {t("admin.users.resetBody", { name: target.displayName })}
      </p>
      <ul className="usr-list">
        <li>{t("admin.users.resetPoint1")}</li>
        <li>{t("admin.users.resetPoint2", { name: target.displayName })}</li>
        <li>{t("admin.users.resetPoint3", { name: target.displayName })}</li>
      </ul>
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
          className="cd__confirm"
          disabled={busy}
          onClick={() => (emailReset ? setStep("deliver") : void issue("link"))}
        >
          {t("admin.users.resetConfirm")}
        </button>
      </div>
    </Dialog>
  );
}
