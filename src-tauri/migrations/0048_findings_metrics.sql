-- Findings and metrics of a run (ING-06, ADR-0012, ADR-0053). Both are
-- append-only children of a shard, like results: written once by the
-- importer, never edited, synced as `finding` and `metric`. Their ids are
-- deterministic (`runs/ids.rs`), so the same file gives the same rows on every
-- device. The link to a case is derived when read (`attributes.tags`, ADR-0013).

-- A rule broken at a location (SARIF, axe).
-- id = UUIDv5(NS_FINDING, [shard_id, fingerprint, occurrence]).
CREATE TABLE IF NOT EXISTS findings (
    id            TEXT PRIMARY KEY,
    workspace_id  TEXT NOT NULL,
    project_id    TEXT NOT NULL,
    run_id        TEXT NOT NULL,
    shard_id      TEXT NOT NULL,
    rule_id       TEXT NOT NULL,
    rule_name     TEXT,
    severity      TEXT NOT NULL,                  -- critical | high | medium | low | info
    raw_severity  TEXT,                           -- SARIF level / axe impact as they came
    message       TEXT NOT NULL,
    location      TEXT NOT NULL DEFAULT '{}',     -- JSON: uri, line, column, url, selector, component, html
    fingerprint   TEXT NOT NULL,
    standard_refs TEXT NOT NULL DEFAULT '[]',     -- JSON: ["WCAG2:1.4.3", "CWE:79"]
    help_uri      TEXT,
    attributes    TEXT NOT NULL DEFAULT '{}',     -- JSON: tool, tags, needsReview, suppressed…
    created_by    TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    hlc           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS findings_run_idx ON findings (run_id);
-- «New» (not in the previous run of the tool) and the triage join (ADR-0012).
CREATE INDEX IF NOT EXISTS findings_fp_idx ON findings (project_id, fingerprint);

-- A measured value, with or without a threshold (k6, axe counts).
-- id = UUIDv5(NS_METRIC, [shard_id, name, aggregation, scope]).
CREATE TABLE IF NOT EXISTS metrics (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    project_id   TEXT NOT NULL,
    run_id       TEXT NOT NULL,
    shard_id     TEXT NOT NULL,
    name         TEXT NOT NULL,                   -- http_req_duration, checks, axe.rules_violated
    aggregation  TEXT,                            -- p95 | avg | rate | count | value…
    scope        TEXT,                            -- sub-metric tags, check path, page URL
    value        REAL NOT NULL,
    unit         TEXT,                            -- ms | B | ratio | /s | count
    threshold    TEXT,                            -- the source expression, e.g. "p(95)<500"
    passed       INTEGER,                         -- NULL when there is no threshold
    attributes   TEXT NOT NULL DEFAULT '{}',
    created_by   TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    hlc          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS metrics_run_idx ON metrics (run_id);

-- The triage of a finding (ADR-0012, ADR-0053 as amended): one row per
-- decision, append-only like the findings, keyed by the fingerprint so it
-- holds for that finding in every run of the project. The current state of a
-- fingerprint is its latest event (by HLC, then id), derived when read; the
-- rows are its history. Random ids: two decisions are two facts.
CREATE TABLE IF NOT EXISTS finding_triage (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    project_id   TEXT NOT NULL,
    fingerprint  TEXT NOT NULL,
    state        TEXT NOT NULL,                   -- open | false_positive | accepted_risk | fixed
    reason       TEXT,                            -- required unless open
    defect_id    TEXT,                            -- an optional defect (DEF-01)
    created_by   TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    hlc          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS finding_triage_fp_idx ON finding_triage (project_id, fingerprint, hlc);
