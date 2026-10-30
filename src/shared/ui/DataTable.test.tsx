import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setViewportWidth } from "@test/viewport";
import { i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { DataTable, type DataColumn, type SortState } from "./DataTable";

interface Row {
  id: string;
  title: string;
  level: string;
}
const ROWS: Row[] = [
  { id: "a", title: "Pago con tarjeta", level: "Básico" },
  { id: "b", title: "Reembolso parcial", level: "Avanzado" },
];
const COLUMNS: DataColumn<Row>[] = [
  {
    id: "title",
    header: "Título",
    width: "minmax(0,2fr)",
    sortable: true,
    cell: (r) => <a href={`#${r.id}`}>{r.title}</a>,
  },
  { id: "level", header: "Nivel", minView: "desktop", cell: (r) => r.level },
];

function Harness({ onSort = () => {} }: { onSort?: (s: SortState) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  return (
    <DataTable
      rows={ROWS}
      columns={COLUMNS}
      getRowId={(r) => r.id}
      label="Casos"
      selection={{ selected, onChange: setSelected, rowLabel: (r) => r.title }}
      sort={{ id: "title", dir: "asc" }}
      onSortChange={onSort}
      mobileCard={(r) => <a href={`#${r.id}`}>{r.title}</a>}
    />
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("es");
});

describe("DataTable", () => {
  it("is a named table whose primary cell holds the link", async () => {
    setViewportWidth(1440);
    render(<Harness />);
    const table = screen.getByRole("table", { name: "Casos" });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(3);
    expect(within(table).getByRole("link", { name: "Pago con tarjeta" })).toHaveAttribute("href", "#a");
    expect(within(table).getByRole("cell", { name: "Avanzado" })).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("selects rows one by one and all at once, with an indeterminate header", async () => {
    setViewportWidth(1440);
    render(<Harness />);
    const all = screen.getByRole("checkbox", { name: "Seleccionar todas las filas" }) as HTMLInputElement;
    await userEvent.click(screen.getByRole("checkbox", { name: "Seleccionar Pago con tarjeta" }));
    expect(all.indeterminate).toBe(true);
    expect(all.checked).toBe(false);
    await userEvent.click(all);
    expect(all.checked).toBe(true);
    expect(screen.getByRole("checkbox", { name: "Seleccionar Reembolso parcial" })).toBeChecked();
    await userEvent.click(all);
    expect(screen.getByRole("checkbox", { name: "Seleccionar Pago con tarjeta" })).not.toBeChecked();
  });

  it("sorts from a header button and says the order with aria-sort", async () => {
    setViewportWidth(1440);
    const onSort = vi.fn();
    render(<Harness onSort={onSort} />);
    const header = screen.getByRole("columnheader", { name: /Título/ });
    expect(header).toHaveAttribute("aria-sort", "ascending");
    await userEvent.click(within(header).getByRole("button", { name: "Título" }));
    expect(onSort).toHaveBeenCalledWith({ id: "title", dir: "desc" });
  });

  it("hides a desktop column on tablet", () => {
    setViewportWidth(820);
    render(<Harness />);
    expect(screen.queryByRole("columnheader", { name: "Nivel" })).not.toBeInTheDocument();
  });

  it("is a list of cards on mobile, still selectable", async () => {
    setViewportWidth(390);
    render(<Harness />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Casos" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    const box = within(list).getByRole("checkbox", { name: "Seleccionar Reembolso parcial" });
    await userEvent.click(box);
    expect(box).toBeChecked();
    await expectNoAxeViolations();
  });

  it("shows its empty state without rows", () => {
    setViewportWidth(1440);
    render(
      <DataTable
        rows={[] as Row[]}
        columns={COLUMNS}
        getRowId={(r) => r.id}
        label="Casos"
        empty="Ningún caso coincide."
      />,
    );
    expect(screen.getByText("Ningún caso coincide.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("selects all from the cards too on mobile", async () => {
    setViewportWidth(390);
    render(<Harness />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Seleccionar todas las filas" }));
    expect(screen.getByRole("checkbox", { name: "Seleccionar Pago con tarjeta" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Seleccionar Reembolso parcial" })).toBeChecked();
  });

  it("keeps the header «indeterminate» when the parent rejects the change", async () => {
    setViewportWidth(1440);
    render(
      <DataTable
        rows={ROWS}
        columns={COLUMNS}
        getRowId={(r) => r.id}
        label="Casos"
        selection={{ selected: new Set(["a"]), onChange: () => {}, rowLabel: (r) => r.title }}
      />,
    );
    const all = screen.getByRole("checkbox", { name: "Seleccionar todas las filas" }) as HTMLInputElement;
    expect(all.indeterminate).toBe(true);
    await userEvent.click(all);
    expect(all.indeterminate).toBe(true);
    expect(all.checked).toBe(false);
  });

  it("says no order (no aria-sort) when the parent cannot sort", () => {
    setViewportWidth(1440);
    render(<DataTable rows={ROWS} columns={COLUMNS} getRowId={(r) => r.id} label="Casos" />);
    expect(screen.getByRole("columnheader", { name: "Título" })).not.toHaveAttribute("aria-sort");
  });
});
