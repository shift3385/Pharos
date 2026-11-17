// «Usar esta clave también en la web» (IA-12, ADR-0034): the switch on the
// desktop, the consent before the key leaves this computer, and the summary
// the web shows of the key the desktop uploaded. The key itself never reaches
// this code: Rust reads it from the keychain and sends it (`webAccess.ts`).
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleCheck, LoaderCircle } from "lucide-react";
import { getServer, serverHost } from "@shared/platform/serverUrl";
import { Alert } from "@shared/ui/Alert";
import { Dialog } from "@shared/ui/Dialog";
import { StatusPill } from "@shared/ui/StatusPill";
import { Switch } from "@shared/ui/Switch";
import { useToast } from "@shared/ui/Toast";
import { useConfirm } from "@shared/ui/useConfirm";
import type { OnlineProviderId } from "../model/types";
import { aiKeys } from "../api/aiApi";
import {
  WebAccessError,
  fetchWebAccess,
  isWebProvider,
  removeWebAccess,
  uploadWebAccess,
  webAccessErrorText,
  type WebAccess,
  type WebProviderId,
} from "../api/webAccess";

/** «17 nov 2026, 10:42» in the app language. */
function formatDateTime(at: string, lang: string): string {
  return new Date(at).toLocaleString(lang, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const errorCode = (e: unknown) =>
  e instanceof WebAccessError
    ? e.code
    : ((e as { code?: string } | null)?.code ?? "");

/** The consent asked before the key leaves this computer (ADR-0034). */
export function WebAccessConsent({
  provider,
  server,
  local,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  provider: string;
  server: string;
  local: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [agreed, setAgreed] = useState(false);
  const points = [
    "encrypted",
    "admin",
    "billing",
    "follows",
    "revoke",
  ] as const;
  return (
    <Dialog
      labelledBy={`${id}-title`}
      describedBy={`${id}-msg`}
      onClose={onCancel}
      dismissable={!busy}
      className="cd ai-web-consent"
    >
      <h3 id={`${id}-title`} className="cd__title">
        {t("ai.web.consent.title", { provider })}
      </h3>
      <p id={`${id}-msg`} className="cd__msg">
        {t("ai.web.consent.lead", { server })}
        {local && ` ${t("ai.web.consent.local")}`}
      </p>
      <ul className="ai-web-consent__points">
        {points.map((p) => (
          <li key={p}>{t(`ai.web.consent.${p}`)}</li>
        ))}
      </ul>
      <label className="ai-web-consent__check">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          data-testid="ai-web-consent-check"
        />
        <span>{t("ai.web.consent.check")}</span>
      </label>
      {error && (
        <Alert kind="error" className="ai-web-consent__error">
          {error}
        </Alert>
      )}
      <div className="cd__actions">
        <button
          type="button"
          className="cd__cancel"
          autoFocus
          onClick={onCancel}
          disabled={busy}
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="cd__confirm"
          disabled={!agreed || busy}
          aria-busy={busy}
          onClick={onConfirm}
          data-testid="ai-web-consent-upload"
        >
          {busy && (
            <LoaderCircle size={16} className="ai-spin" aria-hidden="true" />
          )}
          {busy ? t("ai.web.consent.uploading") : t("ai.web.consent.upload")}
        </button>
      </div>
    </Dialog>
  );
}

/** Why the switch cannot be turned on now, or null. */
function blockedReason(
  t: (k: string, o?: Record<string, unknown>) => string,
  provider: OnlineProviderId,
  keySet: boolean,
  model: string,
  access: WebAccess | null,
  loadFailed: boolean,
): string | null {
  if (!isWebProvider(provider)) return t("ai.web.switch.compatible");
  if (loadFailed) return t("ai.web.switch.offline");
  if (access && !access.available) return t("ai.web.switch.disabled");
  if (!keySet)
    return t("ai.web.switch.noKey", {
      provider: t(`ai.provenance.provider.${provider}`),
    });
  if (!model.trim()) return t("ai.web.switch.noModel");
  return null;
}

/**
 * Desktop: the switch under the model of «IA en línea». It works on what the
 * app uses (the saved provider and model), never the draft on screen. Its state
 * comes from the server, so a change made on the web or another computer shows
 * here too. `refresh` changes after the key or the config were saved.
 */
export function WebAccessSwitch({
  provider,
  model,
  refresh,
}: {
  provider: OnlineProviderId;
  model: string;
  refresh: number;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const id = useId();
  const [access, setAccess] = useState<WebAccess | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [server, setServer] = useState<{ host: string; local: boolean }>({
    host: "",
    local: false,
  });
  const [consent, setConsent] = useState<{
    provider: WebProviderId;
    model: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keySet, setKeySet] = useState(false);
  const label = (p: string) => t(`ai.provenance.provider.${p}`);

  useEffect(() => {
    let live = true;
    fetchWebAccess()
      .then((a) => {
        if (!live) return;
        setAccess(a);
        setLoadFailed(false);
      })
      .catch(() => live && setLoadFailed(true));
    getServer()
      .then(
        (s) =>
          live && setServer({ host: serverHost(s.origin), local: s.local }),
      )
      .catch(() => undefined);
    aiKeys
      .status(provider)
      .then((set) => live && setKeySet(set))
      .catch(() => live && setKeySet(false));
    return () => {
      live = false;
    };
  }, [refresh, provider]);

  const on = !!access?.enabled;
  const blocked = on
    ? null
    : blockedReason(t, provider, keySet, model, access, loadFailed);

  async function upload(p: WebProviderId, m: string) {
    setBusy(true);
    setError(null);
    try {
      setAccess(await uploadWebAccess(p, m));
      setConsent(null);
      toast(t("ai.web.toast.on", { provider: label(p) }));
    } catch (e) {
      setError(webAccessErrorText(errorCode(e)));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    const ok = await confirm({
      title: t("ai.web.off.title"),
      message: t("ai.web.off.message"),
      confirmLabel: t("ai.web.off.confirm"),
      danger: true,
    });
    if (!ok) return;
    try {
      await removeWebAccess();
      setAccess((a) =>
        a
          ? {
              ...a,
              enabled: false,
              provider: null,
              model: null,
              updatedAt: null,
              needsReupload: false,
            }
          : a,
      );
      toast(t("ai.web.toast.off"));
    } catch (e) {
      toast(webAccessErrorText(errorCode(e)));
    }
  }

  function onToggle(next: boolean) {
    if (!next) return void turnOff();
    if (!isWebProvider(provider)) return;
    setError(null);
    setConsent({ provider, model: model.trim() });
  }

  /** Changing the model or the provider asks first: a new provider uploads another key. */
  async function applyCurrent() {
    if (!isWebProvider(provider) || !access?.enabled) return;
    if (provider !== access.provider) {
      setError(null);
      setConsent({ provider, model: model.trim() });
      return;
    }
    const ok = await confirm({
      title: t("ai.web.model.title"),
      message: t("ai.web.model.message", { model: model.trim() }),
      confirmLabel: t("ai.web.model.confirm"),
    });
    if (ok) await upload(provider, model.trim());
  }

  const differs =
    on &&
    access?.provider &&
    (access.provider !== provider || access.model !== model.trim()) &&
    isWebProvider(provider) &&
    keySet;

  return (
    <div className="ai-web" data-testid="ai-web-access">
      {dialog}
      <div className="ai-web__row">
        <Switch
          id={`${id}-switch`}
          ariaLabel={t("ai.web.switch.label")}
          checked={on}
          disabled={!on && blocked !== null}
          title={!on && blocked ? blocked : undefined}
          describedBy={`${id}-desc`}
          onChange={onToggle}
          testId="ai-web-switch"
        />
        <div className="ai-web__text">
          <label htmlFor={`${id}-switch`} className="ai-web__label">
            {t("ai.web.switch.label")}
          </label>
          <span id={`${id}-desc`} className="adm-hint">
            {on ? null : (blocked ?? t("ai.web.switch.hint"))}
          </span>
          {on && access && (
            <dl className="ai-web__facts">
              <dt>{t("ai.web.facts.inWeb")}</dt>
              <dd>
                {label(access.provider ?? "")} · {access.model}
              </dd>
              <dt>{t("ai.web.facts.uploaded")}</dt>
              <dd>
                {access.updatedAt
                  ? formatDateTime(access.updatedAt, i18n.language)
                  : "—"}
              </dd>
              {server.host && (
                <>
                  <dt>{t("ai.web.facts.server")}</dt>
                  <dd className="t-id">{server.host}</dd>
                </>
              )}
            </dl>
          )}
        </div>
      </div>
      {on && access?.needsReupload && (
        <Alert kind="error" className="ai-web__notice">
          <p>{t("ai.web.reupload.message")}</p>
          {isWebProvider(provider) && keySet && (
            <button
              type="button"
              className="adm-btn adm-btn--secondary"
              onClick={() => setConsent({ provider, model: model.trim() })}
            >
              {t("ai.web.reupload.action")}
            </button>
          )}
        </Alert>
      )}
      {differs && !access?.needsReupload && (
        <Alert kind="info" className="ai-web__notice">
          <p>
            {access?.provider !== provider
              ? t("ai.web.differs.provider", {
                  provider: label(provider),
                  web: label(access?.provider ?? ""),
                })
              : t("ai.web.differs.model", {
                  model: model.trim(),
                  web: access?.model ?? "",
                })}
          </p>
          <button
            type="button"
            className="adm-btn adm-btn--secondary"
            onClick={() => void applyCurrent()}
            disabled={busy}
          >
            {access?.provider !== provider
              ? t("ai.web.differs.useProvider", { provider: label(provider) })
              : t("ai.web.differs.useModel")}
          </button>
        </Alert>
      )}
      {consent && (
        <WebAccessConsent
          provider={label(consent.provider)}
          server={server.host}
          local={server.local}
          busy={busy}
          error={error}
          onCancel={() => {
            setConsent(null);
            setError(null);
          }}
          onConfirm={() => void upload(consent.provider, consent.model)}
        />
      )}
    </div>
  );
}

/**
 * Web: the key the desktop uploaded, read-only (provider and model are set on
 * the desktop), with «Dejar de usarla en la web». Without one, how to get it.
 */
export function WebAccessSummary({ onChange }: { onChange?: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [access, setAccess] = useState<WebAccess | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetchWebAccess()
      .then((a) => live && setAccess(a))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  async function remove() {
    const ok = await confirm({
      title: t("ai.web.summary.removeTitle"),
      message: t("ai.web.summary.removeMessage"),
      confirmLabel: t("ai.web.off.confirm"),
      danger: true,
    });
    if (!ok) return;
    try {
      await removeWebAccess();
      setAccess((a) =>
        a
          ? {
              ...a,
              enabled: false,
              provider: null,
              model: null,
              updatedAt: null,
            }
          : a,
      );
      toast(t("ai.web.toast.off"));
      onChange?.();
    } catch (e) {
      toast(webAccessErrorText(errorCode(e)));
    }
  }

  if (failed) return null;
  if (!access) return null;
  const provider = access.provider
    ? t(`ai.provenance.provider.${access.provider}`)
    : "";

  let body;
  if (!access.available) {
    body = (
      <Alert kind="warning" className="ai-web__notice">
        <p>{t("ai.web.summary.disabled")}</p>
      </Alert>
    );
  } else if (!access.enabled) {
    body = (
      <Alert kind="info" className="ai-web__notice">
        <p>{t("ai.web.summary.off")}</p>
      </Alert>
    );
  } else if (access.needsReupload) {
    body = (
      <Alert kind="error" className="ai-web__notice">
        <p>{t("ai.web.summary.reupload")}</p>
      </Alert>
    );
  } else {
    body = (
      <>
        <p className="ai-web__lead">
          <CircleCheck size={16} aria-hidden="true" /> {t("ai.web.summary.on")}
        </p>
        <dl className="ai-web__facts">
          <dt>{t("ai.web.facts.provider")}</dt>
          <dd>{provider}</dd>
          <dt>{t("ai.web.facts.model")}</dt>
          <dd>{access.model}</dd>
          <dt>{t("ai.web.facts.uploaded")}</dt>
          <dd>
            {access.updatedAt
              ? formatDateTime(access.updatedAt, i18n.language)
              : "—"}
          </dd>
        </dl>
        <p className="adm-hint">{t("ai.web.summary.changeOnDesktop")}</p>
      </>
    );
  }

  return (
    <div className="ai-web ai-web--summary" data-testid="ai-web-summary">
      {dialog}
      <div className="ai-web__head">
        <StatusPill
          dot
          tone={
            access.enabled && access.available && !access.needsReupload
              ? "success"
              : access.enabled
                ? "error"
                : "neutral"
          }
        >
          {t(
            !access.available
              ? "ai.web.summary.pill.disabled"
              : !access.enabled
                ? "ai.web.summary.pill.off"
                : access.needsReupload
                  ? "ai.web.summary.pill.reupload"
                  : "ai.web.summary.pill.on",
          )}
        </StatusPill>
      </div>
      {body}
      {access.enabled && (
        <div className="adm-actions">
          <button
            type="button"
            className="adm-btn adm-btn--ghost-danger"
            onClick={() => void remove()}
            data-testid="ai-web-remove"
          >
            {t("ai.web.summary.remove")}
          </button>
        </div>
      )}
    </div>
  );
}
