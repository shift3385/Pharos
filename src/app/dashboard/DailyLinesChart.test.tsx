import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { DailyLinesChart } from "./DailyLinesChart";
import type { DailyPoint } from "./model/metrics";

// «Ejecuciones diarias» as lines (UX-32).

/** 7 days ending on Tue 10 Nov 2026; the 8th and the 10th have results. */
function points(): DailyPoint[] {
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(2026, 10, 4 + i);
    const p = { day, passed: 0, failed: 0, others: 0, manual: 0, imported: 0, total: 0 };
    if (i === 4) Object.assign(p, { passed: 2, failed: 1, total: 3 });
    if (i === 6) Object.assign(p, { passed: 4, failed: 3, others: 1, total: 8 });
    return p;
  });
}

const render = () =>
  renderWithProviders(
    <DailyLinesChart points={points()} status="ready" label="Ejecuciones por día" periodText="últimos 7 días" />,
  );

const series = () =>
  [...document.querySelectorAll(".home-lines__series")].map((g) => g.getAttribute("data-series"));

describe("DailyLinesChart (UX-32)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
  });
  afterEach(() => vi.restoreAllMocks());

  it("draws a line per state with dots only above 0, and labels every day for screen readers", () => {
    render();
    expect(series()).toEqual(["passed", "failed", "others"]);
    expect(document.querySelectorAll('[data-series="passed"] circle')).toHaveLength(2);
    expect(document.querySelectorAll('[data-series="others"] circle')).toHaveLength(1);
    expect(screen.getByRole("img", { name: "Ejecuciones por día" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Ejecuciones por día, últimos 7 días" });
    expect(table.parentElement).toHaveClass("sr-only");
    expect(table.querySelectorAll("tbody tr")).toHaveLength(7);
    // y axis: the top value (4) is under the minimum of 5; whole numbers
    // only, a test runs or not (FIX-25).
    expect([...document.querySelectorAll(".home-lines__grid text")].map((t) => t.textContent)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
  });

  it("filters with the legend, rescales, and never hides the last line", async () => {
    const user = userEvent.setup();
    render();
    const pass = screen.getByRole("button", { name: "Pasa" });
    await user.click(pass);
    expect(pass).toHaveAttribute("aria-pressed", "false");
    expect(series()).toEqual(["failed", "others"]);
    await user.click(screen.getByRole("button", { name: "Otras" }));
    const fail = screen.getByRole("button", { name: "Falla" });
    expect(fail).toHaveAttribute("aria-disabled", "true");
    await user.click(fail);
    expect(series()).toEqual(["failed"]);
    expect(fail).toHaveAttribute("aria-pressed", "true");
    await user.click(pass);
    expect(series()).toEqual(["passed", "failed"]);
  });

  it("shows the day under the pointer: a hairline and a bubble with each visible value", () => {
    // jsdom has no PointerEvent: without it the event loses its clientX.
    if (typeof window.PointerEvent === "undefined") vi.stubGlobal("PointerEvent", class extends MouseEvent {});
    render();
    const area = screen.getByRole("group", { name: /usa las flechas/ });
    vi.spyOn(area, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 560, height: 170 } as DOMRect);
    // The last day sits at the plot's right edge (560 − 10 px).
    fireEvent.pointerMove(area, { clientX: 548 });
    const tip = screen.getByTestId("home-daily-tip");
    expect(tip).toHaveTextContent("mar, 10 nov");
    expect(tip).toHaveTextContent("4 Pasa");
    expect(tip).toHaveTextContent("3 Falla");
    expect(tip).toHaveTextContent("1 Otras");
    expect(document.querySelector(".home-lines__cross")).not.toBeNull();
    fireEvent.pointerLeave(area);
    expect(screen.queryByTestId("home-daily-tip")).toBeNull();
  });

  it("walks the days with the keyboard and says each one", async () => {
    const user = userEvent.setup();
    render();
    await user.tab();
    const area = screen.getByRole("group", { name: /usa las flechas/ });
    expect(area).toHaveFocus();
    expect(screen.getByTestId("home-daily-tip")).toHaveTextContent("mar, 10 nov");
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByTestId("home-daily-tip")).toHaveTextContent("dom, 8 nov");
    expect(screen.getByText("dom, 8 nov: Pasa 2, Falla 1, Otras 0")).toHaveAttribute("aria-live", "polite");
    await user.keyboard("{Home}");
    expect(screen.getByTestId("home-daily-tip")).toHaveTextContent("mié, 4 nov");
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("home-daily-tip")).toBeNull();
  });

  it("too narrow, becomes the total with a bare trend line, no axes", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 180,
      height: 120,
    } as DOMRect);
    act(() => {
      render();
    });
    expect(document.querySelector(".home-lines--spark")).not.toBeNull();
    expect(document.querySelector(".home-lines__big")).toHaveTextContent("11");
    expect(document.querySelector(".home-lines__grid")).toBeNull();
  });
});
