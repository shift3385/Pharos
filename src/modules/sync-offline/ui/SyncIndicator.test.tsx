// The sync indicator (UX-26): a sync button in the icon strip, and the arrows
// that turn while a sync runs (manual or automatic), still with reduced motion.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { SyncIndicator, SyncStatusProvider } from "./SyncIndicator";
import { SyncStatusContext, type SyncStatusValue } from "./syncStatusContext";

const syncAny = vi.fn();
vi.mock("../api/syncApi", async (orig) => ({
  ...(await orig<typeof import("../api/syncApi")>()),
  syncAny: () => syncAny(),
  syncLocalState: () => Promise.resolve({ pending: 0, conflicts: 0 }),
}));
vi.mock("../api/purgeApi", () => ({ purgeDeleted: () => Promise.resolve() }));

/** Stubs `prefers-reduced-motion`. */
function motion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce") ? reduce : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function value(over: Partial<SyncStatusValue> = {}): SyncStatusValue {
  return {
    status: "synced",
    label: "Sincronizado",
    title: "Sincronizado",
    conflicts: 0,
    pending: 0,
    syncing: false,
    runSync: vi.fn(),
    openConflicts: vi.fn(),
    ...over,
  };
}

function show(variant: "full" | "compact", v: SyncStatusValue) {
  return renderWithProviders(
    <SyncStatusContext.Provider value={v}>
      <SyncIndicator variant={variant} />
    </SyncStatusContext.Provider>,
  );
}

const icon = () => screen.getByTestId("sync-icon");

describe("SyncIndicator (UX-26)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    motion(false);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("in the icon strip", () => {
    it("is a «Sincronizar ahora» button with the status in its tooltip, and syncs", async () => {
      const v = value();
      show("compact", v);
      const button = screen.getByRole("button", { name: /Sincronizar ahora/ });
      expect(button).toHaveAccessibleName("Sincronizado. Sincronizar ahora");
      expect(button).toHaveAttribute("title", "Sincronizado · Sincronizar ahora");
      await userEvent.click(button);
      expect(v.runSync).toHaveBeenCalledTimes(1);
    });

    it("opens the conflicts panel when there are conflicts", async () => {
      const v = value({ status: "conflicts", label: "Conflictos (2)", title: "Conflictos (2)", conflicts: 2 });
      show("compact", v);
      await userEvent.click(screen.getByRole("button", { name: /Revisar conflictos/ }));
      expect(v.openConflicts).toHaveBeenCalledTimes(1);
      expect(v.runSync).not.toHaveBeenCalled();
    });

    it("does nothing offline, but keeps its tooltip", async () => {
      const v = value({ status: "offline", label: "Sin conexión", title: "Sin conexión" });
      show("compact", v);
      const button = screen.getByTestId("sync-compact");
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).toHaveAttribute("title", "Sin conexión · Sincronizar ahora");
      await userEvent.click(button);
      expect(v.runSync).not.toHaveBeenCalled();
    });

    it("turns its arrows while syncing and says so", async () => {
      const v = value({ syncing: true });
      show("compact", v);
      const button = screen.getByTestId("sync-compact");
      expect(icon()).toHaveClass("sync__spin");
      expect(button).toHaveClass("sync--busy");
      expect(button).toHaveAccessibleName("Sincronizando…");
      expect(button).toHaveAttribute("title", "Sincronizando…");
      expect(button).toHaveAttribute("aria-busy", "true");
      await userEvent.click(button);
      expect(v.runSync).not.toHaveBeenCalled();
    });

    it("with reduced motion, does not turn: the dot changes instead", () => {
      motion(true);
      show("compact", value({ syncing: true }));
      expect(icon()).not.toHaveClass("sync__spin");
      expect(screen.getByTestId("sync-compact")).toHaveClass("sync--busy");
    });
  });

  describe("in the full sidebar", () => {
    it("turns the arrows of «Sincronizando…» while syncing", () => {
      show("full", value({ syncing: true }));
      expect(screen.getByRole("button", { name: "Sincronizando…" })).toBeDisabled();
      expect(icon()).toHaveClass("sync__spin");
      expect(document.querySelector(".sync")).toHaveClass("sync--busy");
    });

    it("keeps the arrows still when idle or with reduced motion", () => {
      const { unmount } = show("full", value());
      expect(icon()).not.toHaveClass("sync__spin");
      expect(document.querySelector(".sync")).not.toHaveClass("sync--busy");
      unmount();
      motion(true);
      show("full", value({ syncing: true }));
      expect(icon()).not.toHaveClass("sync__spin");
    });
  });

  it("turns during the automatic sync too (sign-in, NC-025)", async () => {
    let finish: () => void = () => {};
    syncAny.mockReset().mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve({ pushed: 0, pulled: 0, conflicts: 0 });
      }),
    );
    renderWithProviders(
      <SyncStatusProvider>
        <SyncIndicator variant="compact" />
      </SyncStatusProvider>,
    );
    // The sign-in sync starts on its own.
    expect(await screen.findByRole("button", { name: "Sincronizando…" })).toBeInTheDocument();
    expect(icon()).toHaveClass("sync__spin");
    await act(async () => finish());
    expect(await screen.findByRole("button", { name: /Sincronizar ahora/ })).toBeInTheDocument();
    expect(icon()).not.toHaveClass("sync__spin");
  });
});
