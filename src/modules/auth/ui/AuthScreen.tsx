import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Logo } from "@shared/ui/Logo";
import { ThemeToggle } from "@shared/theme/ThemeToggle";
import { LanguageToggle } from "@shared/i18n/LanguageToggle";
import { useAuth } from "../state/useAuth";
import { ApiError, NetworkError } from "../api/authApi";
import "./AuthScreen.css";

type Mode = "login" | "register";

const KNOWN_ERROR_CODES = new Set([
  "invalid_credentials",
  "email_in_use",
  "validation_error",
]);

function errorMessageKey(error: unknown): string {
  if (error instanceof NetworkError) return "auth.error.network";
  if (error instanceof ApiError && KNOWN_ERROR_CODES.has(error.code)) {
    return `auth.error.${error.code}`;
  }
  return "auth.error.generic";
}

export function AuthScreen() {
  const { t } = useTranslation();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [form, setForm] = useState({
    email: "",
    password: "",
    displayName: "",
    firstName: "",
    lastName: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
        await register(form);
      } else {
        await login({ email: form.email, password: form.password });
      }
    } catch (err) {
      setError(t(errorMessageKey(err)));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-screen__toolbar">
        <LanguageToggle />
        <ThemeToggle />
      </div>

      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-card__brand">
          <Logo size={40} />
          <div>
            <h1 className="auth-card__title">
              {isRegister ? t("auth.registerTitle") : t("auth.loginTitle")}
            </h1>
            <p className="auth-card__subtitle">{t("app.tagline")}</p>
          </div>
        </div>

        {isRegister && (
          <>
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
          value={form.email}
          onChange={update("email")}
          autoComplete="email"
          required
        />
        <Field
          id="password"
          type="password"
          label={t("auth.password")}
          value={form.password}
          onChange={update("password")}
          autoComplete={isRegister ? "new-password" : "current-password"}
          minLength={isRegister ? 8 : undefined}
          required
        />

        {error && (
          <p className="auth-card__error" role="alert">
            {error}
          </p>
        )}

        <button
          className="auth-card__submit"
          type="submit"
          disabled={submitting}
        >
          {submitting
            ? t("auth.loggingIn")
            : isRegister
              ? t("auth.register")
              : t("auth.login")}
        </button>

        <button
          type="button"
          className="auth-card__switch"
          onClick={() => {
            setMode(isRegister ? "login" : "register");
            setError(null);
          }}
        >
          {isRegister ? t("auth.toLogin") : t("auth.toRegister")}
        </button>
      </form>
    </div>
  );
}

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
}

function Field({ id, label, ...rest }: FieldProps) {
  return (
    <label className="auth-field" htmlFor={id}>
      <span className="auth-field__label">{label}</span>
      <input id={id} name={id} className="auth-field__input" {...rest} />
    </label>
  );
}
