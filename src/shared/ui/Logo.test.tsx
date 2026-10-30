import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Logo } from "./Logo";

describe("Logo (SPEC §11)", () => {
  it("is the full mark from 28 px: windows and three beams", () => {
    const { container } = render(<Logo size={35} />);
    const svg = screen.getByRole("img", { name: "Pharos" });
    expect(svg).toHaveAttribute("data-variant", "full");
    expect(container.querySelectorAll('[data-part="window"]')).toHaveLength(2);
  });

  it("is the compact mark below 28 px: no windows", () => {
    const { container } = render(<Logo size={16} />);
    expect(screen.getByRole("img")).toHaveAttribute("data-variant", "compact");
    expect(container.querySelectorAll('[data-part="window"]')).toHaveLength(0);
  });

  it("paints the tower navy 500 on light surfaces and navy 300 on navy", () => {
    const { container, rerender } = render(<Logo />);
    const tower = () => container.querySelector('[data-part="tower"]');
    expect(tower()).toHaveAttribute("fill", "var(--color-navy-500)");
    rerender(<Logo surface="navy" />);
    expect(tower()).toHaveAttribute("fill", "var(--color-navy-300)");
  });

  it("takes its accessible name from title", () => {
    render(<Logo title="Inicio de Pharos" />);
    expect(screen.getByRole("img", { name: "Inicio de Pharos" })).toBeInTheDocument();
  });
});
