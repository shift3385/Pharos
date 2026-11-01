import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ReportImportOutcome,
  ReportImportPreview,
  Run,
} from "@shared/contracts/contract";
import { Dialog } from "@shared/ui/Dialog";
import { FormField } from "@shared/ui/FormField";
import { SegmentedControl } from "@shared/ui/SegmentedControl";
import { runsApi } from "../api/runsApi";
import {
  type AttachResult,
  attachAll,
  buildRequest,
  readReport,
  type ReadReport,
} from "../model/importFlow";
import { importErrorKey } from "../model/importErrors";
import "@shared/ui/ConfirmDialog.css";
import "@shared/ui/buttons.css";
import "./Runs.css";

const SHOWN_WARNINGS = 8;

type Step = "form" | "importing" | "done";

/** «Importar informe» (ING-02..05). No design in docs/rediseno for it: built
 *  with the existing dialog, field and segmented primitives. Choose the file
 *  (and, for reports that point at files, the folder with them), the run
 *  (new, or an open one of the project) and the shard; the preview says what
 *  will link before anything is written. */
export function ImportReportDialog({
  projectId,
  userId,
  runs,
  onClose,
  onImported,
}: {
  projectId: string;
  userId: string;
  runs: Run[];
  onClose: () => void;
  onImported: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const openRuns = runs.filter((r) => r.status === "in_progress");
  const [report, setReport] = useState<ReadReport | null>(null);
  const [reading, setReading] = useState(false);
  const [folder, setFolder] = useState<File[]>([]);
  const [kind, setKind] = useState<"new" | "existing">("new");
  const [runId, setRunId] = useState(openRuns[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [environment, setEnvironment] = useState("");
  const [build, setBuild] = useState("");
  const [commit, setCommit] = useState("");
  const [branch, setBranch] = useState("");
  const [keepOpen, setKeepOpen] = useState(false);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [preview, setPreview] = useState<ReportImportPreview | null>(null);
  const [error, setError] = useState<{ key: string; detail?: string } | null>(
    null,
  );
  const [step, setStep] = useState<Step>("form");
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [outcome, setOutcome] = useState<{
    result: ReportImportOutcome;
    attach: AttachResult;
  } | null>(null);

  const target = () =>
    kind === "new"
      ? {
          kind: "new" as const,
          run: {
            title: title.trim() || undefined,
            environment: environment.trim() || undefined,
            build: build.trim() || undefined,
            commitSha: commit.trim() || undefined,
            branch: branch.trim() || undefined,
            keepOpen,
          },
        }
      : { kind: "existing" as const, runId };
  const request = (r: ReadReport) =>
    buildRequest(projectId, userId, r, target(), allowDuplicate);

  async function pick(file: File | undefined) {
    setPreview(null);
    setError(null);
    setReport(null);
    if (!file) return;
    setReading(true);
    try {
      const r = await readReport(file);
      setReport(r);
      const run = r.parsed.doc.run;
      setTitle(
        (prev) =>
          prev || [run.sourceTool, file.name].filter(Boolean).join(" · "),
      );
      setBuild((prev) => prev || (run.build ?? ""));
      setCommit((prev) => prev || (run.commitSha ?? ""));
      setBranch((prev) => prev || (run.branch ?? ""));
      setEnvironment((prev) => prev || (run.environment ?? ""));
    } catch (e) {
      setError(importErrorKey(e));
    } finally {
      setReading(false);
    }
  }

  // The preview follows the file and the target run.
  useEffect(() => {
    if (!report || (kind === "existing" && !runId)) return;
    let live = true;
    runsApi
      .preview(request(report))
      .then((p) => live && (setPreview(p), setError(null)))
      .catch((e) => live && (setPreview(null), setError(importErrorKey(e))));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, kind, runId]);

  async function confirm() {
    if (!report) return;
    setStep("importing");
    setError(null);
    try {
      const result = await runsApi.importReport(request(report), report.file);
      setProgress({ done: 0, total: result.attachments.length });
      const attach = await attachAll(
        report,
        result,
        folder,
        userId,
        (done, total) => setProgress({ done, total }),
      );
      setOutcome({ result, attach });
      setStep("done");
      onImported();
    } catch (e) {
      setError(importErrorKey(e));
      setStep("form");
    }
  }

  const duplicateInNew = kind === "new" && Boolean(preview?.duplicateOf);
  const duplicateInRun = kind === "existing" && Boolean(preview?.duplicateOf);
  const canImport =
    step === "form" &&
    !!report &&
    !!preview &&
    (kind === "new" || !!runId) &&
    (!duplicateInNew || allowDuplicate);
  const needsFolder = report?.parsed.doc.attachments.some(
    (a) => a.path && !report.parsed.inline.has(a.ref),
  );

  return (
    <Dialog
      className="cd rn-modal"
      labelledBy={`${id}-title`}
      onClose={onClose}
      dismissable={step !== "importing"}
    >
      <h3 id={`${id}-title`} className="cd__title">
        {t("runs.import.title")}
      </h3>

      {step === "done" && outcome ? (
        <div className="rn-done" role="status">
          <p className="cd__msg">
            {outcome.result.alreadyImported
              ? t("runs.import.done.already", { run: outcome.result.runKey })
              : t("runs.import.done.summary", {
                  run: outcome.result.runKey,
                  count: outcome.result.results,
                  unlinked: outcome.result.unlinked,
                })}
          </p>
          {outcome.attach.attached > 0 && (
            <p className="tp-field__hint">
              {t("runs.import.done.attached", {
                count: outcome.attach.attached,
              })}
            </p>
          )}
          {outcome.attach.missing.length > 0 && (
            <p className="rn-warn">
              {t("runs.import.done.missing", {
                count: outcome.attach.missing.length,
              })}
            </p>
          )}
          {outcome.attach.failed > 0 && (
            <p className="rn-warn">
              {t("runs.import.done.failed", { count: outcome.attach.failed })}
            </p>
          )}
          <div className="cd__actions">
            <button type="button" className="cd__confirm" onClick={onClose}>
              {t("common.close")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="cd__msg">{t("runs.import.intro")}</p>
          <div className="rn-form">
            <FormField
              label={t("runs.import.file")}
              hint={t("runs.import.fileHint")}
              required
            >
              {(p) => (
                <input
                  {...p}
                  type="file"
                  accept=".json,.ndjson,.jsonl,.xml,application/json,application/xml,text/xml"
                  disabled={step !== "form"}
                  onChange={(e) => void pick(e.target.files?.[0])}
                />
              )}
            </FormField>
            {reading && (
              <p className="tp-field__hint">{t("runs.import.reading")}</p>
            )}
            {report && (
              <p className="tp-field__hint">
                {t(`runs.format.${report.parsed.format}`)} ·{" "}
                {t("runs.import.parsed", {
                  count: report.parsed.doc.results.length,
                })}
              </p>
            )}
            {needsFolder && (
              <FormField
                label={t("runs.import.folder")}
                hint={t("runs.import.folderHint")}
              >
                {(p) => (
                  <input
                    {...p}
                    type="file"
                    multiple
                    // Not in React's types: lets the user pick a whole folder.
                    {...{ webkitdirectory: "" }}
                    disabled={step !== "form"}
                    onChange={(e) =>
                      setFolder(Array.from(e.target.files ?? []))
                    }
                  />
                )}
              </FormField>
            )}

            <SegmentedControl
              label={t("runs.import.target")}
              value={kind}
              onChange={setKind}
              options={[
                { value: "new", label: t("runs.import.newRun") },
                {
                  value: "existing",
                  label: t("runs.import.existingRun"),
                  disabled: openRuns.length === 0,
                  title:
                    openRuns.length === 0
                      ? t("runs.import.noOpenRuns")
                      : undefined,
                },
              ]}
            />

            {kind === "new" ? (
              <div className="rn-grid">
                <FormField
                  label={t("runs.field.title")}
                  className="tp-field rn-grid__wide"
                >
                  {(p) => (
                    <input
                      {...p}
                      value={title}
                      maxLength={500}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  )}
                </FormField>
                <FormField label={t("runs.field.environment")}>
                  {(p) => (
                    <input
                      {...p}
                      value={environment}
                      onChange={(e) => setEnvironment(e.target.value)}
                    />
                  )}
                </FormField>
                <FormField label={t("runs.field.build")}>
                  {(p) => (
                    <input
                      {...p}
                      value={build}
                      onChange={(e) => setBuild(e.target.value)}
                    />
                  )}
                </FormField>
                <FormField label={t("runs.field.commit")}>
                  {(p) => (
                    <input
                      {...p}
                      className="rn-mono"
                      value={commit}
                      onChange={(e) => setCommit(e.target.value)}
                    />
                  )}
                </FormField>
                <FormField label={t("runs.field.branch")}>
                  {(p) => (
                    <input
                      {...p}
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                    />
                  )}
                </FormField>
                <label className="rn-check rn-grid__wide">
                  <input
                    type="checkbox"
                    checked={keepOpen}
                    onChange={(e) => setKeepOpen(e.target.checked)}
                  />
                  {t("runs.import.keepOpen")}
                </label>
              </div>
            ) : (
              <FormField label={t("runs.import.run")}>
                {(p) => (
                  <select
                    {...p}
                    value={runId}
                    onChange={(e) => setRunId(e.target.value)}
                  >
                    {openRuns.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.runKey} · {r.title}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            )}

            {/* The shard is part of the report (immutable, ADR-0013): it is
                shown, never edited. */}
            {report?.parsed.doc.shards[0]?.shardIndex !== undefined && (
              <p className="tp-field__hint">
                {t("runs.import.shard", {
                  index: report.parsed.doc.shards[0].shardIndex,
                  total: report.parsed.doc.shards[0].shardTotal,
                })}
              </p>
            )}
          </div>

          {preview && (
            <section
              className="rn-preview"
              aria-label={t("runs.import.preview")}
            >
              <p className="cd__msg">
                {t("runs.import.previewSummary", {
                  tests: preview.tests,
                  results: preview.results,
                  linked: preview.linked,
                  unlinked: preview.unlinked,
                })}
              </p>
              <p className="tp-field__hint">
                {Object.entries(preview.statuses)
                  .map(([s, n]) => `${t(`runs.status.${s}`)}: ${n}`)
                  .join(" · ")}
                {preview.attachments > 0 &&
                  ` · ${t("runs.import.attachments", { count: preview.attachments })}`}
              </p>
              {report?.parsed.warnings.map((w) => (
                <p key={w.code} className="rn-warn">
                  {t(`runs.import.warning.${w.code}`)}
                </p>
              ))}
              {preview.warnings.length > 0 && (
                <ul
                  className="rn-warnings"
                  aria-label={t("runs.import.warnings", {
                    count: preview.warnings.length,
                  })}
                >
                  {preview.warnings.slice(0, SHOWN_WARNINGS).map((w, i) => (
                    <li key={i} className="rn-warn">
                      <span className="sr-only">
                        {t("validation.severity.warning")}:{" "}
                      </span>
                      {t(`runs.import.warning.${w.code}`, {
                        detail: w.detail ?? "",
                      })}
                      {w.testKey && (
                        <span className="rn-mono rn-key"> {w.testKey}</span>
                      )}
                    </li>
                  ))}
                  {preview.warnings.length > SHOWN_WARNINGS && (
                    <li className="tp-field__hint">
                      {t("runs.import.moreWarnings", {
                        count: preview.warnings.length - SHOWN_WARNINGS,
                      })}
                    </li>
                  )}
                </ul>
              )}
              {duplicateInRun && (
                <p className="cd__msg" role="status">
                  {t("runs.import.alreadyInRun", { run: preview.duplicateOf })}
                </p>
              )}
              {duplicateInNew && (
                <label className="rn-check rn-warn">
                  <input
                    type="checkbox"
                    checked={allowDuplicate}
                    onChange={(e) => setAllowDuplicate(e.target.checked)}
                  />
                  {t("runs.import.duplicate", { run: preview.duplicateOf })}
                </label>
              )}
            </section>
          )}

          {error && (
            <p className="rn-error" role="alert">
              {t(error.key, { detail: error.detail ?? "" })}
            </p>
          )}
          {step === "importing" && (
            <p className="tp-field__hint" role="status">
              {progress
                ? t("runs.import.attaching", {
                    done: progress.done,
                    total: progress.total,
                  })
                : t("runs.import.importing")}
            </p>
          )}

          <div className="cd__actions">
            <button
              type="button"
              className="cd__cancel"
              onClick={onClose}
              disabled={step === "importing"}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="cd__confirm"
              disabled={!canImport}
              onClick={() => void confirm()}
            >
              {duplicateInRun
                ? t("runs.import.completeAttachments")
                : t("runs.import.confirm")}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
