// IA-19: «Guardar las imágenes como adjunto de los requisitos» is offered
// only when the caller can keep them, starts unticked, and passes the step to
// the apply only when ticked.

import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@test/utils";
import { RequirementProposalsReview } from "./RequirementProposalsReview";
import type { RequirementProposal } from "../proposals/types";

const apply = vi.hoisted(() =>
  vi.fn(async (_input: { afterSave?: unknown }) => ({
    created: 1,
    updated: 0,
    removed: 0,
    skipped: [],
    failed: [],
  })),
);
vi.mock("../api/applyProposals", () => ({ applyRequirementProposals: apply }));

const proposals: RequirementProposal[] = [
  {
    id: 0,
    action: "add",
    title: "Login",
    description: "d",
    priority: "high",
    reason: "r",
    acceptance: [],
    sources: [{ kind: "image", name: "boceto.jpg", index: 1 }],
  },
];
const props = {
  proposals,
  existing: [],
  provenance: {
    provider: "anthropic" as const,
    model: "m",
    generatedAt: "2026-11-09T00:00:00Z",
  },
  projectId: "p1",
  linkedCases: {},
  onApplied: () => undefined,
  onClose: () => undefined,
};
const KEEP = "Guardar las imágenes como adjunto de los requisitos";

describe("RequirementProposalsReview › keep images (IA-19)", () => {
  it("is not offered without a way to keep them", () => {
    renderWithProviders(<RequirementProposalsReview {...props} />);
    expect(
      screen.queryByRole("checkbox", { name: new RegExp(KEEP) }),
    ).not.toBeInTheDocument();
  });

  it("starts unticked and keeps nothing unless ticked", async () => {
    const keepImages = vi.fn(async () => undefined);
    renderWithProviders(
      <RequirementProposalsReview {...props} keepImages={keepImages} />,
    );
    const box = screen.getByRole("checkbox", { name: new RegExp(KEEP) });
    expect(box).not.toBeChecked();
    await userEvent.click(screen.getByTestId("req-proposals-apply"));
    expect(apply.mock.calls.at(-1)?.[0].afterSave).toBeUndefined();
  });

  it("passes the step to the apply when ticked", async () => {
    const keepImages = vi.fn(async () => undefined);
    renderWithProviders(
      <RequirementProposalsReview {...props} keepImages={keepImages} />,
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: new RegExp(KEEP) }),
    );
    await userEvent.click(screen.getByTestId("req-proposals-apply"));
    expect(apply.mock.calls.at(-1)?.[0].afterSave).toBe(keepImages);
  });
});

describe("RequirementProposalsReview › acceptance criteria (UX-23)", () => {
  it("shows each Gherkin criterion one keyword per line, the keyword in bold", async () => {
    const withCriteria: RequirementProposal[] = [
      { ...(proposals[0] as Extract<RequirementProposal, { action: "add" }>), acceptance: ["Given la pantalla de login, when se muestra, then existe un botón", "El botón está visible"] },
    ];
    renderWithProviders(<RequirementProposalsReview {...props} proposals={withCriteria} />);
    const items = document.querySelectorAll(".tz-criteria__item");
    expect(items).toHaveLength(2);
    const kws = Array.from(items[0].querySelectorAll("strong.tz-criteria__kw")).map((k) => k.textContent);
    expect(kws).toEqual(["Given", "When", "Then"]);
    expect(items[0].textContent).toContain("Given la pantalla de login");
    expect(items[1].querySelector("strong")).toBeNull();
  });
});
