import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  deviceKind,
  diffRows,
  elementName,
  fieldKey,
  filtersFromParams,
  filtersToParams,
  lineDiff,
  parseActor,
  periodBounds,
  summaryEntries,
  toQuery,
  valueLines,
} from "./audit";

describe("audit filters in the URL (AUD-01)", () => {
  it("defaults to the last 30 days and leaves defaults out of the URL", () => {
    const f = filtersFromParams(new URLSearchParams("tab=audit"));
    expect(f).toMatchObject({ period: "30d", actors: [], page: 1, search: "" });
    expect(filtersToParams(f).toString()).toBe("tab=audit");
    expect(activeFilterCount(f)).toBe(0);
  });

  it("round-trips every filter, and drops bad values", () => {
    const url = "tab=audit&period=custom&from=2026-11-01&to=2026-11-12&actor=user%3Au1&actor=agent%3Aa&entity=test_case&action=update&project=p1&q=ATS&element=c1&page=3";
    const f = filtersFromParams(new URLSearchParams(url));
    expect(f).toEqual({
      period: "custom",
      from: "2026-11-01",
      to: "2026-11-12",
      actors: ["user:u1", "agent:a"],
      entities: ["test_case"],
      actions: ["update"],
      projects: ["p1"],
      search: "ATS",
      entityId: "c1",
      page: 3,
    });
    expect(filtersToParams(f).toString()).toBe(url);
    expect(activeFilterCount(f)).toBe(7);
    const bad = filtersFromParams(new URLSearchParams("period=year&from=ayer&page=-2"));
    expect(bad).toMatchObject({ period: "30d", from: "", page: 1 });
  });

  it("turns a period into UTC bounds from the viewer's days", () => {
    const now = new Date(2026, 10, 12, 15, 30);
    expect(periodBounds({ period: "today", from: "", to: "" }, now)).toEqual({ from: new Date(2026, 10, 12).toISOString() });
    expect(periodBounds({ period: "7d", from: "", to: "" }, now)).toEqual({ from: new Date(2026, 10, 6).toISOString() });
    expect(periodBounds({ period: "30d", from: "", to: "" }, now)).toEqual({ from: new Date(2026, 9, 14).toISOString() });
    expect(periodBounds({ period: "all", from: "", to: "" }, now)).toEqual({});
    // The custom end day is included.
    expect(periodBounds({ period: "custom", from: "2026-11-01", to: "2026-11-02" }, now)).toEqual({
      from: new Date(2026, 10, 1).toISOString(),
      to: new Date(2026, 10, 3).toISOString(),
    });
    const q = toQuery({ ...filtersFromParams(new URLSearchParams("page=2&q=%20")), period: "all" }, now);
    expect(q).toMatchObject({ offset: 50, limit: 50, search: undefined, entityId: undefined });
  });
});

describe("audit actors, devices and changes", () => {
  it("parses every kind of actor", () => {
    expect(parseActor("user:u1")).toEqual({ kind: "user", id: "u1" });
    expect(parseActor("agent:planner-01")).toEqual({ kind: "agent", id: "planner-01" });
    expect(parseActor("system:sync")).toEqual({ kind: "system", id: "sync" });
    expect(parseActor("ci:t1")).toEqual({ kind: "ci", id: "t1" });
    expect(parseActor("robot")).toEqual({ kind: "other", id: "robot" });
  });

  it("tells this device, the web and other devices apart", () => {
    expect(deviceKind("d1", "d1")).toBe("this");
    expect(deviceKind("web", "d1")).toBe("web");
    expect(deviceKind("d2", "d1")).toBe("other");
  });

  it("reads the field diff and the summary, and survives bad JSON", () => {
    expect(diffRows('{"status":["draft","ready"],"tags":[[],["sso"]]}')).toEqual([
      { field: "status", before: "draft", after: "ready" },
      { field: "tags", before: [], after: ["sso"] },
    ]);
    expect(diffRows(null)).toEqual([]);
    expect(diffRows("not json")).toEqual([]);
    expect(summaryEntries('{"created":42,"updated":3}')).toEqual([
      ["created", 42],
      ["updated", 3],
    ]);
  });

  it("compares long values line by line", () => {
    expect(valueLines([{ id: "s1", text: "Open", expected: "Shown" }, "Close"])).toEqual(["Open → Shown", "Close"]);
    expect(valueLines({ a: 1 })).toEqual(['{"a":1}']);
    expect(valueLines(null)).toEqual([]);
    const d = lineDiff(["Open", "Enter"], ["Open", "Enter with SSO", "Accept"]);
    expect(d.before).toEqual([
      { text: "Open", changed: false },
      { text: "Enter", changed: true },
    ]);
    expect(d.after.map((l) => l.changed)).toEqual([false, true, true]);
  });
});

describe("audit element names and field keys (AUD-01 polish)", () => {
  const base = {
    id: "e",
    at: "2026-11-12T10:00:00.000Z",
    actor: "user:u",
    onBehalfOf: null,
    action: "create",
    entity: "project",
    entityId: "p1",
    entityKey: null,
    projectId: "p1",
    projectName: "Avianca",
    deviceId: "d",
    changes: null,
    summary: null,
    chainWorkspaceId: "w",
    chainOwner: "u",
    chainSeq: 1,
    prevHash: null,
    hash: "h",
    redactedAt: null,
  };

  it("names an element by its key, its title or name, or its project", () => {
    expect(elementName({ ...base, entityKey: "ATS_014" })).toBe("ATS_014");
    expect(elementName({ ...base, entity: "test_plan", changes: '{"title":[null,"Plan Q4"]}' })).toBe("Plan Q4");
    // A delete keeps the name it had.
    expect(elementName({ ...base, entity: "custom_field", changes: '{"name":["Canal",null]}' })).toBe("Canal");
    expect(elementName({ ...base, entity: "custom_field", changes: '{"label":[null,"Canal"]}' })).toBe("Canal");
    expect(elementName(base)).toBe("Avianca");
    expect(elementName({ ...base, entity: "run", projectName: "Avianca" })).toBeNull();
  });

  it("labels a first-level data field like the field itself", () => {
    expect(fieldKey("data.aiProvenance")).toBe("aiProvenance");
    expect(fieldKey("title")).toBe("title");
  });
});
