import { test } from "node:test";
import assert from "node:assert/strict";
import { advisories, judgeAudit } from "./audit-gate.mjs";

const adv = (name, severity, ghsa) => ({
  source: 1,
  name,
  severity,
  title: `${name} issue`,
  url: `https://github.com/advisories/${ghsa}`,
});

const report = {
  vulnerabilities: {
    zod: { via: [adv("zod", "high", "GHSA-zzzz")] },
    vite: {
      via: [
        adv("vite", "high", "GHSA-vvvv"),
        adv("vite", "moderate", "GHSA-mmmm"),
      ],
    },
    vitest: { via: ["vite", adv("vite", "high", "GHSA-vvvv")] }, // duplicate + inherited
  },
};

test("advisories are collected once per GHSA id, ignoring inherited entries", () => {
  assert.deepEqual(
    advisories(report)
      .map((a) => a.id)
      .sort(),
    ["GHSA-mmmm", "GHSA-vvvv", "GHSA-zzzz"],
  );
});

test("high/critical advisories block unless tolerated for this scope and not expired", () => {
  const allowlist = [
    {
      id: "GHSA-zzzz",
      scope: "server",
      expires: "2026-12-15",
      item: "BASE-18",
    },
    { id: "GHSA-vvvv", scope: "root", expires: "2026-12-15", item: "X" }, // other scope
  ];
  const res = judgeAudit(advisories(report), allowlist, "server", "2026-10-28");
  assert.deepEqual(
    res.tolerated.map((a) => a.id),
    ["GHSA-zzzz"],
  );
  assert.deepEqual(
    res.blocking.map((a) => a.id),
    ["GHSA-vvvv"],
  );
  assert.deepEqual(
    res.reported.map((a) => a.id),
    ["GHSA-mmmm"],
  );
});

test("an expired tolerance blocks again", () => {
  const allowlist = [
    {
      id: "GHSA-zzzz",
      scope: "server",
      expires: "2026-10-27",
      item: "BASE-18",
    },
  ];
  const res = judgeAudit(
    [advisories(report).find((a) => a.id === "GHSA-zzzz")],
    allowlist,
    "server",
    "2026-10-28",
  );
  assert.equal(res.blocking[0].expired, "2026-10-27");
});

test("entries that no longer match an advisory are reported as stale", () => {
  const allowlist = [
    { id: "GHSA-gone", scope: "root", expires: "2027-01-01", item: "X" },
  ];
  const res = judgeAudit([], allowlist, "root", "2026-10-28");
  assert.equal(res.stale.length, 1);
  assert.equal(res.blocking.length, 0);
});
