import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Archive, Check, RotateCcw, Send, Undo2 } from "lucide-react";
import { personName, useAuth } from "@modules/auth";
import { Alert } from "@shared/ui/Alert";
import { ConfirmDialog } from "@shared/ui/ConfirmDialog";
import { TextArea } from "@shared/ui/TextArea";
import { useToast } from "@shared/ui/Toast";
import { testCaseApi } from "../api/testCaseApi";
import { diffCase } from "../model/caseDiff";
import {
  allowedActions,
  approvalOf,
  changesMade,
  isReturned,
  reviewErrorKey,
  reviewOf,
  type ReviewAction,
} from "../model/review";
import type { TestCase } from "../model/types";
import { approverCheck, type ApprovalVerdict } from "../review/approver";
import { CaseChanges } from "./CaseChanges";
import { stampLabel } from "./caseTones";

/**
 * «Estado del caso» of a saved case (CAS-02, ADR-0047; PLN-08, ADR-0049):
 * who sent it, who asked for changes and why, who approved it; the next
 * step of the flow (send, approve or «Pedir cambios», mark obsolete,
 * reactivate), each confirmed; and, while
 * in review, what changed since the last approved or sent state. The cores
 * enforce every rule; this only asks and shows.
 */
export function CaseReviewPanel({
  testCase,
  dirty,
  contentEdited,
  onChanged,
}: {
  testCase: TestCase;
  /** The editor has unsaved changes: a transition waits for the save. */
  dirty: boolean;
  /** The unsaved changes touch the content (title, steps…). */
  contentEdited: boolean;
  onChanged: (saved: TestCase) => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const commentId = useId();
  const lang = i18n.resolvedLanguage ?? "es";
  const userId = user?.id ?? "";
  const userName = personName(user);
  const status = testCase.status;
  const data = (testCase.data ?? {}) as Record<string, unknown>;
  const review = reviewOf(data.review);
  const approval = approvalOf(data.approval);
  const actions = allowedActions(status);
  const [verdict, setVerdict] = useState<ApprovalVerdict | null>(null);
  const [open, setOpen] = useState<ReviewAction | null>(null);
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [base, setBase] = useState<{ title: string; data: unknown; at: string; status: string } | null>(null);

  // May this account approve it? Asked again when the case changes.
  useEffect(() => {
    if (status !== "reviewed") return setVerdict(null);
    let live = true;
    void approverCheck()
      .canApprove({
        workspaceId: testCase.workspaceId,
        projectId: testCase.projectId ?? "",
        caseId: testCase.id,
        authorId: testCase.createdBy,
        approverId: userId,
      })
      .then((v) => live && setVerdict(v))
      .catch(() => live && setVerdict({ ok: false, reason: "notMember" }));
    return () => {
      live = false;
    };
  }, [status, testCase.id, testCase.revision, testCase.createdBy, testCase.workspaceId, testCase.projectId, userId]);

  // The state the reviewer compares with.
  useEffect(() => {
    if (status !== "reviewed") return setBase(null);
    let live = true;
    void testCaseApi
      .reviewBase(testCase.id, userId)
      .then((r) => live && setBase(r ? { title: r.title, data: r.data, at: r.createdAt, status: r.status } : null))
      .catch(() => live && setBase(null));
    return () => {
      live = false;
    };
  }, [status, testCase.id, testCase.revision, userId]);

  const date = (iso?: string) => (iso ? stampLabel(iso, lang) : "");
  const key = testCase.scenarioId;
  const version = testCase.version;

  function start(action: ReviewAction) {
    setComment("");
    setCommentError(false);
    setOpen(action);
  }

  async function run(action: ReviewAction) {
    const text = comment.trim();
    if (action === "return" && !text) {
      setCommentError(true);
      return;
    }
    setBusy(true);
    try {
      const saved = await testCaseApi.review(testCase, {
        action,
        comment: text || undefined,
        userId,
        userName,
      });
      setOpen(null);
      if (saved) onChanged(saved);
      toast(t(`testCase.review.toast.${action}`, { key, version }));
    } catch (e) {
      setOpen(null);
      toast(t(reviewErrorKey(e)), "error");
    } finally {
      setBusy(false);
    }
  }

  const saveFirst = dirty ? t("testCase.review.saveFirst") : null;
  const approveWhy = saveFirst ?? (verdict && !verdict.ok ? t(`testCase.review.notAllowed.${verdict.reason}`) : null);
  const selfApproval = verdict?.ok === true && verdict.selfApproval;
  const changes = base ? diffCase(base, testCase, { checklist: testCase.caseType === "checklist" }) : [];

  return (
    <section className="tc-review" aria-labelledby="tc-review-title" data-testid="case-review">
      <h3 id="tc-review-title" className="sr-only">
        {t("testCase.statusSheet")}
      </h3>

      {isReturned(status, review) && review && (
        <Alert kind="warning" role="note" className="tc-review__banner case-review-returned">
          <strong>
            {t(status === "reviewed" ? "testCase.review.banner.changesRequested" : "testCase.review.banner.returned", {
              name: review.returnedByName || "—",
              date: date(review.returnedAt),
            })}
          </strong>
          {review.comment && <span className="tc-review__quote">«{review.comment}»</span>}
        </Alert>
      )}
      {status === "reviewed" && review && !isReturned(status, review) && (
        <Alert kind="info" role="note" className="tc-review__banner case-review-sent">
          <strong>
            {review.reopenedFrom
              ? t("testCase.review.banner.reopened", { version: review.reopenedFrom })
              : t("testCase.review.banner.sent", { name: review.sentByName || "—", date: date(review.sentAt) })}
          </strong>
          {changesMade(status, review) ? (
            <span className="tc-review__quote case-review-changes-made">
              {t("testCase.review.banner.changesMade", { name: review.returnedByName || "—", comment: review.comment })}
            </span>
          ) : (
            review.note && <span className="tc-review__quote">«{review.note}»</span>
          )}
        </Alert>
      )}
      {status === "approved" && (
        <Alert kind="success" role="note" className="tc-review__banner case-review-approved">
          {approval ? (
            <strong>
              {t("testCase.review.banner.approved", {
                name: approval.byName || "—",
                date: date(approval.at),
                version: approval.version || version,
              })}
              {approval.selfApproved && ` · ${t("testCase.review.banner.selfApproved")}`}
            </strong>
          ) : (
            <strong>{t("testCase.review.banner.legacy")}</strong>
          )}
        </Alert>
      )}
      {contentEdited && (status === "reviewed" || status === "approved") && (
        <Alert kind="warning" role="note" className="tc-review__banner case-review-editing">
          {t(status === "approved" ? "testCase.review.editingApproved" : "testCase.review.editingReviewed")}
        </Alert>
      )}

      {/* What changed since the state the reviewer compares with, named by
          its date (the internal revision number means nothing to a person),
          and only when something did change (FIX-44). */}
      {status === "reviewed" && base && changes.length > 0 && (
        <div className="tc-review__changes">
          <h4 className="tc-review__cap">
            {t("testCase.review.changesSince", {
              date: date(base.at),
              status: t(`testCase.statusLabel.${base.status}`),
            })}
          </h4>
          <CaseChanges changes={changes} />
        </div>
      )}

      <div className="tc-review__actions">
        {actions.includes("send") && (
          <button
            type="button"
            className="ui-btn ui-btn--primary ui-btn--small"
            disabled={busy || saveFirst !== null}
            aria-describedby={saveFirst ? "tc-review-why" : undefined}
            onClick={() => start("send")}
            data-testid="case-send-review"
          >
            <Send size={15} aria-hidden="true" />
            {t("testCase.review.send")}
          </button>
        )}
        {actions.includes("return") && (
          <button
            type="button"
            className="ui-btn ui-btn--small"
            disabled={busy || saveFirst !== null}
            onClick={() => start("return")}
            data-testid="case-return"
          >
            <Undo2 size={15} aria-hidden="true" />
            {t("testCase.review.return")}
          </button>
        )}
        {actions.includes("approve") && (
          <button
            type="button"
            className="ui-btn ui-btn--primary ui-btn--small"
            disabled={busy || approveWhy !== null || verdict === null}
            aria-describedby={approveWhy ? "tc-review-why" : undefined}
            onClick={() => start("approve")}
            data-testid="case-approve"
          >
            <Check size={15} aria-hidden="true" />
            {t("testCase.review.approve", { version })}
          </button>
        )}
        {actions.includes("obsolete") && (
          <button
            type="button"
            className="ui-btn ui-btn--small ui-btn--ghost"
            disabled={busy || saveFirst !== null}
            onClick={() => start("obsolete")}
          >
            <Archive size={15} aria-hidden="true" />
            {t("testCase.review.obsolete")}
          </button>
        )}
        {actions.includes("reactivate") && (
          <button type="button" className="ui-btn ui-btn--small" disabled={busy} onClick={() => start("reactivate")}>
            <RotateCcw size={15} aria-hidden="true" />
            {t("testCase.review.reactivate")}
          </button>
        )}
        {(status === "draft" || status === "reviewed") && (saveFirst ?? approveWhy) && (
          <p id="tc-review-why" className="tc-review__why">
            {status === "draft" ? saveFirst : approveWhy}
          </p>
        )}
      </div>

      {open === "send" && (
        <ConfirmDialog
          title={t("testCase.review.sendTitle", { key })}
          message={t("testCase.review.sendMessage", { version })}
          confirmLabel={t("testCase.review.send")}
          confirmTestId="case-send-review-confirm"
          onConfirm={() => void run("send")}
          onCancel={() => setOpen(null)}
        >
          <label className="tc-review__field" htmlFor={commentId}>
            <span>{t("testCase.review.noteLabel")}</span>
            <TextArea id={commentId} size="short" value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
        </ConfirmDialog>
      )}
      {open === "return" && (
        <ConfirmDialog
          title={t("testCase.review.returnTitle", { key })}
          message={t("testCase.review.returnMessage")}
          confirmLabel={t("testCase.review.returnAction")}
          confirmTestId="case-return-confirm"
          onConfirm={() => void run("return")}
          onCancel={() => setOpen(null)}
        >
          <label className="tc-review__field" htmlFor={commentId}>
            <span>{t("testCase.review.commentLabel")}</span>
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
            <p id={`${commentId}-err`} className="tc-review__error" role="alert">
              {t("testCase.review.errors.comment")}
            </p>
          )}
        </ConfirmDialog>
      )}
      {open === "approve" && (
        <ConfirmDialog
          title={t("testCase.review.approveTitle", { version })}
          message={t("testCase.review.approveMessage", {
            name: selfApproval ? `${userName} (${t("testCase.review.banner.selfApproved")})` : userName,
            date: new Intl.DateTimeFormat(lang, { dateStyle: "medium" }).format(new Date()),
          })}
          confirmLabel={t("testCase.review.approveAction")}
          confirmTestId="case-approve-confirm"
          onConfirm={() => void run("approve")}
          onCancel={() => setOpen(null)}
        >
          {selfApproval && (
            <Alert kind="warning" role="note">
              {t("testCase.review.selfApprovalNote")}
            </Alert>
          )}
        </ConfirmDialog>
      )}
      {open === "obsolete" && (
        <ConfirmDialog
          title={t("testCase.review.obsoleteTitle", { key })}
          message={t(status === "approved" ? "testCase.review.obsoleteApproved" : "testCase.review.obsoleteMessage")}
          confirmLabel={t("testCase.review.obsolete")}
          onConfirm={() => void run("obsolete")}
          onCancel={() => setOpen(null)}
        />
      )}
      {open === "reactivate" && (
        <ConfirmDialog
          title={t("testCase.review.reactivateTitle", { key })}
          message={t("testCase.review.reactivateMessage")}
          confirmLabel={t("testCase.review.reactivate")}
          onConfirm={() => void run("reactivate")}
          onCancel={() => setOpen(null)}
        />
      )}
    </section>
  );
}
