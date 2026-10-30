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
    <button type="button" className="header-action" onClick={() => setN((v) => v + 1)}>
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
    expect(screen.getByRole("heading", { level: 1, name: "Portal Clientes v3" })).toBeInTheDocument();
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

describe("ProjectHeader (review of PR #20)", () => {
  function Named({ name }: { name: string }) {
    useHeaderActions(<button type="button">{name}</button>);
    return <p>{name}</p>;
  }

  it("going from section A to B shows B's actions, even when A's cleanup runs after B registers", async () => {
    setViewportWidth(1440);
    function Sections() {
      const [tab, setTab] = useState<"a" | "b">("a");
      return (
        <ProjectHeaderLayout info={INFO}>
          <button type="button" onClick={() => setTab("b")}>
            ir a B
          </button>
          {/* Keyed like the routes: A unmounts, B mounts in the same commit. */}
          {tab === "a" ? <Named key="a" name="Acción A" /> : <Named key="b" name="Acción B" />}
        </ProjectHeaderLayout>
      );
    }
    renderWithProviders(<Sections />);
    expect(screen.getByRole("button", { name: "Acción A" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ir a B" }));
    expect(screen.getByRole("button", { name: "Acción B" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Acción A" })).not.toBeInTheDocument();
  });

  it("shows no plan pill while the status is unknown, and «Sin plan» once it is known", () => {
    setViewportWidth(1440);
    const { rerender } = renderWithProviders(
      <ProjectHeaderLayout info={{ ...INFO, planStatus: undefined }}>
        <p>sección</p>
      </ProjectHeaderLayout>,
    );
    expect(screen.queryByText(/Plan |Sin plan/)).not.toBeInTheDocument();
    rerender(
      <ProjectHeaderLayout info={{ ...INFO, planStatus: null }}>
        <p>sección</p>
      </ProjectHeaderLayout>,
    );
    expect(screen.getByText("Sin plan")).toBeInTheDocument();
  });

  it("gives the name a tooltip only when it is cut", () => {
    setViewportWidth(1440);
    renderWithProviders(
      <ProjectHeaderLayout info={INFO}>
        <p>sección</p>
      </ProjectHeaderLayout>,
    );
    // jsdom has no layout: nothing is cut, so no tooltip.
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveAttribute("title");
  });

  it("on mobile without actions leaves only the hidden heading (no empty row)", () => {
    setViewportWidth(390);
    renderWithProviders(
      <ProjectHeaderLayout info={INFO}>
        <p>sección</p>
      </ProjectHeaderLayout>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass("sr-only");
    expect(document.querySelector("header.pj-header")).not.toBeInTheDocument();
  });
});
