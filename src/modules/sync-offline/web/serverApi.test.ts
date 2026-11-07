// The web's server client (BASE-10, FIX-04): writes name the revision the page
// last saw; a 409 is shown and remembered so saving again replaces the newer
// version knowingly; key refusals are shown once (ReportedError).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "i18next";
import { ReportedError, TOAST_EVENT } from "@shared/ui/notify";
import { DesktopOnlyError } from "@shared/platform";
import { desktopOnly, forgetSeenRevisions, serverApi } from "./serverApi";

const fetchMock = vi.fn();
const toasts: string[] = [];
const onToast = (e: Event) => toasts.push((e as CustomEvent<{ message: string }>).detail.message);

const reply = (body: unknown, status = 200) =>
  Promise.resolve(
    status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status }),
  );
const sent = (i: number) => {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return { url, method: init.method, body: init.body ? JSON.parse(init.body as string) : undefined };
};

beforeEach(() => {
  localStorage.setItem("pharos.session", JSON.stringify({ accessToken: "tok", refreshToken: "r", user: { id: "u1" } }));
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  forgetSeenRevisions();
  toasts.length = 0;
  window.addEventListener(TOAST_EVENT, onToast);
});
afterEach(() => window.removeEventListener(TOAST_EVENT, onToast));

describe("serverApi", () => {
  it("sends the session token and app version, and remembers revisions it reads", async () => {
    fetchMock.mockImplementationOnce(() => reply([{ id: "c1", revision: 4 }]));
    fetchMock.mockImplementationOnce(() => reply({ id: "c1", revision: 5 }));
    fetchMock.mockImplementationOnce(() => reply(null, 204));
    await serverApi.get("/api/test-cases?projectId=p1");
    await serverApi.put("/api/test-cases/c1", "c1", { title: "T" });
    await serverApi.remove("/api/test-cases/c1", "c1");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ authorization: "Bearer tok", "x-pharos-version": expect.any(String) });
    expect(sent(1)).toMatchObject({ method: "PUT", body: { input: { title: "T" }, revision: 4 } });
    expect(sent(2)).toMatchObject({ method: "DELETE", url: expect.stringContaining("/api/test-cases/c1?revision=5") });
  });

  it("an item changed elsewhere: tells the user, keeps nothing hidden, and a second save replaces it", async () => {
    fetchMock.mockImplementationOnce(() => reply({ id: "p1", revision: 1 }));
    fetchMock.mockImplementationOnce(() =>
      reply({ code: "stale_write", message: "changed", current: { id: "p1", revision: 3 } }, 409),
    );
    fetchMock.mockImplementationOnce(() => reply({ id: "p1", revision: 4 }));
    await serverApi.get("/api/projects/p1");
    await expect(serverApi.put("/api/projects/p1", "p1", { name: "Mine" })).rejects.toBeInstanceOf(ReportedError);
    expect(toasts).toEqual([i18n.t("sync.web.staleWrite")]);
    await serverApi.put("/api/projects/p1", "p1", { name: "Mine" });
    expect(sent(2).body.revision).toBe(3);
  });

  it("an item deleted elsewhere has its own notice and is not taken as a newer version", async () => {
    fetchMock.mockImplementationOnce(() => reply({ id: "p1", revision: 1 }));
    fetchMock.mockImplementation(() => reply({ code: "deleted_elsewhere", message: "deleted" }, 409));
    await serverApi.get("/api/projects/p1");
    await expect(serverApi.put("/api/projects/p1", "p1", { name: "Mine" })).rejects.toBeInstanceOf(ReportedError);
    await expect(serverApi.put("/api/projects/p1", "p1", { name: "Mine" })).rejects.toBeInstanceOf(ReportedError);
    expect(toasts).toEqual([i18n.t("sync.web.deletedElsewhere"), i18n.t("sync.web.deletedElsewhere")]);
    expect(sent(2).body.revision).toBe(1);
  });

  it("shows key refusals once and passes other errors through", async () => {
    fetchMock.mockImplementationOnce(() => reply({ code: "key_taken", message: "taken" }, 409));
    await expect(serverApi.post("/api/test-cases", {})).rejects.toBeInstanceOf(ReportedError);
    expect(toasts).toHaveLength(1);
    fetchMock.mockImplementationOnce(() => reply({ code: "internal_error", message: "boom" }, 500));
    await expect(serverApi.get("/api/projects")).rejects.toMatchObject({ status: 500 });
    expect(toasts).toHaveLength(1);
  });

  it("needs a session", async () => {
    localStorage.clear();
    await expect(serverApi.get("/api/projects")).rejects.toThrow("not-authenticated");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("when the access token expires while the page is open", () => {
    const stored = () => JSON.parse(localStorage.getItem("pharos.session") ?? "null");
    const fresh = (user = "u1") => ({ accessToken: "tok2", refreshToken: "r2", user: { id: user } });
    /** The server: refuses the old token, and answers /auth/refresh as given. */
    const server = (onRefresh: () => Promise<Response>) =>
      fetchMock.mockImplementation((url: string, init: RequestInit) => {
        if (url.endsWith("/auth/refresh")) return onRefresh();
        const token = (init.headers as Record<string, string>).authorization;
        return token === "Bearer tok2"
          ? reply({ id: "p1", revision: 2 })
          : reply({ code: "unauthorized", message: "Authentication is required." }, 401);
      });
    const calls = (end: string) =>
      fetchMock.mock.calls.filter(([url]) => (url as string).endsWith(end));

    it("renews and repeats the request, and the caller never notices", async () => {
      server(() => reply(fresh()));
      await expect(serverApi.post("/api/projects", { name: "N" })).resolves.toMatchObject({ id: "p1" });
      const repeated = calls("/api/projects")[1][1] as RequestInit;
      expect(repeated.method).toBe("POST");
      expect(JSON.parse(repeated.body as string)).toEqual({ name: "N" });
      expect(stored()).toMatchObject({ accessToken: "tok2", refreshToken: "r2" });
    });

    it("a screen's parallel requests spend the refresh token once", async () => {
      server(() => reply(fresh()));
      await Promise.all([serverApi.get("/api/a"), serverApi.get("/api/b"), serverApi.get("/api/c")]);
      expect(calls("/auth/refresh")).toHaveLength(1);
    });

    it("a session that is over rejects with the 401 and is gone", async () => {
      server(() => reply({ code: "invalid_refresh_token", message: "no" }, 401));
      await expect(serverApi.get("/api/projects")).rejects.toMatchObject({ status: 401 });
      expect(stored()).toBeNull();
    });

    it("rejects, keeping the session, if the server cannot renew it right now", async () => {
      server(() => Promise.reject(new TypeError("Failed to fetch")));
      await expect(serverApi.get("/api/projects")).rejects.toThrow("Network request failed");
      expect(stored()).toMatchObject({ accessToken: "tok" });
    });

    it("never repeats a request under another account", async () => {
      server(() => reply(fresh()));
      localStorage.setItem("pharos.session", JSON.stringify({ accessToken: "tok", refreshToken: "r", user: { id: "u1" } }));
      fetchMock.mockImplementationOnce(() => {
        // Another account signed in while the request was on its way.
        localStorage.setItem("pharos.session", JSON.stringify(fresh("u2")));
        return reply({ code: "unauthorized", message: "no" }, 401);
      });
      await expect(serverApi.post("/api/projects", {})).rejects.toMatchObject({ status: 401 });
      expect(calls("/api/projects")).toHaveLength(1);
    });

    it("repeats once: a second 401 is an answer, not a loop", async () => {
      fetchMock.mockImplementation((url: string) =>
        url.endsWith("/auth/refresh")
          ? reply(fresh())
          : reply({ code: "unauthorized", message: "no" }, 401),
      );
      await expect(serverApi.get("/api/projects")).rejects.toMatchObject({ status: 401 });
      expect(calls("/api/projects")).toHaveLength(2);
    });
  });

  it("desktop-only features say so", () => {
    expect(() => desktopOnly("attachments")).toThrow(DesktopOnlyError);
    expect(toasts).toHaveLength(1);
  });
});
