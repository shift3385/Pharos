// IA-10 pick list (risks, preconditions): only the kept items are added; an
// invalid answer adds nothing; with no AI the button is disabled.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { AiOutputError } from "../api/structured";
import { AiSuggestList } from "./AiSuggestList";

const provenance = { provider: "ollama" as const, model: "llama3.2:3b", generatedAt: "2026-10-29T10:00:00.000Z" };

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

function renderList(run: () => Promise<{ value: string[]; provenance: typeof provenance }>, available = true) {
  const onAdd = vi.fn();
  renderWithProviders(
    <AiSuggestList available={available} buttonLabel="Suggest" run={run} renderItem={(s) => s} onAdd={onAdd} />,
  );
  return onAdd;
}

describe("AiSuggestList (IA-10)", () => {
  it("adds only the items the user keeps, with the provenance", async () => {
    const onAdd = renderList(async () => ({ value: ["The user is registered", "There is stock"], provenance }));
    await userEvent.click(screen.getByRole("button", { name: "Suggest" }));
    expect(await screen.findByText("AI proposals · Ollama (local) · llama3.2:3b")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "There is stock" }));
    await userEvent.click(screen.getByRole("button", { name: "Add 1" }));
    expect(onAdd).toHaveBeenCalledWith(["The user is registered"], provenance);
    expect(screen.queryByText("There is stock")).not.toBeInTheDocument();
  });

  it("an invalid answer is reported and nothing is added", async () => {
    const onAdd = renderList(() => Promise.reject(new AiOutputError("invalid-json")));
    await userEvent.click(screen.getByRole("button", { name: "Suggest" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not valid JSON");
    expect(screen.queryByRole("button", { name: /^Add/ })).not.toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("a refusal shows the model's reason", async () => {
    renderList(() => Promise.reject(new AiOutputError("refusal", ["Not enough context"])));
    await userEvent.click(screen.getByRole("button", { name: "Suggest" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The AI made no proposals.");
    expect(alert).toHaveTextContent("Not enough context");
  });

  it("is disabled with a notice when no AI is available", () => {
    const run = vi.fn();
    renderList(run, false);
    const button = screen.getByRole("button", { name: "Suggest" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", i18n.t("ai.assist.unavailable"));
  });
});
