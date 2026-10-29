// IA-05 in the UI: the user sees where the requirement goes, reviews the
// proposals and only accepted ones are created (failed saves stay for a retry);
// an invalid answer creates nothing; with no AI the button is disabled.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import type { GeneratedCase } from "@modules/ai";
import type { Requirement } from "../model/types";

const ai = vi.hoisted(() => ({
  available: vi.fn(async () => true),
  generate: vi.fn(),
}));
const createProposedCases = vi.hoisted(() => vi.fn(async () => ({ created: 1, failed: 0, failedIndexes: [] as number[] })));

vi.mock("@modules/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@modules/ai")>()),
  aiAvailable: ai.available,
  aiDestination: async () => ({ provider: "anthropic", model: "claude-opus-5-5" }),
  generateCasesFromRequirement: ai.generate,
}));
vi.mock("@modules/test-cases", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@modules/test-cases")>()),
  createProposedCases,
}));

const { GenerateCasesModal } = await import("./GenerateCasesModal");
const { requirementApi } = await import("../api/requirementApi");
const { RequirementsPanel } = await import("./RequirementsPanel");
const { AiOutputError } = await import("@modules/ai");

const requirement: Requirement = {
  id: "r1",
  projectId: "p1",
  requirementKey: "REQ-007",
  title: "Login with email",
  description: "Five failed attempts lock the account.",
  priority: "high",
  createdAt: "2026-10-29T10:00:00.000Z",
  updatedAt: "2026-10-29T10:00:00.000Z",
  revision: 1,
};

const provenance = { provider: "anthropic" as const, model: "claude-opus-5-5", generatedAt: "2026-10-29T10:00:00.000Z" };
const cases: GeneratedCase[] = [
  { title: "Successful login", description: "", priority: "high", given: [], when: ["sign in"], then: ["dashboard"] },
  { title: "Locked account", description: "", priority: "critical", given: [], when: ["fail 5 times"], then: ["locked"] },
];

beforeEach(async () => {
  await i18n.changeLanguage("en");
  ai.available.mockResolvedValue(true);
  ai.generate.mockReset();
  createProposedCases.mockClear();
});

function renderModal(onCreated = vi.fn(), onClose = vi.fn()) {
  renderWithProviders(
    <GenerateCasesModal
      requirement={requirement}
      projectId="p1"
      caseIdPrefix="TC-"
      caseIdDigits={3}
      onCreated={onCreated}
      onClose={onClose}
    />,
  );
  return onCreated;
}

describe("GenerateCasesModal (IA-05)", () => {
  it("says where the requirement goes, then creates only the accepted proposals", async () => {
    ai.generate.mockResolvedValue({ value: cases, provenance });
    const onCreated = renderModal();
    expect(await screen.findByText("Will be sent to Claude · claude-opus-5-5")).toBeInTheDocument();
    expect(ai.generate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(await screen.findByText("Successful login")).toBeInTheDocument();
    expect(screen.getByText("AI · pending review · Claude · claude-opus-5-5")).toBeInTheDocument();
    await expectNoAxeViolations(); // the review list (UX-05)
    expect(ai.generate).toHaveBeenCalledWith(
      expect.objectContaining({ requirementKey: "REQ-007", title: "Login with email" }),
      "en",
    );

    await userEvent.click(screen.getAllByRole("checkbox")[1]); // drop "Locked account"
    await userEvent.click(screen.getByRole("button", { name: "Create 1 case" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ created: 1, failed: 0, failedIndexes: [] }));
    expect(createProposedCases).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        requirementKey: "REQ-007",
        provenance,
        proposals: [cases[0]],
        author: "Quality Analyst",
        caseIdPrefix: "TC-",
      }),
    );
  });

  it("an invalid answer is reported and nothing is created; retry asks again", async () => {
    ai.generate.mockRejectedValueOnce(new AiOutputError("invalid-schema", ["cases.0.then: Required"]));
    renderModal();
    await userEvent.click(await screen.findByRole("button", { name: "Generate" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("does not have the expected format");
    expect(alert).toHaveTextContent("cases.0.then: Required");
    expect(alert).toHaveTextContent("Nothing was applied.");
    expect(screen.queryByRole("button", { name: /^Create/ })).not.toBeInTheDocument();
    expect(createProposedCases).not.toHaveBeenCalled();

    ai.generate.mockResolvedValueOnce({ value: cases, provenance });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Locked account")).toBeInTheDocument();
    expect(ai.generate).toHaveBeenCalledTimes(2);
  });

  it("cases that cannot be saved stay selected; Create retries only those", async () => {
    const three = [...cases, { ...cases[0], title: "Wrong password" }];
    ai.generate.mockResolvedValue({ value: three, provenance });
    // First save: "Locked account" (position 1 of the two chosen) fails.
    createProposedCases.mockResolvedValueOnce({ created: 1, failed: 1, failedIndexes: [1] });
    const onCreated = renderModal();
    await userEvent.click(await screen.findByRole("button", { name: "Generate" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: /Wrong password/ })); // not chosen
    await userEvent.click(screen.getByRole("button", { name: "Create 2 cases" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("1 case could not be saved. It is still selected");
    expect(onCreated).toHaveBeenCalledWith({ created: 1, failed: 1, failedIndexes: [1] });
    // The saved one is gone (no duplicates); the unchosen one stays unchosen.
    expect(screen.queryByText("Successful login")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Locked account/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Wrong password/ })).not.toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Create 1 case" }));
    await waitFor(() => expect(createProposedCases).toHaveBeenCalledTimes(2));
    expect(createProposedCases).toHaveBeenLastCalledWith(expect.objectContaining({ proposals: [cases[1]] }));
  });

  it("focuses the primary action, announces progress and closes with Escape", async () => {
    const onClose = vi.fn();
    renderModal(vi.fn(), onClose);
    const generate = await screen.findByRole("button", { name: "Generate" });
    expect(generate).toHaveFocus();
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    ai.generate.mockReturnValueOnce(new Promise(() => {})); // stays loading
    await userEvent.click(generate);
    expect(screen.getByRole("status")).toHaveTextContent("Generating scenarios from the requirement");
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("a timeout is reported as such", async () => {
    ai.generate.mockRejectedValueOnce("The AI provider did not answer in time");
    renderModal();
    await userEvent.click(await screen.findByRole("button", { name: "Generate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The AI did not answer in time.");
    expect(createProposedCases).not.toHaveBeenCalled();
  });
});

describe("RequirementsPanel — AI button (IA-05)", () => {
  beforeEach(() => {
    vi.spyOn(requirementApi, "list").mockResolvedValue([requirement]);
  });

  it("is disabled with a notice when no AI is available", async () => {
    ai.available.mockResolvedValue(false);
    renderWithProviders(<RequirementsPanel projectId="p1" />);
    const button = await screen.findByRole("button", { name: "Generate cases with AI from REQ-007" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", i18n.t("ai.assist.unavailable"));
  });

  it("opens the generator when AI is available", async () => {
    renderWithProviders(<RequirementsPanel projectId="p1" />);
    const button = await screen.findByRole("button", { name: "Generate cases with AI from REQ-007" });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    expect(await screen.findByRole("dialog")).toHaveTextContent("Generate cases from REQ-007");
  });

  it("when every save fails there is no success toast and the modal stays open", async () => {
    ai.generate.mockResolvedValue({ value: cases, provenance });
    createProposedCases.mockResolvedValueOnce({ created: 0, failed: 2, failedIndexes: [0, 1] });
    renderWithProviders(<RequirementsPanel projectId="p1" />);
    const button = await screen.findByRole("button", { name: "Generate cases with AI from REQ-007" });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    await userEvent.click(await screen.findByRole("button", { name: "Generate" }));
    await userEvent.click(await screen.findByRole("button", { name: "Create 2 cases" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("2 cases could not be saved");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText(/created and linked/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create 2 cases" })).toBeEnabled();
  });
});
