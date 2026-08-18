import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./settings";

describe("admin settings", () => {
  beforeEach(() => localStorage.clear());

  it("returns defaults when nothing is stored", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("persists and reloads settings", () => {
    saveSettings({ retentionDays: 15, downloadLocation: "C:/exports", backgroundImage: "data:x", backgroundOpacity: 50 });
    expect(loadSettings()).toEqual({
      retentionDays: 15,
      downloadLocation: "C:/exports",
      backgroundImage: "data:x",
      backgroundOpacity: 50,
    });
  });

  it("clamps bad retention and opacity to safe ranges", () => {
    saveSettings({ ...DEFAULT_SETTINGS, retentionDays: 0 });
    expect(loadSettings().retentionDays).toBe(30);
    saveSettings({ ...DEFAULT_SETTINGS, retentionDays: 100000 });
    expect(loadSettings().retentionDays).toBe(3650);
    saveSettings({ ...DEFAULT_SETTINGS, backgroundOpacity: 999 });
    expect(loadSettings().backgroundOpacity).toBe(100);
  });
});
