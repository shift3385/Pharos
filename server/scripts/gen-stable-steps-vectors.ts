// Writes src-tauri/tests/fixtures/stable-steps-vectors.json from the server's
// implementation (DAT-02). The desktop (steps.rs), the server and the client
// tests read that file, so the three implementations must agree. Run it only
// when a rule changes on purpose:  npx tsx scripts/gen-stable-steps-vectors.ts
import { writeFileSync } from "node:fs";
import {
  contentSha256,
  deriveId,
  jcs,
  normalizeCaseData,
  revisionContent,
  revisionId,
} from "../src/modules/sync/stable-steps";

const out = new URL(
  "../../src-tauri/tests/fixtures/stable-steps-vectors.json",
  import.meta.url,
);

// RFC 8785 examples (§3.2.2 numbers, §3.2.3 sorting) plus strings.
const jcsInputs = [
  JSON.parse(
    '{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001,1e21,1e-7,123456789012345680000,-1.5,0,-7]}',
  ),
  JSON.parse(
    '{"\\u20ac":"Euro Sign","\\r":"Carriage Return","\\ufb33":"Hebrew Letter Dalet With Dagesh","1":"One","\\ud83d\\ude00":"Emoji: Grinning Face","\\u0080":"Control","\\u00f6":"Latin Small Letter O With Diaeresis"}',
  ),
  {
    string: 'tab\tnl\nquote"back\\ctl\u0001\u001fdel\u007fé€😀',
    empty: "",
    t: true,
    f: false,
    n: null,
  },
  { nested: { b: [1, { z: 1, a: 2 }], a: [] } },
];

const derived = [
  { caseId: "c1", list: "steps", index: 0, used: [] as string[] },
  { caseId: "c1", list: "steps", index: 1, used: [] },
  {
    caseId: "3f2c9a10-0000-4000-8000-000000000001",
    list: "flows/F1/examples",
    index: 3,
    used: [],
  },
];
const derivedIds = derived.map((d) => {
  const used = new Set(d.used);
  return { ...d, id: deriveId(d.caseId, d.list, d.index, used) };
});
// A taken id forces the ":1" retry.
const taken = derivedIds[0].id;
derivedIds.push({
  caseId: "c1",
  list: "steps",
  index: 0,
  used: [taken],
  id: deriveId("c1", "steps", 0, new Set([taken])),
});

const normalizeInputs: { name: string; caseId: string; input: unknown }[] = [
  {
    name: "basic case as 0.1 wrote it",
    caseId: "case-basic",
    input: {
      gherkinLevel: "basic",
      preconditions: ["a user", "a cart"],
      steps: ["I pay", "I confirm", "I pay"],
      expectedResult: "the order is placed",
      postconditions: ["kept as text"],
    },
  },
  {
    name: "steps of the fixtures (objects without text)",
    caseId: "case-fixture",
    input: {
      gherkinLevel: "basic",
      requirementKeys: ["REQ-001"],
      steps: [{ given: "a cart", when: "I pay", then: "the order is placed" }],
    },
  },
  {
    name: "outline with examples",
    caseId: "case-outline",
    input: {
      gherkinLevel: "outline",
      steps: ["I log in as <user>"],
      examples: {
        headers: ["user", "ok"],
        rows: [
          ["ana", "yes"],
          ["bob", "no"],
          ["ana", "yes"],
        ],
      },
    },
  },
  {
    name: "advanced with flows, background and a flow without id",
    caseId: "case-adv",
    input: {
      gherkinLevel: "advanced",
      background: ["the shop is open"],
      flows: [
        {
          id: "main",
          name: "Pay",
          preconditions: ["a cart"],
          steps: ["I pay"],
          expectedResult: "ok",
        },
        {
          name: "Declined",
          steps: ["I pay with <card>"],
          expectedResult: "declined",
          examples: { headers: ["card"], rows: [["expired"]] },
        },
        {
          id: "main",
          name: "Duplicated flow id",
          steps: ["x"],
          expectedResult: "",
        },
        "not a flow",
      ],
      featureSource: "Feature: f\n  Scenario: Pay\n    When I pay\n",
    },
  },
  {
    name: "already stable (unchanged)",
    caseId: "case-stable",
    input: {
      steps: [
        { id: "AAAAAAAA", text: "one", expected: "1" },
        { id: "BBBBBBBB", text: "two" },
      ],
      examples: { headers: ["a"], rows: [{ id: "CCCCCCCC", values: ["x"] }] },
    },
  },
  {
    name: "mixed: repeated ids, empty id, odd elements, odd rows",
    caseId: "case-mixed",
    input: {
      steps: [
        { id: "AAAAAAAA", text: "one" },
        { id: "AAAAAAAA", text: "two", expected: "kept" },
        { id: "", text: "three" },
        { text: 4 },
        7,
        null,
        ["nested", 1],
        "plain",
      ],
      background: [{ id: "AAAAAAAA", text: "same id as a step" }],
      examples: {
        headers: ["a"],
        rows: [{ id: "R1", values: ["x"] }, "lonely", 5, { values: ["y"] }],
      },
    },
  },
  {
    name: "data without lists",
    caseId: "case-empty",
    input: { notes: "n", steps: "not an array" },
  },
  { name: "data is not an object", caseId: "case-odd", input: "text" },
];
const normalize = normalizeInputs.map((v) => ({
  ...v,
  output: normalizeCaseData(v.caseId, v.input).data,
}));

const revisionInputs = [
  {
    caseId: "case-basic",
    revision: 1,
    content: {
      scenarioId: "ATS_001",
      title: "Pagar",
      version: "1.0",
      status: "draft",
      priority: "medium",
      caseType: null,
      automationStatus: null,
      data: normalize[0].output,
    },
  },
  {
    caseId: "case-basic",
    revision: 4,
    content: {
      scenarioId: "ATS_001",
      title: "Pagar ñ €",
      version: "1.1",
      status: "approved",
      priority: "high",
      caseType: "functional",
      automationStatus: "manual",
      data: {
        ...(normalize[0].output as object),
        custom: { "peso€": 2.5, n: 3 },
      },
    },
  },
];
const revisions = revisionInputs.map((r) => {
  const sha = contentSha256(revisionContent(r.content));
  return {
    ...r,
    contentSha256: sha,
    id: revisionId(r.caseId, r.revision, sha),
  };
});

const file = {
  $comment:
    "Shared vectors of DAT-02 (ADR-0011): RFC 8785 JCS, derived step ids, the normalization of case data and revision ids. Generated by server/scripts/gen-stable-steps-vectors.ts; read by src-tauri/src/steps.rs, server/tests and src/modules/test-cases tests. Regenerate only when a rule changes on purpose, and never for data already migrated.",
  jcs: jcsInputs.map((input) => ({ input, output: jcs(input) })),
  derivedIds,
  normalize,
  revisions,
};
writeFileSync(out, JSON.stringify(file, null, 2) + "\n");
console.log("wrote", out.pathname);
