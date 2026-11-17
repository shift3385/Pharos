import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@shared/i18n";
import { APP_VERSION } from "@shared/version";
import { compatibility } from "./model/serverState";
import { lastUsedLabel } from "./model/serverState";
import { ServerLine } from "./ui/ServerLine";
import { ServerPanel } from "./ui/ServerPanel";
import type { ServerInfo } from "@shared/platform/serverUrl";

// The desktop core (Tauri invoke), answered per command by each test.
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));

const PROD: ServerInfo = {
  origin: "https://pharos.example.com",
  local: false,
  recent: [{ origin: "http://localhost:3000", local: true, email: "liomar@example.com", lastUsed: "0" }],
};

function answer(handlers: Record<string, (args: Record<string, unknown>) => unknown>) {
  invokeMock.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
    const handler = handlers[cmd];
    if (!handler) throw new Error(`unexpected command ${cmd}`);
    return handler(args);
  });
}

const health = (version = "0.5.0") => ({ status: "ok", service: "pharos", version, accepted: ["0.5", "0.4"] });
/** A server of this app's own minor. */
const APP_MINOR = APP_VERSION.split(".").slice(0, 2).join(".");
const sameMinor = () => ({ status: "ok", service: "pharos", version: `${APP_MINOR}.0`, accepted: [APP_MINOR] });

beforeEach(() => {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
});
afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  invokeMock.mockReset();
});

describe("compatibility (E6)", () => {
  it("tells same minor, read-only and refused apart", () => {
    expect(compatibility(health("0.5.2"), "0.5.0-beta.1")).toBe("ok");
    expect(compatibility(health("0.5.0"), "0.4.3")).toBe("read_only");
    expect(compatibility({ ...health("0.6.0"), accepted: ["0.6", "0.5"] }, "0.4.0")).toBe("app_too_old");
    expect(compatibility({ ...health("0.4.0"), accepted: ["0.4", "0.3"] }, "0.5.0")).toBe("server_too_old");
    expect(compatibility({ status: "ok" }, "0.5.0")).toBe("unknown");
  });

  it("labels the last use relative to now", () => {
    const now = Date.UTC(2026, 10, 17);
    expect(lastUsedLabel(String(now / 1000 - 3 * 86400), "es", now)).toBe("hace 3 días");
    expect(lastUsedLabel("0", "es", now)).toBe("");
  });
});

describe("ServerLine", () => {
  it("names the server with a padlock and marks it reachable", async () => {
    answer({ server_check: () => ({ origin: PROD.origin, local: false, health: health() }) });
    render(<ServerLine info={PROD} onChange={() => undefined} />);
    expect(screen.getByTestId("server-line-host")).toHaveTextContent("pharos.example.com");
    expect(screen.getByRole("img", { name: "Conexión cifrada" })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector(".server-line__dot--ok")).not.toBeNull());
  });

  it("says «sin conexión» when the server does not answer", async () => {
    answer({
      server_check: () => {
        throw { kind: "unreachable", message: "x" };
      },
    });
    render(<ServerLine info={PROD} onChange={() => undefined} />);
    expect(await screen.findByText("sin conexión")).toBeInTheDocument();
  });

  it("shows nothing on the web", () => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    const { container } = render(<ServerLine info={PROD} onChange={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ServerPanel", () => {
  async function connectTo(address: string) {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ServerPanel info={PROD} onCancel={() => undefined} onDone={onDone} />);
    const field = screen.getByLabelText("Dirección del servidor");
    await user.clear(field);
    await user.type(field, address);
    await user.click(screen.getByTestId("server-connect"));
    return { onDone, user };
  }

  it.each([
    ["invalid", "Esa dirección no es válida."],
    ["insecure", "Pharos solo se conecta con https:// a otro equipo."],
    ["unreachable", "otro.example.com no responde."],
    ["timeout", "otro.example.com no responde."],
    ["tls", "No se puede comprobar la identidad de otro.example.com."],
    ["not_pharos", "Esa dirección responde, pero no es un servidor de Pharos."],
  ])("shows E for %s and saves nothing", async (kind, title) => {
    answer({
      server_check: () => {
        throw { kind, message: kind };
      },
    });
    const { onDone } = await connectTo("otro.example.com");
    expect(await screen.findByTestId("server-error")).toHaveTextContent(title);
    expect(screen.getByLabelText("Dirección del servidor")).toHaveAttribute("aria-invalid", "true");
    expect(invokeMock).not.toHaveBeenCalledWith("server_set", expect.anything());
    expect(onDone).not.toHaveBeenCalled();
  });

  it("refuses a server that needs a newer app (E6)", async () => {
    answer({
      server_check: () => ({
        origin: "https://otro.example.com",
        local: false,
        health: { status: "ok", version: "9.1.0", accepted: ["9.1", "9.0"] },
      }),
    });
    await connectTo("otro.example.com");
    expect(await screen.findByTestId("server-error")).toHaveTextContent(
      "Este servidor necesita una versión más nueva de Pharos.",
    );
  });

  it("saves a working server and reports it", async () => {
    answer({
      server_check: () => ({ origin: "https://otro.example.com", local: false, health: sameMinor() }),
      server_pending: () => [],
      server_set: (args) => args.url,
    });
    const { onDone } = await connectTo("otro.example.com");
    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith({
        host: "otro.example.com",
        version: `${APP_MINOR}.0`,
        local: false,
        readOnly: false,
      }),
    );
  });

  it("warns about unsent changes before switching (E8)", async () => {
    answer({
      server_check: () => ({ origin: "https://otro.example.com", local: false, health: health() }),
      server_pending: () => [{ email: "ana@example.com", count: 3 }],
      server_set: (args) => args.url,
    });
    const { onDone, user } = await connectTo("otro.example.com");
    const warning = await screen.findByTestId("server-pending");
    expect(warning).toHaveTextContent("Hay 3 cambios sin enviar a pharos.example.com.");
    expect(warning).toHaveTextContent("ana@example.com");
    expect(onDone).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cambiar de servidor" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("fills the address from a recent server and cancels with Escape", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ServerPanel info={PROD} onCancel={onCancel} onDone={() => undefined} />);
    await user.click(screen.getByRole("button", { name: /Este equipo \(localhost:3000\)/ }));
    expect(screen.getByLabelText("Dirección del servidor")).toHaveValue("http://localhost:3000");
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalled();
  });
});
