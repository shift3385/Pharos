import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { setViewportWidth } from "@test/viewport";
import { i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { TableSkeleton, type DataColumn } from "./DataTable";
import { CardGridSkeleton, FormSkeleton, ListSkeleton, LoadingStatus, Skeleton, SkeletonRegion, SKELETON_DELAY_MS } from "./Skeleton";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "skeleton.css"), "utf8");
const tokens = readFileSync(join(here, "../theme/tokens.css"), "utf8");

const columns: DataColumn<{ id: string }>[] = [
  { id: "key", header: "ID", width: "96px", cell: () => null },
  { id: "title", header: "Título", width: "minmax(0,2fr)", cell: () => null },
  { id: "wide", header: "Solo escritorio", minView: "desktop", cell: () => null },
];

beforeEach(async () => {
  await i18n.changeLanguage("es");
});

describe("LoadingStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("says nothing during a fast load, then announces once", () => {
    render(<LoadingStatus />);
    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();
    act(() => vi.advanceTimersByTime(SKELETON_DELAY_MS - 1));
    expect(status).toBeEmptyDOMElement();
    act(() => vi.advanceTimersByTime(1));
    expect(status).toHaveTextContent("Cargando…");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("goes quiet when the load ends, even before the delay", () => {
    const { rerender } = render(<LoadingStatus active />);
    rerender(<LoadingStatus active={false} />);
    act(() => vi.advanceTimersByTime(SKELETON_DELAY_MS * 2));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("keeps the live region out of the hidden shapes", () => {
    render(
      <SkeletonRegion>
        <Skeleton />
      </SkeletonRegion>,
    );
    const status = screen.getByRole("status");
    expect(status.closest('[aria-hidden="true"]')).toBeNull();
    expect(status.closest("[aria-busy]")).toBeNull();
  });

  it("a skeleton right after another continues the wait: no delay, no second announcement", () => {
    // Clear of the skeleton of the test before.
    let now = 1e12;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    const first = render(
      <SkeletonRegion>
        <Skeleton />
      </SkeletonRegion>,
    );
    act(() => vi.advanceTimersByTime(SKELETON_DELAY_MS));
    expect(screen.getByRole("status")).toHaveTextContent("Cargando…");
    first.unmount();

    const next = render(
      <SkeletonRegion>
        <Skeleton />
      </SkeletonRegion>,
    );
    expect(screen.getByTestId("skeleton")).toHaveAttribute("data-continues");
    act(() => vi.advanceTimersByTime(SKELETON_DELAY_MS));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    next.unmount();

    // A later, separate load starts over.
    now += 1000;
    render(
      <SkeletonRegion>
        <Skeleton />
      </SkeletonRegion>,
    );
    expect(screen.getByTestId("skeleton")).not.toHaveAttribute("data-continues");
    clock.mockRestore();
  });

  it("does not announce when the screen says it elsewhere", () => {
    render(
      <SkeletonRegion announce={false}>
        <Skeleton />
      </SkeletonRegion>,
    );
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("TableSkeleton", () => {
  it("uses the columns of the view and hides them from assistive technology", () => {
    setViewportWidth(1440);
    const { container } = render(<TableSkeleton columns={columns} rows={3} selectable />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Solo escritorio").closest('[aria-hidden="true"]')).not.toBeNull();
    const table = container.querySelector<HTMLElement>(".dt")!;
    expect(table.style.getPropertyValue("--dt-cols")).toBe("36px 96px minmax(0,2fr) minmax(0,1fr)");
    expect(container.querySelectorAll(".dt__row")).toHaveLength(4);
  });

  it("drops the columns hidden below their view", () => {
    setViewportWidth(800);
    render(<TableSkeleton columns={columns} />);
    expect(screen.queryByText("Solo escritorio")).toBeNull();
    expect(screen.getByText("Título")).toBeInTheDocument();
  });

  it("shows cards on mobile, or the table when it has no card view", () => {
    setViewportWidth(390);
    const { container, unmount } = render(<TableSkeleton columns={columns} rows={2} />);
    expect(container.querySelectorAll(".dt-card")).toHaveLength(2);
    expect(container.querySelector(".dt")).toBeNull();
    unmount();
    const table = render(<TableSkeleton columns={columns} rows={2} cards={false} />);
    expect(table.container.querySelector(".dt")).not.toBeNull();
  });
});

describe("skeleton styles", () => {
  it("respects reduced motion and waits as long as the announcement", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.sk::after \{\s*display: none/);
    expect(css).toContain(`ease ${SKELETON_DELAY_MS}ms forwards`);
  });

  it("has its colours in both themes", () => {
    expect(tokens.match(/--color-skeleton:/g)).toHaveLength(2);
    expect(tokens.match(/--color-skeleton-shine:/g)).toHaveLength(2);
  });
});

it("every skeleton passes axe and holds nothing focusable", async () => {
  setViewportWidth(1440);
  const { container } = render(
    <main>
      <TableSkeleton columns={columns} />
      <ListSkeleton />
      <CardGridSkeleton className="grid" />
      <FormSkeleton />
    </main>,
  );
  expect(container.querySelector("a, button, input, select, textarea, [tabindex]")).toBeNull();
  await expectNoAxeViolations();
});
