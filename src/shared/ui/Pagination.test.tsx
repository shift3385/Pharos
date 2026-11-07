import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setViewportWidth } from "@test/viewport";
import { i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { Pagination } from "./Pagination";
import { pageWindow } from "./pageWindow";

beforeEach(async () => {
  await i18n.changeLanguage("es");
});

describe("pageWindow", () => {
  it("lists every page when there are few", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(2, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(1, 0)).toEqual([]);
  });

  it("keeps the ends and the current page with its neighbours", () => {
    expect(pageWindow(1, 24)).toEqual([1, 2, 3, "…", 24]);
    expect(pageWindow(3, 24)).toEqual([1, 2, 3, 4, "…", 24]);
    expect(pageWindow(12, 24)).toEqual([1, "…", 11, 12, 13, "…", 24]);
    expect(pageWindow(24, 24)).toEqual([1, "…", 22, 23, 24]);
  });

  it("shows the page instead of «…» when only one is missing", () => {
    expect(pageWindow(4, 24)).toEqual([1, 2, 3, 4, 5, "…", 24]);
    expect(pageWindow(5, 9)).toEqual([1, "…", 4, 5, 6, "…", 9]);
  });

  it("clamps a page out of range", () => {
    expect(pageWindow(99, 3)).toEqual([1, 2, 3]);
  });
});

describe("Pagination", () => {
  it("says what it shows and moves between pages", async () => {
    setViewportWidth(1440);
    const onPage = vi.fn();
    render(<Pagination page={1} pageSize={10} total={240} onPageChange={onPage} />);
    expect(screen.getByText(/Mostrando/)).toHaveTextContent("Mostrando 1–10 de 240");
    const nav = screen.getByRole("navigation", { name: "Paginación" });
    expect(within(nav).getByRole("button", { name: "Página 1" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("button", { name: "Página anterior" })).toBeDisabled();
    await userEvent.click(within(nav).getByRole("button", { name: "Página 24" }));
    expect(onPage).toHaveBeenLastCalledWith(24);
    await userEvent.click(within(nav).getByRole("button", { name: "Página siguiente" }));
    expect(onPage).toHaveBeenLastCalledWith(2);
    await expectNoAxeViolations();
  });

  it("takes its own summary", () => {
    setViewportWidth(1440);
    render(
      <Pagination
        page={1}
        pageSize={10}
        total={14}
        onPageChange={() => {}}
        summary={({ from, to, total }) => `${from}-${to} / ${total} casos`}
      />,
    );
    expect(screen.getByText("1-10 / 14 casos")).toBeInTheDocument();
  });

  it("shows nothing while everything fits in the smallest page", () => {
    setViewportWidth(1440);
    const sizes = { pageSizes: [5, 10, 20], onPageSizeChange: () => {}, onPageChange: () => {} };
    const { container, rerender } = render(<Pagination page={1} pageSize={5} total={5} {...sizes} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<Pagination page={1} pageSize={5} total={0} {...sizes} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<Pagination page={1} pageSize={10} total={4} onPageChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("stays from one above the smallest page, even if a larger size fits them all", () => {
    setViewportWidth(1440);
    const sizes = { pageSizes: [5, 10, 20], onPageSizeChange: () => {}, onPageChange: () => {} };
    const { rerender } = render(<Pagination page={1} pageSize={5} total={6} {...sizes} />);
    expect(screen.getByText(/Mostrando/)).toHaveTextContent("Mostrando 1–5 de 6");
    expect(screen.getByRole("navigation", { name: "Paginación" })).toBeInTheDocument();
    // Otherwise choosing 20 would take away the way back to 5.
    rerender(<Pagination page={1} pageSize={20} total={6} {...sizes} />);
    expect(screen.getByRole("button", { name: "20 por página" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("is compact on mobile", () => {
    setViewportWidth(390);
    render(<Pagination page={2} pageSize={10} total={240} onPageChange={() => {}} />);
    expect(screen.getByText("Página 2 de 24")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Página 24" })).not.toBeInTheDocument();
  });

  it("changes the page size from its menu", async () => {
    setViewportWidth(1440);
    const onSize = vi.fn();
    render(
      <Pagination
        page={1}
        pageSize={12}
        total={100}
        onPageChange={() => {}}
        pageSizes={[12, 24, 48]}
        onPageSizeChange={onSize}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "12 por página" }));
    const menu = screen.getByRole("menu", { name: "Por página" });
    expect(within(menu).getByRole("menuitemradio", { name: "12 por página" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await userEvent.click(within(menu).getByRole("menuitemradio", { name: "48 por página" }));
    expect(onSize).toHaveBeenCalledWith(48);
  });

  it("moves back to the last page when the list shrank under it", () => {
    setViewportWidth(1440);
    const onPage = vi.fn();
    render(<Pagination page={5} pageSize={10} total={23} onPageChange={onPage} />);
    expect(onPage).toHaveBeenCalledWith(3);
    expect(screen.getByText(/Mostrando/)).toHaveTextContent("Mostrando 21–23 de 23");
  });
});
