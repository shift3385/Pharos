import { describe, expect, it } from "vitest";
import {
  changesText,
  groupHistory,
  historyTable,
  localStamp,
  planSaves,
  type PlanSave,
} from "./planHistory";
import type { PlanHistoryEvent, PlanHistorySource } from "../model/types";

const t = (key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}:${JSON.stringify(opts)}` : key;
const UTC = "UTC";
const ANA = "u-ana";
const LUIS = "u-luis";

/** An update event of `who` at `at` (UTC) with the given changes. */
const update = (
  who: string,
  at: string,
  changes: PlanHistoryEvent["changes"],
): PlanHistoryEvent => ({
  at,
  actor: `user:${who}`,
  action: "update",
  changes,
});
const create = (
  who: string,
  at: string,
  status = "draft",
): PlanHistoryEvent => ({
  at,
  actor: `user:${who}`,
  action: "create",
  changes: {
    title: [null, "Plan"],
    version: [null, "1.0"],
    status: [null, status],
    "data.summary": [null, "s"],
  },
});
const source = (
  events: PlanHistoryEvent[],
  extra: Partial<PlanHistorySource> = {},
): PlanHistorySource => ({
  createdAt: events[0]?.at ?? "2026-11-01T08:00:00.000Z",
  createdBy: ANA,
  events,
  revisions: [],
  ...extra,
});
const current = { title: "Plan", data: {} };
const rows = (s: PlanHistorySource, tz = UTC) =>
  groupHistory(planSaves(s, current), tz);

describe("revision history of the exported plan (PLN-02)", () => {
  it("joins the saves of one person on one day into their last one", () => {
    const r = rows(
      source([
        create(ANA, "2026-11-05T09:00:00.000Z"),
        update(ANA, "2026-11-05T10:00:00.000Z", {
          version: ["1.0", "1.1"],
          "data.scopeIn": [[], ["a"]],
        }),
        update(ANA, "2026-11-05T16:00:00.000Z", {
          version: ["1.1", "1.2"],
          "data.risks": [[], [{}]],
        }),
      ]),
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      actor: ANA,
      day: "2026-11-05",
      version: "1.2",
      status: "draft",
      created: true,
    });
    expect(r[0].at.toISOString()).toBe("2026-11-05T16:00:00.000Z");
    expect(r[0].sections).toEqual(["scope", "risks"]);
    expect(changesText(r[0], t)).toBe(
      "testPlan.history.created, testPlan.step.scope, testPlan.step.risks",
    );
  });

  it("orders interleaved people by the time of each one's last save", () => {
    // Ana 10:00, Luis 12:00, Ana 15:00 → Luis (12:00), then Ana (15:00).
    const r = rows(
      source([
        create(ANA, "2026-11-04T08:00:00.000Z"),
        update(ANA, "2026-11-05T10:00:00.000Z", {
          version: ["1.0", "1.1"],
          "data.summary": ["s", "t"],
        }),
        update(LUIS, "2026-11-05T12:00:00.000Z", {
          version: ["1.1", "1.2"],
          "data.sprints": [[], [{}]],
        }),
        update(ANA, "2026-11-05T15:00:00.000Z", {
          version: ["1.2", "1.3"],
          "data.roles": [[], [{}]],
        }),
      ]),
    );
    const day = r.filter((x) => x.day === "2026-11-05");
    expect(
      day.map((x) => [x.actor, localStamp(x.at, UTC).time, x.version]),
    ).toEqual([
      [LUIS, "12:00", "1.2"],
      [ANA, "15:00", "1.3"],
    ]);
    // Ana's row has everything she changed that day, also before Luis.
    expect(day[1].sections).toEqual(["summary", "roles"]);
    expect(r[0].day).toBe("2026-11-04");
  });

  it("starts a new row when the day changes, in the exporter's time zone", () => {
    const s = source([
      create(ANA, "2026-11-05T22:00:00.000Z"),
      update(ANA, "2026-11-06T03:00:00.000Z", {
        version: ["1.0", "1.1"],
        "data.purpose": ["", "p"],
      }),
    ]);
    // UTC: two days. Bogotá (UTC−5): both saves on 5 November.
    expect(rows(s, UTC).map((x) => x.day)).toEqual([
      "2026-11-05",
      "2026-11-06",
    ]);
    expect(rows(s, "America/Bogota").map((x) => [x.day, x.version])).toEqual([
      ["2026-11-05", "1.1"],
    ]);
  });

  it("leaves out saves that changed nothing but the version", () => {
    const r = rows(
      source([
        create(ANA, "2026-11-05T09:00:00.000Z"),
        update(LUIS, "2026-11-05T11:00:00.000Z", { version: ["1.0", "1.1"] }),
        update(ANA, "2026-11-06T09:00:00.000Z", {
          version: ["1.1", "1.2"],
          "data.aiProvenance": [{}, { a: 1 }],
        }),
        update(ANA, "2026-11-06T10:00:00.000Z", {
          version: ["1.2", "1.3"],
          "data.conclusion": ["", "c"],
        }),
        update(ANA, "2026-11-06T11:00:00.000Z", { version: ["1.3", "1.4"] }),
      ]),
    );
    // Luis only saved without changes: no row. Ana's last real save on the
    // 6th is 1.3 (1.4 changed nothing).
    expect(r.map((x) => [x.day, x.actor, x.version])).toEqual([
      ["2026-11-05", ANA, "1.0"],
      ["2026-11-06", ANA, "1.3"],
    ]);
  });

  it("says when the plan was approved that day", () => {
    const r = rows(
      source([
        create(ANA, "2026-11-05T09:00:00.000Z"),
        update(ANA, "2026-11-06T09:00:00.000Z", {
          version: ["1.0", "1.1"],
          "data.sprints": [[], [{}]],
        }),
        update(ANA, "2026-11-06T10:00:00.000Z", {
          version: ["1.1", "1.2"],
          status: ["draft", "approved"],
        }),
      ]),
    );
    expect(r[1]).toMatchObject({
      approved: true,
      status: "approved",
      version: "1.2",
      sections: ["schedule"],
    });
    expect(changesText(r[1], t)).toBe(
      "testPlan.step.schedule · testPlan.history.approved",
    );
    // Another status is a change of step 2.
    const reviewed = rows(
      source([
        update(ANA, "2026-11-07T09:00:00.000Z", {
          version: ["1.2", "1.3"],
          status: ["approved", "reviewed"],
        }),
      ]),
    );
    expect(reviewed.at(-1)).toMatchObject({
      approved: false,
      sections: ["meta"],
      status: "reviewed",
    });
  });

  it("builds the saves before 0.2.0 from the revision copies", () => {
    // Created on the 4th, saved twice before the audit log existed, then one
    // save with its event (which also wrote a copy in the same second).
    const s: PlanHistorySource = {
      createdAt: "2026-11-04 08:00:00",
      createdBy: ANA,
      revisions: [
        {
          revision: 1,
          title: "Plan",
          data: {},
          createdAt: "2026-11-04 09:00:00",
          createdBy: ANA,
        },
        {
          revision: 2,
          title: "Plan",
          data: { summary: "s" },
          createdAt: "2026-11-05 09:00:00",
          createdBy: ANA,
        },
        {
          revision: 3,
          title: "Plan",
          data: { summary: "s" },
          createdAt: "2026-11-05 10:00:00",
          createdBy: ANA,
        },
        {
          revision: 4,
          title: "Plan v2",
          data: { summary: "s" },
          createdAt: "2026-11-06 09:00:00",
          createdBy: ANA,
        },
      ],
      events: [
        update(ANA, "2026-11-06T09:00:00.400Z", {
          version: ["1.3", "1.4"],
          "data.risks": [[], [{}]],
        }),
      ],
    };
    const saves = planSaves(s, {
      title: "Plan v2",
      data: { summary: "s", risks: [{}] },
    });
    // Creation + copies 1..3 (the 4th is the event's) + the event.
    expect(saves.map((x) => [x.created, x.sections])).toEqual([
      [true, []],
      [false, ["summary"]],
      [false, []], // copy 2 → copy 3: nothing changed
      [false, ["title"]],
      [false, ["risks"]],
    ]);
    // The event's «before» gives the version of the save before it.
    expect(saves.map((x) => x.version)).toEqual([
      null,
      null,
      null,
      "1.3",
      "1.4",
    ]);
    const r = groupHistory(saves, UTC);
    expect(r.map((x) => [x.day, x.version ?? "—"])).toEqual([
      ["2026-11-04", "—"],
      ["2026-11-05", "1.3"],
      ["2026-11-06", "1.4"],
    ]);
  });

  it("ignores events of components and keeps a redacted save", () => {
    const saves: PlanSave[] = planSaves(
      source([
        create(ANA, "2026-11-05T09:00:00.000Z"),
        {
          at: "2026-11-05T10:00:00.000Z",
          actor: "system:sync",
          action: "update",
          changes: { title: ["a", "b"] },
        },
        update(ANA, "2026-11-06T10:00:00.000Z", null),
      ]),
      current,
    );
    expect(saves.map((x) => x.actor)).toEqual([ANA, ANA]);
    const r = groupHistory(saves, UTC);
    expect(changesText(r[1], t)).toBe("testPlan.history.otherChanges");
    // The version carries on from the last known one.
    expect(r[1].version).toBe("1.0");
  });

  it("names each row by official name, else the plan's author, else a neutral text", () => {
    const r = rows(
      source([
        create(ANA, "2026-11-05T09:00:00.000Z"),
        update(LUIS, "2026-11-05T12:00:00.000Z", {
          version: ["1.0", "1.1"],
          "data.summary": ["s", "t"],
        }),
      ]),
    );
    const table = historyTable(
      r,
      { names: { [ANA]: "Ana Pérez Gil" }, fallback: "QA" },
      t,
      UTC,
    );
    expect(table.name).toBe("testPlan.history.title");
    expect(table.headers).toEqual([
      "testPlan.version",
      "testPlan.date",
      "testPlan.history.reviewedBy",
      "testPlan.status",
      "testPlan.history.changes",
    ]);
    expect(table.rows).toEqual([
      [
        "1.0",
        "2026-11-05 09:00",
        "Ana Pérez Gil",
        "testPlan.statusLabel.draft",
        "testPlan.history.created",
      ],
      [
        "1.1",
        "2026-11-05 12:00",
        "QA",
        "testPlan.statusLabel.draft",
        "testPlan.step.summary",
      ],
    ]);
    const anonymous = historyTable(r, { names: {} }, t, UTC);
    expect(anonymous.rows[1][2]).toBe("testPlan.history.unknownAuthor");
  });
});
