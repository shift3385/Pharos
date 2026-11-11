import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GadgetFitContext, useFitRows } from "./model/fitRows";
import { COMPACT_BELOW, MIN_ROW_HEIGHT } from "./HomeBoard";

// UX-28: a gadget never scrolls. Its lists draw the rows that fit and say
// how many are left («+N más»).

function List({ total }: { total: number }) {
  const { boxRef, listRef, shown, more } = useFitRows(total);
  return (
    <div ref={boxRef} data-testid="box">
      <ul ref={listRef}>
        {Array.from({ length: shown }, (_, i) => (
          <li key={i}>row {i}</li>
        ))}
      </ul>
      {more > 0 && <a data-fit-more>+{more} más</a>}
    </div>
  );
}

/** jsdom has no layout: the box is `free` px tall and a row 20 px. */
function layout(free: number) {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.dataset.testid === "box" ? free : 0;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ height: 20, width: 100, top: 0, left: 0, right: 100, bottom: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
  );
}

describe("useFitRows (UX-28)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("on the board draws the rows that fit and leaves the rest to «+N más»", () => {
    layout(100);
    render(
      <GadgetFitContext.Provider value>
        <List total={10} />
      </GadgetFitContext.Provider>,
    );
    // 5 rows would fill 100 px; «+N más» (22 px) leaves room for 3.
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("+7 más")).toBeInTheDocument();
  });

  it("draws them all when they fit, with no «+N más»", () => {
    layout(100);
    render(
      <GadgetFitContext.Provider value>
        <List total={5} />
      </GadgetFitContext.Provider>,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.queryByText(/más/)).toBeNull();
  });

  it("off the board (tablet, mobile) the card grows: every row shows", () => {
    layout(40);
    render(<List total={10} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  });

  it("without a measured height (no layout yet) every row shows", () => {
    layout(0);
    render(
      <GadgetFitContext.Provider value>
        <List total={10} />
      </GadgetFitContext.Provider>,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  });
});

describe("no scroll inside a gadget (UX-28)", () => {
  /** Every rule of a stylesheet that lets something scroll. */
  const scrolling = (file: string) => {
    const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) => /overflow(-x|-y)?\s*:\s*(auto|scroll)/.test(m[2]))
      .map((m) => m[1].trim());
  };

  it("no rule of Inicio lets a gadget scroll: only the project picker's popover does", () => {
    expect(scrolling("src/app/dashboard/DashboardPage.css")).toEqual([".home-picker__list"]);
  });

  it("on the board, gadgets, cards, list areas and tabs clip instead of scrolling", () => {
    const css = readFileSync("src/app/dashboard/DashboardPage.css", "utf8");
    const rule = (selector: string) => {
      const at = css.indexOf(`\n${selector} {`);
      return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
    };
    expect(rule(".home-gadget__body")).toMatch(/overflow: hidden/);
    expect(rule(".home-gadget__body > .home-card,\n.home-gadget__body > .home-kpi,\n.home-gadget__body > .home-kpi-stack")).toMatch(/overflow: hidden/);
    expect(rule(".home-board .home-card > .home-fit,\n.home-board .home-upcoming__panel")).toMatch(/overflow: hidden/);
    // The underline tabs scroll sideways elsewhere (controls.css); not here.
    expect(rule(".home-board .tabs--underline")).toMatch(/overflow: hidden/);
  });

  it("compacts before the rows reach their minimum, under which the page scrolls", () => {
    expect(MIN_ROW_HEIGHT).toBe(14);
    expect(COMPACT_BELOW).toBeGreaterThan(MIN_ROW_HEIGHT);
  });
});
