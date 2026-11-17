// SYNC-09: the shell takes the account's language and theme, and sends the
// ones chosen here, never one it just took.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { ThemeProvider } from "@shared/theme/ThemeProvider";
import { useTheme } from "@shared/theme/useTheme";
import { i18n } from "@test/utils";

const remote = new Map<string, unknown>();
const pushSynced = vi.fn(async () => undefined);
vi.mock("@modules/profile", async (importOriginal) => {
  const real = await importOriginal<typeof import("@modules/profile")>();
  return {
    ...real,
    pullSynced: async (_u: string, key: string, current: unknown) => {
      const v = remote.get(key);
      return v === undefined || JSON.stringify(v) === JSON.stringify(current) ? null : v;
    },
    pushSynced: (...a: unknown[]) => pushSynced(...(a as [])),
    syncProfileNames: async () => "skipped",
  };
});
vi.mock("@modules/auth", () => ({ useAuth: () => ({ user: { id: "me" } }) }));

const { usePreferenceSync } = await import("./usePreferenceSync");

const wrapper = ({ children }: { children: ReactNode }) => (
  <ThemeProvider>
    <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
  </ThemeProvider>
);

beforeEach(async () => {
  remote.clear();
  vi.clearAllMocks();
  localStorage.clear();
  await i18n.changeLanguage("es");
});

describe("usePreferenceSync", () => {
  it("takes the account's language and theme without sending them back", async () => {
    remote.set("ui.language", "en");
    remote.set("ui.theme", "dark");
    const { result } = renderHook(
      () => {
        usePreferenceSync();
        return useTheme();
      },
      { wrapper },
    );
    await waitFor(() => expect(i18n.resolvedLanguage).toBe("en"));
    await waitFor(() => expect(result.current.preference).toBe("dark"));
    expect(pushSynced).not.toHaveBeenCalled();
  });

  it("sends a language and a theme chosen here", async () => {
    const { result } = renderHook(
      () => {
        usePreferenceSync();
        return useTheme();
      },
      { wrapper },
    );
    await act(async () => {
      await i18n.changeLanguage("en");
    });
    expect(pushSynced).toHaveBeenCalledWith("me", "ui.language", "en");
    act(() => result.current.setPreference("light"));
    await waitFor(() => expect(pushSynced).toHaveBeenCalledWith("me", "ui.theme", "light"));
  });
});
