import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Alert } from "@shared/ui/Alert";
import { serverHost, serverUrl } from "@shared/platform/serverUrl";
import { notify } from "@shared/ui/notify";
import { ApiError, NetworkError } from "../api/authApi";
import { accountApi, tokenFromLink } from "../api/accountApi";
import { useAuth } from "../state/useAuth";
import { Field, PasswordField } from "./AuthField";

// «¿Olvidaste tu contraseña?» and the reset page (SEC-08, SEC-09 by email;
// ADR-0045). Answers never say whether an email is registered.

const KNOWN = new Set([
  "invalid_recovery",
  "invalid_reset_token",
  "rate_limited",
  "validation_error",
  "email_reset_disabled",
]);

function errorKey(error: unknown): string {
  if (error instanceof NetworkError) return "auth.error.network";
  if (error instanceof ApiError && KNOWN.has(error.code))
    return `auth.recover.error.${error.code}`;
  return "auth.error.generic";
}

/** Below this many codes left, the user is told to generate new ones. */
const FEW_CODES = 3;

type Tab = "code" | "email";

function BackLink({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="auth-form__link auth-form__back"
      onClick={onBack}
    >
      <ArrowLeft size={15} aria-hidden="true" />
      {t("auth.recover.back")}
    </button>
  );
}

/** «Recupera el acceso»: a recovery code, or a link by email. */
export function RecoverView({
  onBack,
  onReset,
  initialTab = "code",
}: {
  onBack: () => void;
  /** Opens the reset page with a token pasted from the email. */
  onReset: (token: string) => void;
  initialTab?: Tab;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <div className="auth-form">
      <div className="auth-form__head">
        <h1 className="auth-form__title">{t("auth.recover.title")}</h1>
        <p className="auth-form__switch">{t("auth.recover.subtitle")}</p>
      </div>
      <div
        className="auth-tabs"
        role="tablist"
        aria-label={t("auth.recover.title")}
      >
        {(["code", "email"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`recover-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`recover-panel-${key}`}
            className="auth-tabs__tab"
            onClick={() => setTab(key)}
          >
            {t(`auth.recover.tab.${key}`)}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`recover-panel-${tab}`}
        aria-labelledby={`recover-tab-${tab}`}
      >
        {tab === "code" ? <CodeForm /> : <EmailForm onReset={onReset} />}
      </div>
      <BackLink onBack={onBack} />
    </div>
  );
}

function CodeForm() {
  const { t } = useTranslation();
  const { recover } = useAuth();
  const [form, setForm] = useState({
    email: "",
    code: "",
    password: "",
    repeat: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const update =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (form.password !== form.repeat) {
      setError(t("auth.recover.mismatch"));
      return;
    }
    setBusy(true);
    try {
      const left = await recover({
        email: form.email,
        code: form.code,
        newPassword: form.password,
      });
      // The app opens now; the toast stays with it.
      notify(
        left <= FEW_CODES
          ? t("auth.recover.fewCodes", { count: left })
          : t("auth.recover.changed"),
        left <= FEW_CODES ? "warning" : "success",
      );
    } catch (err) {
      setError(t(errorKey(err), { host: serverHost(serverUrl()) }));
      setBusy(false);
    }
  }

  return (
    <form className="auth-form__fields" onSubmit={onSubmit}>
      <Field
        id="recover-email"
        type="email"
        label={t("auth.email")}
        value={form.email}
        onChange={update("email")}
        autoComplete="email"
        required
      />
      <Field
        id="recover-code"
        label={t("auth.recover.code")}
        help={t("auth.recover.codeHelp")}
        value={form.code}
        onChange={update("code")}
        autoComplete="one-time-code"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={40}
        required
      />
      <PasswordField
        id="recover-password"
        label={t("auth.recover.newPassword")}
        help={t("auth.recover.passwordHelp")}
        value={form.password}
        onChange={update("password")}
        autoComplete="new-password"
        minLength={8}
        required
      />
      <PasswordField
        id="recover-repeat"
        label={t("auth.recover.repeat")}
        value={form.repeat}
        onChange={update("repeat")}
        autoComplete="new-password"
        minLength={8}
        required
      />
      {error && (
        <p className="auth-form__error" role="alert">
          {error}
        </p>
      )}
      <button className="auth-form__submit" type="submit" disabled={busy}>
        {t("auth.recover.submitCode")}
      </button>
    </form>
  );
}

function EmailForm({ onReset }: { onReset: (token: string) => void }) {
  const { t, i18n } = useTranslation();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    accountApi
      .capabilities()
      .then((c) => live && setEnabled(c.emailReset))
      .catch(() => live && setEnabled(false));
    return () => {
      live = false;
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await accountApi.requestReset(
        email,
        i18n.resolvedLanguage === "en" ? "en" : "es",
      );
      setSent(true);
    } catch (err) {
      setError(t(errorKey(err), { host: serverHost(serverUrl()) }));
    } finally {
      setBusy(false);
    }
  }

  function openLink(event: FormEvent) {
    event.preventDefault();
    const token = tokenFromLink(link);
    if (!token) {
      setLinkError(t("auth.recover.badLink"));
      return;
    }
    onReset(token);
  }

  return (
    <div className="auth-form__fields">
      {enabled === false && (
        <Alert kind="info">{t("auth.recover.emailOff")}</Alert>
      )}
      <form className="auth-form__fields" onSubmit={onSubmit}>
        <Field
          id="reset-email"
          type="email"
          label={t("auth.email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          disabled={!enabled}
        />
        {sent && <Alert kind="success">{t("auth.recover.sent")}</Alert>}
        {error && (
          <p className="auth-form__error" role="alert">
            {error}
          </p>
        )}
        <button
          className="auth-form__submit"
          type="submit"
          disabled={!enabled || busy}
        >
          {t("auth.recover.sendLink")}
        </button>
      </form>
      <form className="auth-form__fields auth-form__paste" onSubmit={openLink}>
        <Field
          id="reset-link"
          label={t("auth.recover.haveLink")}
          help={t("auth.recover.haveLinkHelp")}
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            setLinkError(null);
          }}
          spellCheck={false}
          autoComplete="off"
        />
        {linkError && (
          <p className="auth-form__error" role="alert">
            {linkError}
          </p>
        )}
        <button
          className="auth-form__secondary"
          type="submit"
          disabled={!link.trim()}
        >
          {t("auth.recover.continue")}
        </button>
      </form>
    </div>
  );
}

/** The reset page the email's link opens (`#/restablecer?token=…`), or the
 *  desktop after pasting it. */
export function ResetView({
  token,
  onDone,
  onAskAgain,
}: {
  token: string;
  /** Back to signing in (after the change, or to leave). */
  onDone: () => void;
  /** «Pedir otro enlace» after an expired or used link. */
  onAskAgain: () => void;
}) {
  const { t } = useTranslation();
  const { status, logout } = useAuth();
  const [state, setState] = useState<"checking" | "ready" | "invalid" | "done">(
    "checking",
  );
  const [email, setEmail] = useState("");
  const [issuedBy, setIssuedBy] = useState<string | null>(null);
  const [form, setForm] = useState({ password: "", repeat: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    accountApi
      .checkReset(token)
      .then((r) => {
        if (!live) return;
        setEmail(r.email);
        setIssuedBy(r.issuedBy ?? null);
        setState("ready");
      })
      .catch((err: unknown) => {
        if (!live) return;
        if (err instanceof ApiError && err.code === "invalid_reset_token")
          setState("invalid");
        else {
          setError(t(errorKey(err), { host: serverHost(serverUrl()) }));
          setState("ready");
        }
      });
    return () => {
      live = false;
    };
  }, [token, t]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (form.password !== form.repeat) {
      setError(t("auth.recover.mismatch"));
      return;
    }
    setBusy(true);
    try {
      await accountApi.confirmReset(token, form.password);
      // Every session closed, this one too: forget it here as well.
      if (status === "authenticated") await logout();
      setState("done");
    } catch (err) {
      if (err instanceof ApiError && err.code === "invalid_reset_token")
        setState("invalid");
      else setError(t(errorKey(err), { host: serverHost(serverUrl()) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-form">
      <div className="auth-form__head">
        <h1 className="auth-form__title">{t("auth.reset.title")}</h1>
        {email && state !== "done" && (
          <p className="auth-form__switch">
            {t("auth.reset.account", { email })}
          </p>
        )}
        {issuedBy && state !== "done" && (
          <p className="auth-form__switch">
            {t("auth.reset.issuedBy", { name: issuedBy })}
          </p>
        )}
      </div>
      {state === "checking" && (
        <p className="auth-form__switch">{t("auth.reset.checking")}</p>
      )}
      {state === "invalid" && (
        <div className="auth-form__fields">
          <Alert kind="error">
            {t("auth.recover.error.invalid_reset_token")}
          </Alert>
          <button
            type="button"
            className="auth-form__submit"
            onClick={onAskAgain}
          >
            {t("auth.reset.askAgain")}
          </button>
        </div>
      )}
      {state === "done" && (
        <div className="auth-form__fields">
          <Alert kind="success">{t("auth.reset.done")}</Alert>
          <button type="button" className="auth-form__submit" onClick={onDone}>
            {t("auth.signInLink")}
          </button>
        </div>
      )}
      {state === "ready" && (
        <form className="auth-form__fields" onSubmit={onSubmit}>
          <PasswordField
            id="reset-password"
            label={t("auth.recover.newPassword")}
            help={t("auth.recover.passwordHelp")}
            value={form.password}
            onChange={(e) =>
              setForm((f) => ({ ...f, password: e.target.value }))
            }
            autoComplete="new-password"
            minLength={8}
            required
          />
          <PasswordField
            id="reset-repeat"
            label={t("auth.recover.repeat")}
            value={form.repeat}
            onChange={(e) => setForm((f) => ({ ...f, repeat: e.target.value }))}
            autoComplete="new-password"
            minLength={8}
            required
          />
          {error && (
            <p className="auth-form__error" role="alert">
              {error}
            </p>
          )}
          <button className="auth-form__submit" type="submit" disabled={busy}>
            {t("auth.reset.save")}
          </button>
        </form>
      )}
      {state !== "done" && <BackLink onBack={onDone} />}
    </div>
  );
}
