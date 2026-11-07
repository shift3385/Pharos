// Refresh tokens work once (server rotation), so everyone who finds the access
// token expired must share one renewal, and only the server saying no may end
// the session.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, authApi, NetworkError } from "../api/authApi";
import type { Session } from "../model/types";
import type { SessionStore } from "./session-store";
import { onSessionRenewal, renewSession } from "./sessionRenewal";

const session = (accessToken: string, refreshToken: string) =>
  ({ accessToken, refreshToken, user: { id: "u1" } }) as Session;

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

const told = vi.fn();
let stopListening: () => void;
const refresh = vi.fn<typeof authApi.refresh>();

beforeEach(() => {
  saved = session("old", "r1");
  refresh.mockReset();
  vi.spyOn(authApi, "refresh").mockImplementation(refresh);
  told.mockReset();
  stopListening = onSessionRenewal(told);
});
afterEach(() => {
  stopListening();
  vi.unstubAllGlobals();
});

describe("renewSession", () => {
  it("parallel callers share one renewal, which is saved and announced once", async () => {
    refresh.mockResolvedValue(session("new", "r2"));
    const answers = await Promise.all([renewSession("old", store), renewSession("old", store)]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith("r1");
    expect(answers.map((s) => s?.accessToken)).toEqual(["new", "new"]);
    expect(saved?.refreshToken).toBe("r2");
    expect(told).toHaveBeenCalledTimes(1);
  });

  it("a late caller with the old token gets the session already renewed", async () => {
    saved = session("new", "r2");
    await expect(renewSession("old", store)).resolves.toMatchObject({ accessToken: "new" });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("the server refusing the refresh token ends the session", async () => {
    refresh.mockRejectedValue(new ApiError(401, "invalid_refresh_token", "no"));
    await expect(renewSession("old", store)).resolves.toBeNull();
    expect(saved).toBeNull();
    expect(told).toHaveBeenCalledWith(null);
  });

  it("a refusal because another tab spent the token keeps that tab's session", async () => {
    refresh.mockImplementation(async () => {
      saved = session("other-tab", "r2");
      throw new ApiError(401, "invalid_refresh_token", "no");
    });
    await expect(renewSession("old", store)).resolves.toMatchObject({ accessToken: "other-tab" });
    expect(saved?.accessToken).toBe("other-tab");
  });

  it.each([
    ["no network", new NetworkError()],
    ["a server failure", new ApiError(503, "error", "down")],
  ])("%s keeps the session and announces nothing", async (_name, failure) => {
    refresh.mockRejectedValue(failure);
    await expect(renewSession("old", store)).rejects.toBe(failure);
    expect(saved?.accessToken).toBe("old");
    expect(told).not.toHaveBeenCalled();
    // The failure does not stick: the next try asks again.
    refresh.mockResolvedValue(session("new", "r2"));
    await expect(renewSession("old", store)).resolves.toMatchObject({ accessToken: "new" });
  });

  it("signing out while it asks is not undone by the answer", async () => {
    refresh.mockImplementation(async () => {
      saved = null;
      return session("new", "r2");
    });
    await expect(renewSession("old", store)).resolves.toBeNull();
    expect(saved).toBeNull();
  });

  it("takes the cross-tab lock where the browser offers it", async () => {
    const request = vi.fn((_name: string, fn: () => Promise<unknown>) => fn());
    vi.stubGlobal("navigator", { locks: { request } });
    refresh.mockResolvedValue(session("new", "r2"));
    await renewSession("old", store);
    expect(request).toHaveBeenCalledWith("pharos.session.renewal", expect.any(Function));
  });
});
