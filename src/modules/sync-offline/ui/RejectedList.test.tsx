import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";

const discard = vi.fn(async (_id: string) => {});
vi.mock("../api/syncApi", () => ({ discardRejection: (id: string) => discard(id) }));
const { RejectedList } = await import("./RejectedList");

describe("RejectedList (SYNC-07)", () => {
  const items = [
    { id: "r1", entity: "test_case", entityId: "c1", reason: "forbidden" as const, workspaceId: "ws", detectedAt: "now" },
    { id: "r2", entity: "project", entityId: "p9", reason: "not_found" as const, workspaceId: null, detectedAt: "now" },
  ];

  it("explains each refusal and discards it", async () => {
    await i18n.changeLanguage("es");
    const onResolved = vi.fn();
    renderWithProviders(<RejectedList items={items} onResolved={onResolved} />);
    expect(screen.getByRole("heading", { name: "Rechazado por permisos" })).toBeInTheDocument();
    expect(screen.getByTestId("rejected-c1")).toHaveTextContent("Tu rol no permite este cambio");
    expect(screen.getByTestId("rejected-p9")).toHaveTextContent("ya no está en ninguno de tus workspaces");
    await userEvent.click(screen.getAllByRole("button", { name: "Descartar" })[0]);
    expect(discard).toHaveBeenCalledWith("r1");
    expect(onResolved).toHaveBeenCalled();
  });

  it("renders nothing without refusals and has no axe violations", async () => {
    await i18n.changeLanguage("en");
    const empty = renderWithProviders(<RejectedList items={[]} onResolved={() => {}} />);
    expect(screen.queryByRole("heading")).toBeNull();
    empty.unmount();
    const { container } = renderWithProviders(<RejectedList items={items} onResolved={() => {}} />);
    await expectNoAxeViolations(container);
  });
});
