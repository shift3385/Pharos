import { useTranslation } from "react-i18next";
import {
  AiSuggestList,
  ListProposalView,
  reviewCaseList,
  type AiProvenance,
  type CaseListField,
  type ListProposal,
} from "@modules/ai";

/** The AI button of one list of a case (IA-16): it suggests while the list is
 *  empty and reviews it once it has items. Adding starts ticked; rewording and
 *  removing touch what the user wrote, so each waits for its own tick. */
export function CaseListReview({
  field,
  available,
  existing,
  context,
  scope,
  provenance,
  onApply,
  onReview,
}: {
  field: CaseListField;
  /** Which part of the case it is about, when the name repeats (a flow). */
  scope?: string;
  available: boolean;
  /** The texts of the list as it stands. */
  existing: string[];
  /** Builds the rest of the case when asked (`caseBrief`). */
  context: () => string;
  provenance?: AiProvenance;
  onApply: (accepted: ListProposal[], provenance: AiProvenance) => void;
  onReview: () => void;
}) {
  const { t, i18n } = useTranslation();
  const filled = existing.filter((text) => text.trim());
  const name = t(`testCase.aiReview.${field}.${filled.length ? "review" : "suggest"}`);
  return (
    <AiSuggestList
      available={available}
      buttonLabel={scope?.trim() ? `${name} · ${scope.trim()}` : name}
      run={() => reviewCaseList(field, context(), filled, i18n.resolvedLanguage ?? "es")}
      renderItem={(proposal) => <ListProposalView proposal={proposal} />}
      startsSelected={(proposal) => proposal.action === "add"}
      applyLabel={(count) => t("ai.review.apply", { count })}
      provenance={provenance}
      onAdd={onApply}
      onReview={onReview}
    />
  );
}
