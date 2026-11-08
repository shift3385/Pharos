import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen } from "lucide-react";
import { Dialog } from "@shared/ui/Dialog";
import {
  AiFailureNotice,
  AiSendNotice,
  aiDestinationNow,
  describeAiFailure,
  extractRequirementCandidates,
  MAX_SYNTHESIS_CANDIDATES,
  REQ_SYNTHESIS_PROMPT,
  synthesizeRequirements,
  type AiDestination,
  type AiFailure,
  type ProjectFileText,
} from "@modules/ai";
import { projectScanApi } from "../api/projectScanApi";
import type { Requirement, RequirementProvenance } from "../model/types";
import {
  BATCH_TOKENS,
  CATEGORY_ORDER,
  DEFAULT_BUDGET,
  batchesOf,
  defaultSelection,
  estimateTokens,
  selectionTokens,
  usableCandidates,
  type ScanCategory,
  type ScanContent,
  type ScanFile,
  type ScanInventory,
} from "../proposals/fromProject";
import { usableRequirementProposals } from "../proposals/proposals";
import type {
  ApplyResult,
  CandidateRequirement,
  RequirementProposal,
} from "../proposals/types";
import { RequirementProposalsReview } from "./RequirementProposalsReview";
import "@shared/ui/ConfirmDialog.css";
import "@shared/ui/buttons.css";
import "./Traceability.css";

type Phase =
  | "pick"
  | "picking"
  | "inventory"
  | "reading"
  | "confirm"
  | "extracting"
  | "partial"
  | "synthesizing"
  | "failed"
  | "review"
  | "empty";

/** Calls to the AI at the same time while extracting. */
const CONCURRENCY = 2;

interface Batch {
  files: ProjectFileText[];
  state: "pending" | "done" | "failed";
  candidates: CandidateRequirement[];
}

const fmt = (n: number, lang: string) => n.toLocaleString(lang);

/** Requirements proposed by the AI from an existing project (IA-17,
 *  ADR-0036). Desktop only: Rust picks and reads the folder. The person sees
 *  what will be sent (and what never is), confirms where it goes, follows the
 *  batches, and reviews the proposals in the common view. */
export function ProjectRequirementsModal({
  projectId,
  existing,
  linkedCases,
  onApplied,
  onClose,
}: {
  projectId: string;
  existing: Requirement[];
  linkedCases: Record<string, number>;
  onApplied: (result: ApplyResult) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "es";
  const [phase, setPhase] = useState<Phase>("pick");
  const [scan, setScan] = useState<ScanInventory | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [context, setContext] = useState("");
  const [contents, setContents] = useState<ScanContent[]>([]);
  const [destination, setDestination] = useState<AiDestination | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [failure, setFailure] = useState<AiFailure | null>(null);
  const [emptyReason, setEmptyReason] = useState("");
  const [review, setReview] = useState<{
    proposals: RequirementProposal[];
    provenance: RequirementProvenance;
  } | null>(null);
  const cancelled = useRef(false);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void aiDestinationNow().then(setDestination);
  }, []);
  // The folder stays open in Rust only while this dialog is.
  useEffect(
    () => () => {
      cancelled.current = true;
      if (scan) void projectScanApi.close(scan.scanId).catch(() => undefined);
    },
    [scan],
  );
  useEffect(() => {
    if (["pick", "inventory", "confirm", "partial", "failed"].includes(phase))
      primaryRef.current?.focus();
  }, [phase]);

  const local = destination?.provider === "ollama";
  const batchTokens = local ? BATCH_TOKENS.local : BATCH_TOKENS.cloud;
  const files = scan?.files ?? [];
  const chosenTokens = selectionTokens(files, selected);
  const plannedCalls = Math.max(1, Math.ceil(chosenTokens / batchTokens)) + 1;

  async function pick() {
    setPhase("picking");
    setFailure(null);
    try {
      const inv = await projectScanApi.pick();
      if (!inv) return setPhase("pick");
      if (scan) void projectScanApi.close(scan.scanId).catch(() => undefined);
      setScan(inv);
      setSelected(defaultSelection(inv.files, budget));
      setPhase("inventory");
    } catch (e) {
      setFailure({
        kind: "provider",
        details: [String(e instanceof Error ? e.message : e)],
      });
      setPhase("pick");
    }
  }

  function toggle(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function changeBudget(value: number) {
    const b = Math.max(10_000, Math.min(2_000_000, value || DEFAULT_BUDGET));
    setBudget(b);
    setSelected(defaultSelection(files, b));
  }

  /** Reads what goes (secrets replaced in Rust) before asking to send it. */
  async function read() {
    if (!scan) return;
    setPhase("reading");
    try {
      setContents(await projectScanApi.read(scan.scanId, [...selected]));
      setPhase("confirm");
    } catch (e) {
      setFailure({
        kind: "provider",
        details: [String(e instanceof Error ? e.message : e)],
      });
      setPhase("inventory");
    }
  }

  const readable = contents.filter((c) => !c.error);
  const sendTokens = readable.reduce((n, c) => n + estimateTokens(c.text), 0);
  const redacted = readable.filter((c) => c.redacted.length);
  const linesOf = useMemo(
    () => new Map(readable.map((c) => [c.path, c.lines])),
    [readable],
  );

  /** Runs the pending batches, two at a time, then the synthesis. */
  async function extract(list: Batch[]) {
    cancelled.current = false;
    setPhase("extracting");
    setFailure(null);
    const next = [...list];
    setBatches([...next]);
    const queue = next
      .map((b, i) => (b.state === "done" ? -1 : i))
      .filter((i) => i >= 0);
    const worker = async () => {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
        if (cancelled.current) return;
        try {
          const r = await extractRequirementCandidates(
            next[i].files,
            lang,
            context,
          );
          next[i] = {
            ...next[i],
            state: "done",
            candidates: usableCandidates(
              r.value.candidates,
              next[i].files,
              linesOf,
            ),
          };
        } catch {
          next[i] = { ...next[i], state: "failed" };
        }
        if (!cancelled.current) setBatches([...next]);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (cancelled.current) return;
    if (next.some((b) => b.state === "failed")) return setPhase("partial");
    await synthesize(next);
  }

  function start() {
    const list = batchesOf(contents, batchTokens).map((files) => ({
      files,
      state: "pending" as const,
      candidates: [],
    }));
    void extract(list);
  }

  async function synthesize(list: Batch[]) {
    setPhase("synthesizing");
    setFailure(null);
    const candidates = list
      .flatMap((b) => b.candidates)
      .slice(0, MAX_SYNTHESIS_CANDIDATES);
    if (!candidates.length) {
      setEmptyReason(t("traceability.fromProject.noCandidates"));
      return setPhase("empty");
    }
    try {
      const r = await synthesizeRequirements(
        candidates,
        existing.map((e) => ({
          key: e.requirementKey,
          title: e.title,
          description: e.description,
          priority: e.priority,
        })),
        lang,
        { context: [scan?.rootName, context].filter(Boolean).join(" — ") },
      );
      if (cancelled.current) return;
      const proposals = usableRequirementProposals(
        r.value.proposals,
        candidates,
        existing,
      );
      if (!proposals.length) {
        setEmptyReason(
          r.value.reason ?? t("traceability.fromProject.nothingToChange"),
        );
        return setPhase("empty");
      }
      setReview({
        proposals,
        provenance: { ...r.provenance, prompt: REQ_SYNTHESIS_PROMPT },
      });
      setPhase("review");
    } catch (e) {
      if (cancelled.current) return;
      setFailure(describeAiFailure(e));
      setPhase("failed");
    }
  }

  function cancel() {
    cancelled.current = true;
    setPhase("confirm");
  }

  const busy = ["picking", "reading", "extracting", "synthesizing"].includes(
    phase,
  );
  const done = batches.filter((b) => b.state !== "pending").length;
  const failedBatches = batches.filter((b) => b.state === "failed").length;

  return (
    <Dialog
      className="cd tr-gen tz-scan"
      labelledBy="tz-scan-title"
      onClose={onClose}
      dismissable={!busy}
      initialFocus={primaryRef}
    >
      <h3 id="tz-scan-title" className="cd__title">
        {t("traceability.fromProject.title")}
      </h3>
      {scan && phase !== "review" && (
        <p className="cd__msg">
          <FolderOpen size={14} aria-hidden="true" />{" "}
          <strong>{scan.rootName}</strong>
        </p>
      )}

      <p className="cd__msg tr-gen__status" role="status" aria-live="polite">
        {phase === "picking" && t("traceability.fromProject.picking")}
        {phase === "reading" && t("traceability.fromProject.reading")}
        {phase === "extracting" &&
          t("traceability.fromProject.extracting", {
            done,
            total: batches.length,
          })}
        {phase === "synthesizing" &&
          t("traceability.fromProject.synthesizing", {
            count: existing.length,
          })}
      </p>
      {failure &&
        (phase === "pick" || phase === "inventory" || phase === "failed") && (
          <AiFailureNotice failure={failure} />
        )}

      {phase === "pick" && (
        <p className="tr-gen__hint">{t("traceability.fromProject.intro")}</p>
      )}

      {phase === "inventory" && scan && (
        <Inventory
          scan={scan}
          selected={selected}
          onToggle={toggle}
          budget={budget}
          onBudget={changeBudget}
          context={context}
          onContext={setContext}
          summary={t("traceability.fromProject.selection", {
            files: selected.size,
            tokens: fmt(chosenTokens, lang),
            calls: plannedCalls,
          })}
        />
      )}

      {phase === "confirm" && (
        <>
          <AiSendNotice destination={destination}>
            <p>
              {t("traceability.fromProject.sendWhat", {
                files: readable.length,
                tokens: fmt(sendTokens, lang),
                calls: Math.max(1, batchesOf(contents, batchTokens).length) + 1,
              })}
            </p>
            <p>{t("traceability.fromProject.neverSent")}</p>
          </AiSendNotice>
          {redacted.length > 0 && (
            <details className="tz-prop__extra">
              <summary>
                {t("traceability.fromProject.redacted", {
                  count: redacted.reduce((n, c) => n + c.redacted.length, 0),
                  files: redacted.length,
                })}
              </summary>
              <ul>
                {redacted.map((c) => (
                  <li key={c.path}>
                    <code>{c.path}</code>: {c.redacted.join(", ")}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {contents.some((c) => c.error) && (
            <p className="tr-gen__hint">
              {t("traceability.fromProject.unreadable", {
                count: contents.filter((c) => c.error).length,
              })}
            </p>
          )}
        </>
      )}

      {(phase === "extracting" || phase === "partial") && (
        <progress
          className="tz-scan__progress"
          max={batches.length}
          value={done}
          aria-hidden="true"
        />
      )}
      {phase === "partial" && (
        <p className="tr-gen__failed" role="alert">
          <span aria-hidden="true">⚠ </span>
          {t("traceability.fromProject.batchesFailed", {
            count: failedBatches,
            total: batches.length,
          })}
        </p>
      )}
      {phase === "empty" && <p className="cd__msg">{emptyReason}</p>}

      {phase === "review" && review && scan && (
        <RequirementProposalsReview
          proposals={review.proposals}
          existing={existing}
          provenance={review.provenance}
          projectId={projectId}
          linkedCases={linkedCases}
          onApplied={(r) => {
            onApplied(r);
            if (!r.failed.length) onClose();
          }}
          onClose={onClose}
        />
      )}

      {phase !== "review" && (
        <div className="cd__actions">
          {phase === "extracting" || phase === "synthesizing" ? (
            <button type="button" className="cd__cancel" onClick={cancel}>
              {t("traceability.fromProject.stop")}
            </button>
          ) : (
            <button
              type="button"
              className="cd__cancel"
              disabled={busy}
              onClick={onClose}
            >
              {phase === "empty" ? t("common.close") : t("common.cancel")}
            </button>
          )}
          {(phase === "pick" || phase === "picking") && (
            <button
              ref={primaryRef}
              type="button"
              className="cd__confirm"
              disabled={busy}
              onClick={() => void pick()}
            >
              {t("traceability.fromProject.pick")}
            </button>
          )}
          {(phase === "inventory" || phase === "reading") && (
            <>
              <button
                type="button"
                className="cd__cancel"
                disabled={busy}
                onClick={() => void pick()}
              >
                {t("traceability.fromProject.pickAnother")}
              </button>
              <button
                ref={primaryRef}
                type="button"
                className="cd__confirm"
                disabled={busy || selected.size === 0}
                onClick={() => void read()}
              >
                {t("traceability.fromProject.continue")}
              </button>
            </>
          )}
          {phase === "confirm" && (
            <>
              <button
                type="button"
                className="cd__cancel"
                onClick={() => setPhase("inventory")}
              >
                {t("traceability.fromProject.back")}
              </button>
              <button
                ref={primaryRef}
                type="button"
                className="cd__confirm"
                disabled={!readable.length || !destination}
                data-testid="req-scan-send"
                onClick={start}
              >
                {t("traceability.fromProject.send")}
              </button>
            </>
          )}
          {phase === "partial" && (
            <>
              <button
                type="button"
                className="cd__cancel"
                onClick={() => void synthesize(batches)}
              >
                {t("traceability.fromProject.continueWithout")}
              </button>
              <button
                ref={primaryRef}
                type="button"
                className="cd__confirm"
                onClick={() => void extract(batches)}
              >
                {t("traceability.fromProject.retryBatches", {
                  count: failedBatches,
                })}
              </button>
            </>
          )}
          {phase === "failed" && (
            <button
              ref={primaryRef}
              type="button"
              className="cd__confirm"
              onClick={() => void synthesize(batches)}
            >
              {t("traceability.generate.retry")}
            </button>
          )}
        </div>
      )}
    </Dialog>
  );
}

/** The inventory: what can go, by category, ticked within the budget; what
 *  never goes, with why. */
function Inventory({
  scan,
  selected,
  onToggle,
  budget,
  onBudget,
  context,
  onContext,
  summary,
}: {
  scan: ScanInventory;
  selected: Set<string>;
  onToggle: (path: string) => void;
  budget: number;
  onBudget: (n: number) => void;
  context: string;
  onContext: (s: string) => void;
  summary: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "es";
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    files: scan.files.filter((f) => f.category === category && !f.excluded),
  })).filter((g) => g.files.length);
  const left = scan.files.filter((f) => f.excluded);
  return (
    <div className="tz-scan__inv">
      {!groups.length && (
        <p className="cd__msg">
          {t("traceability.fromProject.nothingReadable")}
        </p>
      )}
      {scan.truncated && (
        <p className="tr-gen__hint">
          {t("traceability.fromProject.truncated")}
        </p>
      )}
      <div className="tz-scan__list">
        {groups.map((g) => (
          <CategoryGroup
            key={g.category}
            category={g.category}
            files={g.files}
            selected={selected}
            onToggle={onToggle}
          />
        ))}
        {left.length > 0 && (
          <details className="tz-prop__extra">
            <summary>
              {t("traceability.fromProject.leftOut", { count: left.length })}
            </summary>
            <ul>
              {left.map((f) => (
                <li key={f.path}>
                  <code>{f.path}</code> —{" "}
                  {t(`traceability.fromProject.excluded.${f.excluded}`)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <div className="tz-scan__opts">
        <label className="tz-scan__field">
          {t("traceability.fromProject.budget")}
          <input
            type="number"
            min={10000}
            step={10000}
            value={budget}
            onChange={(e) => onBudget(Number(e.target.value))}
          />
        </label>
        <label className="tz-scan__field tz-scan__field--wide">
          {t("traceability.fromProject.context")}
          <input
            value={context}
            maxLength={300}
            placeholder={t("traceability.fromProject.contextPlaceholder")}
            onChange={(e) => onContext(e.target.value)}
          />
        </label>
      </div>
      <p className="tz-scan__summary" aria-live="polite">
        {summary}
        {budget !== DEFAULT_BUDGET
          ? ""
          : ` · ${t("traceability.fromProject.budgetDefault", { tokens: fmt(DEFAULT_BUDGET, lang) })}`}
      </p>
    </div>
  );
}

function CategoryGroup({
  category,
  files,
  selected,
  onToggle,
}: {
  category: ScanCategory;
  files: ScanFile[];
  selected: Set<string>;
  onToggle: (path: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "es";
  const ticked = files.filter((f) => selected.has(f.path)).length;
  return (
    <details className="tz-scan__group" open={category === "docs"}>
      <summary>
        {t(`traceability.fromProject.category.${category}`)} ({ticked}/
        {files.length})
      </summary>
      <ul>
        {files.map((f) => (
          <li key={f.path}>
            <label>
              <input
                type="checkbox"
                checked={selected.has(f.path)}
                onChange={() => onToggle(f.path)}
              />{" "}
              <code>{f.path}</code>{" "}
              <span className="tr-gen__hint">≈ {fmt(f.tokens, lang)}</span>
            </label>
          </li>
        ))}
      </ul>
    </details>
  );
}
