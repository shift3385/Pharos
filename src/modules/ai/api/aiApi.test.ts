import { beforeEach, describe, expect, it } from "vitest";
import { loadConfig, pickProvider, saveConfig } from "./aiApi";
import { DEFAULT_AI_CONFIG } from "../model/types";

describe("pickProvider", () => {
  it("auto prefers online when available, else offline", () => {
    expect(pickProvider("auto", { online: true, offline: true })).toBe("online");
    expect(pickProvider("auto", { online: false, offline: true })).toBe("offline");
    expect(pickProvider("auto", { online: false, offline: false })).toBeNull();
  });

  it("respects a forced online/offline mode and reports null when unavailable", () => {
    expect(pickProvider("online", { online: true, offline: true })).toBe("online");
    expect(pickProvider("online", { online: false, offline: true })).toBeNull();
    expect(pickProvider("offline", { online: true, offline: false })).toBeNull();
    expect(pickProvider("offline", { online: true, offline: true })).toBe("offline");
  });
});

describe("ai config persistence", () => {
  beforeEach(() => localStorage.clear());

  it("returns defaults when nothing is stored", () => {
    expect(loadConfig()).toEqual(DEFAULT_AI_CONFIG);
  });

  it("round-trips saved config and merges over defaults", () => {
    saveConfig({ ...DEFAULT_AI_CONFIG, mode: "offline", temperature: 0.2 });
    const cfg = loadConfig();
    expect(cfg.mode).toBe("offline");
    expect(cfg.temperature).toBe(0.2);
    expect(cfg.offlineModel).toBe(DEFAULT_AI_CONFIG.offlineModel); // untouched default
  });
});
