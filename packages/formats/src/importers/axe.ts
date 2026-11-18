// axe-core results → Pharos Run JSON findings and metrics (ING-06,
// ADR-0053 §7.2). Input: the object `axe.run()` resolves to (what
// @axe-core/playwright and the other integrations write), or an array of them
// (one per page, as @axe-core/cli writes). A finding per violated node;
// `incomplete` nodes are findings «to review» (`info`, `needsReview`) that do
// not count as open; `passes`/`inapplicable` only give per-page counts.

import { derivedFingerprint } from "../ids.js";
import type { PharosFinding, PharosMetric } from "../schema.js";
import { type ParsedReport, ReportError, emptyDoc, iso } from "./common.js";
import {
  severityOfImpact,
  standardRefsOf,
  wcagLevelOf,
  webLocationKey,
} from "./findings.js";

/** A selector of a node: an array of strings, where an inner array walks
 *  into shadow roots (axe's `target`). */
type Target = (string | string[])[];

interface AxeNode {
  html?: string;
  target?: Target;
  impact?: string | null;
  failureSummary?: string;
}

interface AxeRule {
  id: string;
  impact?: string | null;
  tags?: string[];
  description?: string;
  help?: string;
  helpUrl?: string;
  nodes?: AxeNode[];
}

export interface AxeResults {
  testEngine: { name: string; version?: string };
  testRunner?: { name?: string };
  testEnvironment?: Record<string, unknown>;
  timestamp?: string;
  url?: string;
  violations: AxeRule[];
  passes?: AxeRule[];
  incomplete?: AxeRule[];
  inapplicable?: AxeRule[];
}

/** True for one axe-core results object. */
export function isAxeResults(v: unknown): v is AxeResults {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Partial<AxeResults>;
  return o.testEngine?.name === "axe-core" && Array.isArray(o.violations);
}

/** `#a >> .b`, with `>>>` between the levels of a shadow-DOM path. */
const selectorOf = (target: Target | undefined) =>
  (target ?? [])
    .map((t) => (Array.isArray(t) ? t.join(" >>> ") : t))
    .join(" >> ");

export function parseAxe(input: AxeResults | AxeResults[]): ParsedReport {
  const pages = Array.isArray(input) ? input : [input];
  if (!pages.length || !pages.every(isAxeResults))
    throw new ReportError("unknown-format");

  const doc = emptyDoc("axe");
  const findings: PharosFinding[] = [];
  const metrics: PharosMetric[] = [];
  const version = pages[0].testEngine.version;
  const times = pages
    .map((p) => p.timestamp)
    .filter((t): t is string => !!t)
    .sort();

  for (const page of pages) {
    const url = page.url;
    const add = (rule: AxeRule, node: AxeNode, review: boolean) => {
      const impact = node.impact ?? rule.impact ?? null;
      const selector = selectorOf(node.target);
      const tags = rule.tags ?? [];
      const level = wcagLevelOf(tags);
      findings.push({
        ruleId: rule.id,
        ruleName: rule.help || undefined,
        severity: review ? "info" : severityOfImpact(impact),
        rawSeverity: impact ?? undefined,
        message:
          node.failureSummary || rule.description || rule.help || rule.id,
        location: {
          ...(url ? { url } : {}),
          ...(selector ? { selector } : {}),
          ...(node.html ? { html: node.html } : {}),
        },
        fingerprint: derivedFingerprint(
          "axe-core",
          rule.id,
          webLocationKey(url, selector),
        ),
        standardRefs: standardRefsOf(tags),
        helpUri: rule.helpUrl || undefined,
        attributes: {
          tool: "axe-core",
          axeResult: review ? "incomplete" : "violation",
          tags,
          ...(level ? { wcagLevel: level } : {}),
          ...(tags.includes("best-practice") ? { bestPractice: true } : {}),
          ...(review ? { needsReview: true } : {}),
        },
        shardRef: "s1",
      });
    };
    for (const rule of page.violations)
      for (const node of rule.nodes ?? []) add(rule, node, false);
    for (const rule of page.incomplete ?? [])
      for (const node of rule.nodes ?? []) add(rule, node, true);

    const counts: [string, AxeRule[] | undefined][] = [
      ["axe.rules_violated", page.violations],
      ["axe.rules_incomplete", page.incomplete],
      ["axe.rules_passed", page.passes],
    ];
    for (const [name, list] of counts) {
      metrics.push({
        name,
        aggregation: "count",
        ...(url ? { scope: url } : {}),
        value: list?.length ?? 0,
        unit: "count",
        shardRef: "s1",
      });
    }
  }

  doc.run = {
    trigger: "import",
    sourceTool: "axe-core",
    ...(version ? { sourceToolVersion: version } : {}),
    ...(times.length
      ? { startedAt: iso(times[0]), finishedAt: iso(times[times.length - 1]) }
      : {}),
    context: {
      pages: pages.map((p) => p.url ?? null),
      testRunner: pages[0].testRunner?.name,
      testEnvironment: pages[0].testEnvironment,
    },
  };
  doc.shards = [
    { ...doc.shards[0], ...(version ? { formatVersion: version } : {}) },
  ];
  doc.findings = findings;
  doc.metrics = metrics;
  return { format: "axe", doc, inline: new Map(), warnings: [] };
}
