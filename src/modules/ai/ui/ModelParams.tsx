import { Check, Lock, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ModelCapabilities } from "../model/capabilities";

/**
 * The model's parameters, drawn from the capabilities table (ADR-0031): what
 * the model accepts is listed with ✓, what it does not with ✗; a parameter
 * that is not sent is locked with a padlock and says why (SPEC §4/§8).
 * Reasoning is never sent yet, so it stays locked as «Próximamente».
 */
export function ModelParams({
  caps,
  temperature,
  sendTemperature,
  onTemperature,
  onSendTemperature,
}: {
  caps: ModelCapabilities;
  temperature: number;
  /** «Compatible» only: whether the user chose to send it. */
  sendTemperature: boolean;
  onTemperature: (value: number) => void;
  onSendTemperature: (send: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const temp = caps.temperature;
  const optional = temp.support === "optional";
  const locked = temp.support === "unsupported";
  const active = temp.support === "supported" || (optional && sendTemperature);
  const fmt = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const reasoning = caps.reasoning;
  const soon = t("ai.params.soon");

  return (
    <div className="ai-params">
      {optional ? (
        <p className="adm-hint">{t("ai.params.compatUnknown")}</p>
      ) : (
        <div className="ai-params__caps">
          <span className="adm-hint">{t("ai.params.supported")}</span>
          <ul className="ai-params__chips">
            <li className="ai-chip" data-ok={!locked}>
              {locked ? <X size={13} aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
              <span className="sr-only">{locked ? t("ai.params.no") : t("ai.params.yes")}</span>
              {t("ai.params.temperature")}
            </li>
            {reasoning && (
              <li className="ai-chip" data-ok={false} title={soon}>
                <Lock size={13} aria-hidden="true" />
                <span className="sr-only">{soon}:</span>
                {t(`ai.params.reasoning.${reasoning.kind}`)}
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="ai-params__grid">
        <div className="ai-param" data-locked={!active || undefined}>
          <div className="ai-param__head">
            <label htmlFor="ai-temperature" className="adm-label">
              {t("ai.params.temperature")}
            </label>
            {(locked || (optional && !sendTemperature)) && (
              <Lock size={13} className="ai-param__lock" aria-hidden="true" />
            )}
            {optional && (
              <label className="adm-switch">
                <input
                  type="checkbox"
                  role="switch"
                  checked={sendTemperature}
                  onChange={(e) => onSendTemperature(e.target.checked)}
                />
                <span className="adm-switch__track" aria-hidden="true" />
                <span className="adm-switch__label">{t("ai.params.send")}</span>
              </label>
            )}
          </div>
          <div className="ai-param__range">
            <input
              id="ai-temperature"
              type="range"
              min={temp.min}
              max={temp.max}
              step={temp.step}
              value={temperature}
              disabled={!active}
              title={locked ? t(temp.note) : undefined}
              aria-describedby="ai-temperature-note"
              aria-valuetext={active ? fmt.format(temperature) : t("ai.params.notSent")}
              onChange={(e) => onTemperature(Number(e.target.value))}
            />
            <span className="ai-param__value u-num" aria-hidden="true">
              {active ? fmt.format(temperature) : "—"}
            </span>
          </div>
          <span id="ai-temperature-note" className="adm-hint">
            {optional
              ? t("ai.params.note.compat")
              : temp.support === "supported" && temp.note === "ai.params.note.range"
                ? t("ai.params.note.range", { min: fmt.format(temp.min), max: fmt.format(temp.max) })
                : t(temp.note)}
          </span>
        </div>

        {reasoning && (
          <div className="ai-param" data-locked>
            <div className="ai-param__head">
              <span id="ai-reasoning-label" className="adm-label">
                {t(`ai.params.reasoning.${reasoning.kind}`)}
              </span>
              <Lock size={13} className="ai-param__lock" aria-hidden="true" />
            </div>
            <div
              className="adm-seg"
              role="radiogroup"
              aria-labelledby="ai-reasoning-label"
              aria-describedby="ai-reasoning-note"
              title={t("ai.params.soonHint")}
            >
              {reasoning.options.map((o, i) => (
                <label key={o} className="adm-seg__opt">
                  <input type="radio" name="ai-reasoning" value={o} disabled defaultChecked={i === 0} />
                  <span>{t(`ai.params.reasoning.option.${o}`)}</span>
                </label>
              ))}
            </div>
            <span id="ai-reasoning-note" className="adm-hint">
              {t("ai.params.soonHint")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
