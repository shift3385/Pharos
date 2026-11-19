// Response schemas of /api/v1 (INT-02, ADR-0052 §1): the routes parse what
// they send with them, and `openapi.ts` turns them into the contract.
import { z } from "zod";
import { API_SCOPES } from "./scopes";

export const meSchema = z
  .object({
    token: z.object({
      id: z.uuid(),
      kind: z.enum(["project", "personal"]),
      name: z.string(),
      prefix: z.string(),
      scopes: z.array(z.enum(API_SCOPES)),
      expiresAt: z.string(),
      workspaceId: z.uuid().nullable(),
      projectId: z.string().nullable(),
    }),
    owner: z.object({ id: z.uuid(), name: z.string() }),
  });

export const projectSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    caseIdPrefix: z.string(),
    workspace: z.object({ id: z.uuid(), name: z.string() }),
  });

export const projectListSchema = z.object({ projects: z.array(projectSchema) });

export const errorSchema = z
  .looseObject({ code: z.string(), message: z.string() })
  .meta({ description: "Every error: a stable `code` and a readable `message`, plus fields of that error." });
