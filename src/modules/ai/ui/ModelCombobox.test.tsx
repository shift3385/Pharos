import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { ModelCombobox } from "./ModelCombobox";

const MODELS = Array.from({ length: 13 }, (_, i) => `claude-model-${i + 1}`).concat("claude-opus-5-5");

function Harness({ options = MODELS, initial = "claude-opus-5-5", onChange }: { options?: string[]; initial?: string; onChange?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  return (
    <>
      <label htmlFor="m">Modelo</label>
      <ModelCombobox
        id="m"
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
        options={options}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

const field = () => screen.getByRole("combobox", { name: "Modelo" });
const optionNames = () => within(screen.getByRole("listbox")).getAllByRole("option").map((o) => o.textContent);

beforeEach(async () => {
  await i18n.changeLanguage("es");
});

describe("ModelCombobox", () => {
  it("opens with every model, even with one already written", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(screen.getByRole("button", { name: "Ver los modelos" }));
    expect(optionNames()).toHaveLength(14);
    expect(screen.getByRole("option", { name: "claude-opus-5-5" })).toHaveAttribute("aria-selected", "true");
    expect(field()).toHaveFocus();
  });

  it("typing searches the models, whatever the case", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(field());
    await user.clear(field());
    await user.type(field(), "MODEL-1");
    expect(optionNames()).toEqual(["claude-model-1", "claude-model-10", "claude-model-11", "claude-model-12", "claude-model-13"]);
  });

  it("choosing writes the model and closes, and it opens full again", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Harness onChange={onChange} />);
    await user.click(field());
    await user.clear(field());
    await user.type(field(), "model-7");
    await user.click(screen.getByRole("option", { name: "claude-model-7" }));
    expect(onChange).toHaveBeenLastCalledWith("claude-model-7");
    expect(field()).toHaveValue("claude-model-7");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.click(field());
    expect(optionNames()).toHaveLength(14);
  });

  it("works with the keyboard and Escape keeps what was there", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    field().focus();
    await user.keyboard("{ArrowDown}");
    expect(field()).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{ArrowUp}");
    expect(field()).toHaveAttribute("aria-activedescendant", "m-opt-12");
    await user.keyboard("{Enter}");
    expect(field()).toHaveValue("claude-model-13");

    await user.keyboard("{ArrowDown}{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(field()).toHaveValue("claude-model-13");
  });

  it("keeps a model that is not listed, and says it does not match", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(field());
    await user.clear(field());
    await user.type(field(), "mi-modelo-privado");
    expect(screen.getByText(/Ningún modelo coincide/)).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(field()).toHaveValue("mi-modelo-privado");
  });

  it("without a list it is a plain field", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness options={[]} initial="" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await user.type(field(), "gpt-x{ArrowDown}");
    expect(field()).toHaveValue("gpt-x");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("passes axe open", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(field());
    await expectNoAxeViolations();
  });
});
