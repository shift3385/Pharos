import { desktopOnly } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type {
  TemplateData,
  TemplateInput,
  TemplateMeta,
  TemplateSeedItem,
  TemplateSummary,
} from "../model/types";

// The desktop keeps the built-in templates and each user's own in its
// encrypted local store (Rust). Templates do not reach the server yet
// (SYNC-04b), so the web has only the built-ins, bundled with the app and held
// in memory while the page is open; importing, editing or deleting a template
// is desktop-only there (BASE-10, ADR-0004).
let builtins: TemplateData[] = [];

const toSummary = ({ dataBase64: _omit, ...rest }: TemplateData): TemplateSummary => ({
  ...rest,
  updatedAt: new Date(0).toISOString(),
});

const web = {
  list: async (): Promise<TemplateSummary[]> =>
    builtins
      .map(toSummary)
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)),
  get: async (id: string): Promise<TemplateData | null> =>
    builtins.find((t) => t.id === id) ?? null,
  seed: async (items: TemplateSeedItem[]): Promise<void> => {
    builtins = items.map((s) => ({
      id: s.id,
      kind: s.kind,
      language: s.language,
      name: s.name,
      description: s.description ?? "",
      usagePrompt: s.usagePrompt ?? "",
      version: s.version ?? "1.0",
      isBuiltin: true,
      isOwn: false,
      dataBase64: s.dataBase64,
    }));
  },
};

// `userId` is the signed-in user (FIX-08b): the desktop store only lists, reads
// or changes the built-in templates and that user's own.
export const templateApi = {
  list: (userId: string): Promise<TemplateSummary[]> =>
    isTauri() ? invoke("template_list", { userId }) : web.list(),
  get: (id: string, userId: string): Promise<TemplateData | null> =>
    isTauri() ? invoke("template_get", { id, userId }) : web.get(id),
  create: async (input: TemplateInput, userId: string): Promise<TemplateData | null> =>
    isTauri() ? invoke("template_create", { input, userId }) : desktopOnly("userTemplates"),
  update: async (id: string, meta: TemplateMeta, userId: string): Promise<TemplateData | null> =>
    isTauri() ? invoke("template_update", { id, meta, userId }) : desktopOnly("userTemplates"),
  remove: async (id: string, userId: string): Promise<void> =>
    isTauri() ? invoke("template_delete", { id, userId }) : desktopOnly("userTemplates"),
  seed: (items: TemplateSeedItem[]): Promise<void> =>
    isTauri() ? invoke("template_seed", { items }) : web.seed(items),
};
