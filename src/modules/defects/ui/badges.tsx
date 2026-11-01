import { useTranslation } from "react-i18next";
import { StatusPill } from "@shared/ui/StatusPill";
import type { Defect, DefectSeverity } from "../model/types";
import { SEVERITY_TONE, STATUS_TONE } from "./tones";

export function SeverityPill({ severity }: { severity: DefectSeverity }) {
  const { t } = useTranslation();
  return (
    <StatusPill tone={SEVERITY_TONE[severity] ?? "neutral"} title={t("defects.field.severity")}>
      {t(`defects.severity.${severity}`)}
    </StatusPill>
  );
}

/** The status, with the resolution of a closed or rejected defect. */
export function StatusBadge({ defect }: { defect: Pick<Defect, "status" | "resolution"> }) {
  const { t } = useTranslation();
  const label = t(`defects.status.${defect.status}`);
  const resolution = defect.resolution ? t(`defects.resolution.${defect.resolution}`) : null;
  return (
    <StatusPill
      tone={STATUS_TONE[defect.status] ?? "neutral"}
      dot
      strike={defect.status === "rejected"}
      title={resolution ? `${label} · ${resolution}` : label}
    >
      {label}
    </StatusPill>
  );
}
