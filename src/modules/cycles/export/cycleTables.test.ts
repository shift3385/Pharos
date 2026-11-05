// EXP-03: what the exports read of a project's cycles, and how a failure to
// read them stops the export with one toast.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@test/utils";
import { ReportedError } from "@shared/ui/notify";
import { loadCycleExport } from "./cycleTables";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  items: vi.fn(),
  configurations: vi.fn(),
}));
vi.mock("../api/cycleApi", () => ({
  cycleApi: { list: api.list, items: api.items },
  configurationApi: { list: api.configurations },
}));
const notify = vi.hoisted(() => vi.fn());
vi.mock("@shared/ui/notify", async (orig) => ({
  ...(await orig<typeof import("@shared/ui/notify")>()),
  notify,
}));

const cycle = (id: string, items: number, configurationIds: string[] = []) => ({
  id,
  cycleKey: id.toUpperCase(),
  title: id,
  status: "active",
  configurationIds,
  items,
});

beforeEach(async () => {
  await i18n.changeLanguage("es");
  Object.values(api).forEach((f) => f.mockReset());
  notify.mockReset();
  api.items.mockImplementation(async (id: string) => [
    { id: `${id}-i`, cycleId: id },
  ]);
  api.configurations.mockResolvedValue([{ id: "k1", name: "Chrome" }]);
});

describe("loadCycleExport", () => {
  it("reads items only when asked, and only of the cycles that have any", async () => {
    api.list.mockResolvedValue([cycle("c1", 2, ["k1"]), cycle("c2", 0)]);
    const plain = await loadCycleExport("p", "u");
    expect(api.items).not.toHaveBeenCalled();
    expect(plain.configurations).toEqual([{ id: "k1", name: "Chrome" }]);

    const full = await loadCycleExport("p", "u", true);
    expect(api.items).toHaveBeenCalledTimes(1);
    expect(api.items).toHaveBeenCalledWith("c1", "u");
    expect([...full.items.keys()]).toEqual(["c1"]);
  });

  it("no configuration is read when no cycle has one", async () => {
    api.list.mockResolvedValue([cycle("c1", 0)]);
    expect((await loadCycleExport("p", "u")).configurations).toEqual([]);
    expect(api.configurations).not.toHaveBeenCalled();
  });

  it("a failure is one error toast and a ReportedError, so callers stay quiet", async () => {
    api.list.mockRejectedValue(new Error("offline"));
    const failed = loadCycleExport("p", "u", true);
    await expect(failed).rejects.toBeInstanceOf(ReportedError);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      "No se pudieron leer los ciclos del proyecto: no se ha exportado nada.",
      "error",
    );
  });

  it("a failure reading the items stops it too", async () => {
    api.list.mockResolvedValue([cycle("c1", 1)]);
    api.items.mockRejectedValue(new Error("offline"));
    await expect(loadCycleExport("p", "u", true)).rejects.toBeInstanceOf(
      ReportedError,
    );
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
