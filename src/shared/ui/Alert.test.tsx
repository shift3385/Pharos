import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { Alert } from "./Alert";
import type { StatusKind } from "./StatusIcon";

/** Kind → live-region role and the Lucide icon class drawn for it. */
const KINDS: [StatusKind, "alert" | "status", string][] = [
  ["error", "alert", "lucide-circle-x"],
  ["warning", "alert", "lucide-triangle-alert"],
  ["success", "status", "lucide-circle-check"],
  ["info", "status", "lucide-info"],
];

describe("Alert (UX-10)", () => {
  it.each(KINDS)("%s: role %s, its icon, its class and its kind spoken", async (kind, role, icon) => {
    renderWithProviders(<Alert kind={kind}>Message</Alert>);
    const el = screen.getByRole(role);
    expect(el).toHaveClass("ui-alert", `ui-alert--${kind}`);
    expect(el).toHaveTextContent(`${i18n.t(`common.status.${kind}`)}: Message`);
    const svg = el.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg.getAttribute("class")).toContain(icon);
    await expectNoAxeViolations();
  });

  it("a role override replaces the default live region", () => {
    renderWithProviders(
      <Alert kind="warning" role="note">
        Static note
      </Alert>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("note")).toHaveTextContent("Static note");
  });
});
