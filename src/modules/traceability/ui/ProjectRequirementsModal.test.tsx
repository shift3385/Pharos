// IA-17 in the UI: pick a folder, see what goes and what never does, confirm
// where it goes, follow the batches, review the proposals in the common view
// and apply only what is ticked. A requirement with linked cases cannot be
// deleted from here; a failed batch can be retried or skipped.

import "@test/slow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import type { Requirement } from "../model/types";

const scan = vi.hoisted(() => ({
  available: () => true,
  pick: vi.fn(),
  read: vi.fn(),
  close: vi.fn(async () => undefined),
}));
const ai = vi.hoisted(() => ({
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

vi.mock("../api/projectScanApi", () => ({ projectScanApi: scan }));
vi.mock("@modules/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@modules/ai")>()),
  aiDestinationNow: ai.destination,
  extractRequirementCandidates: ai.extract,
  synthesizeRequirements: ai.synthesize,
}));
vi.mock("../api/requirementApi", () => ({ requirementApi: api }));

const UI_TIMEOUT = 20_000;
const { ProjectRequirementsModal } = await import("./ProjectRequirementsModal");

const provenance = { provider: "anthropic" as const, model: "claude-opus-5-5", generatedAt: "2026-11-07T00:00:00Z" };
const req = (key: string, title: string): Requirement => ({
  id: `id-${key}`,
  projectId: "p1",
  requirementKey: key,
  title,
  description: "",
  priority: "medium",
  createdAt: "",
  updatedAt: "",
  revision: 1,
});
const existing = [req("REQ-001", "Fast pages"), req("REQ-002", "Old export")];

const inventory = {
  scanId: "s1",
  rootName: "shop",
  truncated: false,
  files: [
    { path: "README.md", size: 700, tokens: 200, category: "docs", excluded: null },
    { path: "src/routes/cart.ts", size: 700, tokens: 200, category: "routes", excluded: null },
    { path: ".npmrc", size: 10, tokens: 3, category: "config", excluded: "secret" },
  ],
};
const contents = [
  { path: "README.md", text: "1| Users can pay with a saved card.\n2| [secreto omitido]\n", redacted: [2], lines: 2 },
  { path: "src/routes/cart.ts", text: "1| router.post('/cart')\n", redacted: [], lines: 1 },
];

beforeEach(async () => {
  await i18n.changeLanguage("en");
  scan.pick.mockReset().mockResolvedValue(inventory);
  scan.read.mockReset().mockResolvedValue(contents);
  ai.extract.mockReset().mockResolvedValue({
    value: {
      candidates: [
        {
          title: "Pay with a saved card",
          description: "The system shall let a user pay with a saved card.",
          priority: "high",
          basis: "stated",
          acceptance: [],
          sources: [{ path: "README.md", startLine: 1, endLine: 1 }],
        },
      ],
    },
    provenance,
  });
  ai.synthesize.mockReset().mockResolvedValue({
    value: {
      proposals: [
        { action: "add", from: [1], title: "Pay with a saved card", description: "The system shall …", reason: "README says it" },
        { action: "remove", key: "REQ-002", coveredBy: "REQ-001", reason: "unrelated" },
      ],
    },
    provenance,
  });
  api.get.mockReset().mockImplementation(async (id: string) => existing.find((r) => r.id === id) ?? null);
  api.create.mockClear();
  api.remove.mockClear();
});

function renderModal(linkedCases: Record<string, number> = {}) {
  const onApplied = vi.fn();
  const onClose = vi.fn();
  renderWithProviders(
    <ProjectRequirementsModal
      projectId="p1"
      existing={existing}
      linkedCases={linkedCases}
      onApplied={onApplied}
      onClose={onClose}
    />,
  );
  return { onApplied, onClose };
}

async function reachReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Pick folder…" }));
  await screen.findByText("README.md");
  expect(screen.getByText("1 file will never be sent")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Continue" }));
  const notice = await screen.findByTestId("ai-send-notice");
  expect(notice).toHaveTextContent("The content leaves this device for Claude.");
  expect(notice).toHaveTextContent("2 files (≈ 24 tokens) will be sent in 2 calls.");
  expect(screen.getByText(/1 line that looks like a secret/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Send and analyse" }));
  await screen.findByTestId("req-proposals");
}

describe("ProjectRequirementsModal", () => {
  it(
    "goes from the folder to the proposals and applies only what is ticked",
    async () => {
      const user = userEvent.setup();
      const { onApplied, onClose } = renderModal();
      await expectNoAxeViolations(document.body);
      await reachReview(user);
      expect(scan.read).toHaveBeenCalledWith("s1", ["README.md", "src/routes/cart.ts"]);
      expect(ai.extract).toHaveBeenCalledTimes(1);
      const [candidates, sent] = ai.synthesize.mock.calls[0];
      expect(candidates[0].title).toBe("Pay with a saved card");
      expect(sent.map((e: { key: string }) => e.key)).toEqual(["REQ-001", "REQ-002"]);

      const add = screen.getByTestId("req-proposal-0");
      expect(within(add).getByText("README.md:1")).toBeInTheDocument();
      expect(within(add).getByText("Stated in the source")).toBeInTheDocument();
      // New ones start ticked; deleting starts unticked.
      expect(within(add).getByRole("checkbox")).toBeChecked();
      expect(within(screen.getByTestId("req-proposal-1")).getByRole("checkbox")).not.toBeChecked();
      await expectNoAxeViolations(document.body);

      await user.click(screen.getByTestId("req-proposals-apply"));
      await waitFor(() => expect(onApplied).toHaveBeenCalled());
      expect(api.create).toHaveBeenCalledTimes(1);
      expect(api.create.mock.calls[0][0]).toMatchObject({
        title: "Pay with a saved card",
        priority: "high",
        data: {
          aiProvenance: { requirement: { ...provenance, prompt: "req-synthesis@1" } },
          sources: [{ kind: "file", path: "README.md", startLine: 1, endLine: 1 }],
        },
      });
      expect(api.remove).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    },
    UI_TIMEOUT,
  );

  it(
    "never deletes a requirement with linked cases",
    async () => {
      const user = userEvent.setup();
      renderModal({ "REQ-002": 2 });
      await reachReview(user);
      const remove = screen.getByTestId("req-proposal-1");
      expect(within(remove).getByRole("checkbox")).toBeDisabled();
      expect(within(remove).getByText(/has 2 linked cases/)).toBeInTheDocument();
    },
    UI_TIMEOUT,
  );

  it(
    "a failed batch can be retried, and going on without it still synthesizes",
    async () => {
      const user = userEvent.setup();
      ai.extract.mockRejectedValueOnce(new Error("The AI provider did not answer in time"));
      renderModal();
      await user.click(screen.getByRole("button", { name: "Pick folder…" }));
      await user.click(await screen.findByRole("button", { name: "Continue" }));
      await user.click(await screen.findByRole("button", { name: "Send and analyse" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("1 batch of 1 failed");
      await user.click(screen.getByRole("button", { name: "Retry 1 batch" }));
      await screen.findByTestId("req-proposals");
      expect(ai.extract).toHaveBeenCalledTimes(2);
    },
    UI_TIMEOUT,
  );
});
