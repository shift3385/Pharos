// Template repository model (spec §6). A template is a stored .xlsx (plan or
// case) with metadata; built-ins are seeded from the bundled PHAROS templates.

import type { Assert, Contract, Covers } from "@shared/contracts";

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

// The Rust contract (BASE-05, ADR-0026): what Rust sends covers what this model
// reads, and what this model sends covers what Rust reads. `tsc` fails if a
// field is renamed, dropped or retyped on either side.
export type _RustContract = [
  Assert<Covers<Contract.TemplateSummary, TemplateSummary>>,
  Assert<Covers<Contract.TemplateData, TemplateData>>,
  Assert<Covers<TemplateInput, Contract.TemplateInput>>,
  Assert<Covers<TemplateMeta, Contract.TemplateMeta>>,
  Assert<Covers<TemplateSeedItem, Contract.TemplateSeedItem>>,
];
