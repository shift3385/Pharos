import { Check, Lock, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StatusPill } from "@shared/ui/StatusPill";
import { Switch } from "@shared/ui/Switch";
import { SegmentedControl } from "@shared/ui/SegmentedControl";
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
            <li>
              <StatusPill tone={locked ? "neutral" : "success"} className="ai-chip">
                {locked ? <X size={13} aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
                <span className="sr-only">{locked ? t("ai.params.no") : t("ai.params.yes")}</span>
                {t("ai.params.temperature")}
              </StatusPill>
            </li>
            {reasoning && (
              <li>
                <StatusPill tone="neutral" title={soon} className="ai-chip">
                  <Lock size={13} aria-hidden="true" />
                  <span className="sr-only">{soon}:</span>
                  {t(`ai.params.reasoning.${reasoning.kind}`)}
                </StatusPill>
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
              <span className="ai-param__switch">
                <Switch
                  checked={sendTemperature}
                  onChange={onSendTemperature}
                  label={t("ai.params.send")}
                  describedBy="ai-temperature-note"
                />
              </span>
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
              <span className="adm-label" aria-hidden="true">
                {t(`ai.params.reasoning.${reasoning.kind}`)}
              </span>
              <Lock size={13} className="ai-param__lock" aria-hidden="true" />
            </div>
            {/* Locked until Pharos sends it (RED-W7): every option says why. */}
            <SegmentedControl
              label={t(`ai.params.reasoning.${reasoning.kind}`)}
              value={reasoning.options[0]}
              onChange={() => {}}
              options={reasoning.options.map((o) => ({
                value: o,
                label: t(`ai.params.reasoning.option.${o}`),
                disabled: true,
                title: t("ai.params.soonHint"),
              }))}
            />
            <span className="adm-hint">
              {t("ai.params.soonHint")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
