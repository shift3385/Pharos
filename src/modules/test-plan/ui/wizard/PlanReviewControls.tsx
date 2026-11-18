import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Archive, Check, MessageSquareWarning, RotateCcw, Send } from "lucide-react";
import { useAuth } from "@modules/auth";
import { Alert } from "@shared/ui/Alert";
import { ConfirmDialog } from "@shared/ui/ConfirmDialog";
import { TextArea } from "@shared/ui/TextArea";
import { useToast } from "@shared/ui/Toast";
import { testPlanApi } from "../../api/testPlanApi";
import {
  changesMade,
  changesRequested,
  planActions,
  planReviewErrorKey,
  planReviewOf,
  type PlanReviewAction,
} from "../../model/review";
import type { TestPlan } from "../../model/types";

function stamp(iso: string | undefined, lang: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

/**
 * The review flow of a saved plan in «Estado del plan» (PLN-08, ADR-0049):
 * who sent it, who asked for changes and why; the next step (send, approve
 * or «Pedir cambios», mark obsolete, reactivate), each confirmed. The cores
 * decide who approves («Aprobación independiente» of the workspace) and
 * answer why not; this only asks and shows.
 */
export function PlanReviewControls({
  plan,
  dirty,
  onChanged,
}: {
  plan: TestPlan;
  /** The form has unsaved changes: a transition waits for the save. */
  dirty: boolean;
  onChanged: (saved: TestPlan) => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const commentId = useId();
  const whyId = useId();
  const lang = i18n.resolvedLanguage ?? "es";
  const userId = user?.id ?? "";
  const userName = user ? `${user.firstName} ${user.lastName}`.trim() : "";
  const status = plan.status;
  const review = planReviewOf((plan.data as Record<string, unknown> | null)?.review);
  const actions = planActions(status);
  const version = plan.version;
  const [open, setOpen] = useState<PlanReviewAction | null>(null);
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState(false);
  const [busy, setBusy] = useState(false);

  function start(action: PlanReviewAction) {
    setComment("");
    setCommentError(false);
    setOpen(action);
  }

  async function run(action: PlanReviewAction) {
    const text = comment.trim();
    if (action === "return" && !text) {
      setCommentError(true);
      return;
    }
    setBusy(true);
    try {
      const saved = await testPlanApi.review(plan, { action, comment: text || undefined, userId, userName });
      setOpen(null);
      if (saved) onChanged(saved);
      toast(t(`testPlan.review.toast.${action}`, { version }));
    } catch (e) {
      setOpen(null);
      toast(t(planReviewErrorKey(e)), "error");
    } finally {
      setBusy(false);
    }
  }

  const saveFirst = dirty ? t("testPlan.review.saveFirst") : null;
  const blocked = busy || saveFirst !== null;

  return (
    <div className="tpw-review" data-testid="plan-review">
      {changesRequested(status, review) && review && (
        <Alert kind="warning" role="note" className="tpw-review__banner plan-review-changes">
          <strong>
            {t("testPlan.review.banner.changesRequested", {
              name: review.returnedByName || "—",
              date: stamp(review.returnedAt, lang),
            })}
          </strong>
          {review.comment && <span className="tpw-review__quote">«{review.comment}»</span>}
        </Alert>
      )}
      {status === "reviewed" && review && !changesRequested(status, review) && (
        <Alert kind="info" role="note" className="tpw-review__banner plan-review-sent">
          <strong>
            {review.reopenedFrom
              ? t("testPlan.review.banner.reopened", { version: review.reopenedFrom })
              : t("testPlan.review.banner.sent", { name: review.sentByName || "—", date: stamp(review.sentAt, lang) })}
          </strong>
          {changesMade(status, review) ? (
            <span className="tpw-review__quote">
              {t("testPlan.review.banner.changesMade", { name: review.returnedByName || "—", comment: review.comment })}
            </span>
          ) : (
            review.note && <span className="tpw-review__quote">«{review.note}»</span>
          )}
        </Alert>
      )}

      <div className="tpw-review__actions">
        {actions.includes("send") && (
          <button
            type="button"
            className="ui-btn ui-btn--primary ui-btn--small"
            disabled={blocked}
            aria-describedby={saveFirst ? whyId : undefined}
            onClick={() => start("send")}
            data-testid="plan-send-review"
          >
            <Send size={15} aria-hidden="true" />
            {t("testPlan.review.send")}
          </button>
        )}
        {actions.includes("approve") && (
          <button
            type="button"
            className="ui-btn ui-btn--primary ui-btn--small"
            disabled={blocked}
            aria-describedby={saveFirst ? whyId : undefined}
            onClick={() => start("approve")}
            data-testid="plan-approve"
          >
            <Check size={15} aria-hidden="true" />
            {t("testPlan.review.approve", { version })}
          </button>
        )}
        {actions.includes("return") && (
          <button
            type="button"
            className="ui-btn ui-btn--small"
            disabled={blocked}
            onClick={() => start("return")}
            data-testid="plan-request-changes"
          >
            <MessageSquareWarning size={15} aria-hidden="true" />
            {t("testPlan.review.return")}
          </button>
        )}
        {actions.includes("obsolete") && (
          <button
            type="button"
            className="ui-btn ui-btn--small ui-btn--ghost"
            disabled={blocked}
            onClick={() => start("obsolete")}
            data-testid="plan-obsolete"
          >
            <Archive size={15} aria-hidden="true" />
            {t("testPlan.review.obsolete")}
          </button>
        )}
        {actions.includes("reactivate") && (
          <button
            type="button"
            className="ui-btn ui-btn--small"
            disabled={busy}
            onClick={() => start("reactivate")}
            data-testid="plan-reactivate"
          >
            <RotateCcw size={15} aria-hidden="true" />
            {t("testPlan.review.reactivate")}
          </button>
        )}
        {saveFirst && status !== "obsolete" && (
          <p id={whyId} className="tpw-review__why">
            {saveFirst}
          </p>
        )}
      </div>

      {open === "send" && (
        <ConfirmDialog
          title={t("testPlan.review.sendTitle")}
          message={t("testPlan.review.sendMessage", { version })}
          confirmLabel={t("testPlan.review.send")}
          confirmTestId="plan-send-review-confirm"
          onConfirm={() => void run("send")}
          onCancel={() => setOpen(null)}
        >
          <label className="tpw-review__field" htmlFor={commentId}>
            <span>{t("testPlan.review.noteLabel")}</span>
            <TextArea id={commentId} size="short" value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
        </ConfirmDialog>
      )}
      {open === "return" && (
        <ConfirmDialog
          title={t("testPlan.review.returnTitle")}
          message={t("testPlan.review.returnMessage")}
          confirmLabel={t("testPlan.review.returnAction")}
          confirmTestId="plan-request-changes-confirm"
          onConfirm={() => void run("return")}
          onCancel={() => setOpen(null)}
        >
          <label className="tpw-review__field" htmlFor={commentId}>
            <span>{t("testPlan.review.commentLabel")}</span>
            <TextArea
              id={commentId}
              size="short"
              value={comment}
              aria-invalid={commentError || undefined}
              aria-describedby={commentError ? `${commentId}-err` : undefined}
              autoFocus
              onChange={(e) => {
                setComment(e.target.value);
                if (e.target.value.trim()) setCommentError(false);
              }}
            />
          </label>
          {commentError && (
            <p id={`${commentId}-err`} className="tpw-review__error" role="alert">
              {t("testPlan.review.errors.comment")}
            </p>
          )}
        </ConfirmDialog>
      )}
      {open === "approve" && (
        <ConfirmDialog
          title={t("testPlan.review.approveTitle", { version })}
          message={t("testPlan.review.approveMessage", {
            name: userName,
            date: new Intl.DateTimeFormat(lang, { dateStyle: "medium" }).format(new Date()),
          })}
          confirmLabel={t("testPlan.review.approveAction")}
          confirmTestId="plan-approve-confirm"
          onConfirm={() => void run("approve")}
          onCancel={() => setOpen(null)}
        />
      )}
      {open === "obsolete" && (
        <ConfirmDialog
          title={t("testPlan.review.obsoleteTitle")}
          message={t(status === "approved" ? "testPlan.review.obsoleteApproved" : "testPlan.review.obsoleteMessage")}
          confirmLabel={t("testPlan.review.obsolete")}
          onConfirm={() => void run("obsolete")}
          onCancel={() => setOpen(null)}
        />
      )}
      {open === "reactivate" && (
        <ConfirmDialog
          title={t("testPlan.review.reactivateTitle")}
          message={t("testPlan.review.reactivateMessage")}
          confirmLabel={t("testPlan.review.reactivate")}
          onConfirm={() => void run("reactivate")}
          onCancel={() => setOpen(null)}
        />
      )}
    </div>
  );
}
