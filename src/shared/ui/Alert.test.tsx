import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { Alert } from "./Alert";

describe("Alert (UX-10)", () => {
  it("errors and warnings are alerts; success and info are polite status", async () => {
    renderWithProviders(
      <>
        <Alert kind="error">Bad</Alert>
        <Alert kind="info">Note</Alert>
      </>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(`${i18n.t("common.status.error")}: Bad`);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(`${i18n.t("common.status.info")}: Note`);
    expect(status).toHaveClass("ui-alert--info");
    expect(status.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    await expectNoAxeViolations();
  });
});
