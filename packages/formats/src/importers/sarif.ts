// SARIF 2.1.0 → Pharos Run JSON findings (ING-06, ADR-0053 §7.1): ZAP,
// Semgrep, Trivy, CodeQL, ESLint… A finding per result whose `kind` is a
// problem (`fail`, `open`, `review`) and that is not `absent` from the
// baseline; the rest is counted in a warning. One file is one shard, with as
// many tool runs (`runs[]`) as it carries.

import { derivedFingerprint } from "../ids.js";
import type { PharosFinding } from "../schema.js";
import {
  type ImportWarning,
  type ParsedReport,
  ReportError,
  emptyDoc,
  iso,
  relativizer,
  slashes,
} from "./common.js";
import { type Severity, codeLocationKey, standardRefsOf } from "./findings.js";

type Bag = Record<string, unknown>;

interface Message {
  text?: string;
  markdown?: string;
  id?: string;
  arguments?: string[];
}

interface ToolComponentRef {
  name?: string;
  index?: number;
}

interface Relationship {
  target?: { id?: string; toolComponent?: ToolComponentRef };
}

interface Rule {
  id?: string;
  name?: string;
  shortDescription?: { text?: string };
  helpUri?: string;
  defaultConfiguration?: { level?: string };
  messageStrings?: Record<string, { text?: string }>;
  relationships?: Relationship[];
  properties?: Bag & { tags?: string[] };
}

interface ToolComponent {
  name?: string;
  version?: string;
  semanticVersion?: string;
  rules?: Rule[];
}

interface ArtifactLocation {
  uri?: string;
  uriBaseId?: string;
}

interface Result {
  ruleId?: string;
  ruleIndex?: number;
  rule?: { id?: string; index?: number; toolComponent?: ToolComponentRef };
  kind?: string;
  level?: string;
  message?: Message;
  locations?: {
    physicalLocation?: {
      artifactLocation?: ArtifactLocation;
      region?: { startLine?: number; startColumn?: number; endLine?: number };
    };
    logicalLocations?: { fullyQualifiedName?: string; name?: string }[];
  }[];
  partialFingerprints?: Record<string, string>;
  fingerprints?: Record<string, string>;
  baselineState?: string;
  suppressions?: { status?: string; kind?: string; justification?: string }[];
  rank?: number;
  taxa?: { id?: string; toolComponent?: ToolComponentRef }[];
  webRequest?: { target?: string; method?: string };
  properties?: Bag & { tags?: string[] };
}

interface SarifRun {
  tool?: { driver?: ToolComponent; extensions?: ToolComponent[] };
  results?: Result[];
  originalUriBaseIds?: Record<string, ArtifactLocation>;
  invocations?: {
    executionSuccessful?: boolean;
    startTimeUtc?: string;
    endTimeUtc?: string;
  }[];
  versionControlProvenance?: {
    repositoryUri?: string;
    revisionId?: string;
    branch?: string;
  }[];
  automationDetails?: { id?: string };
}

export interface SarifLog {
  version: string;
  $schema?: string;
  runs: SarifRun[];
}

/** True for a SARIF 2.x log. */
export function isSarif(v: unknown): v is SarifLog {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Partial<SarifLog>;
  return (
    typeof o.version === "string" &&
    o.version.startsWith("2.") &&
    Array.isArray(o.runs) &&
    (typeof o.$schema !== "string" ||
      /sarif/i.test(o.$schema) ||
      o.runs.length > 0)
  );
}

/** SARIF `level` → Pharos severity. */
function severityOfLevel(level: string | undefined): Severity {
  switch (level) {
    case "error":
      return "high";
    case "note":
      return "low";
    case "none":
      return "info";
    default:
      return "medium"; // "warning", SARIF's default for a problem
  }
}

/** GitHub's `security-severity` (a CVSS-like score) → Pharos severity. */
function severityOfScore(score: number): Severity {
  if (score >= 9) return "critical";
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  if (score > 0) return "low";
  return "info";
}

const score = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/** `{0}` placeholders of a SARIF message string filled from `arguments`. */
const fill = (template: string, args: string[] | undefined) =>
  template.replace(/\{(\d+)\}/g, (m, i) => args?.[Number(i)] ?? m);

const PROBLEM_KINDS = new Set(["fail", "open", "review"]);

export function parseSarif(log: SarifLog): ParsedReport {
  if (!isSarif(log)) throw new ReportError("unknown-format");
  const doc = emptyDoc("sarif");
  const warnings: ImportWarning[] = [];
  const rel = relativizer();
  const findings: PharosFinding[] = [];
  const tools: { name?: string; version?: string }[] = [];
  let skipped = 0;
  let started: string | undefined;
  let finished: string | undefined;

  for (const run of log.runs) {
    const driver = run.tool?.driver ?? {};
    const extensions = run.tool?.extensions ?? [];
    const tool = driver.name ?? "sarif";
    tools.push({
      name: driver.name,
      version: driver.semanticVersion ?? driver.version,
    });
    if (run.invocations?.some((i) => i.executionSuccessful === false))
      warnings.push({ code: "tool-failed", detail: tool });
    for (const inv of run.invocations ?? []) {
      if (inv.startTimeUtc && (!started || inv.startTimeUtc < started))
        started = inv.startTimeUtc;
      if (inv.endTimeUtc && (!finished || inv.endTimeUtc > finished))
        finished = inv.endTimeUtc;
    }

    const component = (ref: ToolComponentRef | undefined): ToolComponent =>
      ref?.index !== undefined
        ? (extensions[ref.index] ?? driver)
        : ref?.name
          ? ([driver, ...extensions].find((c) => c.name === ref.name) ?? driver)
          : driver;
    const ruleOf = (r: Result): Rule | undefined => {
      const index = r.rule?.index ?? r.ruleIndex;
      const comp = component(r.rule?.toolComponent);
      if (index !== undefined && comp.rules?.[index]) return comp.rules[index];
      const id = r.rule?.id ?? r.ruleId;
      if (!id) return undefined;
      for (const c of [comp, driver, ...extensions]) {
        const found = c.rules?.find((x) => x.id === id);
        if (found) return found;
      }
      return undefined;
    };

    /** A location URI as a repo-relative path (`%20` decoded, `file://`
     *  and the uriBaseId's absolute root removed). */
    const uriOf = (loc: ArtifactLocation | undefined): string | undefined => {
      if (!loc?.uri) return undefined;
      let uri = loc.uri;
      const base = loc.uriBaseId
        ? run.originalUriBaseIds?.[loc.uriBaseId]?.uri
        : undefined;
      if (base && !/^[a-z][a-z0-9+.-]*:/i.test(uri) && /^file:/i.test(base))
        uri = base + uri;
      if (/^file:/i.test(uri))
        uri = uri.replace(/^file:\/*/i, "/").replace(/^\/([a-z]:)/i, "$1");
      else if (/^[a-z][a-z0-9+.-]*:/i.test(uri)) return uri; // http(s) and the like
      try {
        uri = decodeURIComponent(uri);
      } catch {
        // Keep it as it came.
      }
      return rel(slashes(uri));
    };

    for (const r of run.results ?? []) {
      const kind = r.kind ?? "fail";
      if (!PROBLEM_KINDS.has(kind) || r.baselineState === "absent") {
        skipped++;
        continue;
      }
      const rule = ruleOf(r);
      const ruleId = r.ruleId ?? r.rule?.id ?? rule?.id ?? "unknown-rule";
      const level = r.level ?? rule?.defaultConfiguration?.level;
      const securitySeverity =
        score(r.properties?.["security-severity"]) ??
        score(rule?.properties?.["security-severity"]);
      const severity =
        securitySeverity !== undefined
          ? severityOfScore(securitySeverity)
          : severityOfLevel(level);

      const physical = r.locations?.[0]?.physicalLocation;
      const logical = r.locations?.[0]?.logicalLocations?.[0];
      const uri = uriOf(physical?.artifactLocation);
      const region = physical?.region;
      const location: Bag = {
        ...(uri ? { uri } : {}),
        ...(region?.startLine !== undefined ? { line: region.startLine } : {}),
        ...(region?.startColumn !== undefined
          ? { column: region.startColumn }
          : {}),
        ...(region?.endLine !== undefined ? { endLine: region.endLine } : {}),
        ...(logical
          ? { component: logical.fullyQualifiedName ?? logical.name }
          : {}),
        ...(r.webRequest?.target ? { url: r.webRequest.target } : {}),
      };

      const template = r.message?.id
        ? rule?.messageStrings?.[r.message.id]?.text
        : undefined;
      const message =
        r.message?.text ??
        r.message?.markdown ??
        (template ? fill(template, r.message?.arguments) : undefined) ??
        rule?.shortDescription?.text ??
        ruleId;

      const own = r.partialFingerprints ?? r.fingerprints;
      const key = own ? Object.keys(own).sort()[0] : undefined;
      const fingerprint =
        key !== undefined
          ? `sarif:${tool.toLowerCase()}:${ruleId}:${key}=${own![key]}`
          : derivedFingerprint(
              tool,
              ruleId,
              codeLocationKey(
                uri ?? (location.url as string | undefined),
                region?.startLine,
                region?.startColumn,
              ),
            );

      const tags = [
        ...(rule?.properties?.tags ?? []),
        ...(r.properties?.tags ?? []),
      ];
      const taxa = [
        ...(rule?.relationships ?? []).map((x) => x.target),
        ...(r.taxa ?? []),
      ]
        .filter((t) => t?.id && t.toolComponent?.name)
        .map((t) => `${t!.toolComponent!.name}-${t!.id}`);
      const suppressed =
        (r.suppressions?.length ?? 0) > 0 &&
        r.suppressions!.every(
          (s) => s.status === undefined || s.status === "accepted",
        );

      findings.push({
        ruleId,
        ruleName: rule?.name ?? rule?.shortDescription?.text,
        severity,
        rawSeverity:
          [
            level,
            securitySeverity !== undefined
              ? `security-severity ${securitySeverity}`
              : undefined,
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
        message,
        location,
        fingerprint,
        standardRefs: standardRefsOf([...tags, ...taxa]),
        helpUri: rule?.helpUri,
        attributes: {
          tool,
          kind,
          ...(tags.length ? { tags: [...new Set(tags)] } : {}),
          ...(r.baselineState ? { baselineState: r.baselineState } : {}),
          ...(suppressed ? { suppressed: true } : {}),
          ...(r.rank !== undefined ? { rank: r.rank } : {}),
          ...(run.automationDetails?.id
            ? { automationId: run.automationDetails.id }
            : {}),
        },
        shardRef: "s1",
      });
    }
  }

  if (skipped)
    warnings.push({ code: "sarif-skipped", detail: String(skipped) });
  const vcs = log.runs.find((r) => r.versionControlProvenance?.length)
    ?.versionControlProvenance?.[0];
  const names = tools.map((t) => t.name).filter((n): n is string => !!n);
  doc.run = {
    trigger: "import",
    ...(names.length ? { sourceTool: [...new Set(names)].join(", ") } : {}),
    ...(tools.length === 1 && tools[0].version
      ? { sourceToolVersion: tools[0].version }
      : {}),
    ...(vcs?.revisionId ? { commitSha: vcs.revisionId } : {}),
    ...(vcs?.branch ? { branch: vcs.branch } : {}),
    ...(vcs?.repositoryUri ? { repositoryUrl: vcs.repositoryUri } : {}),
    ...(started ? { startedAt: iso(started) } : {}),
    ...(finished ? { finishedAt: iso(finished) } : {}),
    context: { tools },
  };
  doc.shards = [{ ...doc.shards[0], formatVersion: log.version }];
  doc.findings = findings;
  return { format: "sarif", doc, inline: new Map(), warnings };
}
