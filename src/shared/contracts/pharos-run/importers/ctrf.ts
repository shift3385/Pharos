// CTRF (specVersion 0.x) → Pharos Run JSON (ING-01 §2.6, §3). A CTRF test
// is already a valid Pharos result; this adds the identity: `test_key` from
// the relative spec path (`suite[0]` before the absolute `filePath`), the
// rest of `suite[]` and `name`, and one result per attempt: `retryAttempts[]`
// (1-based) are the earlier ones, the test itself is attempt `retries`.

import {
  type ImportAttachment,
  type ImportResult,
  type ParsedReport,
  type ResultStatus,
  emptyDoc,
  isAbsolute,
  iso,
  kindOf,
  refMaker,
  relativizer,
  rowOfTitle,
  shardOf,
  slashes,
  testKey,
  uniqueTags,
} from "./common";

type CtrfAttachment = { name?: string; contentType?: string; path?: string };
interface CtrfAttempt {
  attempt?: number;
  status?: string;
  duration?: number;
  start?: number;
  stop?: number;
  message?: string;
  trace?: string;
  attachments?: CtrfAttachment[];
}
interface CtrfTest extends CtrfAttempt {
  name: string;
  testId?: string;
  rawStatus?: string;
  tags?: string[];
  suite?: string | string[];
  filePath?: string;
  retries?: number;
  flaky?: boolean;
  browser?: string;
  device?: string;
  steps?: { name: string; status: string }[];
  retryAttempts?: CtrfAttempt[];
  [k: string]: unknown;
}
interface Ctrf {
  reportFormat: "CTRF";
  specVersion?: string;
  generatedBy?: string;
  timestamp?: string;
  results: {
    tool?: { name?: string; version?: string };
    summary?: { start?: number; stop?: number };
    environment?: Record<string, string | undefined>;
    tests: CtrfTest[];
  };
}

const STATUSES: ResultStatus[] = [
  "passed",
  "failed",
  "skipped",
  "pending",
  "other",
];
const status = (s: string | undefined): ResultStatus =>
  STATUSES.includes(s as ResultStatus) ? (s as ResultStatus) : "other";

/** A suite name that is a spec file (`features\auth.feature.spec.js`). */
const looksLikeFile = (s: string) => /\.[a-z0-9]{1,8}$/i.test(s);

export function parseCtrf(report: Ctrf): ParsedReport {
  const doc = emptyDoc("ctrf");
  const nextRef = refMaker();
  const r = report.results;
  const env = r.environment ?? {};
  doc.shards[0].formatVersion = report.specVersion;
  const shard = shardOf(env.shardId);
  if (shard) Object.assign(doc.shards[0], shard);
  doc.run = {
    trigger: "import",
    sourceTool: r.tool?.name ?? report.generatedBy,
    sourceToolVersion: r.tool?.version,
    startedAt: iso(r.summary?.start) ?? report.timestamp,
    finishedAt: iso(r.summary?.stop),
    environment: env.testEnvironment,
    build: env.buildNumber ?? env.buildName,
    commitSha: env.commit,
    branch: env.branchName,
    repositoryUrl: env.repositoryUrl,
    ciUrl: env.buildUrl,
    context: { generatedBy: report.generatedBy, environment: env },
  };
  const suites = (t: CtrfTest) =>
    Array.isArray(t.suite) ? t.suite : t.suite ? t.suite.split(" > ") : [];
  // The spec path: the relative `suite[0]` playwright reporters write, else
  // `filePath` (absolute in the samples: relativized for the whole file).
  const pathOf = (t: CtrfTest): { path?: string; titles: string[] } => {
    const s = suites(t);
    if (s.length && looksLikeFile(s[0]) && !isAbsolute(slashes(s[0])))
      return { path: slashes(s[0]), titles: s.slice(1) };
    return { path: t.filePath, titles: s };
  };
  const rel = relativizer(r.tests.flatMap((t) => pathOf(t).path ?? []));
  const attach = (list: CtrfAttachment[] | undefined): string[] =>
    (list ?? []).flatMap((a) => {
      if (!a.path && !a.name) return [];
      const ref = nextRef();
      const name = a.name || a.path?.split(/[\\/]/).pop() || "attachment";
      const att: ImportAttachment = {
        ref,
        name,
        contentType: a.contentType,
        kind: kindOf(name, a.contentType),
      };
      if (a.path) att.path = a.path;
      doc.attachments.push(att);
      return [ref];
    });

  for (const t of r.tests) {
    const { path, titles } = pathOf(t);
    const p = path ? rel(path) : undefined;
    const key = testKey(p, [...titles, t.name]);
    const row = rowOfTitle(t.name);
    const label = t.browser ?? t.device;
    const common: Partial<ImportResult> = {
      testKey: key,
      ...(p ? { filePath: p } : {}),
      suite: titles,
      tags: uniqueTags(t.tags ?? []),
      externalId: t.testId,
      ...(row !== undefined ? { exampleRow: row } : {}),
      ...(label ? { configurationLabel: label } : {}),
      shardRef: "s1",
    };
    const earlier = [...(t.retryAttempts ?? [])].sort(
      (a, b) => (a.attempt ?? 0) - (b.attempt ?? 0),
    );
    earlier.forEach((a, i) => {
      const refs = attach(a.attachments);
      doc.results.push({
        ...common,
        name: t.name,
        status: status(a.status),
        rawStatus: a.status,
        attempt: a.attempt !== undefined && a.attempt >= 1 ? a.attempt - 1 : i,
        ...(a.duration !== undefined ? { duration: a.duration } : {}),
        startedAt: iso(a.start),
        finishedAt: iso(a.stop),
        ...(a.message ? { message: a.message } : {}),
        ...(a.trace ? { trace: a.trace } : {}),
        ...(refs.length ? { attachments: refs } : {}),
      } as ImportResult);
    });
    const refs = attach(t.attachments);
    const final = t.retries ?? earlier.length;
    doc.results.push({
      ...common,
      name: t.name,
      status: status(t.status),
      rawStatus: t.rawStatus ?? t.status,
      attempt: Math.max(final, earlier.length),
      ...(t.duration !== undefined ? { duration: t.duration } : {}),
      startedAt: iso(t.start),
      finishedAt: iso(t.stop),
      ...(t.message ? { message: t.message } : {}),
      ...(t.trace ? { trace: t.trace } : {}),
      steps: (t.steps ?? []).map((s) => ({
        text: s.name,
        status: status(s.status),
      })),
      ...(refs.length ? { attachments: refs } : {}),
      attributes: {
        ...(t.flaky !== undefined ? { flaky: t.flaky } : {}),
        ...(t.type ? { type: t.type } : {}),
      },
    } as ImportResult);
  }
  const warnings: ParsedReport["warnings"] = [];
  if (!doc.results.length) warnings.push({ code: "no-results" });
  return { format: "ctrf", doc, inline: new Map(), warnings };
}
