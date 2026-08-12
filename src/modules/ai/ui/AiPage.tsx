import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@shared/ui/Toast";
import { aiChat, aiKeys, aiStatus, loadConfig, resolveProvider, saveConfig } from "../api/aiApi";
import {
  getDownloadState,
  startDownload,
  subscribeDownload,
  type DownloadView,
} from "../providers/ollamaDownload";
import type { AiConfig, AiMode, AiStatus } from "../model/types";
import "./Ai.css";

type Tab = "online" | "offline";

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

export function AiPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [config, setConfig] = useState<AiConfig>(loadConfig());
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [tab, setTab] = useState<Tab>("online");
  const [keyInput, setKeyInput] = useState("");
  const [pull, setPull] = useState<DownloadView | null>(getDownloadState().view);
  const [testing, setTesting] = useState(false);

  async function refreshStatus(cfg = config) {
    setStatus(await aiStatus(cfg));
  }

  useEffect(() => {
    void refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const next = { ...config, ...patch };
    setConfig(next);
    saveConfig(next);
  }

  async function saveKey() {
    if (!keyInput.trim()) return;
    await aiKeys.set("gemini", keyInput.trim());
    setKeyInput("");
    toast(t("ai.keySaved"));
    await refreshStatus();
  }
  async function clearKey() {
    await aiKeys.clear("gemini");
    toast(t("ai.keyCleared"));
    await refreshStatus();
  }

  /** Starts the download in the module-level manager. Ollama resumes from the
   *  partial blobs on disk, so this also works after the app was closed. */
  async function downloadModel() {
    const ok = await startDownload(config.ollamaEndpoint, config.offlineModel);
    toast(ok ? t("ai.modelReady") : t("ai.ollamaError"));
    await refreshStatus();
  }

  async function testConnection() {
    setTesting(true);
    try {
      const reply = await aiChat([{ role: "user", content: t("ai.testPrompt") }]);
      toast(reply.trim() ? t("ai.testOk") : t("ai.testEmpty"));
    } catch (e) {
      toast(e instanceof Error && e.message === "no-provider" ? t("ai.testNoProvider") : t("ai.testFailed"));
    } finally {
      setTesting(false);
    }
  }

  const resolved = status ? resolveProvider(config, status) : null;
  const modes: AiMode[] = ["auto", "online", "offline"];

  return (
    <section className="ai">
      <header className="ai__header">
        <div>
          <h1>{t("ai.title")}</h1>
          <p className="ai__subtitle">{t("ai.subtitle")}</p>
        </div>
        <button type="button" className="ai__test" onClick={() => void testConnection()} disabled={testing}>
          {testing ? t("ai.testing") : t("ai.test")}
        </button>
      </header>

      <div className="ai__mode">
        <span className="ai__mode-label">{t("ai.mode")}</span>
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            className="ai__mode-btn"
            data-active={config.mode === m}
            onClick={() => update({ mode: m })}
          >
            {t(`ai.modeOption.${m}`)}
          </button>
        ))}
        <span className="ai__resolved">
          {t("ai.using")}:{" "}
          <strong>{resolved ? t(`ai.provider.${resolved}`) : t("ai.provider.none")}</strong>
        </span>
      </div>

      <div className="ai__tabs">
        <button type="button" className="ai__tab" data-active={tab === "online"} onClick={() => setTab("online")}>
          {t("ai.tab.online")}
        </button>
        <button type="button" className="ai__tab" data-active={tab === "offline"} onClick={() => setTab("offline")}>
          {t("ai.tab.offline")}
        </button>
      </div>

      {tab === "online" ? (
        <div className="ai__panel">
          <p className="ai__status">
            {t("ai.keyStatus")}:{" "}
            <strong>{status?.onlineKeySet ? t("ai.keyConfigured") : t("ai.keyNotSet")}</strong>
          </p>
          <div className="ai__row">
            <input
              type="password"
              className="ai__input"
              placeholder={t("ai.keyPlaceholder")}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
            />
            <button type="button" className="ai__btn" onClick={() => void saveKey()} disabled={!keyInput.trim()}>
              {t("ai.saveKey")}
            </button>
            {status?.onlineKeySet && (
              <button type="button" className="ai__btn" onClick={() => void clearKey()}>
                {t("ai.clearKey")}
              </button>
            )}
          </div>
          <label className="ai__field">
            <span>{t("ai.model")}</span>
            <input className="ai__input" value={config.onlineModel} onChange={(e) => update({ onlineModel: e.target.value })} />
          </label>
          <label className="ai__field">
            <span>{t("ai.temperature")}: {config.temperature.toFixed(1)}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={config.temperature}
              onChange={(e) => update({ temperature: Number(e.target.value) })}
            />
          </label>
        </div>
      ) : (
        <div className="ai__panel">
          <p className="ai__status">
            {t("ai.ollamaStatus")}:{" "}
            <strong>
              {!status?.ollamaReachable
                ? t("ai.ollamaOffline")
                : status.ollamaModelReady
                  ? t("ai.modelInstalled")
                  : t("ai.modelMissing")}
            </strong>
          </p>
          <label className="ai__field">
            <span>{t("ai.endpoint")}</span>
            <input
              className="ai__input"
              value={config.ollamaEndpoint}
              onChange={(e) => update({ ollamaEndpoint: e.target.value })}
              onBlur={() => void refreshStatus()}
            />
          </label>
          <label className="ai__field">
            <span>{t("ai.model")}</span>
            <input className="ai__input" value={config.offlineModel} onChange={(e) => update({ offlineModel: e.target.value })} onBlur={() => void refreshStatus()} />
          </label>

          {pull ? (
            <>
              {pull.completed != null && pull.total != null && (
                <p className="ai__pull-stats">
                  {mb(pull.completed)} / {mb(pull.total)}
                  {pull.speedBps ? ` · ${mb(pull.speedBps)}/s` : ""}
                </p>
              )}
              <div className="ai__pull">
                <div className="ai__pull-bar" style={{ width: `${pull.percent ?? 0}%` }} />
                <span className="ai__pull-text">
                  {pull.status} {pull.percent != null ? `${pull.percent}%` : ""}
                </span>
              </div>
              <p className="ai__pull-warn">{t("ai.dontClose")}</p>
            </>
          ) : (
            status?.ollamaReachable &&
            !status.ollamaModelReady && (
              <button type="button" className="ai__btn ai__btn--accent" onClick={() => void downloadModel()}>
                {t("ai.downloadModel", { model: config.offlineModel })}
              </button>
            )
          )}
          <button type="button" className="ai__btn" onClick={() => void refreshStatus()}>
            {t("ai.refresh")}
          </button>
        </div>
      )}

      <p className="ai__note">{t("ai.neverBlocks")}</p>
    </section>
  );
}
