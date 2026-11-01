// Playwright's JSON reporter → Pharos Run JSON (ING-01 §2.5, §3). One result
// per `tests[].results[]` (its `retry` is the attempt), the project name as
// the configuration label. Tags come without `@` and are normalized; the
// `test_id` annotation of the spike's recipe counts as a tag. The `test_key`
// is the spec file + describe titles + the spec title, which is the same key
// the CTRF and JUnit reporters of the same run give.

import {
  type ImportAttachment,
  type ImportResult,
  type InlineBody,
  type ParsedReport,
  type ResultStatus,
  atTag,
  emptyDoc,
  kindOf,
  refMaker,
  relativizer,
  rowOfTitle,
  testKey,
  uniqueTags,
} from "./common";

interface PwAttachment {
  name: string;
  contentType?: string;
  path?: string;
  body?: string;
}
interface PwStep {
  title: string;
  duration?: number;
  error?: { message?: string };
  steps?: PwStep[];
}
interface PwResult {
  retry: number;
  status: string;
  duration?: number;
  startTime?: string;
  error?: { message?: string; stack?: string };
  errors?: { message?: string; stack?: string }[];
  steps?: PwStep[];
  attachments?: PwAttachment[];
  annotations?: { type: string; description?: string }[];
}
interface PwTest {
  projectName?: string;
  projectId?: string;
  status?: string;
  annotations?: { type: string; description?: string }[];
  results: PwResult[];
}
interface PwSpec {
  title: string;
  file: string;
  id?: string;
  line?: number;
  tags?: string[];
  tests: PwTest[];
}
interface PwSuite {
  title: string;
  file?: string;
  specs?: PwSpec[];
  suites?: PwSuite[];
}
interface PwReport {
  config: {
    rootDir?: string;
    argv?: string[];
    version?: string;
    shard?: { current: number; total: number } | null;
    metadata?: Record<string, unknown>;
  };
  suites: PwSuite[];
  stats?: { startTime?: string; duration?: number };
}

const STATUS: Record<string, ResultStatus> = {
  passed: "passed",
  failed: "failed",
  timedOut: "failed",
  skipped: "skipped",
  interrupted: "other",
};

/** Annotations that name the case (`test_id`, the TestRail convention). */
const caseTags = (
  annotations: { type: string; description?: string }[] | undefined,
) =>
  (annotations ?? [])
    .filter((a) => a.type === "test_id" && a.description)
    .map((a) => atTag(a.description!));

export function parsePlaywright(report: PwReport): ParsedReport {
  const doc = emptyDoc("playwright_json");
  const inline = new Map<string, InlineBody>();
  const nextRef = refMaker();
  const shard = report.config.shard;
  if (shard && shard.total > 0)
    Object.assign(doc.shards[0], {
      shardIndex: shard.current,
      shardTotal: shard.total,
    });
  doc.shards[0].formatVersion = report.config.version;
  const started = report.stats?.startTime;
  const duration = report.stats?.duration;
  doc.run = {
    trigger: "import",
    sourceTool: "playwright",
    sourceToolVersion: report.config.version,
    startedAt: started,
    finishedAt:
      started && duration !== undefined
        ? new Date(Date.parse(started) + Math.round(duration)).toISOString()
        : undefined,
    context: {
      ...(report.config.metadata ? { metadata: report.config.metadata } : {}),
      // `merge-reports` writes no argv: the shard is lost (ING-01 §4).
      ...(Array.isArray(report.config.argv) && report.config.argv.length === 0
        ? { merged: true }
        : {}),
    },
  };

  const specs: { spec: PwSpec; titles: string[] }[] = [];
  const walk = (s: PwSuite, titles: string[], top: boolean) => {
    // The top suite of a file is titled with the file: not a describe.
    const here = top ? titles : [...titles, s.title];
    for (const spec of s.specs ?? []) specs.push({ spec, titles: here });
    for (const child of s.suites ?? []) walk(child, here, false);
  };
  for (const s of report.suites) walk(s, [], true);
  const rel = relativizer(report.config.rootDir);
  const attach = (list: PwAttachment[] | undefined): string[] =>
    (list ?? []).flatMap((a) => {
      if (!a.body && !a.path) return [];
      const ref = nextRef();
      const att: ImportAttachment = {
        ref,
        name: a.name,
        contentType: a.contentType,
        kind: kindOf(a.name, a.contentType),
      };
      if (a.body) inline.set(ref, { data: a.body, encoding: "base64" });
      else att.path = a.path;
      doc.attachments.push(att);
      return [ref];
    });
  const stepsOf = (list: PwStep[] | undefined) =>
    (list ?? []).map((st) => ({
      text: st.title,
      status: (st.error ? "failed" : "passed") as ResultStatus,
      ...(st.duration !== undefined && st.duration >= 0
        ? { durationMs: Math.round(st.duration) }
        : {}),
      ...(st.error?.message ? { actual: st.error.message } : {}),
    }));

  for (const { spec, titles } of specs) {
    const path = rel(spec.file);
    const key = testKey(path, [...titles, spec.title]);
    const row = rowOfTitle(spec.title);
    for (const test of spec.tests) {
      const label = test.projectName || undefined;
      const tags = uniqueTags([
        ...(spec.tags ?? []).map(atTag),
        ...caseTags(test.annotations),
      ]);
      for (const r of test.results) {
        const err = r.error ?? r.errors?.[0];
        const refs = attach(r.attachments);
        const isLast = r === test.results[test.results.length - 1];
        doc.results.push({
          name: spec.title,
          status: STATUS[r.status] ?? "other",
          rawStatus: r.status,
          testKey: key,
          filePath: path,
          suite: titles,
          tags: uniqueTags([...tags, ...caseTags(r.annotations)]),
          externalId: spec.id,
          attempt: r.retry,
          ...(label ? { configurationLabel: label } : {}),
          ...(row !== undefined ? { exampleRow: row } : {}),
          ...(r.duration !== undefined ? { duration: r.duration } : {}),
          startedAt: r.startTime,
          finishedAt:
            r.startTime && r.duration !== undefined
              ? new Date(
                  Date.parse(r.startTime) + Math.round(r.duration),
                ).toISOString()
              : undefined,
          ...(err?.message ? { message: err.message } : {}),
          ...(err?.stack ? { trace: err.stack } : {}),
          steps: stepsOf(r.steps),
          shardRef: "s1",
          ...(refs.length ? { attachments: refs } : {}),
          attributes: {
            ...(isLast && test.status === "flaky" ? { flaky: true } : {}),
            ...(test.status ? { outcome: test.status } : {}),
            ...(spec.line ? { line: spec.line } : {}),
          },
        } as ImportResult);
      }
    }
  }
  return {
    format: "playwright_json",
    doc,
    inline,
    warnings: doc.results.length ? [] : [{ code: "no-results" }],
  };
}
