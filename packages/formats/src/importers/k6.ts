// k6 end-of-test summary → Pharos Run JSON metrics (ING-06, ADR-0053 §7.3).
// Two shapes: the `data` of `handleSummary` (`JSON.stringify(data)`: each
// metric has `type`, `contains`, `values` and `thresholds: {expr: {ok}}`)
// and `--summary-export` (the legacy flat shape: the values beside a
// `thresholds: {expr: boolean}` map). A metric per metric × aggregation; a
// threshold goes on the aggregation it names; each check is a `checks` rate.

import type { PharosMetric } from "../schema.js";
import {
  type ImportWarning,
  type ParsedReport,
  ReportError,
  emptyDoc,
} from "./common.js";

type Values = Record<string, unknown>;

interface Metric {
  type?: "trend" | "counter" | "rate" | "gauge";
  contains?: "time" | "data" | "default";
  values?: Values;
  thresholds?: Record<string, { ok?: boolean } | boolean>;
  [aggregation: string]: unknown;
}

interface Check {
  name?: string;
  path?: string;
  passes?: number;
  fails?: number;
}

interface Group {
  name?: string;
  path?: string;
  groups?: Group[] | Record<string, Group>;
  checks?: Check[] | Record<string, Check>;
}

export interface K6Summary {
  metrics: Record<string, Metric>;
  root_group: Group;
  state?: { testRunDurationMs?: number; isStdOutTTY?: boolean };
  options?: { summaryTrendStats?: string[] };
}

/** True for a k6 summary in either shape. */
export function isK6Summary(v: unknown): v is K6Summary {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Partial<K6Summary>;
  return (
    !!o.metrics &&
    typeof o.metrics === "object" &&
    !!o.root_group &&
    typeof o.root_group === "object"
  );
}

const LEGACY_FAILED_MEANS = true; // see the README of fixtures/k6: checked on a real export

/** k6's built-in metrics measured in time or bytes, for the legacy shape,
 *  which does not say what a metric contains. */
const TIME =
  /^(http_req_(duration|blocked|connecting|tls_handshaking|sending|waiting|receiving)|iteration_duration|group_duration|ws_(connecting|session_duration|ping)|grpc_req_duration|browser_.*)$/;
const DATA = /^data_(sent|received)$/;

/** `p(95)` → `p95`, `p(99.9)` → `p99.9`; other keys as they are. */
const aggregationOf = (key: string) =>
  key.replace(/^p\((\d+(?:\.\d+)?)\)$/, "p$1");

/** The aggregation a threshold expression tests (`p(95)<500` → `p(95)`). */
const thresholdKey = (expr: string) =>
  /^\s*(avg|min|max|med|count|rate|value|p\(\d+(?:\.\d+)?\))\s*(?:[<>=!]=?=?)/.exec(
    expr,
  )?.[1];

const asList = <T>(v: T[] | Record<string, T> | undefined): T[] =>
  Array.isArray(v) ? v : v ? Object.values(v) : [];

/** `name{tag:value,…}` → base name and the tag part as the scope. */
function split(full: string): { name: string; scope?: string } {
  const m = /^([^{]+)\{(.*)\}$/.exec(full);
  return m ? { name: m[1], scope: m[2] } : { name: full };
}

/** `@TC-12` style tags of a check name or a `case` sub-metric tag: kept for
 *  the persister, which links them with the project's prefix (ING-01 §5). */
function tagsOf(scope: string | undefined, label?: string): string[] {
  const out = new Set<string>();
  for (const part of (scope ?? "").split(",")) {
    const m = /^\s*case\s*:\s*(.+?)\s*$/i.exec(part);
    if (m) out.add(m[1].startsWith("@") ? m[1] : `@${m[1]}`);
  }
  for (const m of (label ?? "").matchAll(/(^|\s)(@[\w.-]+)/g)) out.add(m[2]);
  return [...out];
}

export function parseK6(summary: K6Summary): ParsedReport {
  if (!isK6Summary(summary)) throw new ReportError("unknown-format");
  const doc = emptyDoc("k6");
  const warnings: ImportWarning[] = [];
  const metrics: PharosMetric[] = [];
  const legacy = Object.values(summary.metrics).every(
    (m) => !m || m.values === undefined,
  );

  for (const full of Object.keys(summary.metrics).sort()) {
    const m = summary.metrics[full];
    if (!m || typeof m !== "object") continue;
    const values: Values = legacy
      ? Object.fromEntries(
          Object.entries(m).filter(([k]) => k !== "thresholds"),
        )
      : (m.values ?? {});
    const { name, scope } = split(full);
    const type =
      m.type ??
      ("avg" in values || "med" in values
        ? "trend"
        : "count" in values
          ? "counter"
          : "passes" in values || "fails" in values
            ? "rate"
            : "gauge");
    const contains =
      m.contains ??
      (TIME.test(name) ? "time" : DATA.test(name) ? "data" : "default");

    // The aggregations each type reports, in a stable order.
    let keys: string[];
    if (type === "trend")
      keys = Object.keys(values).filter((k) => typeof values[k] === "number");
    else if (type === "counter")
      keys = ["count", "rate"].filter((k) => k in values);
    else if (type === "rate")
      keys = [legacy ? "value" : "rate"].filter((k) => k in values);
    else keys = ["value", "min", "max"].filter((k) => k in values);

    const unitOf = (key: string): string | undefined => {
      if (type === "rate") return "ratio";
      if (type === "counter" && key === "rate") return "/s";
      if (type === "counter") return contains === "data" ? "B" : undefined;
      return contains === "time" ? "ms" : contains === "data" ? "B" : undefined;
    };

    // Thresholds by the aggregation they test.
    const thresholds = new Map<string, { expr: string; passed: boolean }[]>();
    for (const [expr, raw] of Object.entries(m.thresholds ?? {})) {
      let key = thresholdKey(expr);
      if (type === "rate" && (key === "rate" || key === "value")) key = keys[0];
      if (!key) continue;
      const passed =
        typeof raw === "boolean"
          ? LEGACY_FAILED_MEANS
            ? !raw
            : raw
          : raw?.ok !== false;
      const list = thresholds.get(key) ?? [];
      list.push({ expr, passed });
      thresholds.set(key, list);
    }
    for (const [key, list] of thresholds) {
      if (!keys.includes(key)) {
        warnings.push({
          code: "threshold-without-value",
          detail: `${full}: ${list.map((t) => t.expr).join(", ")}`,
        });
      }
    }

    const tags = tagsOf(scope);
    for (const key of keys) {
      const value = values[key];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const own = thresholds.get(key) ?? [];
      const passes = type === "rate" ? values.passes : undefined;
      const fails = type === "rate" ? values.fails : undefined;
      metrics.push({
        name,
        aggregation: aggregationOf(key),
        ...(scope ? { scope } : {}),
        value,
        ...(unitOf(key) ? { unit: unitOf(key) } : {}),
        ...(own.length
          ? {
              threshold: own.map((t) => t.expr).join(" && "),
              passed: own.every((t) => t.passed),
            }
          : {}),
        attributes: {
          type,
          ...(own.length > 1 ? { thresholds: own } : {}),
          ...(typeof passes === "number" ? { passes } : {}),
          ...(typeof fails === "number" ? { fails } : {}),
          ...(tags.length ? { tags } : {}),
        },
        shardRef: "s1",
      });
    }
    // A threshold on an aggregation the summary does not carry stays on the
    // metric's first aggregation, so the result is not lost.
    const orphan = [...thresholds]
      .filter(([key]) => !keys.includes(key))
      .flatMap(([, l]) => l);
    if (orphan.length) {
      const first = metrics.find(
        (x) => x.name === name && (x.scope ?? "") === (scope ?? ""),
      );
      if (first)
        first.attributes = {
          ...first.attributes,
          thresholdsWithoutValue: orphan,
        };
    }
  }

  // Checks: one rate per check, by group path.
  const walk = (g: Group) => {
    for (const c of asList(g.checks)) {
      const passes = c.passes ?? 0;
      const fails = c.fails ?? 0;
      const tags = tagsOf(undefined, c.name);
      metrics.push({
        name: "checks",
        aggregation: "rate",
        scope: c.path ?? `${g.path ?? ""}::${c.name ?? ""}`,
        value: passes + fails ? passes / (passes + fails) : 0,
        unit: "ratio",
        attributes: {
          check: c.name,
          group: g.path ?? "",
          passes,
          fails,
          ...(tags.length ? { tags } : {}),
        },
        shardRef: "s1",
      });
    }
    for (const sub of asList(g.groups)) walk(sub);
  };
  walk(summary.root_group);

  doc.run = {
    trigger: "import",
    sourceTool: "k6",
    context: {
      summaryFormat: legacy ? "summary-export" : "handleSummary",
      ...(summary.state?.testRunDurationMs !== undefined
        ? { durationMs: summary.state.testRunDurationMs }
        : {}),
      ...(summary.options?.summaryTrendStats
        ? { summaryTrendStats: summary.options.summaryTrendStats }
        : {}),
    },
  };
  doc.metrics = metrics;
  return { format: "k6", doc, inline: new Map(), warnings };
}
