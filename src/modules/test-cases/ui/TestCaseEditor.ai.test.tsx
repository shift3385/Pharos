// IA-16 in the case editor: each list has its own AI button, nothing is applied
// until the user picks it, a removal or a rewording waits for its own tick, steps
// keep their ids, and neither test data nor notes have AI.

import { beforeEach, describe, expect, it, vi } from "vitest";
import "@test/slow";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import type { TestCase } from "../model/types";
import {
  caseBrief,
  checklistBrief,
  flowProvenanceKey,
  flowsBrief,
  liveProvenance,
} from "./caseAi";
import { TestCaseEditor } from "./TestCaseEditor";

const reviewCaseList = vi.fn();
const update = vi.fn();
const stored = (): TestCase =>
  ({
    id: "c1",
    workspaceId: "w1",
    projectId: "p1",
    scenarioId: "BM-001",
    title: "Transfer",
    version: "1.0",
    status: "draft",
    priority: "medium",
    author: "QA",
    caseType: "standard",
    automationStatus: "manual",
    revision: 1,
    createdAt: "",
    updatedAt: "",
    data: {
      gherkinLevel: "basic",
      preconditions: [
        { id: "PRE00001", text: "The user is signed in" },
        { id: "PRE00002", text: "The user has a session" },
        { id: "PRE00003", text: "Enough balance" },
      ],
      steps: [{ id: "STP00001", text: "Open transfers" }],
      expectedResult: "The transfer is sent",
      testData: "SECRET-TEST-DATA",
      notes: "SOME-NOTE",
    },
  }) as unknown as TestCase;

const advanced = (): TestCase => {
  const c = stored();
  return {
    ...c,
    data: {
      gherkinLevel: "advanced",
      background: [{ id: "BGD00001", text: "The user is signed in" }],
      flows: [
        {
          id: "FLOWMAIN",
          name: "Main",
          preconditions: [],
          steps: [{ id: "STPMAIN1", text: "Open transfers" }],
          expectedResult: "Sent",
        },
        {
          id: "FLOWALT1",
          name: "Expired",
          preconditions: [],
          steps: [{ id: "STPALT01", text: "Enter an old code" }],
          expectedResult: "Rejected",
        },
      ],
      notes: "SOME-NOTE",
    },
  } as unknown as TestCase;
};
const checklist = (): TestCase => ({ ...stored(), caseType: "checklist" }) as unknown as TestCase;
let current: () => TestCase = stored;

vi.mock("../api/testCaseApi", () => ({
  testCaseApi: {
    get: () => Promise.resolve(current()),
    revisions: () => Promise.resolve([]),
    create: vi.fn(),
    update: (...a: unknown[]) => update(...a),
  },
}));
vi.mock("@modules/custom-fields", async (orig) => ({
  ...(await orig<typeof import("@modules/custom-fields")>()),
  customFieldApi: { list: () => Promise.resolve([]) },
}));
vi.mock("@modules/ai", async (orig) => ({
  ...(await orig<typeof import("@modules/ai")>()),
  aiAvailable: () => Promise.resolve(true),
  reviewCaseList: (...a: unknown[]) => reviewCaseList(...a),
}));

const provenance = { provider: "ollama" as const, model: "llama3.2:3b", generatedAt: "2026-11-07T10:00:00.000Z" };

async function openEditor() {
  renderWithProviders(<TestCaseEditor projectId="p1" caseId="c1" onClose={() => {}} />);
  await screen.findByRole("button", { name: "Review preconditions" });
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  current = stored;
  reviewCaseList.mockReset();
  update.mockReset();
  update.mockResolvedValue(null);
});

describe("TestCaseEditor AI (IA-16)", () => {
  it("offers one button per field, and none for test data or notes", async () => {
    await openEditor();
    // Lists with content are reviewed; empty ones ask for suggestions.
    for (const name of ["Review preconditions", "Review steps", "Suggest postconditions", "Suggest criteria"]) {
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
    const expected = screen.getByRole("button", { name: "Write the expected result with AI" });
    expect(expected).toBeEnabled();
    // Description + the five above: nothing else in the form.
    expect(document.querySelectorAll(".assist__btn")).toHaveLength(6);
    // Every AI button comes before the two fields that must not have one.
    const testData = screen.getByDisplayValue("SECRET-TEST-DATA");
    const notes = screen.getByDisplayValue("SOME-NOTE");
    for (const btn of document.querySelectorAll(".assist__btn")) {
      expect(btn.compareDocumentPosition(testData) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(btn.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("each list has «Add», the AI icon and the mark on one action line", async () => {
    await openEditor();
    const line = (name: string) => screen.getByRole("button", { name }).closest(".tp-list-field__actions");
    expect(line("Review preconditions")).toHaveTextContent("Add");
    expect(line("Review steps")).toHaveTextContent("Add step");
    expect(line("Suggest postconditions")).toHaveTextContent("Add");
    expect(line("Suggest criteria")).toHaveTextContent("Add");
    // Only the icon: the name is for assistive technology and the tooltip.
    const button = screen.getByRole("button", { name: "Review steps" });
    expect(button).toHaveAttribute("title", "Review steps");
    expect(button.querySelector(".sr-only")).toHaveTextContent("Review steps");
  });

  it("applies only what the user ticks; removing and rewording start unticked", async () => {
    reviewCaseList.mockResolvedValue({
      value: [
        { action: "rewrite", index: 2, target: "Enough balance", text: "The balance covers the amount", reason: "Vague term" },
        { action: "remove", index: 1, target: "The user has a session", reason: "Repeats item 1" },
        { action: "add", text: "The beneficiary exists", reason: "Step 1 needs it" },
      ],
      provenance,
    });
    await openEditor();
    await userEvent.click(screen.getByRole("button", { name: "Review preconditions" }));
    const remove = await screen.findByRole("checkbox", { name: /Remove.*The user has a session.*Repeats item 1/ });
    const rewrite = screen.getByRole("checkbox", { name: /Reword.*Enough balance.*The balance covers/ });
    const add = screen.getByRole("checkbox", { name: /Add.*The beneficiary exists/ });
    expect(remove).not.toBeChecked();
    expect(rewrite).not.toBeChecked();
    expect(add).toBeChecked();
    // What goes away is crossed out, and still in the form until applied.
    expect(screen.getByText("The user has a session", { selector: "del" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("The user has a session")).toBeInTheDocument();

    await userEvent.click(remove);
    await userEvent.click(screen.getByRole("button", { name: "Apply 2" }));

    expect(screen.queryByDisplayValue("The user has a session")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Enough balance")).toBeInTheDocument();
    expect(screen.getByDisplayValue("The beneficiary exists")).toBeInTheDocument();
    expect(screen.getByText("AI · pending review")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    const data = update.mock.calls[0][1].data;
    expect(data.preconditions[0]).toEqual({ id: "PRE00001", text: "The user is signed in" });
    expect(data.preconditions[1]).toEqual({ id: "PRE00003", text: "Enough balance" });
    expect(data.preconditions[2].text).toBe("The beneficiary exists");
    expect(data.aiProvenance.preconditions).toEqual(provenance);
    expect(data.aiProvenance.steps).toBeUndefined();
  });

  it("rewording a step keeps its id (DAT-02), and asks for that field with the rest of the case", async () => {
    reviewCaseList.mockResolvedValue({
      value: [{ action: "rewrite", index: 0, target: "Open transfers", text: "Open the Transfers screen", reason: "Vague" }],
      provenance,
    });
    await openEditor();
    await userEvent.click(screen.getByRole("button", { name: "Review steps" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: /Reword/ }));
    await userEvent.click(screen.getByRole("button", { name: "Apply 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][1].data.steps).toEqual([{ id: "STP00001", text: "Open the Transfers screen" }]);

    const [field, context, existing, lang] = reviewCaseList.mock.calls[0];
    expect(field).toBe("steps");
    expect(existing).toEqual(["Open transfers"]);
    expect(lang).toBe("en");
    expect(context).toContain("The user is signed in");
    expect(context).toContain("The transfer is sent");
    expect(context).not.toContain("Open transfers");
  });

  it("discarding applies nothing", async () => {
    reviewCaseList.mockResolvedValue({
      value: [{ action: "add", text: "Should not appear", reason: "x" }],
      provenance,
    });
    await openEditor();
    await userEvent.click(screen.getByRole("button", { name: "Suggest postconditions" }));
    await screen.findByRole("checkbox", { name: /Should not appear/ });
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByDisplayValue("Should not appear")).not.toBeInTheDocument();
    expect(screen.queryByText("AI · pending review")).not.toBeInTheDocument();
  });
});

describe("TestCaseEditor AI in flows and checklists (IA-16)", () => {
  const open = async (name: string) => {
    renderWithProviders(<TestCaseEditor projectId="p1" caseId="c1" onClose={() => {}} />);
    return screen.findByRole("button", { name });
  };

  it("an advanced case has AI on the shared preconditions and on each flow, not on notes", async () => {
    current = advanced;
    await open("Review shared preconditions");
    for (const name of [
      "Suggest preconditions · Main",
      "Review steps · Main",
      "Write the expected result with AI · Main",
      "Suggest preconditions · Expired",
      "Review steps · Expired",
      "Write the expected result with AI · Expired",
    ]) {
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
    // Description, shared preconditions and three per flow.
    expect(document.querySelectorAll(".assist__btn")).toHaveLength(8);
    const notes = screen.getByDisplayValue("SOME-NOTE");
    for (const btn of document.querySelectorAll(".assist__btn")) {
      expect(btn.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("a flow's review changes only that flow, keeps ids, and sends the rest as context", async () => {
    current = advanced;
    reviewCaseList.mockResolvedValue({
      value: [{ action: "rewrite", index: 0, target: "Enter an old code", text: "Enter an expired code", reason: "Vague" }],
      provenance,
    });
    await userEvent.click(await open("Review steps · Expired"));
    await userEvent.click(await screen.findByRole("checkbox", { name: /Reword/ }));
    await userEvent.click(screen.getByRole("button", { name: "Apply 1" }));
    expect(screen.getAllByText("AI · pending review")).toHaveLength(1);

    const [field, context, existing] = reviewCaseList.mock.calls[0];
    expect(field).toBe("steps");
    expect(existing).toEqual(["Enter an old code"]);
    expect(context).toContain("Shared preconditions");
    expect(context).toContain("Another flow: Main");
    expect(context).not.toContain("Enter an old code");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    const data = update.mock.calls[0][1].data;
    expect(data.flows[1].steps).toEqual([{ id: "STPALT01", text: "Enter an expired code" }]);
    expect(data.flows[0].steps).toEqual([{ id: "STPMAIN1", text: "Open transfers" }]);
    expect(Object.keys(data.aiProvenance)).toEqual(["flow.FLOWALT1.steps"]);
  });

  it("removing a flow takes its AI mark with it, or the case would stay pending for good", async () => {
    current = advanced;
    reviewCaseList.mockResolvedValue({ value: [{ action: "add", text: "New step", reason: "x" }], provenance });
    await userEvent.click(await open("Review steps · Expired"));
    await screen.findByRole("checkbox", { name: /New step/ });
    await userEvent.click(screen.getByRole("button", { name: "Apply 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove: Expired" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][1].data.aiProvenance).toEqual({});
  });

  it("a checklist reviews its items from what it shows, and notes have no AI", async () => {
    current = checklist;
    reviewCaseList.mockResolvedValue({ value: [{ action: "remove", index: 0, target: "Open transfers", reason: "x" }], provenance });
    await userEvent.click(await open("Review checks"));
    await screen.findByRole("checkbox", { name: /Remove/ });
    expect(document.querySelectorAll(".assist__btn")).toHaveLength(2);
    const [field, context] = reviewCaseList.mock.calls[0];
    expect(field).toBe("checklist");
    expect(context).not.toContain("The transfer is sent");
    expect(context).not.toContain("The user is signed in");
  });
});

describe("caseBrief (IA-16)", () => {
  const content = {
    title: "Transfer",
    description: "",
    mappedUseCase: "",
    requirementKeys: ["REQ-1", "REQ-2"],
    preconditions: [{ id: "a", text: "Signed in" }, { id: "b", text: " " }],
    steps: [{ id: "c", text: "Open" }],
    expectedResult: "Sent",
    postconditions: [],
    acceptanceCriteria: ["Accepted"],
    testData: "Amount 150",
    notes: "",
  };

  it("leaves out the assisted field and what is empty, and names the requirements", () => {
    const brief = caseBrief(content, "expectedResult", [{ requirementKey: "REQ-1", title: "Transfers" }]);
    expect(brief).toBe(
      [
        "Test case title: Transfer",
        "Linked requirements: REQ-1: Transfers; REQ-2",
        "Preconditions:\n1. Signed in",
        "Steps:\n1. Open",
        "Acceptance criteria:\n1. Accepted",
        "Test data: Amount 150",
      ].join("\n"),
    );
    expect(caseBrief(content, "steps")).not.toContain("Open");
    expect(caseBrief(content, "steps")).toContain("Expected result: Sent");
  });

  it("a checklist reads only what it shows", () => {
    expect(checklistBrief(content)).toBe("Test case title: Transfer\nLinked requirements: REQ-1; REQ-2");
  });

  const flow = (id: string, name: string) => ({
    id,
    name,
    preconditions: [{ id: `${id}p`, text: `${name} pre` }],
    steps: [{ id: `${id}s`, text: `${name} step` }],
    expectedResult: `${name} result`,
  });
  const background = [{ id: "bg", text: "Shared" }];

  it("a flow's brief puts that flow first, without the assisted field or hidden flat fields", () => {
    const brief = flowsBrief(content, background, [flow("a", "Main"), flow("b", "Alt")], { flowId: "b", omit: "steps" });
    expect(brief.indexOf("This flow: Alt")).toBeLessThan(brief.indexOf("Another flow: Main"));
    expect(brief).toContain("Shared preconditions (they apply to every flow):\n1. Shared");
    expect(brief).not.toContain("Alt step");
    expect(brief).toContain("Main step");
    expect(brief).not.toContain("Signed in");
    expect(brief).not.toContain("Amount 150");
  });

  it("the shared preconditions' brief leaves them out and shows every flow", () => {
    const brief = flowsBrief(content, background, [flow("a", "Main")], { omit: "background" });
    expect(brief).not.toContain("Shared");
    expect(brief).toContain("Another flow: Main");
  });

  it("keeps the marks of what is still stored", () => {
    const mark = provenance;
    const map = {
      description: mark,
      background: mark,
      [flowProvenanceKey("a", "steps")]: mark,
      [flowProvenanceKey("gone", "steps")]: mark,
    };
    expect(Object.keys(liveProvenance(map, "advanced", [flow("a", "Main")]))).toEqual([
      "description",
      "background",
      "flow.a.steps",
    ]);
    expect(Object.keys(liveProvenance(map, "basic", [flow("a", "Main")]))).toEqual(["description"]);
  });
});
