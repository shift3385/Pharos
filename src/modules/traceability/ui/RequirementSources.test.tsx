// IA-19: a requirement's «Fuente» shows the kept image (thumbnail, region,
// full size on click) or says why it cannot be shown.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { RequirementSources } from "./RequirementSources";
import type { RequirementSource } from "../model/types";

const api = vi.hoisted(() => ({
  available: vi.fn(() => true),
  list: vi.fn(
    async () =>
      [] as {
        id: string;
        name: string;
        mime: string | null;
        size: number;
        purged: boolean;
      }[],
  ),
  preview: vi.fn(async () => "data:image/webp;base64,QUJD" as string | null),
}));
vi.mock("../api/requirementAttachments", () => ({
  requirementAttachments: api,
}));

const image: RequirementSource = {
  kind: "image",
  name: "boceto.jpg",
  index: 1,
  region: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
};

describe("RequirementSources (IA-19)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    api.available.mockReturnValue(true);
    api.list.mockResolvedValue([]);
  });

  it("a kept image shows its thumbnail and opens full size", async () => {
    api.list.mockResolvedValue([
      {
        id: "a1",
        name: "boceto.jpg",
        mime: "image/webp",
        size: 3,
        purged: false,
      },
    ]);
    renderWithProviders(
      <RequirementSources requirementId="r1" sources={[image]} />,
    );
    const open = await screen.findByRole("button", {
      name: "Ver boceto.jpg a tamaño completo",
    });
    await userEvent.click(open);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector("img")?.getAttribute("src")).toBe(
      "data:image/webp;base64,QUJD",
    );
    expect(dialog.querySelector(".tr-design__region")).toHaveStyle({
      left: "10%",
      top: "20%",
    });
  });

  it("an image not kept says so", async () => {
    renderWithProviders(
      <RequirementSources requirementId="r1" sources={[image]} />,
    );
    expect(
      await screen.findByText("La imagen no se guardó en Pharos."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("on the web it says the images are seen on the desktop", async () => {
    api.available.mockReturnValue(false);
    renderWithProviders(
      <RequirementSources requirementId="r1" sources={[image]} />,
    );
    expect(
      await screen.findByText(
        "Las imágenes guardadas solo se ven en la app de escritorio.",
      ),
    ).toBeInTheDocument();
  });
});
