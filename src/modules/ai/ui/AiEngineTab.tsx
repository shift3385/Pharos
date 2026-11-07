import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CircleCheck,
  Download,
  Eye,
  EyeOff,
  Info,
  LoaderCircle,
  PlugZap,
  RefreshCw,
  Save,
  TriangleAlert,
} from "lucide-react";
import { isTauri } from "@shared/platform";
import { InfoTip } from "@shared/ui/InfoTip";
import { joinLabels } from "@shared/ui/joinLabels";
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
  aiTestKey,
  destinationFor,
  isKeyRejection,
  loadConfig,
  onlineConfigured,
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
  type AiDestination,
  type AiMessage,
  type AiMode,
  type AiStatus,
  type OnlineProviderId,
} from "../model/types";
import { ProviderLogo } from "./ProviderLogo";
import { ModelCombobox } from "./ModelCombobox";
import { ModelParams } from "./ModelParams";
import { pendingChanges } from "./pendingChanges";
import "./Ai.css";

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

/** The provider's own message (Rust returns a string; fetch errors an Error). */
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The provider the app really uses (what is saved, not the card being edited). */
function InUseMark({ label }: { label: string }) {
  return (
    <span className="ai-in-use" role="img" aria-label={label} title={label} data-testid="ai-in-use">
      <CircleCheck size={16} aria-hidden="true" />
    </span>
  );
}

/** `typedKey`: the test used the key in the field, which is still not stored. */
type TestResult = { ok: true; ms: number; typedKey: boolean } | { ok: false; message: string };

/**
 * Administración → Motor de IA (SPEC §8, ScrAdministracion `tab="ai"`): the
 * online provider with its key, model and parameters (from the capabilities
 * table, ADR-0031), the local Ollama model, and where AI is used. Provider,
 * model, parameters, Ollama settings and a typed key are a draft saved with
 * «Guardar» in the tab's save bar (the key goes to the keychain, never to the
 * config). «Guardar clave» stores the key and makes its provider the active one
 * (ADR-0033). «Probar conexión» tries a typed key without storing it, and
 * replacing a stored key with one that was not tested asks first. Changing
 * provider with a typed key, or leaving the tab with any draft, asks first.
 */
export function AiEngineTab({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const uid = useId();
  const [saved, setSaved] = useState<AiConfig>(loadConfig);
  const [draft, setDraft] = useState<AiConfig>(saved);
  const [status, setStatus] = useState<AiStatus | null>(null);
  // Whether the provider on screen has its key (`status` also waits for Ollama).
  const [keyCheck, setKeyCheck] = useState<{ provider: OnlineProviderId; set: boolean } | null>(null);
  const statusRun = useRef(0);
  // What the app really uses: the saved config, never the draft on screen.
  const [inUse, setInUse] = useState<AiDestination | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [pull, setPull] = useState<DownloadView | null>(getDownloadState().view);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  // Bumped whenever what is under test changes, so a late answer is dropped.
  const testRun = useRef(0);
  const [models, setModels] = useState<string[]>([]);
  const [modelListOpen, setModelListOpen] = useState(false);
  const [listing, setListing] = useState(false);

  const configDirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const keyTyped = keyInput.trim() !== "";
  // Keys live in the OS keychain: the web can only test them, never store them.
  const canStoreKey = isTauri();
  // A key typed but not stored is unsaved work too.
  const keyDirty = canStoreKey && keyTyped;
  const dirty = configDirty || keyDirty;
  const provider = draft.onlineProvider;
  // The save bar says what is pending, so nobody has to guess what «Guardar» does.
  const pendingLabels = pendingChanges(draft, saved, keyDirty).map((id) =>
    id === "provider" ? t("ai.pending.provider", { provider: t(`ai.provenance.provider.${provider}`) }) : t(`ai.pending.${id}`),
  );
  const pendingText = joinLabels(pendingLabels, t("common.and"));
  const info = providerInfo(provider);
  const model = draft.onlineModels[provider];
  const caps = capabilitiesFor(provider, model);
  const providerLabel = (id: OnlineProviderId | "ollama") => t(`ai.provenance.provider.${id}`);

  // A provider without its key cannot become the active one: the app would be
  // left without AI (ADR-0033). While its key is being checked, saving waits too.
  const needsKeyCheck = provider !== saved.onlineProvider && info.keyRequired && !keyDirty;
  const keyMissing = needsKeyCheck && keyCheck?.provider === provider && !keyCheck.set;
  const saveBlocked = needsKeyCheck && !(keyCheck?.provider === provider && keyCheck.set);
  const keyMissingText = canStoreKey
    ? t("ai.pending.needsKey", { provider: providerLabel(provider) })
    : t("ai.keyWebHint");

  // «Compatible» cannot work without its URL: saving explains that instead.
  const baseUrlIssue = provider === "custom" ? required(draft.customBaseUrl) : null;
  const { guard, showSummary, summaryRef, attempted } = useSaveGuard(baseUrlIssue !== null);

  async function refreshStatus(cfg = draft) {
    const run = ++statusRun.current;
    // The key first: the keychain answers at once, Ollama may take seconds.
    const keySet = await onlineConfigured(cfg);
    if (run !== statusRun.current) return; // Another provider was chosen meanwhile.
    setKeyCheck({ provider: cfg.onlineProvider, set: keySet });
    const next = await aiStatus(cfg);
    if (run !== statusRun.current) return;
    setStatus(next);
    setKeyCheck({ provider: cfg.onlineProvider, set: next.onlineKeySet });
    const live = loadConfig();
    const liveStatus = JSON.stringify(cfg) === JSON.stringify(live) ? next : await aiStatus(live);
    if (run !== statusRun.current) return;
    setInUse(destinationFor(resolveProvider(live, liveStatus), live));
  }

  function resetTest() {
    testRun.current += 1;
    setTesting(false);
    setTest(null);
  }

  /** Replacing a stored key cannot be undone: only a key that just answered
   *  goes through without asking. */
  async function confirmReplaceKey() {
    if (test?.ok && test.typedKey) return true;
    const stored = await aiKeys.status(provider).catch(() => false);
    return !stored || window.confirm(t("ai.keyReplaceConfirm", { provider: providerLabel(provider) }));
  }

  useEffect(() => {
    void refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // AdminPage guards leaving with unsaved changes (useUnsavedChangesGuard).
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

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
    resetTest();
  }

  async function selectProvider(id: OnlineProviderId) {
    if (id === provider) return;
    // The typed key belongs to the current provider: switching drops it.
    if (keyDirty && !window.confirm(t("ai.keyDiscardConfirm"))) return;
    const next = { ...draft, onlineProvider: id };
    setDraft(next);
    setKeyInput("");
    setModels([]);
    setModelListOpen(false);
    resetTest();
    await refreshStatus(next);
  }

  async function save() {
    if (keyDirty) {
      if (!(await confirmReplaceKey())) return;
      await aiKeys.set(provider, keyInput.trim());
      setKeyInput("");
      setShowKey(false);
    }
    saveConfig(draft);
    const fresh = loadConfig();
    setSaved(fresh);
    setDraft(fresh);
    resetTest();
    toast(t("admin.savedWhat", { changes: pendingText }));
    await refreshStatus(fresh);
  }

  /** Stores the key and makes its provider the active one: a key saved for a
   *  provider that stays inactive leaves the app asking for one (ADR-0033).
   *  The rest of the draft (model, parameters) still waits for «Guardar». */
  async function saveKey() {
    if (!keyDirty) return;
    if (!(await confirmReplaceKey())) return;
    await aiKeys.set(provider, keyInput.trim());
    const becameActive = saved.onlineProvider !== provider;
    saveConfig({
      ...saved,
      onlineProvider: provider,
      // «Compatible» cannot be the active provider without its URL.
      customBaseUrl: provider === "custom" ? draft.customBaseUrl : saved.customBaseUrl,
    });
    setSaved(loadConfig());
    setKeyInput("");
    setShowKey(false);
    resetTest();
    toast(becameActive ? t("ai.keySavedActive", { provider: providerLabel(provider) }) : t("ai.keySaved"));
    await refreshStatus();
  }

  async function clearKey() {
    await aiKeys.clear(provider);
    resetTest();
    toast(t("ai.keyCleared"));
    await refreshStatus();
  }

  async function listModels() {
    setListing(true);
    try {
      const found = await aiListModels(provider, draft.customBaseUrl);
      setModels(found);
      setModelListOpen(found.length > 0);
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

  /** Times a reply. With a typed key, tries that key with the form on screen and
   *  stores nothing; otherwise tests the saved configuration (what the app uses). */
  async function testConnection() {
    resetTest();
    const run = testRun.current;
    const typedKey = keyInput.trim();
    setTesting(true);
    const start = performance.now();
    const messages: AiMessage[] = [{ role: "user", content: t("ai.testPrompt") }];
    let result: TestResult;
    try {
      const reply = typedKey ? await aiTestKey(draft, typedKey, messages) : await aiChat(messages);
      result = reply.trim()
        ? { ok: true, ms: Math.round(performance.now() - start), typedKey: typedKey !== "" }
        : { ok: false, message: t("ai.testEmpty") };
    } catch (e) {
      const error = errorText(e);
      result = {
        ok: false,
        message:
          error === "no-provider"
            ? draft.mode !== "offline" && status && !status.onlineKeySet
              ? t("ai.testNoKey", { provider: providerLabel(provider) })
              : t("ai.testNoProvider")
            : t(isKeyRejection(error) ? "ai.testKeyRejected" : "ai.testFailedWith", { error }),
      };
    }
    if (run !== testRun.current) return; // The key or the form changed meanwhile.
    setTest(result);
    setTesting(false);
  }

  // Why the test cannot run now, said on screen and not only in a tooltip.
  const testBlock = keyTyped
    ? baseUrlIssue
      ? t("ai.testNeedsUrl")
      : !model.trim()
        ? t(canStoreKey ? "ai.testNeedsModel" : "ai.testNeedsModelWeb")
        : null
    : keyMissing
      ? t("ai.testNoKey", { provider: providerLabel(provider) })
      : configDirty
        ? t("ai.testSaveFirst")
        : null;
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
      </div>

      <div className="ai-tab__grid">
        <section className="adm-card" aria-labelledby={`${uid}-online`}>
          <header className="adm-card__head">
            <div className="adm-card__titles">
              <h2 id={`${uid}-online`} className="t-card-title">
                {t("ai.online.title")}
              </h2>
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
              <div key={p.id} className="ai-provider-cell">
                <label className="ai-provider" data-testid={`ai-provider-${p.id}`}>
                  <input
                    type="radio"
                    name={`${uid}-provider`}
                    value={p.id}
                    checked={provider === p.id}
                    aria-describedby={`${uid}-help-${p.id}`}
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
                    {inUse?.provider === p.id && <InUseMark label={t("ai.using")} />}
                  </span>
                </label>
                {/* Beside the label, not inside it: asking for help does not choose the provider. */}
                <InfoTip id={`${uid}-help-${p.id}`} label={p.id === "custom" ? t("ai.providerCompat") : providerLabel(p.id)}>
                  {t(`ai.providerHint.${p.id}`)}
                  {p.keyUrl && (
                    <>
                      {" "}
                      {t("ai.keyWhere")} <span className="t-id">{p.keyUrl}</span>
                    </>
                  )}
                </InfoTip>
              </div>
            ))}
          </div>
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
                  onChange={(e) => {
                    setKeyInput(e.target.value);
                    resetTest();
                  }}
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
                onClick={() => guard(() => void saveKey())}
                disabled={!keyDirty}
                title={canStoreKey ? undefined : t("ai.keyWebHint")}
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
              {canStoreKey ? t("ai.keyHint") : t("ai.keyWebHint")}
            </span>
          </div>

          <div className="adm-field">
            <label htmlFor="ai-online-model" className="adm-label">
              {t("ai.model")}
            </label>
            <div className="adm-inline">
              <ModelCombobox
                id="ai-online-model"
                placeholder={t("ai.modelPlaceholder")}
                value={model}
                onChange={(value) => update({ onlineModels: { ...draft.onlineModels, [provider]: value } })}
                options={models}
                open={modelListOpen}
                onOpenChange={setModelListOpen}
              />
              <button
                type="button"
                className="adm-btn adm-btn--secondary"
                onClick={() => void listModels()}
                disabled={listing || !status?.onlineKeySet}
                title={!status?.onlineKeySet ? t(canStoreKey ? "ai.listModelsNeedsKey" : "ai.listModelsDesktopOnly") : undefined}
              >
                {listing ? t("ai.listingModels") : t("ai.listModels")}
              </button>
            </div>
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
              disabled={testing || testBlock !== null}
              title={testBlock ?? undefined}
              aria-busy={testing}
            >
              {testing ? (
                <LoaderCircle size={16} className="ai-spin" aria-hidden="true" />
              ) : (
                <PlugZap size={16} aria-hidden="true" />
              )}
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
              {!test && !testing && testBlock && <span className="adm-hint">{testBlock}</span>}
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
                  {inUse?.provider === "ollama" && <InUseMark label={t("ai.using")} />}
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
          {keyMissing
            ? keyMissingText
            : dirty
              ? t("ai.pending.message", { changes: pendingText })
              : t("ai.pending.none")}
        </span>
        <button
          type="button"
          className="adm-btn adm-btn--primary"
          data-testid="ai-save"
          onClick={() => guard(() => void save())}
          disabled={!dirty || saveBlocked}
          title={keyMissing ? keyMissingText : dirty ? undefined : t("admin.nothingToSave")}
        >
          <Save size={16} aria-hidden="true" />
          {t("ai.save")}
        </button>
      </div>
    </div>
  );
}
