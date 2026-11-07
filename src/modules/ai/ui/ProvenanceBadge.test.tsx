import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { i18n, renderWithProviders } from "@test/utils";
import { ProvenanceBadge } from "./ProvenanceBadge";

const provenance = {
  provider: "anthropic" as const,
  model: "claude-opus-5-5",
  generatedAt: "2026-11-07T10:00:00.000Z",
};

describe("ProvenanceBadge (IA-01, UX-18)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
  });

  it("names the provider and model only in its tooltip", () => {
    renderWithProviders(<ProvenanceBadge provenance={provenance} onReview={() => undefined} />);
    expect(screen.getByText("IA · pendiente de revisión")).toHaveAttribute("title", "Claude · claude-opus-5-5");
    expect(screen.queryByText(/claude-opus-5-5/)).not.toBeInTheDocument();
  });
});
