// Uploading a report through the API (INT-02 A2, ADR-0052 §2): the run it
// goes to, the shard and its results, the raw report as evidence, and one
// `import` audit event, in one transaction of the token's owner. What the
// desktop's `import.rs::commit` does, on the server's document store, so the
// desktop pulls exactly what it would have written itself.
//
// Target run, one of:
// - `runKey`: an open run of the project;
// - `externalId`: the run `UUIDv5(NS_API_RUN, [projectId, externalId])`,
//   created by the first upload and found by the next ones, so the jobs of a
//   CI matrix converge on one run without coordinating; it stays open until
//   `POST …/runs/{runKey}/close`;
// - none: a new run, closed as `completed` once imported (as the desktop
//   does); the same file again returns the run that already holds it.
// The shard is `UUIDv5(run ‖ sha256 ‖ normalizer)`: the same file in the
// same run is a no-op (200), never a duplicate.
import { randomUUID } from "node:crypto";
import { v5 as uuidv5 } from "uuid";
import { shardId as shardIdOf } from "@pharos/formats";
import { AppError } from "../auth/errors";
import { sha256Hex, type BlobStore } from "../blobs/blobStore";
import type { DomainStore, DomainTx } from "../domain/domain.store";
import { insertRun, liveRun, type RunService } from "../domain/runs";
import { timestamp } from "../domain/domain.service";
import type { RemoteDoc } from "../sync/sync.repository";
import type { Pool } from "pg";
import type { ApiPrincipal } from "./apiTokens";
import { checkDoc, clip, MAX_TITLE, planImport, resultPayload, runFieldsOf, statusCounts, text, type ImportWarning } from "./importPlan";
import type { ParsedUpload } from "./reportParse";

/** Namespace of the runs an `externalId` names (ADR-0052 §2). */
export const NS_API_RUN = "8d3f6a2e-41c7-5b09-9e18-7a2c4b6d0f53";

type Json = Record<string, unknown>;

export interface UploadOptions {
  runKey?: string;
  externalId?: string;
  runName?: string;
  cycleKey?: string;
  configuration?: string;
  /** Link every result of the file to this case (ADR-0053 §5, `--case`). */
  caseKey?: string;
  fileName?: string;
}

export interface UploadOutcome {
  created: boolean;
  run: { id: string; key: string; url: string | null; status: string };
  shard: { id: string; created: boolean; format: string };
  counts: {
    results: number;
    linked: number;
    unlinked: number;
    byStatus: Record<string, number>;
    findings: number;
    metrics: number;
  };
  warnings: ImportWarning[];
}

export const RunErrors = {
  notFound: (key: string) => new AppError(404, "run_not_found", `Run ${key} not found in this project.`, { runKey: key }),
  closed: (key: string) => new AppError(409, "run_closed", `Run ${key} is closed: reopen it or upload to a new run.`, { runKey: key }),
  both: () => new AppError(400, "validation_error", "Give runKey or externalId, not both."),
};

const str = (p: Json, k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
const nowIso = () => new Date().toISOString();

/** The run of an `externalId` in a project. */
export const externalRunId = (projectId: string, externalId: string) =>
  uuidv5(JSON.stringify([projectId, externalId]), NS_API_RUN);

async function runByKey(tx: DomainTx, projectId: string, key: string): Promise<RemoteDoc | null> {
  const runs = await tx.list("run", projectId);
  return runs.find((d) => str(d.payload, "runKey").toLowerCase() === key.toLowerCase()) ?? null;
}

async function idByKey(tx: DomainTx, entity: string, projectId: string, field: string, value: string): Promise<string | null> {
  const docs = await tx.list(entity, projectId);
  const want = value.trim().toLowerCase();
  return docs.find((d) => str(d.payload, field).trim().toLowerCase() === want)?.entityId ?? null;
}

export function createRunImport(deps: {
  pool: Pool;
  store: DomainStore;
  runs: RunService;
  blobs: BlobStore;
  /** The web app's address, for the run's link in the answer. */
  publicUrl?: string;
}) {
  const { pool, store, runs, blobs } = deps;

  /** The raw report, held by content in the project's workspace (SYNC-04b). */
  async function keepBlob(workspaceId: string, sha: string, bytes: Buffer, mime: string, userId: string) {
    const key = await blobs.put(sha, bytes);
    await pool.query(
      `INSERT INTO blobs (workspace_id, sha256, size, mime, storage_key, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (workspace_id, sha256) DO NOTHING`,
      [workspaceId, sha, bytes.length, mime, key, userId],
    );
  }

  async function attach(tx: DomainTx, a: {
    projectId: string;
    ownerEntity: string;
    ownerId: string;
    sha: string;
    size: number;
    mime: string | null;
    name: string;
    kind: string;
    userId: string;
  }) {
    const existing = (await tx.list("attachment", a.projectId, { where: { ownerEntity: a.ownerEntity, ownerId: a.ownerId } })).find(
      (d) => d.payload.sha256 === a.sha,
    );
    if (existing) return;
    const id = randomUUID();
    const at = nowIso();
    await tx.put(
      "attachment",
      id,
      {
        id,
        workspaceId: "local",
        projectId: a.projectId,
        sha256: a.sha,
        size: a.size,
        mime: a.mime,
        name: clip(a.name, MAX_TITLE)[0],
        ownerEntity: a.ownerEntity,
        ownerId: a.ownerId,
        kind: a.kind,
        createdBy: a.userId,
        createdAt: at,
        updatedAt: at,
      },
      null,
      false,
      { audit: "folded" },
    );
  }

  return {
    async upload(input: {
      principal: ApiPrincipal;
      project: { id: string; workspace: { id: string } };
      file: Buffer;
      mime: string;
      parsed: ParsedUpload;
      options: UploadOptions;
    }): Promise<UploadOutcome> {
      const { principal, project, file, parsed, options } = input;
      if (options.runKey && options.externalId) throw RunErrors.both();
      const userId = principal.ownerId;
      const doc = parsed.doc;
      checkDoc(doc);
      // `--case`: the file's results without a case of their own go to it.
      const caseKey = text(options.caseKey);
      if (caseKey) {
        for (const r of (doc.results as Json[] | undefined) ?? []) if (!text(r.caseKey)) r.caseKey = caseKey;
      }
      const sha = sha256Hex(file);
      const via = { kind: "token", id: principal.tokenId, name: principal.name, prefix: principal.displayPrefix };
      await keepBlob(project.workspace.id, sha, file, input.mime, userId);
      const fileName = clip(text(options.fileName) ?? `${parsed.format}.report`, MAX_TITLE)[0];
      const fields = runFieldsOf(doc);

      const result = await store.tx(userId, async (tx) => {
        const projectId = project.id;
        let runDoc: RemoteDoc | null = null;
        let runCreated = false;
        let closeAfter = false;
        if (options.runKey) {
          runDoc = await runByKey(tx, projectId, options.runKey);
          if (!runDoc) throw RunErrors.notFound(options.runKey);
        } else if (options.externalId) {
          const id = externalRunId(projectId, options.externalId);
          const found = await tx.get("run", id);
          if (found && !found.deleted) runDoc = found;
          else if (found?.deleted) throw RunErrors.notFound(options.externalId);
          else runDoc = await createRun(tx, id);
        } else {
          // The same file already imported in this project: that run.
          const shards = await tx.list("run_shard", projectId);
          const same = shards.find((s) => str(s.payload, "sourceFileSha256") === sha);
          const held = same ? await tx.get("run", str(same.payload, "runId")) : null;
          if (held && !held.deleted) runDoc = held;
          else {
            runDoc = await createRun(tx, randomUUID());
            closeAfter = true;
          }
        }
        async function createRun(tx2: DomainTx, id: string) {
          const cycleId = text(options.cycleKey) ? await idByKey(tx2, "test_cycle", projectId, "cycleKey", options.cycleKey!) : null;
          if (text(options.cycleKey) && !cycleId)
            throw new AppError(404, "not_found", `Cycle ${options.cycleKey} not found in this project.`, { cycleKey: options.cycleKey });
          const configurationId = text(options.configuration)
            ? await idByKey(tx2, "configuration", projectId, "name", options.configuration!)
            : null;
          if (text(options.configuration) && !configurationId)
            throw new AppError(404, "not_found", `Configuration ${options.configuration} not found in this project.`, {
              configuration: options.configuration,
            });
          runCreated = true;
          return insertRun(
            tx2,
            {
              projectId,
              title: clip(text(options.runName) ?? fields.title ?? text(options.fileName) ?? "Import", MAX_TITLE)[0],
              trigger: "ci",
              sourceTool: fields.sourceTool,
              sourceToolVersion: fields.sourceToolVersion,
              environment: fields.environment,
              build: fields.build,
              commitSha: fields.commitSha,
              branch: fields.branch,
              repositoryUrl: fields.repositoryUrl,
              ciUrl: fields.ciUrl,
              dataset: fields.dataset,
              context: { ...(fields.context ?? {}), ...(options.externalId ? { externalId: options.externalId } : {}) },
              cycleId,
              configurationId,
              startedAt: fields.startedAt,
            },
            id,
          );
        }
        const runId = runDoc.entityId;
        const runKey = str(runDoc.payload, "runKey");
        const shardId = shardIdOf(runId, sha, parsedNormalizer(doc));
        const plan = planImport(doc, shardId);
        const existing = await tx.get("run_shard", shardId);
        if (existing && !existing.deleted) {
          await attach(tx, rawAttachment(projectId, shardId));
          return { runId, runKey, shardId, created: false, runCreated, plan, status: str(runDoc.payload, "status") };
        }
        if (!runCreated && str(runDoc.payload, "status") !== "in_progress") throw RunErrors.closed(runKey);
        const at = nowIso();
        await tx.append("run_shard", shardId, {
          id: shardId,
          workspaceId: "local",
          projectId,
          runId,
          shardIndex: plan.shardIndex,
          shardTotal: plan.shardTotal,
          sourceFormat: plan.format,
          sourceFileSha256: sha,
          sourceAttachmentId: null,
          formatVersion: plan.formatVersion,
          normalizerVersion: plan.normalizerVersion,
          importedBy: userId,
          importedAt: at,
          hlc: tx.stamp(),
        });
        await attach(tx, rawAttachment(projectId, shardId));
        for (const r of plan.results) {
          await tx.append(
            "result",
            r.id,
            resultPayload(r, { projectId, runId, shardId, executedBy: plan.executedBy, userId, at, hlc: tx.stamp() }),
          );
        }
        await tx.audit(
          "import",
          "run_shard",
          shardId,
          {
            runId,
            format: plan.format,
            results: plan.results.length,
            warnings: plan.warnings.length,
            via,
          },
          { results: [null, plan.results.length] },
        );
        let status = str(runDoc.payload, "status");
        if (closeAfter) {
          const current = await liveRun(tx, runId);
          await tx.put(
            "run",
            runId,
            { ...current.payload, status: "completed", finishedAt: fields.finishedAt ?? nowIso(), updatedAt: timestamp() },
            current,
          );
          status = "completed";
        }
        return { runId, runKey, shardId, created: true, runCreated, plan, status };
      });

      function rawAttachment(projectId: string, shardId: string) {
        return {
          projectId,
          ownerEntity: "run_shard",
          ownerId: shardId,
          sha,
          size: file.length,
          mime: input.mime,
          name: fileName,
          kind: "raw_report",
          userId,
        };
      }

      // The link is derived when read: count what the readers will see.
      const views = (await runs.results(userId, result.runId)).filter((v) => v.shardId === result.shardId);
      const linked = views.filter((v) => v.effectiveTestCaseId).length;
      const warnings = [...result.plan.warnings];
      const findings = Array.isArray(doc.findings) ? doc.findings.length : 0;
      const metrics = Array.isArray(doc.metrics) ? doc.metrics.length : 0;
      if (findings || metrics)
        warnings.push({ code: "findings-in-raw-report", testKey: null, detail: `${findings} findings, ${metrics} metrics` });
      // Attachments the report embeds stay in the raw report for now (A2).
      if (parsed.inline.length)
        warnings.push({ code: "attachments-in-raw-report", testKey: null, detail: `${parsed.inline.length} attachments` });
      return {
        created: result.runCreated,
        run: {
          id: result.runId,
          key: result.runKey,
          url: deps.publicUrl ? `${deps.publicUrl.replace(/\/$/, "")}/runs/${result.runId}` : null,
          status: result.status,
        },
        shard: { id: result.shardId, created: result.created, format: result.plan.format },
        counts: {
          results: views.length,
          linked,
          unlinked: views.length - linked,
          byStatus: statusCounts(result.plan.results),
          // Stored from F2 on (ADR-0053); kept in the raw report until then.
          findings: 0,
          metrics: 0,
        },
        warnings,
      };
    },
  };
}

function parsedNormalizer(doc: Json): number {
  const s = Array.isArray(doc.shards) ? (doc.shards[0] as Json | undefined) : undefined;
  const v = s?.normalizerVersion;
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 0;
}

export type RunImport = ReturnType<typeof createRunImport>;

