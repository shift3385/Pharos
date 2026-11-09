import { useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pencil } from "lucide-react";
import { useAuth } from "@modules/auth";
import { StatusPill, type PillTone } from "@shared/ui/StatusPill";
import { ConfirmDialog } from "@shared/ui/ConfirmDialog";
import { FormField } from "@shared/ui/FormField";
import { applyRequirementProposals } from "../api/applyProposals";
import {
  REQUIREMENT_PRIORITIES,
  type Requirement,
  type RequirementPriority,
  type RequirementProvenance,
} from "../model/types";
import { blockedByLinks, deletedKeys } from "../proposals/proposals";
import { defaultSourceLabel } from "./sourceLabel";
import type {
  ApplyResult,
  ProposalAction,
  RequirementProposal,
  RequirementSource,
} from "../proposals/types";
import "@shared/ui/buttons.css";
import "./Traceability.css";

const ORDER: ProposalAction[] = ["add", "improve", "merge", "remove"];
const TONE: Record<ProposalAction, PillTone> = {
  add: "success",
  improve: "warning",
  merge: "info",
  remove: "error",
};

type Edit = {
  title: string;
  description: string;
  priority: RequirementPriority;
};

/** The review of the requirement proposals of the AI (IA-17, ADR-0036; shared
 *  with IA-18): new, improvements, possible duplicates and redundant ones,
 *  each with its reason and source. Nothing is applied until the person picks
 *  and confirms; deleting asks again, and a requirement with linked test cases
 *  is never deleted from here. What is created or changed is marked «IA ·
 *  pendiente de revisión». */
export function RequirementProposalsReview({
  proposals,
  existing,
  provenance,
  projectId,
  linkedCases,
  sourceLabel,
  onApplied,
  onClose,
  keepImages,
}: {
  proposals: RequirementProposal[];
  existing: Requirement[];
  provenance: RequirementProvenance;
  projectId: string;
  linkedCases: Record<string, number>;
  /** Each source of material paints its own sources (IA-18: thumbnails). */
  sourceLabel?: (s: RequirementSource) => ReactNode;
  /** After every apply; the caller closes when nothing failed. */
  onApplied: (result: ApplyResult) => void;
  onClose: () => void;
  /** IA-19: offers «keep the images as attachments» (unticked) and, when
   *  ticked, runs after each requirement created or improved. */
  keepImages?: (proposal: RequirementProposal, saved: Requirement) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const byKey = useMemo(
    () => new Map(existing.map((r) => [r.requirementKey, r])),
    [existing],
  );
  const blocked = (p: RequirementProposal) => blockedByLinks(p, linkedCases);
  const [items, setItems] = useState(proposals);
  // New ones and improvements start ticked; deleting starts unticked.
  const [selected, setSelected] = useState<Set<number>>(
    () =>
      new Set(
        proposals
          .filter((p) => p.action === "add" || p.action === "improve")
          .map((p) => p.id),
      ),
  );
  const [edits, setEdits] = useState<Map<number, Edit>>(new Map());
  const [editing, setEditing] = useState<number | null>(null);
  const [phase, setPhase] = useState<"review" | "confirm" | "applying">(
    "review",
  );
  const [lastFailed, setLastFailed] = useState(0);
  // Unticked: by default Pharos keeps no image (IA-18 privacy decision).
  const [keep, setKeep] = useState(false);
  const [attachFailed, setAttachFailed] = useState(0);
  const applyRef = useRef<HTMLButtonElement>(null);
  const label =
    sourceLabel ?? ((s: RequirementSource) => defaultSourceLabel(s, t));

  const chosen = items.filter((p) => selected.has(p.id) && !blocked(p).length);
  const deleting = chosen.flatMap(deletedKeys);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** The proposal as the person left it (edited title, description, priority). */
  function withEdits(p: RequirementProposal): RequirementProposal {
    const e = edits.get(p.id);
    if (!e || (p.action !== "add" && p.action !== "improve")) return p;
    return {
      ...p,
      title: e.title,
      description: e.description,
      priority: e.priority,
    };
  }

  async function apply() {
    setPhase("applying");
    const result = await applyRequirementProposals({
      projectId,
      userId: user?.id ?? "",
      accepted: chosen.map(withEdits),
      existing,
      linkedCases,
      provenance,
      acceptanceHeading: t("traceability.proposals.acceptanceHeading"),
      afterSave: keep && keepImages ? keepImages : undefined,
    });
    setAttachFailed(result.attachFailed ?? 0);
    // Applied and skipped ones leave the list; failed ones stay ticked for a retry.
    const failed = new Set(result.failed);
    const done = new Set(
      chosen.map((p) => p.id).filter((id) => !failed.has(id)),
    );
    setItems((prev) => prev.filter((p) => !done.has(p.id)));
    setSelected(failed);
    setLastFailed(result.failed.length);
    setPhase("review");
    onApplied(result);
  }

  const start = () => (deleting.length ? setPhase("confirm") : void apply());

  return (
    <div className="tz-prop" data-testid="req-proposals">
      <div className="tz-prop__bar">
        <span className="tz-prop__count">
          {t("traceability.proposals.count", { count: items.length })}
        </span>
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--small"
          onClick={() =>
            setSelected(
              new Set(items.filter((p) => !blocked(p).length).map((p) => p.id)),
            )
          }
        >
          {t("traceability.proposals.selectAll")}
        </button>
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--small"
          onClick={() => setSelected(new Set())}
        >
          {t("traceability.proposals.selectNone")}
        </button>
      </div>
      <p className="tr-gen__hint">{t("ai.provenance.pending")}</p>
      {lastFailed > 0 && (
        <p className="tr-gen__failed" role="alert">
          <span aria-hidden="true">⚠ </span>
          {t("traceability.proposals.failed", { count: lastFailed })}
        </p>
      )}

      <div className="tz-prop__list">
        {ORDER.map((action) => {
          const group = items.filter((p) => p.action === action);
          if (!group.length) return null;
          const heading = `tz-prop-${action}`;
          return (
            <section
              key={action}
              role="group"
              aria-labelledby={heading}
              className="tz-prop__group"
            >
              <h4 id={heading} className="tz-prop__heading">
                {t(`traceability.proposals.section.${action}`, {
                  count: group.length,
                })}
              </h4>
              <ul className="tr-gen__list tz-prop__items">
                {group.map((raw) => {
                  const p = withEdits(raw);
                  const links = blocked(p);
                  const isEditing = editing === p.id;
                  return (
                    <li
                      key={p.id}
                      className="tr-gen__row"
                      data-testid={`req-proposal-${p.id}`}
                    >
                      <label className="tr-gen__check">
                        <input
                          type="checkbox"
                          checked={selected.has(p.id) && !links.length}
                          disabled={phase !== "review" || links.length > 0}
                          onChange={() => toggle(p.id)}
                          aria-describedby={`tz-prop-why-${p.id}`}
                        />
                        <span>
                          <span className="tz-prop__head">
                            <StatusPill tone={TONE[p.action]}>
                              {t(`traceability.proposals.action.${p.action}`)}
                            </StatusPill>
                            <ProposalTitle p={p} byKey={byKey} />
                          </span>
                          <ProposalBody p={p} byKey={byKey} />
                        </span>
                      </label>
                      {isEditing &&
                        (p.action === "add" || p.action === "improve") && (
                          <ProposalEditor
                            value={{
                              title:
                                p.title ??
                                (p.action === "improve"
                                  ? byKey.get(p.key)?.title
                                  : "") ??
                                "",
                              description:
                                p.description ??
                                (p.action === "improve"
                                  ? byKey.get(p.key)?.description
                                  : "") ??
                                "",
                              priority:
                                p.priority ??
                                (p.action === "improve"
                                  ? byKey.get(p.key)?.priority
                                  : undefined) ??
                                "medium",
                            }}
                            onDone={(e) => {
                              setEdits((prev) => new Map(prev).set(p.id, e));
                              setEditing(null);
                            }}
                            onCancel={() => setEditing(null)}
                          />
                        )}
                      <div className="tz-prop__meta" id={`tz-prop-why-${p.id}`}>
                        <span>
                          <strong>{t("traceability.proposals.reason")}</strong>{" "}
                          {p.reason}
                        </span>
                        {links.length > 0 && (
                          <span className="tz-prop__blocked">
                            {t("traceability.proposals.linkedBlocked", {
                              keys: links.join(", "),
                              count: links.reduce(
                                (n, k) => n + (linkedCases[k] ?? 0),
                                0,
                              ),
                            })}
                          </span>
                        )}
                        {"basis" in p && p.basis && (
                          <span>
                            <StatusPill
                              tone={p.basis === "stated" ? "info" : "neutral"}
                            >
                              {t(`traceability.proposals.basis.${p.basis}`)}
                            </StatusPill>
                            {p.basis === "inferred" &&
                              p.sources.some((s) => s.kind === "file") && (
                                <span className="tr-gen__hint">
                                  {" "}
                                  {t("traceability.proposals.inferredHint")}
                                </span>
                              )}
                          </span>
                        )}
                        {"sources" in p && p.sources.length > 0 && (
                          <span className="tz-prop__sources">
                            <strong>
                              {t("traceability.proposals.source", {
                                count: p.sources.length,
                              })}
                            </strong>{" "}
                            {p.sources.map((s, i) => (
                              <span key={i} className="tz-prop__source">
                                {label(s)}
                              </span>
                            ))}
                          </span>
                        )}
                        {"acceptance" in p && (
                          <Extra
                            title={t("traceability.proposals.acceptance")}
                            items={p.acceptance}
                          />
                        )}
                        {"assumptions" in p && (
                          <Extra
                            title={t("traceability.proposals.assumptions")}
                            items={p.assumptions}
                          />
                        )}
                        {"questions" in p && (
                          <Extra
                            title={t("traceability.proposals.questions")}
                            items={p.questions}
                          />
                        )}
                        {(p.action === "add" || p.action === "improve") &&
                          !isEditing &&
                          phase === "review" && (
                            <button
                              type="button"
                              className="ui-btn ui-btn--ghost ui-btn--small"
                              onClick={() => setEditing(p.id)}
                            >
                              <Pencil size={12} aria-hidden="true" />{" "}
                              {t("traceability.proposals.edit")}
                            </button>
                          )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {keepImages && (
        <label className="tr-gen__check tz-prop__keep">
          <input
            type="checkbox"
            checked={keep}
            disabled={phase === "applying"}
            onChange={(e) => setKeep(e.target.checked)}
          />
          <span>
            <span className="tr-gen__name">{t("traceability.fromDesign.keepImages")}</span>
            <span className="tr-gen__desc">{t("traceability.fromDesign.keepImagesHint")}</span>
          </span>
        </label>
      )}
      {attachFailed > 0 && (
        <p className="tr-warn" role="alert">
          {t("traceability.fromDesign.keepImagesFailed", { count: attachFailed })}
        </p>
      )}
      <p className="cd__msg tr-gen__status" role="status" aria-live="polite">
        {phase === "applying" ? t("traceability.proposals.applying") : ""}
      </p>
      <div className="cd__actions">
        <button
          type="button"
          className="cd__cancel"
          disabled={phase === "applying"}
          onClick={onClose}
        >
          {items.length ? t("common.cancel") : t("common.close")}
        </button>
        <button
          ref={applyRef}
          type="button"
          className="cd__confirm"
          data-testid="req-proposals-apply"
          disabled={phase !== "review" || chosen.length === 0}
          onClick={start}
        >
          {phase === "applying"
            ? t("traceability.proposals.applying")
            : t("traceability.proposals.apply", { count: chosen.length })}
        </button>
      </div>

      {phase === "confirm" && (
        <ConfirmDialog
          variant="destructive"
          title={t("traceability.proposals.deleteTitle")}
          message={t("traceability.proposals.deleteWarning", {
            keys: deleting.join(", "),
            count: deleting.length,
          })}
          confirmLabel={t("traceability.proposals.apply", {
            count: chosen.length,
          })}
          onConfirm={() => void apply()}
          onCancel={() => setPhase("review")}
        />
      )}
    </div>
  );
}

function ProposalTitle({
  p,
  byKey,
}: {
  p: RequirementProposal;
  byKey: Map<string, Requirement>;
}) {
  const { t } = useTranslation();
  switch (p.action) {
    case "add":
      return (
        <span className="tr-gen__name">
          {p.title}
          <span className="tr-gen__priority">
            {t(`traceability.priorityLabel.${p.priority}`)}
          </span>
        </span>
      );
    case "improve":
      return (
        <span className="tr-gen__name">
          <span className="tr-key">{p.key}</span>{" "}
          {p.title ?? byKey.get(p.key)?.title}
        </span>
      );
    case "merge":
      return (
        <span className="tr-gen__name">
          {t("traceability.proposals.mergeTitle", {
            keys: p.keys.join(", "),
            keep: p.keep,
          })}
        </span>
      );
    case "remove":
      return (
        <span className="tr-gen__name">
          <span className="tr-key">{p.key}</span>{" "}
          <del>{byKey.get(p.key)?.title}</del>
        </span>
      );
  }
}

function ProposalBody({
  p,
  byKey,
}: {
  p: RequirementProposal;
  byKey: Map<string, Requirement>;
}) {
  const { t } = useTranslation();
  if (p.action === "add") {
    return (
      <>
        <span className="tr-gen__desc">{p.description}</span>
        {p.similarTo && (
          <span className="tz-prop__warn">
            {t("traceability.proposals.similarTo", {
              key: p.similarTo,
              title: byKey.get(p.similarTo)?.title ?? "",
            })}
          </span>
        )}
      </>
    );
  }
  if (p.action === "improve") {
    const current = byKey.get(p.key);
    return (
      <>
        {p.title && current && (
          <del className="tr-gen__desc">{current.title}</del>
        )}
        {p.description && (
          <>
            {current?.description && (
              <del className="tr-gen__desc">{current.description}</del>
            )}
            <span className="tr-gen__desc">{p.description}</span>
          </>
        )}
        {p.priority && current && (
          <span className="tr-gen__desc">
            {t("traceability.proposals.priorityChange", {
              from: t(`traceability.priorityLabel.${current.priority}`),
              to: t(`traceability.priorityLabel.${p.priority}`),
            })}
          </span>
        )}
      </>
    );
  }
  if (p.action === "merge") {
    return (
      <>
        <ul className="tz-prop__keys">
          {p.keys.map((k) => (
            <li key={k}>
              <span className="tr-key">{k}</span>{" "}
              {k === p.keep ? (
                byKey.get(k)?.title
              ) : (
                <del>{byKey.get(k)?.title}</del>
              )}
            </li>
          ))}
        </ul>
        {(p.title || p.description) && (
          <span className="tr-gen__desc">
            {p.title && <strong>{p.title}. </strong>}
            {p.description}
          </span>
        )}
      </>
    );
  }
  return p.coveredBy ? (
    <span className="tr-gen__desc">
      {t("traceability.proposals.coveredBy", {
        key: p.coveredBy,
        title: byKey.get(p.coveredBy)?.title ?? "",
      })}
    </span>
  ) : null;
}

function Extra({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <details className="tz-prop__extra">
      <summary>
        {title} ({items.length})
      </summary>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </details>
  );
}

function ProposalEditor({
  value,
  onDone,
  onCancel,
}: {
  value: Edit;
  onDone: (e: Edit) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  return (
    <div className="tz-prop__editor">
      <FormField label={t("traceability.requirement.title")} required>
        {(p) => (
          <input
            {...p}
            value={draft.title}
            autoFocus
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        )}
      </FormField>
      <FormField label={t("traceability.requirement.description")}>
        {(p) => (
          <textarea
            {...p}
            rows={3}
            value={draft.description}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
          />
        )}
      </FormField>
      <FormField label={t("traceability.requirement.priority")}>
        {(p) => (
          <select
            {...p}
            value={draft.priority}
            onChange={(e) =>
              setDraft({
                ...draft,
                priority: e.target.value as RequirementPriority,
              })
            }
          >
            {REQUIREMENT_PRIORITIES.map((pr) => (
              <option key={pr} value={pr}>
                {t(`traceability.priorityLabel.${pr}`)}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <span className="tz-prop__editor-actions">
        <button type="button" className="cd__cancel" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="cd__confirm"
          disabled={!draft.title.trim()}
          onClick={() =>
            onDone({
              ...draft,
              title: draft.title.trim(),
              description: draft.description.trim(),
            })
          }
        >
          {t("traceability.proposals.editDone")}
        </button>
      </span>
    </div>
  );
}
