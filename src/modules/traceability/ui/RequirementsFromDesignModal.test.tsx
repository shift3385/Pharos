// IA-18 in the UI: the material is read and shown before anything is sent, with
// where it goes; limits and models without vision block the analysis; the
// images are read once, the common synthesis (IA-17) runs as partial material,
// and the proposals open in the common review with their image and region.

import "@test/slow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import type { DesignExtraction, VisionCapability } from "@modules/ai";
import type { Requirement } from "../model/types";

const ai = vi.hoisted(() => ({
  vision: vi.fn(async (): Promise<VisionCapability | null> => ({ images: "yes", pdf: true })),
  destination: vi.fn(async () => ({ provider: "anthropic", model: "claude-opus-5-5" })),
  extract: vi.fn(),
  synthesize: vi.fn(),
}));
const api = vi.hoisted(() => ({
  get: vi.fn(),
  create: vi.fn(async (_input: Record<string, unknown>) => ({ id: "new" })),
  update: vi.fn(async (_id: string, _input: Record<string, unknown>) => ({ id: "x" })),
  remove: vi.fn(async (_id: string, _userId: string) => undefined),
}));
vi.mock("@modules/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@modules/ai")>()),
  aiVision: ai.vision,
  aiDestinationNow: ai.destination,
  extractRequirementsFromDesign: ai.extract,
  synthesizeRequirements: ai.synthesize,
}));
vi.mock("../api/requirementApi", () => ({ requirementApi: api }));

const { RequirementsFromDesignModal } = await import("./RequirementsFromDesignModal");
const { AiOutputError } = await import("@modules/ai");

const UI_TIMEOUT = 20_000;
const provenance = { provider: "anthropic" as const, model: "claude-opus-5-5", generatedAt: "2026-11-07T00:00:00Z" };
const reduce = async () => ({ mediaType: "image/webp" as const, data: "QUJD", width: 1200, height: 800 });
const png = (name: string, body = name) => new File([body], name, { type: "image/png" });
const existing: Requirement[] = [
  {
    id: "id-REQ-001",
    projectId: "p1",
    requirementKey: "REQ-001",
    title: "Iniciar sesión con correo",
    description: "",
    priority: "high",
    createdAt: "",
    updatedAt: "",
    revision: 1,
  },
];

const extraction: DesignExtraction = {
  screens: [{ item: 1, name: "Inicio de sesión" }],
  candidates: [
    {
      title: "Recuperar la contraseña",
      description: "El sistema debe permitir recuperar la contraseña desde el inicio de sesión.",
      basis: "stated",
      acceptance: ["Dado un usuario registrado, cuando pulsa el enlace, entonces recibe un correo."],
      assumptions: [],
      questions: ["¿Cuánto dura el enlace?"],
      evidence: [{ item: 1, region: { x: 0.1, y: 0.7, w: 0.3, h: 0.05 }, quote: "¿Olvidaste tu contraseña?" }],
    },
  ],
};

beforeEach(async () => {
  await i18n.changeLanguage("es");
  ai.vision.mockReset().mockResolvedValue({ images: "yes", pdf: true });
  ai.extract.mockReset().mockResolvedValue({ value: extraction, provenance });
  ai.synthesize.mockReset().mockResolvedValue({
    value: {
      proposals: [
        { action: "add", from: [1], title: "Recuperar la contraseña", description: "El sistema debe…", reason: "Imagen 1: enlace visible" },
      ],
    },
    provenance,
  });
  api.get.mockReset().mockImplementation(async (id: string) => existing.find((r) => r.id === id) ?? null);
  api.create.mockClear();
});

function open() {
  const onApplied = vi.fn();
  const onClose = vi.fn();
  renderWithProviders(
    <RequirementsFromDesignModal
      projectId="p1"
      existing={existing}
      linkedCases={{}}
      onApplied={onApplied}
      onClose={onClose}
      reduce={reduce}
    />,
  );
  return { onApplied, onClose };
}

async function addFiles(files: File[]) {
  const input = screen.getByLabelText(/elegir archivos/i) as HTMLInputElement;
  // A file the picker would hide (`accept`) can still be dropped.
  await userEvent.setup({ applyAccept: false }).upload(input, files);
}

describe("RequirementsFromDesignModal", () => {
  it(
    "shows the material, its cost and where it goes; then reads, synthesizes and applies what is ticked",
    async () => {
      const user = userEvent.setup();
      const { onApplied, onClose } = open();
      expect(screen.getByRole("button", { name: "Analizar" })).toBeDisabled();
      await addFiles([png("login.png")]);
      expect(await screen.findByText("login.png")).toBeInTheDocument();
      expect(screen.getByText(/1 de 8 imágenes o PDF/)).toBeInTheDocument();
      expect(screen.getByText(/Imagen 1200 × 800 px/)).toBeInTheDocument();
      const notice = await screen.findByTestId("ai-send-notice");
      expect(notice).toHaveTextContent("El contenido sale de este equipo hacia Claude.");
      expect(notice).not.toHaveTextContent("claude-opus");
      expect(ai.extract).not.toHaveBeenCalled();
      await expectNoAxeViolations(document.body);

      await user.type(screen.getByLabelText("Nota sobre login.png"), "alta");
      await user.click(screen.getByRole("button", { name: "Analizar" }));
      await screen.findByTestId("req-proposals");
      const [items] = ai.extract.mock.calls[0];
      expect(items[0]).toMatchObject({ number: 1, name: "login.png", note: "alta", attachment: { data: "QUJD" } });
      const [candidates, brief, , opts] = ai.synthesize.mock.calls[0];
      expect(candidates[0].sources[0]).toMatchObject({ kind: "image", name: "login.png", index: 1, note: "alta" });
      expect(brief).toEqual([{ key: "REQ-001", title: "Iniciar sesión con correo", description: "", priority: "high" }]);
      expect(opts).toMatchObject({ partialMaterial: true });

      const proposal = screen.getByTestId("req-proposal-0");
      expect(within(proposal).getByText(/Imagen 1 · login\.png/)).toBeInTheDocument();
      expect(proposal.querySelector(".tr-design__region")).not.toBeNull();
      await expectNoAxeViolations(document.body);

      await user.click(screen.getByTestId("req-proposals-apply"));
      await waitFor(() => expect(onApplied).toHaveBeenCalled());
      expect(api.create).toHaveBeenCalledTimes(1);
      expect(api.create.mock.calls[0][0]).toMatchObject({
        title: "Recuperar la contraseña",
        data: {
          aiProvenance: { requirement: { ...provenance, prompt: "requirements-from-design@1+req-synthesis@1" } },
          sources: [{ kind: "image", name: "login.png", index: 1 }],
        },
      });
      expect(onClose).toHaveBeenCalled();
    },
    UI_TIMEOUT,
  );

  it(
    "takes a pasted screenshot",
    async () => {
      open();
      const zone = screen.getByRole("group", { name: "Material para analizar" });
      fireEvent.paste(zone, { clipboardData: { files: [png("image.png", "pasted")] } });
      expect(await screen.findByText(/^captura-\d{6}-1\.png$/)).toBeInTheDocument();
    },
    UI_TIMEOUT,
  );

  it(
    "blocks images for a model without vision, and says why",
    async () => {
      ai.vision.mockResolvedValue({ images: "no", pdf: false });
      open();
      await addFiles([png("a.png")]);
      expect(await screen.findByText(/no ve imágenes/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Analizar" })).toBeDisabled();
      await userEvent.click(screen.getByRole("checkbox"));
      expect(screen.queryByText(/no ve imágenes/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Analizar" })).toBeDisabled();
    },
    UI_TIMEOUT,
  );

  it(
    "starts the ninth image off and reports unsupported files",
    async () => {
      open();
      await addFiles([...Array.from({ length: 9 }, (_, i) => png(`${i + 1}.png`)), new File(["x"], "notas.docx")]);
      await screen.findByText("9.png");
      const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
      expect(boxes.filter((b) => b.checked)).toHaveLength(8);
      expect(boxes[8].checked).toBe(false);
      expect(screen.getByText("notas.docx: tipo de archivo no admitido.")).toBeInTheDocument();
      await userEvent.click(boxes[8]);
      expect(screen.getByText(/Como mucho 8 imágenes/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Analizar" })).toBeDisabled();
    },
    UI_TIMEOUT,
  );

  it(
    "an invalid reading applies nothing; a failed synthesis is retried without reading the images again",
    async () => {
      const user = userEvent.setup();
      const { onApplied } = open();
      await addFiles([png("a.png")]);
      await screen.findByText("a.png");
      ai.extract.mockRejectedValueOnce(new AiOutputError("invalid-schema", ["candidates.0.evidence: too small"]));
      await user.click(screen.getByRole("button", { name: "Analizar" }));
      expect(await screen.findByText(/no tiene el formato esperado/)).toBeInTheDocument();
      expect(onApplied).not.toHaveBeenCalled();
      expect(ai.synthesize).not.toHaveBeenCalled();

      ai.synthesize.mockRejectedValueOnce(new Error("The AI provider did not answer in time"));
      await user.click(screen.getByRole("button", { name: /reintentar/i }));
      expect(await screen.findByText(/no respondió a tiempo/)).toBeInTheDocument();
      expect(ai.extract).toHaveBeenCalledTimes(2);
      await user.click(screen.getByRole("button", { name: /reintentar/i }));
      await screen.findByTestId("req-proposals");
      expect(ai.extract).toHaveBeenCalledTimes(2);
      expect(ai.synthesize).toHaveBeenCalledTimes(2);
    },
    UI_TIMEOUT,
  );

  it(
    "says so when the material holds no requirements",
    async () => {
      const user = userEvent.setup();
      ai.extract.mockResolvedValue({ value: { screens: [], candidates: [], reason: "Solo es un logotipo." }, provenance });
      open();
      await addFiles([png("logo.png")]);
      await screen.findByText("logo.png");
      await user.click(screen.getByRole("button", { name: "Analizar" }));
      expect(await screen.findByText("Solo es un logotipo.")).toBeInTheDocument();
      expect(ai.synthesize).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Volver al material" }));
      expect(screen.getByText("logo.png")).toBeInTheDocument();
    },
    UI_TIMEOUT,
  );

  it(
    "with no AI configured, says so",
    async () => {
      ai.vision.mockResolvedValue(null);
      open();
      await addFiles([png("a.png")]);
      expect(await screen.findByText(/No hay IA disponible/)).toBeInTheDocument();
    },
    UI_TIMEOUT,
  );
});

describe("RequirementsFromDesignModal › progress (UX-23)", () => {
  it("says which of the two steps is running and for how long", async () => {
    const user = userEvent.setup();
    ai.extract.mockImplementationOnce(() => new Promise(() => {}));
    open();
    await addFiles([png("login.png")]);
    await screen.findByText("login.png");
    await user.click(screen.getByRole("button", { name: "Analizar" }));
    expect(await screen.findByText(/Paso 1 de 2 · Leyendo el material con IA…/)).toBeInTheDocument();
    expect(screen.getByTestId("design-elapsed")).toHaveTextContent("(0 s)");
    expect(screen.getByText(/no se ha quedado colgado/)).toBeInTheDocument();
  });
});
