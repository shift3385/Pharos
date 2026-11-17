import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { APP_VERSION } from "@shared/version";
import {
  checkServer,
  isServerErrorBody,
  pendingChanges,
  serverHost,
  setServer,
  type PendingChanges,
  type ServerCheck,
  type ServerInfo,
} from "@shared/platform/serverUrl";
import { compatibility, lastUsedLabel, problemOf, type ServerProblem } from "../model/serverState";
import type { ConnectedNotice } from "./ServerLine";
import "./ServerPicker.css";

type Phase = "idle" | "checking" | "confirm";

/** Picking another server on the sign-in screen (SEC-10, sketches 2 and 3).
 *  It takes the form's place. «Conectar» checks the server first and saves
 *  nothing when it fails: the previous server stays. No state lets the user go
 *  on past an error. */
export function ServerPanel({
  info,
  onCancel,
  onDone,
}: {
  info: ServerInfo;
  onCancel: () => void;
  onDone: (notice: ConnectedNotice) => void;
}) {
  const { t, i18n } = useTranslation();
  const [address, setAddress] = useState(info.origin);
  const [phase, setPhase] = useState<Phase>("idle");
  const [problem, setProblem] = useState<(ServerProblem & { host: string; version?: string }) | null>(null);
  const [pending, setPending] = useState<PendingChanges[]>([]);
  const checked = useRef<ServerCheck | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const hostOfInput = () => serverHost(address.trim()).replace(/\/.*$/, "");

  async function save(result: ServerCheck) {
    const compat = compatibility(result.health, APP_VERSION);
    const origin = await setServer(result.origin);
    onDone({
      host: serverHost(origin),
      version: result.health.version ?? null,
      local: result.local,
      readOnly: compat === "read_only",
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (phase === "checking") return;
    setProblem(null);
    setPhase("checking");
    try {
      const result = await checkServer(address);
      const compat = compatibility(result.health, APP_VERSION);
      if (compat === "app_too_old" || compat === "server_too_old") {
        setProblem({ ...problemOf(compat), host: serverHost(result.origin), version: result.health.version });
        setPhase("idle");
        return;
      }
      checked.current = result;
      if (result.origin !== info.origin) {
        const waiting = await pendingChanges();
        if (waiting.length > 0) {
          setPending(waiting);
          setPhase("confirm");
          return;
        }
      }
      await save(result);
    } catch (e) {
      const kind = isServerErrorBody(e) ? e.kind : "storage";
      setProblem({ ...problemOf(kind), host: hostOfInput() });
      setPhase("idle");
    }
  }

  async function confirmChange() {
    const result = checked.current;
    if (!result) return;
    try {
      await save(result);
    } catch (e) {
      setProblem({ ...problemOf(isServerErrorBody(e) ? e.kind : "storage"), host: hostOfInput() });
      setPhase("idle");
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCancel();
    }
  }

  const fieldInvalid = problem?.field ?? false;
  const errorId = "server-address-error";
  const previousHost = serverHost(info.origin);

  return (
    <form className="server-panel" onSubmit={onSubmit} onKeyDown={onKeyDown} data-testid="server-panel" noValidate>
      <div className="auth-form__head">
        <h1 className="auth-form__title">{t("server.panel.title")}</h1>
        <p className="auth-form__switch">{t("server.panel.intro")}</p>
      </div>

      <div className="auth-field">
        <label className="auth-field__label" htmlFor="server-address">
          {t("server.panel.address")}
        </label>
        <div className="auth-field__box">
          <input
            ref={input}
            id="server-address"
            name="server-address"
            className="auth-field__input server-panel__input"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              if (phase === "confirm") setPhase("idle");
            }}
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            aria-invalid={fieldInvalid || undefined}
            aria-describedby={problem ? errorId : "server-address-hint"}
            disabled={phase === "checking"}
          />
        </div>
        <span id="server-address-hint" className="server-panel__hint">
          {t("server.panel.hint")}
        </span>
      </div>

      {info.recent.length > 0 && (
        <div className="server-panel__recent">
          <span className="auth-field__label">{t("server.panel.recent")}</span>
          {info.recent.map((r) => (
            <button
              key={r.origin}
              type="button"
              className="server-panel__recent-item"
              onClick={() => setAddress(r.origin)}
              disabled={phase === "checking"}
            >
              <span className="server-panel__recent-host">
                {r.local ? t("server.line.local", { host: serverHost(r.origin) }) : serverHost(r.origin)}
              </span>
              <span className="server-panel__recent-meta">
                {[r.email, lastUsedLabel(r.lastUsed, i18n.resolvedLanguage ?? "es")].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
        </div>
      )}

      {problem && (
        <p className="server-msg server-msg--err" role="alert" id={errorId} data-testid="server-error">
          <b>{t(`server.error.${problem.key}.title`, { host: problem.host, version: problem.version })}</b>
          <span>{t(`server.error.${problem.key}.detail`, { host: problem.host, version: problem.version, app: APP_VERSION })}</span>
        </p>
      )}

      {phase === "confirm" ? (
        <div className="server-msg server-msg--warn" role="alert" data-testid="server-pending">
          {pending.map((p) => (
            <p key={p.email}>
              <b>{t("server.pending.title", { count: p.count, host: previousHost })}</b>
              <span>{t("server.pending.detail", { email: p.email })}</span>
            </p>
          ))}
          <div className="server-panel__buttons">
            <button type="button" className="server-panel__secondary" onClick={() => setPhase("idle")}>
              {t("server.panel.cancel")}
            </button>
            <button type="button" className="auth-form__submit" onClick={() => void confirmChange()}>
              {t("server.pending.confirm")}
            </button>
          </div>
        </div>
      ) : (
        <div className="server-panel__buttons">
          <button type="button" className="server-panel__secondary" onClick={onCancel} disabled={phase === "checking"}>
            {t("server.panel.cancel")}
          </button>
          <button type="submit" className="auth-form__submit" disabled={phase === "checking"} data-testid="server-connect">
            {phase === "checking" ? t("server.panel.checking") : t("server.panel.connect")}
          </button>
        </div>
      )}
    </form>
  );
}
