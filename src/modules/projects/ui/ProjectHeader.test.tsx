import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import { renderWithProviders } from "@test/utils";
import { ProjectHeaderLayout, type ProjectHeaderInfo } from "./ProjectHeader";
import { useHeaderActions } from "@shared/ui/headerActions";

const INFO: ProjectHeaderInfo = {
  name: "Portal Clientes v3",
  caseIdPrefix: "PCL-",
  planStatus: "reviewed",
  meta: ["240 casos", "48 requisitos"],
};

/** A section page that puts a counter button in the header. */
function Section() {
  const [n, setN] = useState(0);
  useHeaderActions(
    <button type="button" className="pj-action" onClick={() => setN((v) => v + 1)}>
      Revisiones {n}
    </button>,
  );
  return <p>contenido {n}</p>;
}

describe("ProjectHeader", () => {
  it("shows the prefix badge, the name, the plan status and the meta line", async () => {
    setViewportWidth(1440);
    renderWithProviders(
      <ProjectHeaderLayout info={INFO}>
        <p>sección</p>
      </ProjectHeaderLayout>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Portal Clientes v3" })).toHaveAttribute(
      "title",
      "Portal Clientes v3",
    );
    expect(screen.getByText("PCL")).toBeInTheDocument();
    expect(screen.getByText("Plan revisado")).toBeInTheDocument();
    expect(screen.getByText("48 requisitos")).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("shows the section's actions and keeps them current", async () => {
    setViewportWidth(1440);
    renderWithProviders(
      <ProjectHeaderLayout info={INFO}>
        <Section />
      </ProjectHeaderLayout>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Revisiones 0" }));
    expect(screen.getByRole("button", { name: "Revisiones 1" })).toBeInTheDocument();
    expect(screen.getByText("contenido 1")).toBeInTheDocument();
  });

  it("drops the actions when the section goes", async () => {
    setViewportWidth(1440);
    function Toggle() {
      const [shown, setShown] = useState(true);
      return (
        <ProjectHeaderLayout info={INFO}>
          <button type="button" onClick={() => setShown(false)}>
            quitar
          </button>
          {shown && <Section />}
        </ProjectHeaderLayout>
      );
    }
    renderWithProviders(<Toggle />);
    expect(screen.getByRole("button", { name: "Revisiones 0" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "quitar" }));
    expect(screen.queryByRole("button", { name: /Revisiones/ })).not.toBeInTheDocument();
  });

  it("on mobile keeps only a hidden h1 and the actions row", async () => {
    setViewportWidth(390);
    renderWithProviders(
      <ProjectHeaderLayout info={INFO}>
        <Section />
      </ProjectHeaderLayout>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Portal Clientes v3" })).toHaveClass("sr-only");
    expect(screen.queryByText("Plan revisado")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revisiones 0" })).toBeInTheDocument();
    await expectNoAxeViolations();
  });
});
