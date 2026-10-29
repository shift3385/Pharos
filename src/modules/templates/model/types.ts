// Template repository model (spec §6). A template is a stored .xlsx (plan or
// case) with metadata; built-ins are seeded from the bundled PHAROS templates.

export type TemplateKind = "plan" | "case";
export type TemplateLanguage = "es" | "en";

export interface TemplateSummary {
  id: string;
  kind: TemplateKind;
  language: TemplateLanguage;
  name: string;
  description: string;
  usagePrompt: string;
  version: string;
  isBuiltin: boolean;
  /** The signed-in account imported it, so it may edit or delete it. Built-in
   *  and shared legacy templates (imported before accounts) are read-only. */
  isOwn: boolean;
  updatedAt: string;
}

export interface TemplateData extends Omit<TemplateSummary, "updatedAt"> {
  /** The raw .xlsx bytes, base64-encoded. */
  dataBase64: string;
}

export interface TemplateInput {
  kind: TemplateKind;
  language: TemplateLanguage;
  name: string;
  description?: string;
  usagePrompt?: string;
  version?: string;
  dataBase64: string;
}

export interface TemplateMeta {
  name: string;
  description?: string;
  usagePrompt?: string;
  version?: string;
}

/** A built-in template to seed (stable id makes seeding idempotent). */
export interface TemplateSeedItem {
  id: string;
  kind: TemplateKind;
  language: TemplateLanguage;
  name: string;
  description?: string;
  usagePrompt?: string;
  version?: string;
  dataBase64: string;
}
