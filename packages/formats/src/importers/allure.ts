// Allure 2 results (`allure-results`: allure-playwright, allure-js,
// allure-java, allure-pytest… — Allure 3 reads the same files) → Pharos Run
// JSON (ING-07, plan F §7.4). Not one file but a folder: the caller gives
// its files already read (a folder on the desktop, the entries of a `.zip`
// elsewhere), so this package needs no zip reader.
//
// - `*-result.json`: one attempt each. Attempts of one test share their
//   `historyId`, ordered by `start`; the last one is final. A passed final
//   attempt after a failed one is flaky.
// - Key: the spec file when `fullName` starts with one (allure-playwright),
//   else the `package` label (`.` → `/`) or `testClass`; titles: the
//   `parentSuite`/`suite`/`subSuite` labels that do not repeat the path, and
//   the name. allure-playwright gives the key of the Playwright JSON reporter.
// - Tags: `tag`, `AS_ID`/`ALLURE_ID` labels and the `tms` links, as `@…`.
// - Parameters (not `excluded`) go to `attributes.parameters`; the same
//   test case with different values is a row.
// - `*-container.json`: a failed `befores`/`afters` fixture fails its
//   children, as a failed hook in Cucumber Messages.
// - `environment.properties` and `executor.json` → `run.context`.

import {
  type ImportAttachment,
  type ImportResult,
  type InlineBody,
  type ParsedReport,
  type ResultStatus,
  ReportError,
  atTag,
  emptyDoc,
  iso,
  kindOf,
  refMaker,
  slashes,
  testKey,
  uniqueTags,
} from "./common.js";

/** A file of an `allure-results` folder: JSON and properties as text,
 *  attachments as text or base64. */
export interface AllureFile {
  /** The name inside the folder (a path in a zip: only its last part counts). */
  name: string;
  text?: string;
  base64?: string;
}

interface Label {
  name?: string;
  value?: string;
}
interface Link {
  name?: string;
  url?: string;
  type?: string;
}
interface Parameter {
  name?: string;
  value?: string;
  excluded?: boolean;
}
interface Attachment {
  name?: string;
  source?: string;
  type?: string;
}
interface StatusDetails {
  message?: string;
  trace?: string;
  flaky?: boolean;
}
interface Step {
  name?: string;
  status?: string;
  start?: number;
  stop?: number;
  statusDetails?: StatusDetails;
  steps?: Step[];
  attachments?: Attachment[];
}
interface AllureResult extends Step {
  uuid?: string;
  historyId?: string;
  testCaseId?: string;
  fullName?: string;
  labels?: Label[];
  links?: Link[];
  parameters?: Parameter[];
}
interface Container {
  children?: string[];
  befores?: Step[];
  afters?: Step[];
}

const STATUS: Record<string, ResultStatus> = {
  passed: "passed",
  failed: "failed",
  broken: "failed",
  skipped: "skipped",
};
const HOOKS = new Set(["Before Hooks", "After Hooks"]);
const FILE = /^[^\s›]+\.(?:[cm]?[jt]sx?|py|rb|java|kt|cs|go|php|feature)$/i;
const SEP = " › ";

const base = (name: string) => slashes(name).split("/").pop() ?? name;

/** Files of a folder read as text (the rest, as base64): the results,
 *  containers and properties, and text attachments. */
export const isAllureTextFile = (name: string) =>
  /\.(?:json|properties|txt|md|csv|xml|html?|log|ya?ml)$/i.test(name);

/** True when the files look like an `allure-results` folder. */
export function isAllureResults(files: AllureFile[]): boolean {
  return files.some((f) => base(f.name).endsWith("-result.json"));
}

/** `key=value` lines (`#` comments), as Java properties without escapes. */
function properties(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("!")) continue;
    const m = /^([^=:]+?)\s*[=:]\s*(.*)$/.exec(t);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

export function parseAllure(files: AllureFile[]): ParsedReport {
  const byName = new Map(files.map((f) => [base(f.name), f]));
  const json = <T>(f: AllureFile): T => {
    try {
      return JSON.parse((f.text ?? "").replace(/^\uFEFF/, "")) as T;
    } catch (e) {
      throw new ReportError("invalid-json", `${base(f.name)}: ${e instanceof Error ? e.message : ""}`);
    }
  };
  const results = files.filter((f) => base(f.name).endsWith("-result.json")).map((f) => json<AllureResult>(f));
  if (!results.length) throw new ReportError("unknown-format");
  const containers = files.filter((f) => base(f.name).endsWith("-container.json")).map((f) => json<Container>(f));

  const doc = emptyDoc("allure");
  const inline = new Map<string, InlineBody>();
  const nextRef = refMaker();

  // Run context: the environment and the executor.
  const context: Record<string, unknown> = {};
  const env = byName.get("environment.properties");
  if (env?.text) context.environment = properties(env.text);
  const executor = byName.get("executor.json");
  if (executor?.text) {
    const e = json<Record<string, unknown>>(executor);
    for (const k of ["name", "type", "buildName", "buildUrl", "reportUrl"])
      if (typeof e[k] === "string") context[`executor${k[0].toUpperCase()}${k.slice(1)}`] = e[k];
  }
  const label = (r: AllureResult, name: string) => r.labels?.find((l) => l.name === name)?.value;
  const labels = (r: AllureResult, name: string) =>
    (r.labels ?? []).filter((l) => l.name === name && l.value).map((l) => l.value!);
  const starts = results.map((r) => r.start).filter((s): s is number => typeof s === "number");
  doc.run = {
    trigger: "import",
    sourceTool: results.map((r) => label(r, "framework")).find(Boolean) ?? "allure",
    ...(starts.length ? { startedAt: iso(Math.min(...starts)) } : {}),
    context,
  };

  // A failed fixture fails its children.
  const fixtureFailure = new Map<string, Step>();
  for (const c of containers)
    for (const fx of [...(c.befores ?? []), ...(c.afters ?? [])])
      if (fx.status === "failed" || fx.status === "broken")
        for (const child of c.children ?? []) if (!fixtureFailure.has(child)) fixtureFailure.set(child, fx);

  const attach = (list: Attachment[] | undefined): string[] =>
    (list ?? []).flatMap((a) => {
      if (!a.source) return [];
      const ref = nextRef();
      const name = a.name || a.source;
      const att: ImportAttachment = { ref, name, kind: kindOf(name, a.type) };
      if (a.type) att.contentType = a.type;
      const file = byName.get(a.source);
      if (file?.base64 !== undefined) inline.set(ref, { data: file.base64, encoding: "base64" });
      else if (file?.text !== undefined) inline.set(ref, { data: file.text, encoding: "text" });
      else att.path = a.source;
      doc.attachments.push(att);
      return [ref];
    });
  /** Every attachment of a step tree, in order. */
  const allAttachments = (s: Step): Attachment[] => [
    ...(s.attachments ?? []),
    ...(s.steps ?? []).flatMap(allAttachments),
  ];
  const stepsOf = (r: AllureResult) =>
    (r.steps ?? [])
      // allure-playwright wraps hooks and writes attachments as steps
      // without a status: neither is a step of the test.
      .filter((s) => s.status && s.name && !(HOOKS.has(s.name) && s.status === "passed"))
      .map((s) => ({
        text: s.name!,
        status: STATUS[s.status!] ?? "other",
        ...(typeof s.start === "number" && typeof s.stop === "number" && s.stop >= s.start
          ? { durationMs: s.stop - s.start }
          : {}),
        ...(s.statusDetails?.message ? { actual: s.statusDetails.message } : {}),
      }));

  /** The test's path and titles (see the header). */
  const where = (r: AllureResult): { path: string; titles: string[] } => {
    const head = (r.fullName ?? "").split(SEP)[0].split(":")[0];
    const pkg = label(r, "package");
    const path = FILE.test(head)
      ? slashes(head)
      : pkg
        ? pkg.replace(/\./g, "/")
        : (label(r, "testClass") ?? "");
    const suites = ["parentSuite", "suite", "subSuite"]
      .map((n) => label(r, n) ?? "")
      .filter((s) => s && s !== path && s !== base(path) && s !== pkg);
    return { path, titles: [...suites, r.name ?? ""] };
  };
  const paramsOf = (r: AllureResult) =>
    (r.parameters ?? []).filter((p) => !p.excluded && p.name).map((p) => [p.name!, p.value ?? ""] as const);
  const signature = (r: AllureResult) => JSON.stringify([...paramsOf(r)].sort());

  // Rows: one test case run with different parameter values.
  const signatures = new Map<string, Set<string>>();
  for (const r of results) {
    const id = r.testCaseId ?? r.fullName ?? r.name ?? "";
    signatures.set(id, (signatures.get(id) ?? new Set()).add(signature(r)));
  }
  const rowOf = (r: AllureResult): number | undefined => {
    const all = [...(signatures.get(r.testCaseId ?? r.fullName ?? r.name ?? "") ?? [])].sort();
    return all.length > 1 ? all.indexOf(signature(r)) : undefined;
  };

  // Attempts: by historyId, ordered by start.
  const groups = new Map<string, AllureResult[]>();
  for (const r of results) {
    const id = r.historyId ?? `${r.testCaseId ?? r.fullName ?? r.name}${signature(r)}`;
    groups.set(id, [...(groups.get(id) ?? []), r]);
  }
  const ordered = [...groups.values()].map((g) =>
    g.sort((a, b) => (a.start ?? 0) - (b.start ?? 0) || (a.uuid ?? "").localeCompare(b.uuid ?? "")),
  );
  ordered.sort((a, b) => (a[0].start ?? 0) - (b[0].start ?? 0) || (a[0].uuid ?? "").localeCompare(b[0].uuid ?? ""));

  for (const attempts of ordered) {
    attempts.forEach((r, attempt) => {
      const { path, titles } = where(r);
      const row = rowOf(r);
      const fixture = r.uuid ? fixtureFailure.get(r.uuid) : undefined;
      const raw = r.status ?? "unknown";
      let status = STATUS[raw] ?? "other";
      if (fixture && status !== "failed") status = "failed";
      const details = fixture?.statusDetails?.message ? fixture.statusDetails : r.statusDetails;
      const tags = uniqueTags(
        [
          ...labels(r, "tag"),
          ...labels(r, "AS_ID"),
          ...labels(r, "ALLURE_ID"),
          ...(r.links ?? [])
            .filter((l) => l.type === "tms")
            .map((l) => l.name || (l.url && !l.url.includes("://") ? l.url : (l.url ?? "").split("/").pop()) || ""),
        ]
          .filter(Boolean)
          .map(atTag),
      );
      const isLast = attempt === attempts.length - 1;
      const flaky =
        r.statusDetails?.flaky === true ||
        (isLast && status === "passed" && attempts.slice(0, -1).some((a) => STATUS[a.status ?? ""] === "failed"));
      const params = paramsOf(r);
      const refs = attach([...(r.attachments ?? []), ...(r.steps ?? []).flatMap(allAttachments)]);
      const steps = stepsOf(r);
      const attributes: Record<string, unknown> = {};
      if (flaky) attributes.flaky = true;
      if (params.length) attributes.parameters = Object.fromEntries(params);
      if (fixture) attributes.failedFixture = fixture.name ?? "";
      if (r.fullName) attributes.fullName = r.fullName;
      doc.results.push({
        name: r.name || titles[titles.length - 1] || "test",
        testKey: testKey(path || undefined, titles, row),
        ...(FILE.test(path.split("/").pop() ?? "") ? { filePath: path } : {}),
        suite: titles.slice(0, -1),
        tags,
        ...(row !== undefined ? { exampleRow: row } : {}),
        status,
        rawStatus: raw,
        attempt,
        ...(r.historyId ? { externalId: r.historyId } : {}),
        ...(typeof r.start === "number" ? { startedAt: iso(r.start) } : {}),
        ...(typeof r.stop === "number" ? { finishedAt: iso(r.stop) } : {}),
        ...(typeof r.start === "number" && typeof r.stop === "number" && r.stop >= r.start
          ? { duration: r.stop - r.start }
          : {}),
        ...(details?.message ? { message: details.message } : {}),
        ...(details?.trace ? { trace: details.trace } : {}),
        ...(steps.length ? { steps } : {}),
        ...(refs.length ? { attachments: refs } : {}),
        shardRef: "s1",
        attributes,
      } as ImportResult);
    });
  }
  return { format: "allure", doc, inline, warnings: [] };
}
