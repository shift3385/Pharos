import { useTranslation } from "react-i18next";
import { StatusPill, type PillTone } from "@shared/ui/StatusPill";
import type { ListProposal } from "../model/listReview";
import "./Assist.css";

const TONE: Record<ListProposal["action"], PillTone> = {
  add: "success",
  rewrite: "warning",
  remove: "error",
};

/** One proposal of a list review (IA-16): what it does in words, what it takes
 *  away crossed out, what it writes and why. */
export function ListProposalView({ proposal }: { proposal: ListProposal }) {
  const { t } = useTranslation();
  const position = proposal.action === "add" ? proposal.position : undefined;
  return (
    <span className="assist__proposal">
      <StatusPill tone={TONE[proposal.action]}>{t(`ai.review.${proposal.action}`)}</StatusPill>
      {proposal.action !== "add" && <del className="assist__old">{proposal.target}</del>}
      {proposal.action !== "remove" && <span>{proposal.text}</span>}
      {position && (
        <span className="assist__pick-sub">
          {position === "start" ? t("ai.review.atStart") : t("ai.review.after", { target: position.target })}
        </span>
      )}
      <span className="assist__pick-sub">{proposal.reason}</span>
    </span>
  );
}
