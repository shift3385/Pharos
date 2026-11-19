// CAS-01 in the case editor (ADR-0055, bocetos 4 and 6): inserting a shared
// step adds a call and materializes it with the preview, its block is
// read-only, «Desvincular» keeps the steps, the state of a saved case's call
// shows, a dataset binds to the Examples table, and advanced cases have none
// of it.

import { beforeEach, describe, expect, it, vi } from "vitest";
import "@test/slow";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import type { LibraryItem, LibraryRefStatus } from "@modules/library";
import type { TestCase, TestCaseData, TestCaseInput } from "../model/types";
import { TestCaseEditor } from "./TestCaseEditor";

const update = vi.fn();
const preview = vi.fn();
const caseStatus = vi.fn();
let current: () => TestCase;

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

const login: LibraryItem = {
  id: "S1",
  projectId: "p1",
  kind: "shared_step",
  name: "Sign in",
  description: "",
  definition: [{ id: "P1", name: "user" }],
  body: [
    { id: "A", text: "Given I am on the sign-in page" },
    { id: "B", text: "When I sign in as <user>" },
  ],
  status: "active",
  version: 4,
  contentSha256: "x",
  usedBy: 1,
  createdBy: "u",
  createdAt: "2026-11-19T10:00:00Z",
  updatedAt: "2026-11-19T10:00:00Z",
  revision: 1,
};
const users: LibraryItem = {
  ...login,
  id: "D1",
  kind: "dataset",
  name: "Valid users",
  definition: [
    { id: "C1", name: "user" },
    { id: "C2", name: "role" },
  ],
  body: [
    { id: "R1", values: { C1: "ana", C2: "client" } },
    { id: "R2", values: { C1: "luis", C2: "admin" } },
  ],
  version: 2,
};

vi.mock("@modules/library/api/libraryApi", () => ({
  libraryApi: {
    list: (_p: string, kind: string) =>
      Promise.resolve(kind === "dataset" ? [users] : [login]),
    get: (id: string) => Promise.resolve(id === "D1" ? users : login),
    preview: (...a: unknown[]) => preview(...a),
    caseStatus: (...a: unknown[]) => caseStatus(...a),
  },
}));

const base = (data: TestCaseData): TestCase =>
  ({
    id: "c1",
    workspaceId: "w1",
    projectId: "p1",
    scenarioId: "ATS_002",
    title: "Purchase",
    version: "1.0",
    status: "draft",
    priority: "medium",
    author: "QA",
    caseType: "standard",
    automationStatus: "manual",
    revision: 1,
    createdAt: "",
    updatedAt: "",
    data,
  }) as unknown as TestCase;

const plain = () =>
  base({
    gherkinLevel: "basic",
    steps: [{ id: "OWN00001", text: "Pay the cart" }],
    expectedResult: "Paid",
  });

/** A case whose first two steps are the copy of a call of «Sign in». */
const withCall = () =>
  base({
    gherkinLevel: "outline",
    steps: [
      { id: "CPY00001", text: "Given I am on the sign-in page" },
      { id: "CPY00002", text: "When I sign in as <user>" },
      { id: "OWN00001", text: "Pay the cart" },
    ],
    expectedResult: "Paid",
    examples: {
      headers: ["user"],
      rows: [{ id: "ROW00001", values: ["ana"] }],
    },
    sharedRefs: [
      {
        id: "CALL0001",
        sharedStepId: "S1",
        version: 3,
        revisionId: "rev3",
        follow: false,
        list: "steps",
        stepIds: ["CPY00001", "CPY00002"],
        args: {},
        name: "Sign in",
      },
    ],
  });

const advanced = () =>
  base({
    gherkinLevel: "advanced",
    background: [],
    flows: [
      {
        id: "F1",
        name: "Main",
        preconditions: [],
        steps: [{ id: "S00001", text: "Open" }],
        expectedResult: "Ok",
      },
    ],
  });

beforeEach(async () => {
  await i18n.changeLanguage("en");
  current = plain;
  update.mockReset();
  update.mockResolvedValue(null);
  preview.mockReset();
  caseStatus.mockReset();
  caseStatus.mockResolvedValue([]);
});

async function openEditor() {
  renderWithProviders(
    <TestCaseEditor projectId="p1" caseId="c1" onClose={() => {}} />,
  );
  await screen.findByRole("textbox", { name: /Title/ });
}

describe("shared steps in a case (boceto 4)", () => {
  it("«Insert shared step…» adds a call and shows its copy from the preview", async () => {
    preview.mockImplementation((_p: string, _c: string, data: TestCaseData) => {
      const call = data.sharedRefs![0];
      return Promise.resolve({
        ...data,
        gherkinLevel: "outline",
        steps: [
          ...(data.steps ?? []),
          { id: "NEW00001", text: "Given I am on the sign-in page" },
          { id: "NEW00002", text: "When I sign in as <user>" },
        ],
        sharedRefs: [
          {
            ...call,
            version: 4,
            revisionId: "rev4",
            stepIds: ["NEW00001", "NEW00002"],
          },
        ],
      });
    });
    await openEditor();
    await userEvent.click(
      screen.getByRole("button", { name: "Insert shared step…" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Insert shared step",
    });
    await expectNoAxeViolations();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Choose · Sign in" }),
    );
    expect(
      within(dialog).getByRole("textbox", { name: "Argument for <user>" }),
    ).toHaveAttribute("placeholder", "Empty: passes to the case");
    await expectNoAxeViolations();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Insert" }),
    );

    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    const [projectId, caseId, data] = preview.mock.calls[0] as [
      string,
      string,
      TestCaseData,
    ];
    expect([projectId, caseId]).toEqual(["p1", "c1"]);
    expect(data.sharedRefs).toEqual([
      expect.objectContaining({
        sharedStepId: "S1",
        follow: true,
        list: "steps",
        stepIds: [],
        args: {},
      }),
    ]);
    const block = await screen.findByRole("group", {
      name: "Shared step Sign in, version 4",
    });
    expect(block).toHaveTextContent("When I sign in as <user>");
    expect(block).toHaveTextContent("v4 · follows the latest");
    // The preview made the case an Outline: <user> got its Examples column.
    expect(screen.getByRole("textbox", { name: "Column 1" })).toHaveValue(
      "user",
    );
  });

  it("a block is read-only; «Unlink» keeps its steps as the case's own", async () => {
    current = withCall;
    await openEditor();
    const block = screen.getByRole("group", {
      name: "Shared step Sign in, version 3",
    });
    expect(block).toHaveTextContent("Pinned to v3");
    expect(within(block).queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByDisplayValue("When I sign in as <user>"),
    ).not.toBeInTheDocument();
    // The own step after the block is numbered after it.
    expect(screen.getByRole("textbox", { name: "Step 3" })).toHaveValue(
      "Pay the cart",
    );

    await userEvent.click(
      within(block).getByRole("button", { name: "Unlink · Sign in" }),
    );
    expect(
      screen.queryByRole("group", { name: /Shared step Sign in/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByDisplayValue("When I sign in as <user>"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const input = update.mock.calls[0][1] as TestCaseInput;
    expect(input.data.sharedRefs).toEqual([]);
    expect(input.data.steps?.map((s) => s.id)).toEqual([
      "CPY00001",
      "CPY00002",
      "OWN00001",
    ]);
  });

  it("shows a pinned call's new version; «Update» saves it following the latest", async () => {
    current = withCall;
    const status: LibraryRefStatus = {
      refId: "CALL0001",
      kind: "shared_step",
      itemId: "S1",
      name: "Sign in",
      version: 3,
      latestVersion: 4,
      follow: false,
      state: "outdated",
      missingColumns: [],
    };
    caseStatus.mockResolvedValue([status]);
    await openEditor();
    expect(
      await screen.findByText("There is a new version (v4)."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const input = update.mock.calls[0][1] as TestCaseInput;
    expect(input.data.sharedRefs?.[0]).toMatchObject({
      id: "CALL0001",
      follow: true,
    });
  });

  it("editing a block's line in Gherkin warns that saving restores it", async () => {
    current = withCall;
    await openEditor();
    // The split view shows the Gherkin next to the form.
    const code = document.querySelector<HTMLTextAreaElement>(
      ".tc-split__pane--gherkin textarea",
    )!;
    expect(code.value).toContain("When I sign in as <user>");
    fireEvent.change(code, {
      target: {
        value: code.value.replace(
          "When I sign in as <user>",
          "When I log in as <user>",
        ),
      },
    });
    expect(
      await screen.findByText(/You changed lines of a shared step/),
    ).toBeInTheDocument();
  });

  it("advanced cases have no library actions, and say so", async () => {
    current = advanced;
    await openEditor();
    expect(
      screen.queryByRole("button", { name: "Insert shared step…" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/not available in cases with several flows/),
    ).toBeInTheDocument();
  });
});

describe("a dataset bound to the Examples table (boceto 6)", () => {
  it("«Link dataset…» binds it and shows the table read-only", async () => {
    current = withCall;
    preview.mockImplementation((_p: string, _c: string, data: TestCaseData) =>
      Promise.resolve({
        ...data,
        examples: {
          headers: ["user", "role"],
          rows: [
            { id: "X1", values: ["ana", "client"] },
            { id: "X2", values: ["luis", "admin"] },
          ],
        },
        datasetRefs: [
          {
            ...data.datasetRefs![0],
            revisionId: "drev2",
            version: 2,
            name: "Valid users",
          },
        ],
      }),
    );
    await openEditor();
    await userEvent.click(
      screen.getByRole("button", { name: "Link dataset…" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Link a dataset",
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Link · Valid users" }),
    );
    await waitFor(() => expect(preview).toHaveBeenCalled());
    expect(preview.mock.calls[0][2].datasetRefs).toEqual([
      expect.objectContaining({ id: "case", datasetId: "D1", follow: true }),
    ]);
    const bound = await screen.findByRole("group", {
      name: "Dataset Valid users, version 2",
    });
    const table = within(bound).getByRole("table", {
      name: "Dataset · Valid users (v2)",
    });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(bound).queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      within(bound).getByRole("button", { name: "Unlink (copy rows)" }),
    ).toBeInTheDocument();

    // «Unlink (copy rows)» keeps the rows as the case's own, editable again.
    await userEvent.click(
      within(bound).getByRole("button", { name: "Unlink (copy rows)" }),
    );
    expect(screen.getByDisplayValue("luis")).toBeInTheDocument();
  });
});
