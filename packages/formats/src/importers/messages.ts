// Cucumber Messages (NDJSON) → Pharos Run JSON (ING-01 §2.3, §3). Tolerant by
// field: cucumber-js 13 writes protocol 34.x and playwright-bdd 9 writes 32.x
// (R5). One result per `testCaseStarted` (attempt 0, 1, …); a pickle's id,
// its test case's id and its `uri` are not stable between runs, so the
// `test_key` is the normalized `uri` + pickle name + Outline row.

import type * as M from "@cucumber/messages";
import {
  type ImportResult,
  type InlineBody,
  type ParsedReport,
  type ResultStatus,
  emptyDoc,
  iso,
  kindOf,
  refMaker,
  relativizer,
  testKey,
  uniqueTags,
  worst,
} from "./common";

type Step = NonNullable<ImportResult["steps"]>[number];

const STATUS: Record<string, ResultStatus> = {
  PASSED: "passed",
  FAILED: "failed",
  SKIPPED: "skipped",
  PENDING: "pending",
  UNDEFINED: "other",
  AMBIGUOUS: "other",
  UNKNOWN: "other",
};

const ms = (d?: { seconds: number; nanos: number }) =>
  d ? Math.round(Number(d.seconds) * 1000 + Number(d.nanos) / 1e6) : undefined;
const at = (t?: { seconds: number; nanos: number }) => iso(ms(t));

/** Collects envelopes (`push`, one parsed line each) and builds the document
 *  at the end (`finish`): references point both ways, so nothing can be
 *  emitted before the whole stream is read. */
export class MessagesCollector {
  private meta?: M.Meta;
  private runStarted?: M.TestRunStarted;
  private runFinished?: M.TestRunFinished;
  /** Gherkin step and row nodes by AST id; Outline rows with their index. */
  private astSteps = new Map<string, { keyword: string; line: number }>();
  private astRows = new Map<string, number>();
  private pickles = new Map<string, M.Pickle>();
  private testCases = new Map<string, M.TestCase>();
  private started: M.TestCaseStarted[] = [];
  private finished = new Map<string, M.TestCaseFinished>();
  private stepsDone = new Map<string, Map<string, M.TestStepFinished>>();
  private attachments: M.Attachment[] = [];
  envelopes = 0;

  push(e: M.Envelope): void {
    this.envelopes++;
    if (e.meta) this.meta = e.meta;
    else if (e.gherkinDocument) this.gherkin(e.gherkinDocument);
    else if (e.pickle) this.pickles.set(e.pickle.id, e.pickle);
    else if (e.testCase) this.testCases.set(e.testCase.id, e.testCase);
    else if (e.testCaseStarted) this.started.push(e.testCaseStarted);
    else if (e.testCaseFinished)
      this.finished.set(
        e.testCaseFinished.testCaseStartedId,
        e.testCaseFinished,
      );
    else if (e.testStepFinished) {
      const f = e.testStepFinished;
      const byStep = this.stepsDone.get(f.testCaseStartedId) ?? new Map();
      byStep.set(f.testStepId, f);
      this.stepsDone.set(f.testCaseStartedId, byStep);
    } else if (e.attachment) this.attachments.push(e.attachment);
    else if (e.testRunStarted) this.runStarted = e.testRunStarted;
    else if (e.testRunFinished) this.runFinished = e.testRunFinished;
  }

  private gherkin(doc: M.GherkinDocument): void {
    const scenario = (s: M.Scenario) => {
      for (const st of s.steps)
        this.astSteps.set(st.id, {
          keyword: st.keyword.trim(),
          line: st.location.line,
        });
      // The row index counts across the Examples blocks of the Outline.
      let n = 0;
      for (const ex of s.examples)
        for (const row of ex.tableBody) this.astRows.set(row.id, n++);
    };
    const background = (b: M.Background) => {
      for (const st of b.steps)
        this.astSteps.set(st.id, {
          keyword: st.keyword.trim(),
          line: st.location.line,
        });
    };
    const children = (list: readonly (M.FeatureChild | M.RuleChild)[]) => {
      for (const c of list) {
        if (c.scenario) scenario(c.scenario);
        if (c.background) background(c.background);
        if ("rule" in c && c.rule) children(c.rule.children);
      }
    };
    if (doc.feature) children(doc.feature.children);
  }

  finish(): ParsedReport {
    const doc = emptyDoc("cucumber_messages");
    const inline = new Map<string, InlineBody>();
    const nextRef = refMaker();
    const meta = this.meta;
    doc.shards[0].formatVersion = meta?.protocolVersion;
    doc.run = {
      trigger: "import",
      sourceTool: meta?.implementation?.name,
      sourceToolVersion: meta?.implementation?.version,
      startedAt: at(this.runStarted?.timestamp),
      finishedAt: at(this.runFinished?.timestamp),
      context: {
        protocolVersion: meta?.protocolVersion,
        os: meta?.os?.name,
        runtime: meta?.runtime
          ? `${meta.runtime.name} ${meta.runtime.version ?? ""}`.trim()
          : undefined,
      },
    };
    const rel = relativizer();
    // Attachments of an attempt, by test step (a hook's go to the result).
    const attachmentsOf = new Map<string, M.Attachment[]>();
    for (const a of this.attachments) {
      if (!a.testCaseStartedId) continue;
      const list = attachmentsOf.get(a.testCaseStartedId) ?? [];
      list.push(a);
      attachmentsOf.set(a.testCaseStartedId, list);
    }
    // Attachments sent by URL (newer protocols): kept as a path, never
    // downloaded; the preview says so.
    let byUrl = 0;
    const addAttachment = (a: M.Attachment): string | undefined => {
      const ref = nextRef();
      const name = a.fileName || a.mediaType || "attachment";
      if (a.body !== undefined && a.body !== "") {
        inline.set(ref, {
          data: a.body,
          encoding: String(a.contentEncoding) === "BASE64" ? "base64" : "text",
        });
      } else if (!a.url) return undefined;
      else byUrl++;
      doc.attachments.push({
        ref,
        name,
        contentType: a.mediaType,
        kind: kindOf(name, a.mediaType),
        ...(a.url && !a.body ? { path: a.url } : {}),
      });
      return ref;
    };

    for (const tcs of this.started) {
      const tc = this.testCases.get(tcs.testCaseId);
      const pickle = tc && this.pickles.get(tc.pickleId);
      if (!tc || !pickle) continue;
      const done =
        this.stepsDone.get(tcs.id) ?? new Map<string, M.TestStepFinished>();
      const pickleSteps = new Map(pickle.steps.map((s) => [s.id, s]));
      const steps: Step[] = [];
      const stepRef = new Map<string, Step>();
      const statuses: ResultStatus[] = [];
      let hookFailed: M.TestStepResult | undefined;
      let failure: M.TestStepResult | undefined;
      let duration = 0;
      for (const ts of tc.testSteps) {
        const result = done.get(ts.id)?.testStepResult;
        const d = ms(result?.duration);
        if (d !== undefined) duration += d;
        if (ts.hookId || !ts.pickleStepId) {
          // Hooks never decide the status (R4: playwright-bdd reports its
          // "After Hooks" as SKIPPED on a passing retry), unless one failed.
          if (result && String(result.status) === "FAILED")
            hookFailed ??= result;
          continue;
        }
        const ps = pickleSteps.get(ts.pickleStepId);
        if (!ps) continue;
        const status = STATUS[String(result?.status ?? "UNKNOWN")] ?? "other";
        statuses.push(status);
        if (status === "failed") failure ??= result;
        const ast = this.astSteps.get(ps.astNodeIds[0] ?? "");
        const step: Step = {
          text: ps.text,
          status,
          ...(ast ? { keyword: ast.keyword, gherkinLine: ast.line } : {}),
          ...(d !== undefined ? { durationMs: d } : {}),
          ...(status === "failed" && result?.message
            ? { actual: result.message }
            : {}),
        };
        steps.push(step);
        stepRef.set(ts.id, step);
      }
      const finished = this.finished.get(tcs.id);
      const status: ResultStatus = hookFailed
        ? "failed"
        : (worst(statuses) ?? "passed");
      const err = failure ?? hookFailed;
      const rowNode = pickle.astNodeIds[1];
      const row = rowNode !== undefined ? this.astRows.get(rowNode) : undefined;
      const resultRefs: string[] = [];
      for (const a of attachmentsOf.get(tcs.id) ?? []) {
        const ref = addAttachment(a);
        if (!ref) continue;
        const step = a.testStepId ? stepRef.get(a.testStepId) : undefined;
        if (step) (step.attachments ??= []).push(ref);
        else resultRefs.push(ref);
      }
      const rawStatus = hookFailed
        ? "FAILED"
        : String(
            tc.testSteps
              .filter((s) => s.pickleStepId && !s.hookId)
              .map((s) => done.get(s.id)?.testStepResult.status)
              .find((s) => s !== undefined && STATUS[String(s)] === status) ??
              "PASSED",
          );
      doc.results.push({
        name: pickle.name,
        status,
        rawStatus,
        testKey: testKey(rel(pickle.uri), [pickle.name], row),
        filePath: rel(pickle.uri),
        tags: uniqueTags(pickle.tags.map((t) => t.name)),
        attempt: tcs.attempt,
        externalId: tc.id,
        ...(row !== undefined ? { exampleRow: row } : {}),
        startedAt: at(tcs.timestamp),
        finishedAt: at(finished?.timestamp),
        duration,
        ...(err?.message
          ? {
              message: err.exception?.message ?? err.message.split("\n")[0],
              trace: err.message,
            }
          : {}),
        steps,
        shardRef: "s1",
        ...(resultRefs.length ? { attachments: resultRefs } : {}),
        attributes: {
          willBeRetried: finished?.willBeRetried ?? false,
          gherkinLine: pickle.location?.line,
        },
      });
    }
    return {
      format: "cucumber_messages",
      doc,
      inline,
      warnings: [
        ...(doc.results.length ? [] : [{ code: "no-results" as const }]),
        ...(byUrl
          ? [{ code: "attachment-url" as const, detail: String(byUrl) }]
          : []),
      ],
    };
  }
}

/** Parses a whole NDJSON text (tests and small files). */
export function parseMessages(text: string): ParsedReport {
  const c = new MessagesCollector();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) c.push(JSON.parse(trimmed) as M.Envelope);
  }
  return c.finish();
}
