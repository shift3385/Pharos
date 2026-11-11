import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Cloud, HardDrive } from "lucide-react";
import type { AiDestination } from "../model/types";
import "@shared/ui/alert.css";

/** What goes where before a large send (IA-17, ADR-0036; shared with IA-18):
 *  whether the material leaves this device and to which provider (its name,
 *  not the model: UX-18), plus what is sent. The other AI buttons send one
 *  field and show no notice (ADR-0033); a whole project or a set of images
 *  is another matter. */
export function AiSendNotice({
  destination,
  children,
}: {
  destination: AiDestination | null;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  if (!destination) return null;
  const local = destination.provider === "ollama";
  const provider = t(`ai.provenance.provider.${destination.provider}`);
  const Icon = local ? HardDrive : Cloud;
  return (
    <div
      className={`ui-alert ${local ? "" : "ui-alert--warning"}`}
      role="note"
      data-testid="ai-send-notice"
    >
      <Icon size={18} aria-hidden="true" className="ui-alert__icon" />
      <div className="ui-alert__body">
        <p>
          <strong>
            {local
              ? t("ai.send.local", { provider })
              : t("ai.send.cloud", { provider })}
          </strong>
        </p>
        {children}
      </div>
    </div>
  );
}
