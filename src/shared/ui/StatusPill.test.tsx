import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { expectNoAxeViolations } from "@test/axe";
import { StatusPill } from "./StatusPill";
import { PriorityFlag } from "./PriorityFlag";

describe("StatusPill and PriorityFlag (SPEC §4)", () => {
  it("a pill carries its tone, an optional dot and the strike of a retired state", async () => {
    render(
      <>
        <StatusPill tone="success">Aprobado</StatusPill>
        <StatusPill tone="neutral" dot>
          No ejecutado
        </StatusPill>
        <StatusPill tone="neutral" strike>
          Obsoleto
        </StatusPill>
      </>,
    );
    expect(screen.getByText("Aprobado").parentElement).toHaveAttribute("data-tone", "success");
    expect(screen.getByText("No ejecutado").parentElement?.querySelector(".pill__dot")).not.toBeNull();
    expect(screen.getByText("Obsoleto").parentElement).toHaveAttribute("data-strike", "true");
    await expectNoAxeViolations();
  });

  it("a struck pill keeps the darkest text, so «Obsoleto» reads under its line (FIX-49)", () => {
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "pills.css"),
      "utf8",
    );
    expect(css).toMatch(
      /\.pill\[data-strike\] \{\s*--pill-text:\s*var\(--color-text-primary\);/,
    );
  });

  it("a flag always names its priority, visibly or as a tooltip", async () => {
    render(
      <>
        <PriorityFlag tone="error" label="Crítica" showLabel />
        <PriorityFlag tone="muted" label="Baja" />
      </>,
    );
    expect(screen.getByText("Crítica")).toHaveClass("flag__label");
    expect(screen.getByText("Baja")).toHaveClass("sr-only");
    expect(screen.getByText("Baja").parentElement).toHaveAttribute("title", "Baja");
    await expectNoAxeViolations();
  });
});
