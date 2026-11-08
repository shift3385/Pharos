import {
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "@shared/ui/Dialog";
import {
  AiFailureNotice,
  AiSendNotice,
  DESIGN_PROMPT_VERSION,
  REQ_SYNTHESIS_PROMPT,
  aiDestinationNow,
  aiVision,
  describeAiFailure,
  extractRequirementsFromDesign,
  synthesizeRequirements,
  type AiDestination,
  type AiFailure,
  type VisionCapability,
} from "@modules/ai";
import type { Requirement, RequirementProvenance } from "../model/types";
import type {
  ApplyResult,
  CandidateRequirement,
  RequirementProposal,
} from "../proposals/types";
import { usableRequirementProposals } from "../proposals/proposals";
import { RequirementProposalsReview } from "./RequirementProposalsReview";
import { DesignSourceLabel } from "./DesignSourceLabel";
import { promptItems, toCandidates } from "../fromDesign/candidates";
import {
  readMaterial,
  summarize,
  withinLimits,
  type MaterialFile,
  type MaterialIssue,
  type MaterialItem,
} from "../fromDesign/material";
import { reduceImage, type ReducedImage } from "../fromDesign/imageReduce";
import { MAX_ATTACHMENTS } from "../fromDesign/limits";
import "@shared/ui/ConfirmDialog.css";
import "./Traceability.css";

type Phase =
  | "material"
  | "reading"
  | "analyzing"
  | "synthesizing"
  | "failed"
  | "review"
  | "empty";

/** What the extraction left, so a failed synthesis is retried alone. */
interface Extracted {
  candidates: CandidateRequirement[];
  /** The items sent, numbered as the sources cite them (thumbnails, names). */
  sent: MaterialItem[];
}

const ACCEPT =
  ".png,.jpg,.jpeg,.webp,.gif,.svg,.pdf,.zip,.excalidraw,.html,.htm,.md,image/*,application/pdf";

const mb = (base64: number) => (base64 * 0.75) / (1024 * 1024);

/** «Requisitos desde diseños» (IA-18, ADR-0037). The person drops, pastes or
 *  picks screenshots, sketches, PDF exports, an Excalidraw sketch or a Claude
 *  Design folder or ZIP; sees what will be sent, where, and its rough cost; and
 *  starts the analysis. Nothing leaves the machine before «Analizar». Two calls:
 *  the images are read once (`requirements-from-design@1`), then the common
 *  synthesis of IA-17 compares the candidates with the project's requirements,
 *  as partial material (nothing is removed for not being shown). The proposals
 *  open in the common review. */
export function RequirementsFromDesignModal({
  projectId,
  existing,
  linkedCases,
  onApplied,
  onClose,
  reduce = reduceImage,
}: {
  projectId: string;
  existing: Requirement[];
  linkedCases: Record<string, number>;
  onApplied: (result: ApplyResult) => void;
  onClose: () => void;
  /** Tests replace the canvas reduction (jsdom has no canvas). */
  reduce?: (blob: Blob) => Promise<ReducedImage>;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const [phase, setPhase] = useState<Phase>("material");
  const [items, setItems] = useState<MaterialItem[]>([]);
  const [issues, setIssues] = useState<MaterialIssue[]>([]);
  const [context, setContext] = useState("");
  const [failure, setFailure] = useState<AiFailure | null>(null);
  const [vision, setVision] = useState<VisionCapability | null | undefined>(
    undefined,
  );
  const [dragging, setDragging] = useState(false);
  const [destination, setDestination] = useState<AiDestination | null>(null);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [emptyReason, setEmptyReason] = useState("");
  const [review, setReview] = useState<{
    proposals: RequirementProposal[];
    provenance: RequirementProvenance;
  } | null>(null);
  const closed = useRef(false);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    aiVision()
      .then((v) => live && setVision(v))
      .catch(() => live && setVision(null));
    aiDestinationNow()
      .then((d) => live && setDestination(d))
      .catch(() => undefined);
    return () => {
      live = false;
      closed.current = true;
    };
  }, []);

  async function add(files: MaterialFile[]) {
    if (!files.length) return;
    setPhase("reading");
    try {
      const read = await readMaterial(files, { reduce });
      // Files added again (same bytes) are not repeated.
      setExtracted(null);
      setItems((prev) => {
        const known = new Set(prev.map((i) => i.sha256));
        const fresh = read.items
          .filter((i) => !known.has(i.sha256))
          .map((i, n) => ({ ...i, id: `${i.id}-${prev.length + n}` }));
        return withinLimits([...prev, ...fresh]);
      });
      setIssues(read.issues);
    } finally {
      setPhase("material");
    }
  }

  const fromList = (list: FileList | null | undefined): MaterialFile[] =>
    Array.from(list ?? []).map((f) => ({
      path: f.webkitRelativePath || f.name,
      blob: f,
      nested: !!f.webkitRelativePath,
    }));

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (phase === "material") void add(fromList(e.dataTransfer.files));
  }

  function onPaste(e: ClipboardEvent) {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (!files.length || phase !== "material") return;
    e.preventDefault();
    const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");
    void add(
      files.map((f, n) => ({
        path:
          f.name && f.name !== "image.png"
            ? f.name
            : `captura-${stamp}-${n + 1}.png`,
        blob: f,
      })),
    );
  }

  // Any change to the material makes the extracted candidates stale.
  const update = (itemId: string, patch: Partial<MaterialItem>) => {
    setExtracted(null);
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
    );
  };

  const summary = summarize(items);
  const sendsImages = items.some((i) => i.included && i.attachment);
  const sendsPdf = items.some((i) => i.included && i.kind === "pdf");
  const blocked =
    vision === null
      ? "noAi"
      : sendsImages && vision?.images === "no"
        ? "noVision"
        : sendsPdf && vision && !vision.pdf
          ? "noPdf"
          : null;
  const canAnalyze =
    (phase === "material" || phase === "failed") &&
    !summary.empty &&
    summary.over.length === 0 &&
    !blocked &&
    vision !== undefined;

  const lang = i18n.resolvedLanguage ?? "es";

  async function analyze() {
    setFailure(null);
    let done = extracted;
    try {
      if (!done) {
        setPhase("analyzing");
        const { prompt, sent } = promptItems(items);
        const { value } = await extractRequirementsFromDesign(
          prompt,
          context,
          lang,
        );
        if (closed.current) return;
        done = { candidates: toCandidates(value, sent), sent };
        setExtracted(done);
        if (!done.candidates.length) {
          setEmptyReason(
            value.reason ?? t("traceability.fromDesign.noCandidates"),
          );
          return setPhase("empty");
        }
      }
      setPhase("synthesizing");
      const r = await synthesizeRequirements(
        done.candidates,
        existing.map((e) => ({
          key: e.requirementKey,
          title: e.title,
          description: e.description,
          priority: e.priority,
        })),
        lang,
        { context, partialMaterial: true },
      );
      if (closed.current) return;
      const proposals = usableRequirementProposals(
        r.value.proposals,
        done.candidates,
        existing,
      );
      if (!proposals.length) {
        setEmptyReason(
          r.value.reason ?? t("traceability.fromDesign.nothingToChange"),
        );
        return setPhase("empty");
      }
      // Both prompts are recorded: the reading of the images and the synthesis.
      setReview({
        proposals,
        provenance: {
          ...r.provenance,
          prompt: `${DESIGN_PROMPT_VERSION}+${REQ_SYNTHESIS_PROMPT}`,
        },
      });
      setPhase("review");
    } catch (e) {
      if (closed.current) return;
      setFailure(describeAiFailure(e));
      setPhase("failed");
    }
  }

  const busy =
    phase === "reading" || phase === "analyzing" || phase === "synthesizing";

  return (
    <Dialog
      className="cd tr-modal tr-modal--wide tr-design"
      labelledBy={`${id}-title`}
      onClose={onClose}
      initialFocus={primaryRef}
    >
      <h3 id={`${id}-title`} className="cd__title">
        {t("traceability.fromDesign.title")}
      </h3>
      {phase === "review" && review && extracted ? (
        <RequirementProposalsReview
          proposals={review.proposals}
          existing={existing}
          provenance={review.provenance}
          projectId={projectId}
          linkedCases={linkedCases}
          sourceLabel={(s) => (
            <DesignSourceLabel source={s} sent={extracted.sent} />
          )}
          onApplied={(r) => {
            onApplied(r);
            if (!r.failed.length) onClose();
          }}
          onClose={onClose}
        />
      ) : phase === "empty" ? (
        <>
          <p className="cd__msg">{emptyReason}</p>
          <div className="cd__actions">
            <button
              type="button"
              className="cd__cancel"
              onClick={() => setPhase("material")}
            >
              {t("traceability.fromDesign.back")}
            </button>
            <button
              ref={primaryRef}
              type="button"
              className="cd__confirm"
              onClick={onClose}
            >
              {t("common.close")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="cd__msg">{t("traceability.fromDesign.intro")}</p>

          <div
            className={`tr-design__drop${dragging ? " tr-design__drop--over" : ""}`}
            // Focusable so Ctrl+V works on it with the keyboard.
            tabIndex={0}
            role="group"
            aria-label={t("traceability.fromDesign.dropLabel")}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onPaste={onPaste}
          >
            <p>{t("traceability.fromDesign.drop")}</p>
            <div className="tr-design__pick">
              <label className="cd__cancel tr-design__btn">
                {t("traceability.fromDesign.pickFiles")}
                <input
                  type="file"
                  multiple
                  accept={ACCEPT}
                  className="tr-design__file"
                  disabled={busy}
                  onChange={(e) => {
                    void add(fromList(e.target.files));
                    e.target.value = "";
                  }}
                />
              </label>
              <label className="cd__cancel tr-design__btn">
                {t("traceability.fromDesign.pickFolder")}
                <input
                  type="file"
                  multiple
                  className="tr-design__file"
                  // Not in React's types: lets the user pick a whole folder.
                  {...{ webkitdirectory: "" }}
                  disabled={busy}
                  onChange={(e) => {
                    void add(fromList(e.target.files));
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <p className="tr-gen__hint">
              {t("traceability.fromDesign.sources")}
            </p>
          </div>

          {issues.length > 0 && (
            <ul className="tr-design__issues" role="alert">
              {issues.map((issue, n) => (
                <li key={n}>
                  {t(`traceability.fromDesign.issue.${issue.reason}`, {
                    name: issue.name,
                    max: MAX_ATTACHMENTS,
                  })}
                </li>
              ))}
            </ul>
          )}

          {items.length > 0 && (
            <ol
              className="tr-design__items"
              aria-label={t("traceability.fromDesign.itemsLabel")}
            >
              {items.map((item) => (
                <li
                  key={item.id}
                  className={`tr-design__item${item.included ? "" : " tr-design__item--off"}`}
                >
                  <label className="tr-gen__check">
                    <input
                      type="checkbox"
                      checked={item.included}
                      disabled={busy}
                      onChange={(e) =>
                        update(item.id, { included: e.target.checked })
                      }
                    />
                    <span className="tr-design__thumb" aria-hidden="true">
                      {item.kind === "image" && item.attachment ? (
                        <img
                          src={`data:${item.attachment.mediaType};base64,${item.attachment.data}`}
                          alt=""
                        />
                      ) : (
                        <span className="tr-design__kind">
                          {item.kind === "pdf" ? "PDF" : "TXT"}
                        </span>
                      )}
                    </span>
                    <span>
                      <span className="tr-gen__name tr-mono">{item.name}</span>
                      <span className="tr-gen__desc">
                        {item.kind === "image"
                          ? t("traceability.fromDesign.meta.image", {
                              w: item.width,
                              h: item.height,
                              tokens: item.tokens,
                            })
                          : item.kind === "pdf"
                            ? t("traceability.fromDesign.meta.pdf", {
                                count: item.pages,
                                tokens: item.tokens,
                              })
                            : t(
                                item.truncated
                                  ? "traceability.fromDesign.meta.textCut"
                                  : "traceability.fromDesign.meta.text",
                                {
                                  chars: item.text?.length ?? 0,
                                  tokens: item.tokens,
                                },
                              )}
                        {item.frame
                          ? ` · ${t("traceability.fromDesign.meta.screen", { name: item.frame })}`
                          : ""}
                      </span>
                    </span>
                  </label>
                  <input
                    type="text"
                    className="tr-design__note"
                    value={item.note}
                    maxLength={200}
                    disabled={busy}
                    aria-label={t("traceability.fromDesign.note", {
                      name: item.name,
                    })}
                    placeholder={t("traceability.fromDesign.notePlaceholder")}
                    onChange={(e) => update(item.id, { note: e.target.value })}
                  />
                  <button
                    type="button"
                    className="cd__cancel tr-design__remove"
                    disabled={busy}
                    aria-label={t("traceability.fromDesign.remove", {
                      name: item.name,
                    })}
                    onClick={() => {
                      setExtracted(null);
                      setItems((prev) =>
                        withinLimits(prev.filter((i) => i.id !== item.id)),
                      );
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
          )}

          <label className="tr-design__context">
            <span>{t("traceability.fromDesign.context")}</span>
            <textarea
              value={context}
              rows={2}
              maxLength={2000}
              disabled={busy}
              placeholder={t("traceability.fromDesign.contextPlaceholder")}
              onChange={(e) => {
                setExtracted(null);
                setContext(e.target.value);
              }}
            />
          </label>

          {items.length > 0 && (
            <p className="tr-gen__hint" aria-live="polite">
              {t("traceability.fromDesign.summary", {
                count: summary.attachments,
                max: MAX_ATTACHMENTS,
                mb: mb(summary.base64).toFixed(1),
                tokens: summary.tokens.toLocaleString(i18n.resolvedLanguage),
              })}
            </p>
          )}
          {summary.over.map((o) => (
            <p key={o} className="tr-error" role="alert">
              {t(`traceability.fromDesign.over.${o}`, { max: MAX_ATTACHMENTS })}
            </p>
          ))}
          {blocked && (
            <p className="tr-error" role="alert">
              {t(`traceability.fromDesign.blocked.${blocked}`)}
            </p>
          )}
          {!blocked && sendsImages && vision?.images === "unknown" && (
            <p className="tr-warn">
              {t("traceability.fromDesign.visionUnknown")}
            </p>
          )}
          {sendsImages || summary.chars > 0 ? (
            <AiSendNotice destination={destination}>
              <p>{t("traceability.fromDesign.privacy")}</p>
            </AiSendNotice>
          ) : null}

          <p
            className="cd__msg tr-gen__status"
            role="status"
            aria-live="polite"
          >
            {phase === "reading"
              ? t("traceability.fromDesign.reading")
              : phase === "analyzing"
                ? t("traceability.fromDesign.analyzing")
                : phase === "synthesizing"
                  ? t("traceability.fromDesign.synthesizing", {
                      count: existing.length,
                    })
                  : ""}
          </p>
          {phase === "failed" && failure && (
            <AiFailureNotice failure={failure} />
          )}

          <div className="cd__actions">
            <button type="button" className="cd__cancel" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button
              ref={primaryRef}
              type="button"
              className="cd__confirm"
              disabled={!canAnalyze}
              onClick={() => void analyze()}
            >
              {phase === "analyzing" || phase === "synthesizing"
                ? t("ai.structured.thinking")
                : phase === "failed"
                  ? t("traceability.generate.retry")
                  : t("traceability.fromDesign.analyze")}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
