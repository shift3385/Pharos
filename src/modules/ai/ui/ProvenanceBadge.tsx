import { useTranslation } from "react-i18next";
import { isPendingReview } from "../model/provenance";
import type { AiProvenance } from "../model/types";
import "./Assist.css";

/** Visible mark on AI-generated content (IA-01): "AI · pending review" plus the
 *  provider and model that produced it, until a person marks it reviewed. Renders
 *  nothing once reviewed (the record stays in the data for audit). */
export function ProvenanceBadge({
  provenance,
  onReview,
  compact = false,
}: {
  provenance: AiProvenance | undefined;
  /** Omit to show the mark without the review action (e.g. in lists). */
  onReview?: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  if (!isPendingReview(provenance)) return null;
  const source = `${t(`ai.provenance.provider.${provenance.provider}`)} · ${provenance.model}`;

  if (compact) {
    return (
      <span className="ai-prov ai-prov--compact" title={source}>
        {t("ai.provenance.short")}
      </span>
    );
  }
  return (
    <div className="ai-prov" role="status">
      <span className="ai-prov__label">{t("ai.provenance.pending")}</span>
      <span className="ai-prov__source">{source}</span>
      {onReview && (
        <button type="button" className="ai-prov__review" onClick={onReview}>
          {t("ai.provenance.markReviewed")}
        </button>
      )}
    </div>
  );
}
