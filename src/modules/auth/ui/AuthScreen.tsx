import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, FileText, GitFork, ListChecks, Lock } from "lucide-react";
import { Logo } from "@shared/ui/Logo";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { APP_VERSION } from "@shared/version";
import { serverHost } from "@shared/platform/serverUrl";
import { ServerLine, ServerPanel, useServerInfo, type ConnectedNotice } from "@modules/server-picker";
import { useAuth } from "../state/useAuth";
import { ApiError, NetworkError } from "../api/authApi";
import { GoogleMark } from "./GoogleMark";
import { Field } from "./AuthField";
import { RecoverView, ResetView } from "./AccountRecovery";
import { RecoveryCodesPanel } from "./RecoveryCodesPanel";
import { LoginLanguageMenu } from "./LoginLanguageMenu";
// The prototype's 1024 px photo; production should ship a ≥ 2400 px version
// of the same image (SPEC §1, ADR-0028).
import lighthouse from "./assets/login-faro.jpg";
import "./AuthScreen.css";

type Mode = "login" | "register" | "codes" | "recover" | "reset";

/** Where the reset email's link lands (`#/restablecer?token=…`, ADR-0045). */
export const RESET_PATH = "/restablecer";

const KNOWN_ERROR_CODES = new Set([
  "invalid_credentials",
  "email_in_use",
  "validation_error",
  "rate_limited",
  "account_other_server",
  // SEC-12: only after the right password.
  "account_disabled",
]);

function errorMessageKey(error: unknown): string {
  if (error instanceof NetworkError) return "auth.error.network";
  if (error instanceof ApiError && KNOWN_ERROR_CODES.has(error.code)) {
    return `auth.error.${error.code}`;
  }
  return "auth.error.generic";
}

/** Sign in / sign up (SPEC §8, `Login.dc.html`). From 600 px: the form column
 *  next to the lighthouse photo with the brand points. Below: the photo as a
 *  header and the form as a sheet whose sizes follow the screen height, so the
 *  login never scrolls (only the longer sign-up form scrolls inside the sheet).
 *  One scroll at most (update 2026-10-31): the screen takes 100dvh and the page
 *  itself never scrolls; only the form column (the sheet on mobile) does, and
 *  the photo never. */
export function AuthScreen() {
  const mobile = useBreakpoint() === "mobile";
  const { t } = useTranslation();
  const { completeRegistration } = useAuth();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const linkToken = pathname === RESET_PATH ? new URLSearchParams(search).get("token") : null;
  const [mode, setMode] = useState<Mode>(linkToken ? "reset" : "login");
  const [token, setToken] = useState<string | null>(linkToken);
  const [recoverTab, setRecoverTab] = useState<"code" | "email">("code");
  // The codes of a new account, shown once (SEC-08) and dropped on continue.
  const [newCodes, setNewCodes] = useState<{ codes: string[]; email: string } | null>(null);
  const [finishing, setFinishing] = useState(false);

  // The token leaves the address as soon as it is read: it is a secret.
  useEffect(() => {
    if (linkToken) void navigate(RESET_PATH, { replace: true });
  }, [linkToken, navigate]);

  const toLogin = () => {
    setToken(null);
    setMode("login");
    if (pathname === RESET_PATH) void navigate("/", { replace: true });
  };

  // html and body stop scrolling only while this screen is shown.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("auth-route");
    return () => root.classList.remove("auth-route");
  }, []);

  let form;
  if (mode === "codes" && newCodes) {
    form = (
      <div className="auth-form">
        <div className="auth-form__head">
          <h1 className="auth-form__title">{t("recoveryCodes.title")}</h1>
        </div>
        <RecoveryCodesPanel
          codes={newCodes.codes}
          email={newCodes.email}
          doneLabel={t("recoveryCodes.continue")}
          busy={finishing}
          onDone={() => {
            setFinishing(true);
            setNewCodes(null);
            void completeRegistration();
          }}
        />
      </div>
    );
  } else if (mode === "recover") {
    form = (
      <RecoverView
        initialTab={recoverTab}
        onBack={toLogin}
        onReset={(pasted) => {
          setToken(pasted);
          setMode("reset");
        }}
      />
    );
  } else if (mode === "reset" && token) {
    form = (
      <ResetView
        token={token}
        onDone={toLogin}
        onAskAgain={() => {
          setToken(null);
          setRecoverTab("email");
          setMode("recover");
          if (pathname === RESET_PATH) void navigate("/", { replace: true });
        }}
      />
    );
  } else {
    form = (
      <AuthForm
        mode={mode === "register" ? "register" : "login"}
        onModeChange={setMode}
        onForgot={() => {
          setRecoverTab("code");
          setMode("recover");
        }}
        onRegistered={(codes, email) => {
          setNewCodes({ codes, email });
          setMode("codes");
        }}
      />
    );
  }
  // The longer forms take the compact sizes of «Crear cuenta».
  const layout = mode === "login" ? "login" : "register";

  if (mobile) {
    return (
      <div className="auth auth--mobile screen-root" data-mode={layout}>
        <div className="auth-hero">
          <img className="auth-photo auth-photo--mobile" src={lighthouse} alt="" />
          <span className="auth-hero__shade" aria-hidden="true" />
          <div className="auth-hero__bar">
            <span className="auth-brand auth-brand--navy">
              <Logo size={32} surface="navy" decorative />
              Pharos
            </span>
            <LoginLanguageMenu onNavy />
          </div>
          <Tagline className="auth-hero__tagline" />
        </div>
        <div className="auth-sheet">{form}</div>
      </div>
    );
  }

  return (
    <div className="auth screen-root" data-mode={layout}>
      <div className="auth-col">
        <span className="auth-brand">
          <Logo size={40} decorative />
          Pharos
        </span>
        <div className="auth-col__center">{form}</div>
        <div className="auth-col__foot">
          <LoginLanguageMenu />
          <span className="auth-col__version">v{APP_VERSION}</span>
        </div>
      </div>
      <BrandPanel />
    </div>
  );
}

function Tagline({ className }: { className: string }) {
  const { t } = useTranslation();
  return <p className={className}>{t("auth.brand.tagline")}</p>;
}

/** The photo with its two gradients, the claim and the three points. */
function BrandPanel() {
  const { t } = useTranslation();
  const points: [typeof FileText, string][] = [
    [FileText, t("auth.brand.point1")],
    [ListChecks, t("auth.brand.point2")],
    [GitFork, t("auth.brand.point3")],
  ];
  return (
    <aside className="auth-panel" aria-label={t("auth.brand.label")}>
      <img className="auth-photo" src={lighthouse} alt="" />
      <span className="auth-panel__shade" aria-hidden="true" />
      <div className="auth-panel__head">
        <span className="auth-panel__eyebrow">{t("auth.brand.eyebrow")}</span>
        <Tagline className="auth-panel__tagline" />
      </div>
      <ul className="auth-panel__points">
        {points.map(([Icon, text]) => (
          <li key={text}>
            <span className="auth-panel__icon" aria-hidden="true">
              <Icon size={16} />
            </span>
            {text}
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** The sign-in or sign-up form, or the server panel in its place (SEC-10). */
function AuthForm({
  mode,
  onModeChange,
  onForgot,
  onRegistered,
}: {
  mode: "login" | "register";
  onModeChange: (m: Mode) => void;
  onForgot: () => void;
  /** The new account's recovery codes, to show before the app opens. */
  onRegistered: (codes: string[], email: string) => void;
}) {
  const server = useServerInfo();
  const [pickingServer, setPickingServer] = useState(false);
  const [notice, setNotice] = useState<ConnectedNotice | null>(null);

  if (pickingServer) {
    return (
      <ServerPanel
        info={server.info}
        onCancel={() => setPickingServer(false)}
        onDone={(next) => {
          setNotice(next);
          setPickingServer(false);
          server.reload();
        }}
      />
    );
  }
  return (
    <CredentialsForm
      mode={mode}
      onModeChange={onModeChange}
      onForgot={onForgot}
      onRegistered={onRegistered}
      serverLine={
        <ServerLine
          info={server.info}
          notice={notice}
          onChange={() => {
            setNotice(null);
            setPickingServer(true);
          }}
        />
      }
      serverHostName={serverHost(server.info.origin)}
    />
  );
}

function CredentialsForm({
  mode,
  onModeChange,
  onForgot,
  onRegistered,
  serverLine,
  serverHostName,
}: {
  mode: "login" | "register";
  onModeChange: (m: Mode) => void;
  onForgot: () => void;
  onRegistered: (codes: string[], email: string) => void;
  serverLine: ReactNode;
  serverHostName: string;
}) {
  const { t } = useTranslation();
  const { login, register } = useAuth();
  const [form, setForm] = useState({
    email: "",
    password: "",
    displayName: "",
    firstName: "",
    lastName: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isRegister = mode === "register";

  const update =
    (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: event.target.value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isRegister) {
        const codes = await register(form);
        if (codes.length > 0) onRegistered(codes, form.email.trim().toLowerCase());
      } else {
        await login({ email: form.email, password: form.password });
      }
    } catch (err) {
      // The server's name in «can't connect» (SEC-10), so a wrong server shows.
      const host =
        err instanceof ApiError && err.code === "account_other_server"
          ? serverHost(err.message)
          : serverHostName;
      setError(t(errorMessageKey(err), { host }));
    } finally {
      setSubmitting(false);
    }
  }

  const switchMode = () => {
    onModeChange(isRegister ? "login" : "register");
    setError(null);
  };

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      <div className="auth-form__head">
        <h1 className="auth-form__title">
          {isRegister ? t("auth.registerTitle") : t("auth.loginTitle")}
        </h1>
        <p className="auth-form__switch">
          {isRegister ? t("auth.haveAccount") : t("auth.noAccount")}{" "}
          <button type="button" className="auth-form__link" onClick={switchMode}>
            {isRegister ? t("auth.signInLink") : t("auth.signUpLink")}
          </button>
        </p>
      </div>

      {serverLine}

      <div className="auth-form__fields">
        {isRegister && (
          <>
            <div className="auth-form__row">
              <Field
                id="firstName"
                label={t("auth.firstName")}
                value={form.firstName}
                onChange={update("firstName")}
                autoComplete="given-name"
                required
              />
              <Field
                id="lastName"
                label={t("auth.lastName")}
                value={form.lastName}
                onChange={update("lastName")}
                autoComplete="family-name"
                required
              />
            </div>
            <Field
              id="displayName"
              label={t("auth.displayName")}
              value={form.displayName}
              onChange={update("displayName")}
              autoComplete="nickname"
              required
            />
          </>
        )}
        <Field
          id="email"
          type="email"
          label={t("auth.email")}
          placeholder={t("auth.emailPlaceholder")}
          value={form.email}
          onChange={update("email")}
          autoComplete="email"
          required
        />
        <Field
          id="password"
          type={showPassword ? "text" : "password"}
          label={t("auth.password")}
          value={form.password}
          onChange={update("password")}
          autoComplete={isRegister ? "new-password" : "current-password"}
          minLength={isRegister ? 8 : undefined}
          required
        >
          <button
            type="button"
            className="auth-field__reveal"
            aria-pressed={showPassword}
            aria-label={t("auth.showPassword")}
            title={t("auth.showPassword")}
            onClick={() => setShowPassword((s) => !s)}
          >
            {showPassword ? (
              <EyeOff size={16} aria-hidden="true" />
            ) : (
              <Eye size={16} aria-hidden="true" />
            )}
          </button>
        </Field>
        {!isRegister && (
          <button type="button" className="auth-form__link auth-form__forgot" onClick={onForgot}>
            {t("auth.forgot")}
          </button>
        )}
      </div>

      {error && (
        <p className="auth-form__error" role="alert">
          {error}
        </p>
      )}

      <button className="auth-form__submit" type="submit" disabled={submitting}>
        {submitting
          ? t("auth.loggingIn")
          : isRegister
            ? t("auth.register")
            : t("auth.login")}
      </button>

      <div className="auth-form__or" aria-hidden="true">
        {t("auth.or")}
      </div>

      <button
        type="button"
        className="auth-form__google"
        disabled
        title={t("auth.googleSoonTitle")}
        data-testid="login-google"
      >
        <GoogleMark />
        {t("auth.google")}
        <span className="auth-form__soon">{t("auth.soon")}</span>
      </button>

      <p className="auth-form__note">
        <Lock size={13} aria-hidden="true" />
        {t("auth.encryptedNote")}
      </p>
    </form>
  );
}
