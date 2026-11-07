import { beforeEach, describe, expect, it } from "vitest";
import {
  applyAppearance,
  backgroundImageUrl,
  DEFAULT_BACKGROUND,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
} from "./settings";

describe("admin settings", () => {
  beforeEach(() => localStorage.clear());

  it("returns defaults when nothing is stored", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("persists and reloads settings", () => {
    saveSettings({ retentionDays: 15, backgroundImage: "data:x", backgroundOpacity: 50, cardShadow: false });
    expect(loadSettings()).toEqual({
      retentionDays: 15,
      backgroundImage: "data:x",
      backgroundOpacity: 50,
      cardShadow: false,
    });
  });

  it("drops the legacy free-text download folder (UX-02)", () => {
    localStorage.setItem(
      "pharos.admin.settings",
      JSON.stringify({ ...DEFAULT_SETTINGS, downloadLocation: "C:/exports" }),
    );
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("starts with the default background at 40 %", () => {
    expect(loadSettings()).toMatchObject({ backgroundImage: DEFAULT_BACKGROUND, backgroundOpacity: 40 });
    expect(backgroundImageUrl(DEFAULT_BACKGROUND)).toContain("default-background");
    expect(backgroundImageUrl("data:x")).toBe("data:x");
    expect(backgroundImageUrl("")).toBe("");
  });

  it("settings from before the default background get it, keeping the rest", () => {
    localStorage.setItem(
      "pharos.admin.settings",
      JSON.stringify({ backgroundImage: "", backgroundOpacity: 30, retentionDays: 15 }),
    );
    expect(loadSettings()).toEqual({ backgroundImage: DEFAULT_BACKGROUND, backgroundOpacity: 40, cardShadow: true, retentionDays: 15 });
  });

  it("a custom image from before keeps its opacity", () => {
    localStorage.setItem(
      "pharos.admin.settings",
      JSON.stringify({ backgroundImage: "data:mine", backgroundOpacity: 25, retentionDays: 30 }),
    );
    expect(loadSettings()).toMatchObject({ backgroundImage: "data:mine", backgroundOpacity: 25 });
  });

  it("a background removed on purpose stays removed", () => {
    saveSettings({ ...DEFAULT_SETTINGS, backgroundImage: "", backgroundOpacity: 0 });
    expect(loadSettings()).toMatchObject({ backgroundImage: "", backgroundOpacity: 0 });
  });

  it("applies a draft to the whole app, and the saved one by default", () => {
    applyAppearance({ ...DEFAULT_SETTINGS, backgroundImage: "data:x", backgroundOpacity: 75, cardShadow: false });
    const root = document.documentElement.style;
    expect(root.getPropertyValue("--app-bg-image")).toContain("data:x");
    expect(root.getPropertyValue("--app-bg-opacity")).toBe("0.75");
    expect(document.documentElement).not.toHaveAttribute("data-card-shadow");
    applyAppearance();
    expect(root.getPropertyValue("--app-bg-image")).toContain("default-background");
    expect(root.getPropertyValue("--app-bg-opacity")).toBe("0.4");
    expect(document.documentElement).toHaveAttribute("data-card-shadow");
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
