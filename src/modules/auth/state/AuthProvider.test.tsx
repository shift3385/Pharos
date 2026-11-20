// How the app follows the session: renewals made by a request elsewhere, a
// session that ends, and a startup check the server cannot answer.

import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "@shared/i18n";
import { TOAST_EVENT } from "@shared/ui/notify";
import { ApiError, authApi, NetworkError } from "../api/authApi";
import type { Session } from "../model/types";
import { AuthProvider } from "./AuthProvider";
import type { SessionStore } from "./session-store";
import { renewSession } from "./sessionRenewal";
import { useAuth } from "./useAuth";

const session = (accessToken: string, refreshToken: string) =>
  ({ accessToken, refreshToken, user: { id: "u1", firstName: "Q" } }) as Session;

let saved: Session | null;
const store: SessionStore = {
  load: async () => saved,
  save: async (s) => {
    saved = s;
  },
  clear: async () => {
    saved = null;
  },
};

function Probe() {
  const { status, offline, logout } = useAuth();
  return (
    <>
      <output>{status}</output>
      {offline && <p>offline</p>}
      <button type="button" onClick={() => void logout()}>
        out
      </button>
    </>
  );
}

const toasts: string[] = [];
const onToast = (e: Event) => toasts.push((e as CustomEvent<{ message: string }>).detail.message);
const signedOut = vi.fn();

beforeEach(() => {
  saved = session("old", "r1");
  toasts.length = 0;
  signedOut.mockReset();
  window.addEventListener(TOAST_EVENT, onToast);
  window.addEventListener("pharos:signed-out", signedOut);
  vi.spyOn(authApi, "me");
  vi.spyOn(authApi, "refresh");
  vi.spyOn(authApi, "logout").mockResolvedValue(null);
});
afterEach(() => {
  window.removeEventListener(TOAST_EVENT, onToast);
  window.removeEventListener("pharos:signed-out", signedOut);
  vi.restoreAllMocks();
});

const refused = new ApiError(401, "unauthorized", "no");

describe("AuthProvider and the session's renewal", () => {
  it("a session that ends mid-use goes to sign-in, says why and keeps the drafts", async () => {
    render(
      <AuthProvider store={store} initialSession={saved}>
        <Probe />
      </AuthProvider>,
    );
    vi.mocked(authApi.refresh).mockRejectedValue(refused);
    await act(() => renewSession("old", store));
    expect(screen.getByRole("status")).toHaveTextContent("unauthenticated");
    expect(toasts).toEqual([i18n.t("auth.sessionExpired")]);
    expect(saved).toBeNull();
    // `pharos:signed-out` would delete the unsaved execution drafts.
    expect(signedOut).not.toHaveBeenCalled();
  });

  it("signing out after a renewal revokes the renewed refresh token", async () => {
    render(
      <AuthProvider store={store} initialSession={saved}>
        <Probe />
      </AuthProvider>,
    );
    vi.mocked(authApi.refresh).mockResolvedValue(session("new", "r2"));
    await act(() => renewSession("old", store));
    await userEvent.click(screen.getByRole("button", { name: "out" }));
    expect(authApi.logout).toHaveBeenCalledWith("r2");
  });

  it("a new account is in the store before the app opens with it, however slow the keychain (FIX-43)", async () => {
    // The order that failed on the desktop: «Continuar» on the recovery
    // codes published the account while the keychain write was still
    // running; the first sync and the workspace list read the store at once
    // (`getSession`), found nothing («not-authenticated») and the selector
    // never appeared.
    saved = null;
    let release: () => void = () => undefined;
    const slow: SessionStore = {
      load: async () => saved,
      save: (s) =>
        new Promise<void>((done) => {
          release = () => {
            saved = s;
            done();
          };
        }),
      clear: async () => {
        saved = null;
      },
    };
    vi.spyOn(authApi, "register").mockResolvedValue({ ...session("new", "r9"), recoveryCodes: ["c1"] });
    const seen: (string | null)[] = [];
    function Opens() {
      const { user, register, completeRegistration } = useAuth();
      // What the shell does when an account enters: read the stored session.
      useEffect(() => {
        if (user) void slow.load().then((s) => seen.push(s?.accessToken ?? null));
      }, [user]);
      return (
        <>
          <button type="button" onClick={() => void register({} as never)}>
            register
          </button>
          <button type="button" onClick={() => void completeRegistration()}>
            continue
          </button>
        </>
      );
    }
    render(
      <AuthProvider store={slow}>
        <Opens />
      </AuthProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "register" }));
    await userEvent.click(screen.getByRole("button", { name: "continue" }));
    // The keychain has not answered yet: the app has not opened.
    expect(seen).toEqual([]);
    await act(async () => release());
    await waitFor(() => expect(seen).toEqual(["new"]));
  });

  it("a profile save updates the signed-in user at once and in the stored session", async () => {
    function Rename() {
      const { user, updateUser } = useAuth();
      return (
        <>
          <p>{user?.displayName ?? "—"}</p>
          <button type="button" onClick={() => void updateUser({ displayName: "Lucía QA", firstName: "Lucía" })}>
            rename
          </button>
        </>
      );
    }
    render(
      <AuthProvider store={store} initialSession={saved}>
        <Rename />
      </AuthProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "rename" }));
    expect(screen.getByText("Lucía QA")).toBeInTheDocument();
    expect(saved?.user).toMatchObject({ id: "u1", displayName: "Lucía QA", firstName: "Lucía" });
    expect(saved?.accessToken).toBe("old");
  });

  describe("on startup, with an expired token", () => {
    beforeEach(() => {
      vi.mocked(authApi.me).mockRejectedValue(refused);
    });
    const start = () =>
      render(
        <AuthProvider store={store}>
          <Probe />
        </AuthProvider>,
      );

    it("renews and stays in", async () => {
      vi.mocked(authApi.refresh).mockResolvedValue(session("new", "r2"));
      start();
      await waitFor(() => expect(saved?.accessToken).toBe("new"));
      expect(screen.getByRole("status")).toHaveTextContent("authenticated");
    });

    it("goes to sign-in if the server refuses the refresh token", async () => {
      vi.mocked(authApi.refresh).mockRejectedValue(refused);
      start();
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("unauthenticated"));
      expect(saved).toBeNull();
    });

    it("keeps the session, as offline, without a connection", async () => {
      vi.mocked(authApi.refresh).mockRejectedValue(new NetworkError());
      start();
      expect(await screen.findByText("offline")).toBeInTheDocument();
      expect(saved?.accessToken).toBe("old");
    });

    it("keeps the session on a server failure", async () => {
      const refresh = vi.mocked(authApi.refresh).mockRejectedValue(new ApiError(500, "error", "boom"));
      start();
      await waitFor(() => expect(refresh).toHaveBeenCalled());
      await act(async () => {});
      expect(screen.getByRole("status")).toHaveTextContent("authenticated");
      expect(saved?.accessToken).toBe("old");
    });
  });
});
