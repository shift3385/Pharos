import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Bug,
  ClipboardPaste,
  Download,
  Keyboard,
  Paperclip,
  Pause,
  Play,
  Save,
  SkipForward,
  Trash2,
  X,
} from "lucide-react";
import {
  createDefectFromResult,
  DefectEditor,
  type DefectInput,
} from "@modules/defects";
import type {
  ExecutionAttachment,
  ExecutionTarget,
  ResultView,
  RunItemDetail,
} from "@shared/contracts/contract";
import { Dialog } from "@shared/ui/Dialog";
import { StatusPill } from "@shared/ui/StatusPill";
import { useToast } from "@shared/ui/Toast";
import { runsApi } from "../api/runsApi";
import {
  attemptsOf,
  commandOf,
  elapsedAt,
  expectedOf,
  fill,
  formatElapsed,
  newDraft,
  nextUnmarked,
  parseDraft,
  resultStatus,
  rowLabel,
  STEP_STATUSES,
  stepsOf,
  toggleTimer,
  toResultInput,
  unmarked,
  type ExecStep,
  type StepStatus,
  type TargetDraft,
} from "../model/execution";
import { instantOf, statusTone } from "../model/types";
import "@shared/ui/buttons.css";
import "@shared/ui/ConfirmDialog.css";
import "./Execution.css";

/** Autosave delay of a draft after the last change. */
const SAVE_DELAY = 600;

const TEST_ID: Record<StepStatus, string> = {
  passed: "pass",
  failed: "fail",
  blocked: "blocked",
  skipped: "skip",
};

/** The executor of one run item (EJE-02): its frozen revision step by step,
 *  one target (flow / Outline row) at a time, with a local draft that is
 *  saved as you go and recorded as one immutable attempt. Keyboard first:
 *  P/F/B/S mark the step and move on, J/K move, N notes, T timer,
 *  Ctrl+Enter records, Ctrl+Shift+N next item, ? the list. */
export function ExecutionPanel({
  runItemId,
  runKey,
  runOpen,
  configurationLabel,
  projectId,
  userId,
  onChanged,
  onNextItem,
  onClose,
}: {
  runItemId: string;
  runKey: string;
  runOpen: boolean;
  configurationLabel: string | null;
  projectId: string;
  userId: string;
  /** An attempt was recorded or a draft changed: refresh the run. */
  onChanged: () => void;
  onNextItem: (() => void) | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const uid = useId();
  const [detail, setDetail] = useState<RunItemDetail | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [targetKey, setTargetKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, TargetDraft>>({});
  const [focus, setFocus] = useState(0);
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [defect, setDefect] = useState<{ draft: DefectInput; label: string } | null>(null);
  const [previews, setPreviews] = useState<Record<string, string | null>>({});
  const [announce, setAnnounce] = useState("");
  const [, tick] = useState(0);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pending = useRef<Record<string, TargetDraft>>({});
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const attachFor = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await runsApi.itemDetail(runItemId, userId);
      setDetail(d);
      setFailed(false);
      if (d) {
        const now = new Date();
        const stored = (d.draft?.targets ?? {}) as Record<string, unknown>;
        setDrafts((cur) => {
          const next: Record<string, TargetDraft> = {};
          for (const [k, v] of Object.entries(stored)) next[k] = cur[k] ?? parseDraft(v, now);
          return next;
        });
        setTargetKey((k) => {
          if (k && d.targets.some((x) => x.key === k)) return k;
          const open = d.targets.find(
            (x) => !attemptsOf(d.results, x).some((r) => r.isFinal),
          );
          return (open ?? d.targets[0])?.key ?? null;
        });
      }
    } catch {
      setFailed(true);
    }
  }, [runItemId, userId]);

  useEffect(() => {
    setDetail(undefined);
    setDrafts({});
    setTargetKey(null);
    setFocus(0);
    void load();
  }, [load]);

  // Pending autosaves are written when the panel closes or changes item.
  useEffect(() => {
    const saved = timers.current;
    const queue = pending.current;
    return () => {
      for (const [k, timer] of Object.entries(saved)) {
        clearTimeout(timer);
        const d = queue[k];
        if (d) void runsApi.draftSave(runItemId, k, d, userId).catch(() => undefined);
      }
    };
  }, [runItemId, userId]);

  const target: ExecutionTarget | undefined = detail?.targets.find((x) => x.key === targetKey);
  const revision = (detail?.revision ?? {}) as Record<string, unknown>;
  const steps: ExecStep[] = useMemo(
    () => (target ? stepsOf(revision, target.flowId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [detail, target?.key],
  );
  const draft = target ? drafts[target.key] : undefined;
  const editable = runOpen && detail?.runStatus === "in_progress";
  const attempts = detail && target ? attemptsOf(detail.results, target) : [];
  const draftFiles = (detail?.draft?.attachments ?? []).filter(
    (a) => a.targetKey === target?.key,
  );

  // The timer repaints once a second while it runs.
  useEffect(() => {
    if (!draft?.runningSince) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [draft?.runningSince]);

  // Thumbnails of image attachments, loaded once each.
  const allFiles = useMemo(
    () => [...(detail?.attachments ?? []), ...(detail?.draft?.attachments ?? [])],
    [detail],
  );
  useEffect(() => {
    for (const a of allFiles) {
      if (!a.mime?.startsWith("image/") || a.id in previews) continue;
      setPreviews((p) => ({ ...p, [a.id]: null }));
      void runsApi
        .previewAttachment(a.id, userId)
        .then((url) => setPreviews((p) => ({ ...p, [a.id]: url })))
        .catch(() => undefined);
    }
  }, [allFiles, previews, userId]);

  /** Changes the draft of the current target and schedules its save. */
  function change(update: (d: TargetDraft) => TargetDraft) {
    if (!target || !editable) return;
    const key = target.key;
    const next = update(drafts[key] ?? newDraft(new Date()));
    setDrafts((cur) => ({ ...cur, [key]: next }));
    pending.current[key] = next;
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => {
      delete timers.current[key];
      const d = pending.current[key];
      delete pending.current[key];
      if (d)
        void runsApi
          .draftSave(runItemId, key, d, userId)
          .catch(() => toast(t("execution.draftError"), "error"));
    }, SAVE_DELAY);
  }

  function cancelSave(key: string) {
    clearTimeout(timers.current[key]);
    delete timers.current[key];
    delete pending.current[key];
  }

  function mark(index: number, status: StepStatus) {
    const step = steps[index];
    if (!step) return;
    change((d) => {
      const cur = d.steps[step.id]?.status;
      const next = cur === status ? undefined : status;
      return { ...d, steps: { ...d.steps, [step.id]: { ...d.steps[step.id], status: next } } };
    });
    setAnnounce(
      t("execution.marked", { n: index + 1, status: t(`runs.status.${status}`) }),
    );
    if (status === "failed" || status === "blocked") {
      setOpenNotes((s) => new Set(s).add(step.id));
    }
  }

  function moveFocus(i: number) {
    const n = Math.max(0, Math.min(steps.length - 1, i));
    setFocus(n);
    stepRefs.current[n]?.focus();
  }

  async function record(): Promise<string | null> {
    if (!target || !detail || !editable) return null;
    const d = drafts[target.key] ?? newDraft(new Date());
    cancelSave(target.key);
    setBusy(true);
    try {
      const input = toResultInput(
        runItemId,
        target,
        steps,
        d,
        configurationLabel,
        userId,
        new Date(),
      );
      const id = await runsApi.record(input);
      toast(t("execution.recorded", { status: t(`runs.status.${input.status}`) }));
      setDrafts((cur) => {
        const next = { ...cur };
        delete next[target.key];
        return next;
      });
      setOpenNotes(new Set());
      await load();
      onChanged();
      return id;
    } catch (e) {
      toast(errorText(e, t), "error");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    if (!target) return;
    cancelSave(target.key);
    setDiscarding(false);
    try {
      await runsApi.draftDiscard(runItemId, target.key, userId);
      setDrafts((cur) => {
        const next = { ...cur };
        delete next[target.key];
        return next;
      });
      await load();
      onChanged();
    } catch (e) {
      toast(errorText(e, t), "error");
    }
  }

  async function attach(files: File[], stepId: string | null, pasted: boolean) {
    if (!target || !editable || files.length === 0) return;
    // The draft exists before its first file, so the file has a home.
    if (!drafts[target.key]) change((d) => d);
    setBusy(true);
    try {
      for (const f of files) {
        const name =
          pasted || !f.name
            ? t("execution.captureName", {
                at: new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-"),
              }) + extOf(f.type)
            : f.name;
        const kind = pasted || f.type.startsWith("image/") ? "screenshot" : "evidence";
        await runsApi.attachToDraft(runItemId, target.key, stepId, f, name, kind, userId);
      }
      toast(t("execution.attached", { count: files.length }));
      await load();
    } catch (e) {
      toast(errorText(e, t), "error");
    } finally {
      setBusy(false);
    }
  }

  async function pasteFromClipboard(stepId: string | null) {
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const type = item.types.find((x) => x.startsWith("image/"));
        if (type) files.push(new File([await item.getType(type)], "", { type }));
      }
      if (files.length === 0) {
        toast(t("execution.pasteEmpty"), "warning");
        return;
      }
      await attach(files, stepId, true);
    } catch {
      toast(t("execution.pasteDenied"), "warning");
    }
  }

  function onPaste(e: ClipboardEvent) {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length === 0 || !editable) return;
    e.preventDefault();
    const step = steps[focus];
    const inStep = stepRefs.current[focus]?.contains(document.activeElement);
    void attach(files, inStep && step && !step.id.startsWith("#") ? step.id : null, true);
  }

  async function removeFile(a: ExecutionAttachment) {
    try {
      await runsApi.deleteDraftAttachment(a.id, userId);
      await load();
    } catch (e) {
      toast(errorText(e, t), "error");
    }
  }

  async function saveFile(a: ExecutionAttachment) {
    try {
      await runsApi.saveAttachment(a.id, userId);
      toast(t("execution.fileSaved", { name: a.name }));
    } catch (e) {
      toast(errorText(e, t), "error");
    }
  }

  async function openDefect(resultId: string, stepId?: string) {
    try {
      const d = await createDefectFromResult(resultId, userId, stepId);
      setDefect({
        draft: d,
        label: [runKey, detail?.caseKey].filter(Boolean).join(" · "),
      });
    } catch (e) {
      toast(errorText(e, t), "error");
    }
  }

  /** «Crear defecto» on a failed step of the draft: the attempt is recorded
   *  first (a defect points at a result), then the editor opens. */
  async function defectFromDraft(stepId: string) {
    const id = await record();
    if (id) await openDefect(id, stepId.startsWith("#") ? undefined : stepId);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const el = e.target as HTMLElement;
    const inField =
      el.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
    const cmd = commandOf(e.nativeEvent, inField);
    if (!cmd) return;
    if (cmd.kind === "help") {
      e.preventDefault();
      setHelp(true);
      return;
    }
    if (cmd.kind === "nextItem") {
      e.preventDefault();
      onNextItem?.();
      return;
    }
    if (!editable) return;
    e.preventDefault();
    switch (cmd.kind) {
      case "mark": {
        mark(focus, cmd.status);
        const d = drafts[target?.key ?? ""] ?? newDraft(new Date());
        const after = {
          ...d,
          steps: { ...d.steps, [steps[focus]?.id ?? ""]: { status: cmd.status } },
        };
        const next = nextUnmarked(steps, after, focus);
        if (next >= 0 && cmd.status === "passed") moveFocus(next);
        else if (cmd.status !== "failed" && cmd.status !== "blocked") moveFocus(focus + 1);
        break;
      }
      case "move":
        moveFocus(focus + cmd.by);
        break;
      case "notes": {
        const step = steps[focus];
        if (!step) break;
        setOpenNotes((s) => new Set(s).add(step.id));
        setTimeout(() => document.getElementById(`${uid}-actual-${focus}`)?.focus(), 0);
        break;
      }
      case "timer":
        change((d) => toggleTimer(d, new Date()));
        break;
      case "save":
        void record();
        break;
    }
  }

  if (failed)
    return (
      <section className="ex" aria-label={t("execution.title")}>
        <p className="rn-error" role="alert">
          {t("execution.loadError")}
        </p>
        <button type="button" className="ui-btn ui-btn--small" onClick={() => void load()}>
          {t("runs.list.retry")}
        </button>
      </section>
    );
  if (detail === undefined)
    return (
      <section className="ex" aria-label={t("execution.title")}>
        <p className="tp-field__hint">{t("common.loading")}</p>
      </section>
    );
  if (detail === null)
    return (
      <section className="ex" aria-label={t("execution.title")}>
        <p className="tp-field__hint">{t("execution.itemGone")}</p>
      </section>
    );

  const d = draft ?? newDraft(new Date());
  const status = resultStatus(steps, d);
  const left = unmarked(steps, d);
  const running = Boolean(d.runningSince);
  const date = (s: string | null) => {
    const at = s ? instantOf(s) : undefined;
    return at ? at.toLocaleString(i18n.resolvedLanguage) : "—";
  };
  const expected = target ? expectedOf(revision, target.flowId) : null;
  const titleId = `${uid}-title`;

  const fileChip = (a: ExecutionAttachment, removable: boolean) => (
    <li key={a.id} className="ex-file">
      {previews[a.id] ? (
        <img src={previews[a.id] ?? undefined} alt="" className="ex-file__thumb" />
      ) : (
        <Paperclip size={14} aria-hidden="true" />
      )}
      <span className="ex-file__name" title={a.name}>
        {a.name}
      </span>
      <button
        type="button"
        className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--small"
        onClick={() => void saveFile(a)}
        aria-label={t("execution.saveFile", { name: a.name })}
        title={t("execution.saveFile", { name: a.name })}
      >
        <Download size={14} aria-hidden="true" />
      </button>
      {removable && editable && (
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--small"
          onClick={() => void removeFile(a)}
          aria-label={t("execution.removeFile", { name: a.name })}
          title={t("execution.removeFile", { name: a.name })}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      )}
    </li>
  );

  return (
    <section
      className="ex"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      data-testid="exec-panel"
    >
      <header className="ex-head">
        <div className="ex-head__title">
          <span className="rn-mono rn-key">{detail.caseKey}</span>
          <h3 id={titleId} className="ex-title">
            {detail.caseTitle}
          </h3>
        </div>
        <div className="ex-head__actions">
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--small"
            onClick={() => setHelp(true)}
            aria-keyshortcuts="?"
          >
            <Keyboard size={16} aria-hidden="true" />
            <span className="ui-btn__text">{t("execution.shortcuts")}</span>
          </button>
          {onNextItem && (
            <button
              type="button"
              className="ui-btn ui-btn--small"
              onClick={onNextItem}
              data-testid="exec-next-item"
              aria-keyshortcuts="Control+Shift+N"
            >
              <SkipForward size={16} aria-hidden="true" />
              <span className="ui-btn__text">{t("execution.nextItem")}</span>
            </button>
          )}
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--small"
            onClick={onClose}
            aria-label={t("execution.close")}
            title={t("execution.close")}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      {detail.caseChanged && (
        <p className="ex-banner" role="note">
          <AlertTriangle size={16} aria-hidden="true" />
          {t("execution.caseChanged", {
            frozen: detail.frozenRevision ?? "?",
            current: detail.currentRevision ?? "?",
          })}
        </p>
      )}
      {detail.caseDeleted && (
        <p className="ex-banner" role="note">
          <AlertTriangle size={16} aria-hidden="true" />
          {t("execution.caseDeleted")}
        </p>
      )}
      {!editable && (
        <p className="ex-banner ex-banner--info" role="note">
          {t("execution.closedRun")}
        </p>
      )}

      {detail.targets.length > 1 && (
        <nav className="ex-targets" aria-label={t("execution.targets")}>
          <ul>
            {detail.targets.map((x) => {
              const final = attemptsOf(detail.results, x).find((r) => r.isFinal);
              const has = Boolean(drafts[x.key]);
              return (
                <li key={x.key}>
                  <button
                    type="button"
                    className="ex-target"
                    aria-current={x.key === target?.key ? "true" : undefined}
                    onClick={() => {
                      setTargetKey(x.key);
                      setFocus(0);
                    }}
                  >
                    <span className="ex-target__name">
                      {x.flowName ?? t("execution.mainFlow")}
                      {x.exampleRow !== null &&
                        ` · ${t("execution.row", { n: x.exampleRow + 1 })}`}
                    </span>
                    {x.values && <span className="ex-target__row">{rowLabel(x.values)}</span>}
                    <StatusPill tone={final ? statusTone(final.status) : "neutral"} dot>
                      {final
                        ? t(`runs.status.${final.status}`, final.status)
                        : has
                          ? t("execution.inDraft")
                          : t("execution.notRun")}
                    </StatusPill>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {target && (
        <>
          {target.values && (
            <p className="ex-row">
              {t("execution.rowValues", { row: rowLabel(target.values) })}
            </p>
          )}
          <h4 className="ex-subtitle">
            {t("execution.steps")}
            {steps.length > 0 && editable && (
              <span className="tp-field__hint">
                {" "}
                {t("execution.unmarked", { count: left })}
              </span>
            )}
          </h4>
          {steps.length === 0 && <p className="tp-field__hint">{t("execution.noSteps")}</p>}
          <ol className="ex-steps">
            {steps.map((s, i) => {
              const sd = d.steps[s.id];
              const files = draftFiles.filter((a) => a.stepId === s.id);
              const notesOpen = openNotes.has(s.id) || Boolean(sd?.actual);
              return (
                <li
                  key={s.id}
                  ref={(el) => {
                    stepRefs.current[i] = el;
                  }}
                  className="ex-step"
                  data-status={sd?.status}
                  data-focused={i === focus || undefined}
                  tabIndex={i === focus ? 0 : -1}
                  onFocus={(e) => {
                    if (e.target === e.currentTarget) setFocus(i);
                  }}
                  onClick={() => setFocus(i)}
                  aria-label={t("execution.stepLabel", {
                    n: i + 1,
                    text: fill(s.text, target.values),
                    status: sd?.status
                      ? t(`runs.status.${sd.status}`)
                      : t("execution.notMarked"),
                  })}
                >
                  <div className="ex-step__main">
                    <span className="ex-step__n" aria-hidden="true">
                      {i + 1}
                    </span>
                    <div className="ex-step__text">
                      {s.section !== "steps" && (
                        <span className="ex-step__section">
                          {t(`execution.section.${s.section}`)}
                        </span>
                      )}
                      <span>{fill(s.text, target.values)}</span>
                      {s.expected && (
                        <span className="ex-step__expected">
                          {t("execution.expected", { text: fill(s.expected, target.values) })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ex-step__controls">
                    <div
                      className="ex-marks"
                      role="group"
                      aria-label={t("execution.markStep", { n: i + 1 })}
                    >
                      {STEP_STATUSES.map((st) => (
                        <button
                          key={st}
                          type="button"
                          className="ex-mark"
                          data-tone={statusTone(st)}
                          aria-pressed={sd?.status === st}
                          disabled={!editable}
                          tabIndex={i === focus ? 0 : -1}
                          onClick={(e) => {
                            e.stopPropagation();
                            setFocus(i);
                            mark(i, st);
                          }}
                          data-testid={`exec-step-${i + 1}-${TEST_ID[st]}`}
                          aria-keyshortcuts={st[0].toUpperCase()}
                        >
                          {t(`runs.status.${st}`)}
                        </button>
                      ))}
                    </div>
                    <div className="ex-step__tools">
                      <button
                        type="button"
                        className="ui-btn ui-btn--ghost ui-btn--small"
                        tabIndex={i === focus ? 0 : -1}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenNotes((x) => new Set(x).add(s.id));
                          setTimeout(
                            () => document.getElementById(`${uid}-actual-${i}`)?.focus(),
                            0,
                          );
                        }}
                        disabled={!editable && !sd?.actual}
                        data-testid={`exec-step-${i + 1}-notes`}
                      >
                        {t("execution.actual")}
                      </button>
                      {editable && !s.id.startsWith("#") && (
                        <button
                          type="button"
                          className="ui-btn ui-btn--ghost ui-btn--small"
                          tabIndex={i === focus ? 0 : -1}
                          onClick={(e) => {
                            e.stopPropagation();
                            attachFor.current = s.id;
                            fileInput.current?.click();
                          }}
                          data-testid={`exec-step-${i + 1}-attach`}
                        >
                          <Paperclip size={14} aria-hidden="true" />
                          <span className="ui-btn__text">{t("execution.attach")}</span>
                        </button>
                      )}
                      {editable && sd?.status === "failed" && (
                        <button
                          type="button"
                          className="ui-btn ui-btn--ghost ui-btn--small"
                          tabIndex={i === focus ? 0 : -1}
                          onClick={(e) => {
                            e.stopPropagation();
                            void defectFromDraft(s.id);
                          }}
                          disabled={busy}
                          data-testid={`exec-step-${i + 1}-defect`}
                          title={t("execution.defectFromDraftHint")}
                        >
                          <Bug size={14} aria-hidden="true" />
                          <span className="ui-btn__text">
                            {t("execution.saveAndDefect")}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                  {notesOpen && (
                    <div className="ex-step__notes">
                      <label htmlFor={`${uid}-actual-${i}`} className="tp-field__label">
                        {t("execution.actualLabel")}
                      </label>
                      <textarea
                        id={`${uid}-actual-${i}`}
                        rows={2}
                        value={sd?.actual ?? ""}
                        readOnly={!editable}
                        onChange={(e) =>
                          change((x) => ({
                            ...x,
                            steps: {
                              ...x.steps,
                              [s.id]: { ...x.steps[s.id], actual: e.target.value },
                            },
                          }))
                        }
                      />
                    </div>
                  )}
                  {files.length > 0 && (
                    <ul className="ex-files" aria-label={t("execution.stepFiles", { n: i + 1 })}>
                      {files.map((a) => fileChip(a, true))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
          {expected && (
            <p className="ex-expected">{t("execution.flowExpected", { text: fill(expected, target.values) })}</p>
          )}

          {editable && (
            <div className="ex-result" aria-label={t("execution.result")} role="group">
              <div className="ex-result__row">
                <label className="tp-field ex-result__status">
                  <span className="tp-field__label">{t("execution.resultStatus")}</span>
                  <select
                    value={d.status ?? ""}
                    onChange={(e) =>
                      change((x) => ({
                        ...x,
                        status: (e.target.value || undefined) as StepStatus | undefined,
                      }))
                    }
                    data-testid="exec-status"
                  >
                    <option value="">
                      {t("execution.derived", { status: t(`runs.status.${resultStatus(steps, { ...d, status: undefined })}`) })}
                    </option>
                    {STEP_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {t(`runs.status.${st}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="ex-timer" role="timer" aria-live="off">
                  <span className="ex-timer__value">{formatElapsed(elapsedAt(d, new Date()))}</span>
                  <button
                    type="button"
                    className="ui-btn ui-btn--small"
                    onClick={() => change((x) => toggleTimer(x, new Date()))}
                    data-testid="exec-timer"
                    aria-keyshortcuts="T"
                    aria-pressed={running}
                  >
                    {running ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
                    <span className="ui-btn__text">
                      {running ? t("execution.timerPause") : t("execution.timerStart")}
                    </span>
                  </button>
                </div>
              </div>
              <label className="tp-field">
                <span className="tp-field__label">{t("execution.notes")}</span>
                <textarea
                  rows={3}
                  value={d.notes}
                  onChange={(e) => change((x) => ({ ...x, notes: e.target.value }))}
                  data-testid="exec-notes"
                />
              </label>
              <div className="ex-result__files">
                <button
                  type="button"
                  className="ui-btn ui-btn--small"
                  onClick={() => {
                    attachFor.current = null;
                    fileInput.current?.click();
                  }}
                  disabled={busy}
                  data-testid="exec-result-attach"
                >
                  <Paperclip size={14} aria-hidden="true" />
                  <span className="ui-btn__text">{t("execution.attachResult")}</span>
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn--small"
                  onClick={() => {
                    const step = steps[focus];
                    const inStep = stepRefs.current[focus]?.contains(document.activeElement);
                    void pasteFromClipboard(inStep && step && !step.id.startsWith("#") ? step.id : null);
                  }}
                  disabled={busy}
                  data-testid="exec-paste"
                  title={t("execution.pasteHint")}
                >
                  <ClipboardPaste size={14} aria-hidden="true" />
                  <span className="ui-btn__text">{t("execution.paste")}</span>
                </button>
                <span className="tp-field__hint">{t("execution.captureHint")}</span>
              </div>
              {draftFiles.some((a) => !a.stepId) && (
                <ul className="ex-files" aria-label={t("execution.resultFiles")}>
                  {draftFiles.filter((a) => !a.stepId).map((a) => fileChip(a, true))}
                </ul>
              )}
              <div className="ex-result__actions">
                {left > 0 && (
                  <span className="tp-field__hint">{t("execution.unmarkedSaved", { count: left })}</span>
                )}
                <button
                  type="button"
                  className="ui-btn ui-btn--ghost"
                  onClick={() => setDiscarding(true)}
                  disabled={busy || (!draft && draftFiles.length === 0)}
                  data-testid="exec-discard"
                >
                  {t("execution.discard")}
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn--primary"
                  onClick={() => void record()}
                  disabled={busy}
                  data-testid="exec-save"
                  aria-keyshortcuts="Control+Enter"
                >
                  <Save size={16} aria-hidden="true" />
                  <span className="ui-btn__text">
                    {t("execution.save", { status: t(`runs.status.${status}`) })}
                  </span>
                </button>
              </div>
              {draft && (
                <p className="tp-field__hint" aria-live="polite">
                  {t("execution.draftKept")}
                </p>
              )}
            </div>
          )}

          <Attempts
            attempts={attempts}
            files={detail.attachments}
            previews={previews}
            date={date}
            onSaveFile={saveFile}
            onDefect={(r, stepId) => void openDefect(r.id, stepId ?? undefined)}
          />
        </>
      )}

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void attach(files, attachFor.current, false);
        }}
      />
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      {help && <ShortcutsDialog onClose={() => setHelp(false)} />}
      {discarding && (
        <Dialog className="cd" label={t("execution.discardTitle")} onClose={() => setDiscarding(false)}>
          <h3 className="cd__title">{t("execution.discardTitle")}</h3>
          <p className="cd__msg">{t("execution.discardMessage")}</p>
          <div className="cd__actions">
            <button type="button" className="cd__cancel" onClick={() => setDiscarding(false)}>
              {t("common.cancel")}
            </button>
            <button type="button" className="cd__confirm cd__confirm--danger" onClick={() => void discard()}>
              {t("execution.discard")}
            </button>
          </div>
        </Dialog>
      )}
      {defect && (
        <DefectEditor
          projectId={projectId}
          userId={userId}
          defect={null}
          draft={defect.draft}
          fromLabel={defect.label}
          onClose={() => setDefect(null)}
        />
      )}
    </section>
  );
}

/** The recorded attempts of the current target, newest first. */
function Attempts({
  attempts,
  files,
  previews,
  date,
  onSaveFile,
  onDefect,
}: {
  attempts: ResultView[];
  files: ExecutionAttachment[];
  previews: Record<string, string | null>;
  date: (s: string | null) => string;
  onSaveFile: (a: ExecutionAttachment) => Promise<void>;
  onDefect: (r: ResultView, stepId: string | null) => void;
}) {
  const { t } = useTranslation();
  if (attempts.length === 0) return null;
  const list = [...attempts].reverse();
  const filesOf = (ownerIds: string[]) => files.filter((a) => ownerIds.includes(a.ownerId));
  return (
    <section className="ex-attempts" aria-label={t("execution.attempts")}>
      <h4 className="ex-subtitle">{t("execution.attempts")}</h4>
      <ul>
        {list.map((r) => {
          const own = filesOf([r.id, ...r.steps.map((s) => s.id)]);
          const failedStep = r.steps.find((s) => s.status === "failed");
          return (
            <li key={r.id} className="ex-attempt">
              <details>
                <summary className="ex-attempt__head">
                  <span>{t("execution.attemptN", { n: r.attempt + 1 })}</span>
                  <StatusPill tone={statusTone(r.status)} dot>
                    {t(`runs.status.${r.status}`, r.status)}
                  </StatusPill>
                  {r.isFinal && <StatusPill tone="info">{t("execution.final")}</StatusPill>}
                  <span className="tp-field__hint">{date(r.finishedAt ?? r.createdAt)}</span>
                  {r.durationMs !== null && (
                    <span className="tp-field__hint">{formatElapsed(r.durationMs)}</span>
                  )}
                </summary>
                <ol className="ex-attempt__steps">
                  {r.steps.map((s) => (
                    <li key={s.id}>
                      <StatusPill tone={statusTone(s.status)} dot>
                        {t(`runs.status.${s.status}`, s.status)}
                      </StatusPill>{" "}
                      {s.text}
                      {s.actual && <span className="ex-step__expected">{t("execution.got", { text: s.actual })}</span>}
                    </li>
                  ))}
                </ol>
                {typeof r.attributes.notes === "string" && (
                  <p className="ex-attempt__notes">{r.attributes.notes}</p>
                )}
                {own.length > 0 && (
                  <ul className="ex-files">
                    {own.map((a) => (
                      <li key={a.id} className="ex-file">
                        {previews[a.id] ? (
                          <img src={previews[a.id] ?? undefined} alt="" className="ex-file__thumb" />
                        ) : (
                          <Paperclip size={14} aria-hidden="true" />
                        )}
                        <span className="ex-file__name">{a.name}</span>
                        <button
                          type="button"
                          className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--small"
                          onClick={() => void onSaveFile(a)}
                          aria-label={t("execution.saveFile", { name: a.name })}
                          title={t("execution.saveFile", { name: a.name })}
                        >
                          <Download size={14} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </details>
              {(r.status === "failed" || r.status === "blocked") && (
                <button
                  type="button"
                  className="ui-btn ui-btn--small"
                  onClick={() => onDefect(r, failedStep?.stepId ?? null)}
                  data-testid="exec-create-defect"
                >
                  <Bug size={14} aria-hidden="true" />
                  <span className="ui-btn__text">{t("execution.createDefect")}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const rows: [string, string][] = [
    ["P", t("execution.keys.pass")],
    ["F", t("execution.keys.fail")],
    ["B", t("execution.keys.blocked")],
    ["S", t("execution.keys.skip")],
    ["J / ↓", t("execution.keys.next")],
    ["K / ↑", t("execution.keys.prev")],
    ["N", t("execution.keys.notes")],
    ["T", t("execution.keys.timer")],
    ["Ctrl+V", t("execution.keys.paste")],
    ["Ctrl+Enter", t("execution.keys.save")],
    ["Ctrl+Shift+N", t("execution.keys.nextItem")],
    ["?", t("execution.keys.help")],
  ];
  return (
    <Dialog className="cd" label={t("execution.shortcuts")} onClose={onClose}>
      <h3 className="cd__title">{t("execution.shortcuts")}</h3>
      <p className="cd__msg">{t("execution.keysIntro")}</p>
      <dl className="ex-keys">
        {rows.map(([k, v]) => (
          <div key={k} className="ex-keys__row">
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="cd__actions">
        <button type="button" className="cd__confirm" onClick={onClose} autoFocus>
          {t("common.close")}
        </button>
      </div>
    </Dialog>
  );
}

function extOf(mime: string): string {
  if (mime === "image/png") return ".png";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  return "";
}

/** A user-facing message for a refused command. */
function errorText(e: unknown, t: (k: string, o?: Record<string, unknown>) => string): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (raw.startsWith("run-closed")) return t("execution.error.closed");
  if (raw.startsWith("evidence-too-large")) return t("execution.error.tooLarge");
  if (raw.startsWith("draft-too-large")) return t("execution.error.draftTooLarge");
  if (raw.startsWith("target-") || raw.includes("not in that flow"))
    return t("execution.error.target");
  return t("execution.error.generic");
}
