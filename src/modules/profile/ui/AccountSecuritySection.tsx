import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import {
  accountApi,
  ApiError,
  NetworkError,
  RecoveryCodesPanel,
  useAuth,
  type RecoveryStatus,
} from "@modules/auth";
import { Alert } from "@shared/ui/Alert";
import { serverHost, serverUrl } from "@shared/platform/serverUrl";
import { Dialog } from "@shared/ui/Dialog";
import "./RecoveryKeySection.css";
import "./AccountSecuritySection.css";

// Mi perfil › Seguridad de la cuenta (SEC-08, ADR-0045): change the password
// and keep the account's recovery codes. Not the recovery key of the local
// database (SEC-03), which lives in Administración › Seguridad. Both need the
// server: offline, the cards say so and do nothing.

const KNOWN = new Set([
  "wrong_password",
  "same_password",
  "rate_limited",
  "validation_error",
]);

function errorKey(error: unknown): string {
  if (error instanceof NetworkError) return "auth.error.network";
  if (error instanceof ApiError && KNOWN.has(error.code))
    return `account.error.${error.code}`;
  return "auth.error.generic";
}

export function AccountSecuritySection() {
  const { t } = useTranslation();
  const { offline } = useAuth();
  return (
    <section
      className="profile-card account-security"
      aria-labelledby="account-security-title"
    >
      <h2 id="account-security-title" className="profile-card__title">
        {t("account.title")}
      </h2>
      {offline && <Alert kind="info">{t("account.offline")}</Alert>}
      <div className="account-security__cols">
        <ChangePassword disabled={offline} />
        <RecoveryCodes disabled={offline} />
      </div>
    </section>
  );
}

function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  return (
    <div className="profile__field">
      <label htmlFor={id}>{label}</label>
      <div className="account-security__pw">
        <input
          id={id}
          name={id}
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          minLength={autoComplete === "new-password" ? 8 : undefined}
          maxLength={200}
          required
          disabled={disabled}
        />
        {/* The same eye toggle as the sign-in screen (FIX-46). */}
        <button
          type="button"
          className="account-security__reveal"
          aria-pressed={shown}
          aria-controls={id}
          aria-label={t("auth.showPassword")}
          title={t("auth.showPassword")}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

function ChangePassword({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation();
  const empty = { current: "", next: "", repeat: "" };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<number | null>(null);
  const set = (key: keyof typeof empty) => (v: string) => {
    setForm((f) => ({ ...f, [key]: v }));
    setClosed(null);
  };
  const mismatch = form.repeat !== "" && form.repeat !== form.next;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (mismatch) return;
    setError(null);
    setBusy(true);
    try {
      const { sessionsClosed } = await accountApi.changePassword(
        form.current,
        form.next,
      );
      setForm(empty);
      setClosed(sessionsClosed);
    } catch (err) {
      setError(t(errorKey(err), { host: serverHost(serverUrl()) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="account-security__card"
      onSubmit={onSubmit}
      aria-labelledby="change-password-title"
    >
      <h3 id="change-password-title" className="account-security__subtitle">
        {t("account.changeTitle")}
      </h3>
      <p className="account-security__text">{t("account.changeIntro")}</p>
      <PasswordInput
        id="pw-current"
        label={t("account.current")}
        value={form.current}
        onChange={set("current")}
        autoComplete="current-password"
        disabled={disabled}
      />
      <PasswordInput
        id="pw-new"
        label={t("account.new")}
        value={form.next}
        onChange={set("next")}
        autoComplete="new-password"
        disabled={disabled}
      />
      <span className="account-security__help">
        {t("auth.recover.passwordHelp")}
      </span>
      <PasswordInput
        id="pw-repeat"
        label={t("account.repeat")}
        value={form.repeat}
        onChange={set("repeat")}
        autoComplete="new-password"
        disabled={disabled}
      />
      {mismatch && (
        <span className="account-security__error" role="alert">
          {t("auth.recover.mismatch")}
        </span>
      )}
      {error && (
        <span className="account-security__error" role="alert">
          {error}
        </span>
      )}
      {closed !== null && (
        <Alert kind="success">{t("account.changed", { count: closed })}</Alert>
      )}
      <button
        type="submit"
        className="profile__save account-security__submit"
        disabled={disabled || busy || mismatch}
      >
        {busy ? t("account.changing") : t("account.change")}
      </button>
    </form>
  );
}

function RecoveryCodes({ disabled }: { disabled: boolean }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [status, setStatus] = useState<RecoveryStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [step, setStep] = useState<"idle" | "confirm" | "shown">("idle");
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await accountApi.recoveryStatus());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!disabled) void load();
  }, [disabled, load]);

  const when = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat(i18n.resolvedLanguage, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(iso))
      : "—";

  async function generate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { recoveryCodes } = await accountApi.regenerateCodes(password);
      setPassword("");
      setCodes(recoveryCodes);
      setStep("shown");
    } catch (err) {
      setError(t(errorKey(err), { host: serverHost(serverUrl()) }));
    } finally {
      setBusy(false);
    }
  }

  function closeDialog() {
    setStep("idle");
    setPassword("");
    setError(null);
    // The codes leave memory with the dialog.
    setCodes(null);
    void load();
  }

  const none = status !== null && status.total === 0;
  const few = status !== null && status.total > 0 && status.remaining <= 3;

  return (
    <div className="account-security__card">
      <h3 className="account-security__subtitle">{t("account.codesTitle")}</h3>
      <p className="account-security__text">{t("account.codesIntro")}</p>
      {loadFailed && <Alert kind="error">{t("account.codesLoadFailed")}</Alert>}
      {none && <Alert kind="warning">{t("account.codesNone")}</Alert>}
      {status && !none && (
        <dl className="account-security__facts">
          <div>
            <dt>{t("account.codesState")}</dt>
            <dd>
              <span
                className={`account-security__pill${few ? " account-security__pill--warn" : ""}`}
                data-testid="codes-remaining"
              >
                {t("account.codesRemaining", {
                  remaining: status.remaining,
                  total: status.total,
                })}
              </span>
            </dd>
          </div>
          <div>
            <dt>{t("account.codesGenerated")}</dt>
            <dd>{when(status.generatedAt)}</dd>
          </div>
          <div>
            <dt>{t("account.codesLastUsed")}</dt>
            <dd>{when(status.lastUsedAt)}</dd>
          </div>
        </dl>
      )}
      {status && !none && (
        <p className="account-security__help">{t("account.codesReplace")}</p>
      )}
      <button
        type="button"
        className="recovery__show"
        disabled={disabled || !status}
        onClick={() => setStep("confirm")}
      >
        <KeyRound size={15} aria-hidden="true" />
        {none ? t("account.codesGenerateFirst") : t("account.codesGenerate")}
      </button>

      {step === "confirm" && (
        <Dialog
          overlayClassName="recovery-overlay"
          className="recovery-dialog"
          labelledBy="codes-confirm"
          onClose={closeDialog}
          dismissable={!busy}
        >
          <form className="account-security__dialog" onSubmit={generate}>
            <h3 id="codes-confirm" className="recovery-dialog__title">
              {t("account.codesConfirmTitle")}
            </h3>
            <p>
              {none
                ? t("account.codesConfirmFirst")
                : t("account.codesConfirmBody")}
            </p>
            <PasswordInput
              id="codes-password"
              label={t("account.current")}
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />
            {error && (
              <span className="account-security__error" role="alert">
                {error}
              </span>
            )}
            <div className="recovery-dialog__actions">
              <button
                type="button"
                className="recovery-dialog__secondary"
                onClick={closeDialog}
                disabled={busy}
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                className="recovery-dialog__primary"
                disabled={busy || !password}
              >
                {t("account.codesGenerate")}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Not dismissable: it closes only after «Los he guardado». */}
      {step === "shown" && codes && (
        <Dialog
          overlayClassName="recovery-overlay"
          className="recovery-dialog"
          labelledBy="codes-shown"
          dismissable={false}
        >
          <h3 id="codes-shown" className="recovery-dialog__title">
            {t("recoveryCodes.title")}
          </h3>
          <RecoveryCodesPanel
            codes={codes}
            email={user?.email ?? ""}
            doneLabel={t("recoveryCodes.close")}
            onDone={closeDialog}
          />
        </Dialog>
      )}
    </div>
  );
}
