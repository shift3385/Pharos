import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";

const api = vi.hoisted(() => ({ draft: vi.fn() }));
vi.mock("../api/aiApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/aiApi")>()),
  assistDraft: api.draft,
}));

const { AssistButton } = await import("./AssistButton");

const provenance = { provider: "anthropic", model: "m", generatedAt: "2026-11-06T00:00:00Z" } as const;
const show = (available = true) =>
  renderWithProviders(<AssistButton available={available} instruction="x" notes="" onUse={() => {}} />);

beforeEach(async () => {
  await i18n.changeLanguage("es");
  api.draft.mockReset();
});

describe("AssistButton", () => {
  it("is only the icon, named and explained", async () => {
    show();
    const button = screen.getByRole("button", { name: "Asistir con IA" });
    expect(button).toHaveAttribute("title", "Asistir con IA");
    expect(button.querySelector("svg")).toBeInTheDocument();
    expect(button.querySelector(".sr-only")).toHaveTextContent("Asistir con IA");
    expect(button.querySelector(".assist__spark")).not.toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("says why it is disabled", () => {
    show(false);
    const button = screen.getByRole("button", { name: "Asistir con IA" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", i18n.t("ai.assist.unavailable"));
  });

  it("shows it is asking the AI until the answer arrives", async () => {
    let answer: (v: unknown) => void = () => {};
    api.draft.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: "Asistir con IA" }));

    const busy = screen.getByRole("button", { name: "Redactando…" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy.querySelector(".assist__spark")).toBeInTheDocument();

    answer({ value: "Borrador", provenance });
    expect(await screen.findByText("Borrador")).toBeInTheDocument();
    const done = screen.getByRole("button", { name: "Asistir con IA" });
    expect(done).toHaveAttribute("aria-busy", "false");
    expect(done.querySelector(".assist__spark")).not.toBeInTheDocument();
  });
});
