import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CircleCheck,
  Download,
  Eye,
  EyeOff,
  Info,
  PlugZap,
  RefreshCw,
  Save,
  TriangleAlert,
} from "lucide-react";
import { useToast } from "@shared/ui/Toast";
import { StatusPill } from "@shared/ui/StatusPill";
import { SegmentedControl } from "@shared/ui/SegmentedControl";
import { ErrorSummary, FieldMessage } from "@shared/ui/FormField";
import { controlProps, useSaveGuard } from "@shared/ui/fieldProps";
import { required } from "@shared/validation";
import {
  aiChat,
  aiKeys,
  aiListModels,
  aiStatus,
  destinationFor,
  loadConfig,
  resolveProvider,
  saveConfig,
} from "../api/aiApi";
import {
  getDownloadState,
  startDownload,
  subscribeDownload,
  type DownloadView,
} from "../providers/ollamaDownload";
import { capabilitiesFor } from "../model/capabilities";
import {
  ONLINE_PROVIDERS,
  providerInfo,
  type AiConfig,
  type AiMode,
  type AiStatus,
  type OnlineProviderId,
} from "../model/types";
import { ProviderLogo } from "./ProviderLogo";
import { ModelParams } from "./ModelParams";
import "./Ai.css";

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

/** The provider's own message (Rust returns a string; fetch errors an Error). */
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

type TestResult = { ok: true; ms: number } | { ok: false; message: string };

/**
 * Administración → Motor de IA (SPEC §8, ScrAdministracion `tab="ai"`): the
 * online provider with its key, model and parameters (from the capabilities
 * table, ADR-0031), the local Ollama model, and where AI is used. Provider,
 * model, parameters, Ollama settings and a typed key are a draft saved with
 * «Guardar» in the tab's save bar (the key goes to the keychain, never to the
 * config). «Guardar clave» stores only the key. Changing provider with a typed
 * key, or leaving the tab with any draft, asks first.
 */
export function AiEngineTab({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const uid = useId();
  const [saved, setSaved] = useState<AiConfig>(loadConfig);
  const [draft, setDraft] = useState<AiConfig>(saved);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [pull, setPull] = useState<DownloadView | null>(getDownloadState().view);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [listing, setListing] = useState(false);

  const configDirty = JSON.stringify(draft) !== JSON.stringify(saved);
  // A key typed but not stored is unsaved work too.
  const keyDirty = keyInput.trim() !== "";
  const dirty = configDirty || keyDirty;
  const provider = draft.onlineProvider;
  const info = providerInfo(provider);
  const model = draft.onlineModels[provider];
  const caps = capabilitiesFor(provider, model);
  const providerLabel = (id: OnlineProviderId | "ollama") => t(`ai.provenance.provider.${id}`);

  // «Compatible» cannot work without its URL: saving explains that instead.
  const baseUrlIssue = provider === "custom" ? required(draft.customBaseUrl) : null;
  const { guard, showSummary, summaryRef, attempted } = useSaveGuard(baseUrlIssue !== null);

  async function refreshStatus(cfg = draft) {
    setStatus(await aiStatus(cfg));
  }

  useEffect(() => {
    void refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  // Closing the window with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Reflect the module-level download so it survives navigating away and back.
  useEffect(() => {
    let wasActive = getDownloadState().active;
    setPull(getDownloadState().view);
    return subscribeDownload((s) => {
      setPull(s.view);
      if (wasActive && !s.active) void refreshStatus(); // finished → reflect status
      wasActive = s.active;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(patch: Partial<AiConfig>) {
    setDraft((d) => ({ ...d, ...patch }));
    setTest(null);
  }

  async function selectProvider(id: OnlineProviderId) {
    if (id === provider) return;
    // The typed key belongs to the current provider: switching drops it.
    if (keyDirty && !window.confirm(t("ai.keyDiscardConfirm"))) return;
    const next = { ...draft, onlineProvider: id };
    setDraft(next);
    setKeyInput("");
    setModels([]);
    setTest(null);
    await refreshStatus(next);
  }

  async function save() {
    if (keyDirty) {
      await aiKeys.set(provider, keyInput.trim());
      setKeyInput("");
      setShowKey(false);
    }
    saveConfig(draft);
    const fresh = loadConfig();
    setSaved(fresh);
    setDraft(fresh);
    toast(keyDirty ? t("ai.savedWithKey") : t("ai.saved"));
    await refreshStatus(fresh);
  }

  async function saveKey() {
    if (!keyInput.trim()) return;
    await aiKeys.set(provider, keyInput.trim());
    setKeyInput("");
    setShowKey(false);
    toast(t("ai.keySaved"));
    await refreshStatus();
  }

  async function clearKey() {
    await aiKeys.clear(provider);
    toast(t("ai.keyCleared"));
    await refreshStatus();
  }

  async function listModels() {
    setListing(true);
    try {
      const found = await aiListModels(provider, draft.customBaseUrl);
      setModels(found);
      toast(found.length ? t("ai.modelsFound", { count: found.length }) : t("ai.modelsNone"));
    } catch (e) {
      toast(t("ai.modelsFailed", { error: errorText(e) }));
    } finally {
      setListing(false);
    }
  }

  /** Starts the download in the module-level manager. Ollama resumes from the
   *  partial blobs on disk, so this also works after the app was closed. */
  async function downloadModel() {
    const ok = await startDownload(draft.ollamaEndpoint, draft.offlineModel);
    toast(ok ? t("ai.modelReady") : t("ai.ollamaError"));
    await refreshStatus();
  }

  /** Tests the saved configuration (what the app uses) and times the reply. */
  async function testConnection() {
    setTesting(true);
    setTest(null);
    const start = performance.now();
    try {
      const reply = await aiChat([{ role: "user", content: t("ai.testPrompt") }]);
      setTest(
        reply.trim()
          ? { ok: true, ms: Math.round(performance.now() - start) }
          : { ok: false, message: t("ai.testEmpty") },
      );
    } catch (e) {
      setTest({
        ok: false,
        message:
          e instanceof Error && e.message === "no-provider"
            ? t("ai.testNoProvider")
            : t("ai.testFailedWith", { error: errorText(e) }),
      });
    } finally {
      setTesting(false);
    }
  }

  const resolved = status ? resolveProvider(draft, status) : null;
  const destination = destinationFor(resolved, draft);
  const modes: AiMode[] = ["auto", "online", "offline"];
  const onlineState = !status
    ? null
    : !status.onlineKeySet
      ? "notSet"
      : status.online
        ? "connected"
        : "offline";
  const ollamaState = !status
    ? null
    : !status.ollamaReachable
      ? "offline"
      : status.ollamaModelReady
        ? "ready"
        : "missing";

  return (
    <div className="ai-tab">
      <div className="ai-tab__mode">
        <span className="adm-label" aria-hidden="true">
          {t("ai.mode")}
        </span>
        <SegmentedControl
          className="adm-seg-wrap"
          label={t("ai.mode")}
          value={draft.mode}
          onChange={(mode) => update({ mode })}
          options={modes.map((m) => ({ value: m, label: t(`ai.modeOption.${m}`) }))}
        />
        <span className="ai-tab__using">
          {t("ai.using")}:{" "}
          <strong>
            {destination ? `${providerLabel(destination.provider)} · ${destination.model}` : t("ai.provider.none")}
          </strong>
        </span>
      </div>

      <div className="ai-tab__grid">
        <section className="adm-card" aria-labelledby={`${uid}-online`}>
          <header className="adm-card__head">
            <div className="adm-card__titles">
              <h2 id={`${uid}-online`} className="t-card-title">
                {t("ai.online.title")}
              </h2>
              <p className="adm-hint">{t("ai.online.desc")}</p>
            </div>
            {onlineState && (
              <StatusPill
                dot
                tone={onlineState === "connected" ? "success" : onlineState === "offline" ? "warning" : "neutral"}
              >
                {t(`ai.online.state.${onlineState}`)}
              </StatusPill>
            )}
          </header>

          <div className="ai-providers" role="radiogroup" aria-label={t("ai.onlineProvider")}>
            {ONLINE_PROVIDERS.map((p) => (
              <label key={p.id} className="ai-provider" data-testid={`ai-provider-${p.id}`}>
                <input
                  type="radio"
                  name={`${uid}-provider`}
                  value={p.id}
                  checked={provider === p.id}
                  onChange={() => void selectProvider(p.id)}
                />
                <span className="ai-provider__box">
                  <span className="ai-provider__logo">
                    <ProviderLogo provider={p.id} />
                  </span>
                  <span className="ai-provider__text">
                    <span className="ai-provider__name">{p.id === "custom" ? t("ai.providerCompat") : providerLabel(p.id)}</span>
                    <span className="ai-provider__sub">{t(`ai.providerSub.${p.id}`)}</span>
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="adm-hint">
            {t(`ai.providerHint.${provider}`)}
            {info.keyUrl && (
              <>
                {" "}
                {t("ai.keyWhere")} <span className="t-id">{info.keyUrl}</span>
              </>
            )}
          </p>

          {provider === "custom" && (
            <div className="adm-field">
              <label htmlFor="ai-base-url" className="adm-label">
                {t("ai.baseUrl")}
              </label>
              <input
                {...controlProps("ai-base-url", attempted ? baseUrlIssue : null, "ai-base-url-hint")}
                aria-required
                className="adm-input"
                placeholder="https://llm.miempresa.com/v1"
                spellCheck={false}
                value={draft.customBaseUrl}
                onChange={(e) => update({ customBaseUrl: e.target.value })}
                onBlur={() => void refreshStatus()}
              />
              <span id="ai-base-url-hint" className="adm-hint">
                {t("ai.baseUrlHint")}
              </span>
              {attempted && baseUrlIssue && <FieldMessage id="ai-base-url-msg" issue={baseUrlIssue} />}
            </div>
          )}

          <div className="adm-field">
            <label htmlFor="ai-key" className="adm-label">
              {t("ai.keyStatus")}
              <span className="ai-key__state">
                {" · "}
                {info.keyRequired
                  ? status?.onlineKeySet
                    ? t("ai.keyConfigured")
                    : t("ai.keyNotSet")
                  : t("ai.keyOptional")}
              </span>
            </label>
            <div className="adm-inline">
              <div className="adm-input adm-input--with-btn">
                <input
                  id="ai-key"
                  type={showKey ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="ai-key-hint"
                  placeholder={
                    status?.onlineKeySet && info.keyRequired
                      ? t("ai.keyReplace")
                      : t("ai.keyPlaceholder", { provider: providerLabel(provider) })
                  }
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                />
                <button
                  type="button"
                  className="adm-icon-btn"
                  aria-label={showKey ? t("ai.keyHide") : t("ai.keyShow")}
                  title={showKey ? t("ai.keyHide") : t("ai.keyShow")}
                  aria-pressed={showKey}
                  onClick={() => setShowKey((s) => !s)}
                >
                  {showKey ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
              <button
                type="button"
                className="adm-btn adm-btn--secondary"
                onClick={() => void saveKey()}
                disabled={!keyInput.trim()}
              >
                {t("ai.saveKey")}
              </button>
              {info.keyRequired && status?.onlineKeySet && (
                <button type="button" className="adm-btn adm-btn--ghost-danger" onClick={() => void clearKey()}>
                  {t("ai.clearKey")}
                </button>
              )}
            </div>
            <span id="ai-key-hint" className="adm-hint">
              {t("ai.keyHint")}
            </span>
          </div>

          <div className="adm-field">
            <label htmlFor="ai-online-model" className="adm-label">
              {t("ai.model")}
            </label>
            <div className="adm-inline">
              <input
                id="ai-online-model"
                className="adm-input"
                list="ai-online-models"
                spellCheck={false}
                placeholder={t("ai.modelPlaceholder")}
                value={model}
                onChange={(e) =>
                  update({ onlineModels: { ...draft.onlineModels, [provider]: e.target.value } })
                }
              />
              <button
                type="button"
                className="adm-btn adm-btn--secondary"
                onClick={() => void listModels()}
                disabled={listing || !status?.onlineKeySet}
                title={!status?.onlineKeySet ? t("ai.listModelsNeedsKey") : undefined}
              >
                {listing ? t("ai.listingModels") : t("ai.listModels")}
              </button>
            </div>
            <datalist id="ai-online-models">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>

          <ModelParams
            caps={caps}
            temperature={draft.temperature}
            sendTemperature={draft.customSendTemperature}
            onTemperature={(temperature) => update({ temperature })}
            onSendTemperature={(customSendTemperature) => update({ customSendTemperature })}
          />

          {showSummary && baseUrlIssue && (
            <ErrorSummary
              ref={summaryRef}
              items={[{ label: t("ai.baseUrl"), issue: baseUrlIssue, fieldId: "ai-base-url" }]}
            />
          )}

          <div className="adm-actions">
            <button
              type="button"
              className="adm-btn adm-btn--secondary"
              onClick={() => void testConnection()}
              disabled={testing || dirty}
              title={dirty ? t("ai.testSaveFirst") : undefined}
            >
              <PlugZap size={16} aria-hidden="true" />
              {testing ? t("ai.testing") : t("ai.test")}
            </button>
            <span className="ai-test" role="status">
              {test?.ok && (
                <span className="ai-test__ok">
                  <CircleCheck size={15} aria-hidden="true" />
                  {t("ai.responseIn", { ms: test.ms })}
                </span>
              )}
              {test && !test.ok && <span className="ai-test__err">{test.message}</span>}
            </span>
          </div>
        </section>

        <div className="ai-tab__side">
          <section className="adm-card" aria-labelledby={`${uid}-ollama`}>
            <header className="adm-card__head">
              <div className="adm-card__titles">
                <h2 id={`${uid}-ollama`} className="t-card-title ai-ollama__title">
                  <ProviderLogo provider="ollama" size={18} />
                  Ollama
                </h2>
                <p className="adm-hint">{t("ai.ollama.desc")}</p>
              </div>
              {ollamaState && (
                <StatusPill
                  dot
                  tone={ollamaState === "ready" ? "success" : ollamaState === "missing" ? "warning" : "neutral"}
                >
                  {t(`ai.ollama.state.${ollamaState}`)}
                </StatusPill>
              )}
            </header>
            {ollamaState === "offline" && (
              <p className="ai-warn">
                <TriangleAlert size={15} aria-hidden="true" />
                {t("ai.ollamaOffline")}
              </p>
            )}
            <div className="adm-field">
              <label htmlFor="ai-ollama-endpoint" className="adm-label">
                {t("ai.endpoint")}
              </label>
              <input
                id="ai-ollama-endpoint"
                className="adm-input"
                spellCheck={false}
                value={draft.ollamaEndpoint}
                onChange={(e) => update({ ollamaEndpoint: e.target.value })}
                onBlur={() => void refreshStatus()}
              />
            </div>
            <div className="adm-field">
              <label htmlFor="ai-ollama-model" className="adm-label">
                {t("ai.model")}
              </label>
              <input
                id="ai-ollama-model"
                className="adm-input"
                spellCheck={false}
                aria-describedby={ollamaState === "missing" ? "ai-ollama-missing" : undefined}
                value={draft.offlineModel}
                onChange={(e) => update({ offlineModel: e.target.value })}
                onBlur={() => void refreshStatus()}
              />
              {ollamaState === "missing" && (
                <span id="ai-ollama-missing" className="adm-hint">
                  {t("ai.ollama.missingHint", { model: draft.offlineModel })}
                </span>
              )}
            </div>

            {pull ? (
              <div className="ai-pull">
                {pull.completed != null && pull.total != null && (
                  <p className="adm-hint u-num">
                    {mb(pull.completed)} / {mb(pull.total)}
                    {pull.speedBps ? ` · ${mb(pull.speedBps)}/s` : ""}
                  </p>
                )}
                <div
                  className="ai-pull__bar"
                  role="progressbar"
                  aria-label={t("ai.downloadModel", { model: draft.offlineModel })}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pull.percent ?? undefined}
                >
                  <span style={{ width: `${pull.percent ?? 0}%` }} />
                </div>
                <p className="adm-hint">
                  {pull.status} {pull.percent != null ? `${pull.percent}%` : ""}
                </p>
                <p className="ai-warn">{t("ai.dontClose")}</p>
              </div>
            ) : null}

            <div className="adm-actions">
              <button type="button" className="adm-btn adm-btn--secondary" onClick={() => void refreshStatus()}>
                <RefreshCw size={16} aria-hidden="true" />
                {t("ai.retry")}
              </button>
              {!pull && ollamaState === "missing" && (
                <button type="button" className="adm-btn adm-btn--secondary" onClick={() => void downloadModel()}>
                  <Download size={16} aria-hidden="true" />
                  {t("ai.downloadModel", { model: draft.offlineModel })}
                </button>
              )}
            </div>
          </section>

          <section className="adm-card adm-card--info" aria-labelledby={`${uid}-where`}>
            <Info size={18} className="adm-card__icon" aria-hidden="true" />
            <div className="adm-card__titles">
              <h2 id={`${uid}-where`} className="t-card-title">
                {t("ai.whereUsed.title")}
              </h2>
              <p className="adm-hint">{t("ai.whereUsed.body")}</p>
              <p className="adm-hint">{t("ai.neverBlocks")}</p>
            </div>
          </section>
        </div>
      </div>

      {/* One save for the whole tab, always in view (SPEC §8). */}
      <div className="adm-savebar" data-dirty={dirty || undefined}>
        <span className="adm-savebar__state" role="status">
          {dirty ? t("admin.unsaved") : ""}
        </span>
        <button
          type="button"
          className="adm-btn adm-btn--primary"
          data-testid="ai-save"
          onClick={() => guard(() => void save())}
          disabled={!dirty}
          title={dirty ? undefined : t("admin.nothingToSave")}
        >
          <Save size={16} aria-hidden="true" />
          {t("ai.save")}
        </button>
      </div>
    </div>
  );
}
