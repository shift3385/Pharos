import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { required, dateOrder } from "@shared/validation";
import { ErrorSummary, FormField } from "./FormField";
import { useSaveGuard } from "./fieldProps";

describe("FormField", () => {
  it("labels the control and links its hint", async () => {
    renderWithProviders(
      <FormField label="Name" hint="Shown on the card" required>
        {(p) => <input {...p} />}
      </FormField>,
    );
    const input = screen.getByRole("textbox", { name: "Name" });
    expect(input).toHaveAccessibleDescription("Shown on the card");
    expect(input).toHaveAttribute("aria-required", "true");
    expect(input).not.toHaveAttribute("aria-invalid");
    await expectNoAxeViolations();
  });

  it("marks an error invalid and describes it with its severity", async () => {
    renderWithProviders(
      <FormField label="Name" issue={required("")}>
        {(p) => <input {...p} />}
      </FormField>,
    );
    const input = screen.getByRole("textbox", { name: "Name" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      `${i18n.t("validation.severity.error")}: ${i18n.t("validation.required")}`,
    );
    await expectNoAxeViolations();
  });

  it("describes a warning without marking the field invalid", () => {
    renderWithProviders(
      <FormField label="End" issue={dateOrder("2026-02-01", "2026-01-01")}>
        {(p) => <input {...p} />}
      </FormField>,
    );
    const input = screen.getByRole("textbox", { name: "End" });
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).toHaveAccessibleDescription(/2026|fin|end/i);
  });
});

function Form({ onSave }: { onSave: () => void }) {
  const [title, setTitle] = useState("");
  const issue = required(title);
  const { guard, showSummary, summaryRef } = useSaveGuard(issue !== null);
  return (
    <>
      {showSummary && issue && (
        <ErrorSummary ref={summaryRef} items={[{ label: "Title", issue, fieldId: "title" }]} />
      )}
      <FormField id="title" label="Title" issue={issue}>
        {(p) => <input {...p} value={title} onChange={(e) => setTitle(e.target.value)} />}
      </FormField>
      <button type="button" onClick={() => guard(onSave)}>
        Save
      </button>
    </>
  );
}

describe("useSaveGuard", () => {
  it("never disables Save: a blocked save shows and focuses the summary", async () => {
    const onSave = vi.fn();
    renderWithProviders(<Form onSave={onSave} />);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();
    const summary = screen.getByRole("alert");
    expect(summary).toHaveFocus();
    await expectNoAxeViolations();

    await userEvent.click(screen.getByRole("button", { name: "Title" }));
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
    await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "Plan");
    expect(screen.queryByRole("alert")).toBeNull();
    await userEvent.click(save);
    expect(onSave).toHaveBeenCalledOnce();
  });
});
