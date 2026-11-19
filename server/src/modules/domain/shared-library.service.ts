// The project library on the web (CAS-01, ADR-0055): the twin of the
// desktop's `shared_library.rs` commands, on the server's document store.
// The pure rules (validation, versions, the copy in a case) are in
// `shared-library.ts`, shared with the sync checks.

import { randomUUID } from "node:crypto";
import { AppError } from "../auth/errors.js";
import type { RemoteDoc } from "../sync/sync.repository.js";
import { staleWrite, type DomainTx } from "./domain.store.js";
import {
  DATASET,
  DATASET_REFS,
  DATASET_REVISION,
  LIMITS,
  LibraryError,
  SHARED_REFS,
  SHARED_STEP,
  SHARED_STEP_REVISION,
  behind,
  bodyKey,
  callCopy,
  canonical,
  caseParams,
  datasetTable,
  defKey,
  follows,
  idsOf,
  isObject,
  libraryRevisionId,
  listOf,
  materialize,
  normalizeDataset,
  normalizeShared,
  referenced,
  refs,
  shaOf,
  str,
  type DatasetVersion,
  type Library,
  type Obj,
  type Outcome,
  type SharedVersion,
} from "./shared-library.js";

const revisionEntity = (entity: string) =>
  entity === SHARED_STEP ? SHARED_STEP_REVISION : DATASET_REVISION;
const num = (v: unknown) => (typeof v === "number" ? v : 0);
const fail = (code: string, status = 400) => new AppError(status, code, code);

type Version = {
  itemId: string;
  version: number;
  revisionId: string;
  name: string;
  current: boolean;
};

/** The library a case names, read into memory for `materialize`. */
export async function loadLibrary(
  tx: DomainTx,
  projectId: string,
  data: Obj,
): Promise<Library> {
  const shared = new Map<string, (SharedVersion & Version)[]>();
  const datasets = new Map<string, (DatasetVersion & Version)[]>();
  const keep = <T extends Version>(m: Map<string, T[]>, v: T) =>
    m.set(v.itemId, [...(m.get(v.itemId) ?? []), v]);
  for (const [key, field, entity] of [
    [SHARED_REFS, "sharedStepId", SHARED_STEP],
    [DATASET_REFS, "datasetId", DATASET],
  ] as const) {
    for (const r of refs(data, key)) {
      const itemId = str(r, field);
      if (!itemId) continue;
      const found: { p: Obj; current: boolean }[] = [];
      const doc = await tx.get(entity, itemId);
      if (doc && !doc.deleted && str(doc.payload, "projectId") === projectId)
        found.push({ p: doc.payload, current: true });
      const rev = str(r, "revisionId");
      if (rev) {
        const old = await tx.get(revisionEntity(entity), rev);
        if (old && !old.deleted && str(old.payload, "itemId") === itemId)
          found.push({ p: { ...old.payload, id: rev }, current: false });
      }
      for (const { p, current } of found) {
        const version = num(p.version);
        const name = str(p, "name") ?? "";
        const def = Array.isArray(p[defKey(entity)])
          ? (p[defKey(entity)] as Obj[])
          : [];
        const body = Array.isArray(p[bodyKey(entity)])
          ? (p[bodyKey(entity)] as Obj[])
          : [];
        const revisionId = current
          ? libraryRevisionId(
              entity,
              itemId,
              version,
              shaOf(entity, name, def, body),
            )
          : (str(p, "id") ?? "");
        const base = { itemId, version, revisionId, name, current };
        if (entity === SHARED_STEP) keep(shared, { ...base, steps: body });
        else
          keep(datasets, {
            ...base,
            columns: def.map((c) => ({
              id: str(c, "id") ?? "",
              name: str(c, "name") ?? "",
            })),
            rows: body.map((row) => ({
              id: str(row, "id") ?? "",
              values: isObject(row.values) ? row.values : {},
            })),
          });
      }
    }
  }
  const pick = <T extends Version>(
    all: T[] | undefined,
    revisionId?: string,
  ) =>
    revisionId
      ? all?.find((v) => v.revisionId === revisionId)
      : all?.find((v) => v.current);
  return {
    shared: (id, rev) => pick(shared.get(id), rev),
    dataset: (id, rev) => pick(datasets.get(id), rev),
  };
}

/** Rebuilds the copies of a case being saved from the web. */
export async function materializeCase(
  tx: DomainTx,
  projectId: string,
  caseId: string,
  data: Obj,
): Promise<Outcome> {
  try {
    return materialize(caseId, data, await loadLibrary(tx, projectId, data));
  } catch (e) {
    if (e instanceof LibraryError) throw fail(e.code);
    throw e;
  }
}

export interface LibraryRefStatus {
  refId: string;
  kind: string;
  itemId: string;
  name: string;
  version: number;
  latestVersion: number | null;
  follow: boolean;
  state: string;
  missingColumns: string[];
}

/** The state of each call and binding (the desktop's `materialize::status`). */
export function refStatus(
  caseId: string,
  data: Obj,
  lib: Library,
): LibraryRefStatus[] {
  const out: LibraryRefStatus[] = [];
  const stateOf = (
    hasAt: boolean,
    hasLatest: boolean,
    hasRev: boolean,
    modified: boolean,
    newer: boolean,
  ) => {
    if (!hasAt) return !hasLatest && hasRev ? "deleted" : "missing";
    if (modified) return "modified";
    if (!hasLatest) return "deleted";
    return newer ? "outdated" : "ok";
  };
  for (const call of refs(data, SHARED_REFS)) {
    const refId = str(call, "id");
    const item = str(call, "sharedStepId");
    if (!refId || !item) continue;
    const latest = lib.shared(item);
    const rev = str(call, "revisionId");
    const at = rev ? lib.shared(item, rev) : undefined;
    const version = num(call.version);
    let modified = false;
    if (at) {
      const ids = idsOf(call, "stepIds");
      const list = Array.isArray(data[listOf(call)])
        ? (data[listOf(call)] as unknown[])
        : [];
      modified =
        canonical(list.filter((s) => ids.includes(str(s, "id") ?? ""))) !==
        canonical(callCopy(caseId, call, at));
    }
    out.push({
      refId,
      kind: SHARED_STEP,
      itemId: item,
      name: str(call, "name") ?? "",
      version,
      latestVersion: latest?.version ?? null,
      follow: follows(call),
      state: stateOf(
        !!at,
        !!latest,
        !!rev,
        modified,
        (latest?.version ?? 0) > version,
      ),
      missingColumns: [],
    });
  }
  const params = caseParams(data);
  for (const b of refs(data, DATASET_REFS)) {
    const refId = str(b, "id");
    const item = str(b, "datasetId");
    if (!refId || !item) continue;
    const latest = lib.dataset(item);
    const rev = str(b, "revisionId");
    const at = rev ? lib.dataset(item, rev) : undefined;
    const version = num(b.version);
    let modified = false;
    let missingColumns: string[] = [];
    if (at) {
      const [table, missing] = datasetTable(caseId, b, params, at);
      missingColumns = missing;
      modified = canonical(data.examples) !== canonical(table);
    }
    out.push({
      refId,
      kind: DATASET,
      itemId: item,
      name: str(b, "name") ?? "",
      version,
      latestVersion: latest?.version ?? null,
      follow: follows(b),
      state: stateOf(
        !!at,
        !!latest,
        !!rev,
        modified,
        (latest?.version ?? 0) > version,
      ),
      missingColumns,
    });
  }
  return out;
}

export interface LibraryInput {
  projectId: string;
  kind: string;
  name: string;
  description?: string;
  definition?: unknown;
  body?: unknown;
}

export interface LibraryDeps {
  run: <T>(userId: string, fn: (tx: DomainTx) => Promise<T>) => Promise<T>;
  liveProject: (tx: DomainTx, projectId: string) => Promise<Obj>;
  /** Saves a case again with its stored fields, so its copy is rebuilt;
   *  false if nothing changed. `cause` goes to its audit event. */
  refreshCase: (
    tx: DomainTx,
    userId: string,
    doc: RemoteDoc,
    cause: Obj,
  ) => Promise<boolean>;
  now: () => string;
}

export function createLibraryService(deps: LibraryDeps) {
  const { run } = deps;

  const casesNaming = async (tx: DomainTx, projectId: string, itemId: string) =>
    (await tx.list("test_case", projectId)).filter((d) => {
      const [s, ds] = referenced(
        isObject(d.payload.data) ? d.payload.data : {},
      );
      return s.includes(itemId) || ds.includes(itemId);
    });

  const view = async (tx: DomainTx, doc: RemoteDoc) => {
    const p = doc.payload;
    const entity = doc.entity;
    const projectId = str(p, "projectId") ?? "";
    return {
      id: doc.entityId,
      projectId,
      kind: entity,
      name: str(p, "name") ?? "",
      description: str(p, "description") ?? "",
      definition: Array.isArray(p[defKey(entity)]) ? p[defKey(entity)] : [],
      body: Array.isArray(p[bodyKey(entity)]) ? p[bodyKey(entity)] : [],
      status: str(p, "status") ?? "active",
      version: num(p.version) || 1,
      contentSha256: str(p, "contentSha256") ?? "",
      usedBy: (await casesNaming(tx, projectId, doc.entityId)).length,
      createdBy: str(p, "createdBy") ?? "",
      createdAt: str(p, "createdAt") ?? "",
      updatedAt: str(p, "updatedAt") ?? "",
      revision: doc.revision,
    };
  };

  async function live(
    tx: DomainTx,
    id: string,
    revision?: number,
  ): Promise<RemoteDoc> {
    for (const entity of [SHARED_STEP, DATASET]) {
      const doc = await tx.get(entity, id);
      if (!doc) continue;
      if (doc.deleted) {
        if (revision === undefined) break;
        throw new AppError(
          409,
          "deleted_elsewhere",
          "This item was deleted elsewhere since you opened it.",
        );
      }
      if (revision !== undefined && doc.revision !== revision)
        throw staleWrite(doc);
      await deps.liveProject(tx, str(doc.payload, "projectId") ?? "");
      return doc;
    }
    throw fail("shared_library.not_found", 404);
  }

  const entityOf = (kind: string) => {
    if (kind !== SHARED_STEP && kind !== DATASET)
      throw fail("shared_library.bad_kind");
    return kind;
  };

  const normalized = (entity: string, input: LibraryInput) => {
    const name = input.name.trim();
    if (!name) throw fail("shared_library.empty_name");
    if (name.length > LIMITS.name) throw fail("shared_library.too_long:name");
    const description = input.description ?? "";
    if (description.length > LIMITS.description)
      throw fail("shared_library.too_long:description");
    try {
      const [def, body] =
        entity === SHARED_STEP
          ? normalizeShared(input.definition, input.body)
          : normalizeDataset(input.definition, input.body);
      return {
        name,
        description,
        def,
        body,
        sha: shaOf(entity, name, def, body),
      };
    } catch (e) {
      if (e instanceof LibraryError) throw fail(e.code);
      throw e;
    }
  };

  const nameTaken = async (
    tx: DomainTx,
    entity: string,
    projectId: string,
    name: string,
    except?: string,
  ) =>
    (await tx.list(entity, projectId)).some(
      (d) =>
        d.entityId !== except &&
        (str(d.payload, "name") ?? "").toLowerCase() === name.toLowerCase(),
    );

  async function appendVersion(tx: DomainTx, userId: string, doc: RemoteDoc) {
    const p = doc.payload;
    const entity = doc.entity;
    const version = num(p.version) || 1;
    const name = str(p, "name") ?? "";
    const def = p[defKey(entity)] ?? [];
    const body = p[bodyKey(entity)] ?? [];
    const sha = shaOf(entity, name, def, body);
    const id = libraryRevisionId(entity, doc.entityId, version, sha);
    await tx.append(revisionEntity(entity), id, {
      id,
      workspaceId: p.workspaceId ?? null,
      projectId: p.projectId ?? null,
      itemId: doc.entityId,
      version,
      name,
      [defKey(entity)]: def,
      [bodyKey(entity)]: body,
      contentSha256: sha,
      createdBy: userId,
      createdAt: deps.now(),
      hlc: tx.stamp(),
    });
  }

  async function propagate(
    tx: DomainTx,
    userId: string,
    doc: RemoteDoc,
  ): Promise<string[]> {
    const version = num(doc.payload.version) || 1;
    const done: string[] = [];
    for (const c of await casesNaming(
      tx,
      str(doc.payload, "projectId") ?? "",
      doc.entityId,
    )) {
      if (
        !behind(
          isObject(c.payload.data) ? c.payload.data : {},
          doc.entityId,
          version,
        )
      )
        continue;
      if (
        await deps.refreshCase(tx, userId, c, {
          cause: { [doc.entity]: doc.entityId, version },
        })
      )
        done.push(c.entityId);
    }
    return done;
  }

  return {
    list: (userId: string, projectId: string, kind: string) =>
      run(userId, async (tx) => {
        const entity = entityOf(kind);
        const project = await tx.get("project", projectId);
        if (!project || project.deleted) return [];
        const views = await Promise.all(
          (await tx.list(entity, projectId)).map((d) => view(tx, d)),
        );
        return views.sort(
          (a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
            a.id.localeCompare(b.id),
        );
      }),
    get: (userId: string, id: string) =>
      run(userId, async (tx) => view(tx, await live(tx, id))),
    create: (userId: string, input: LibraryInput) =>
      run(userId, async (tx) => {
        const entity = entityOf(input.kind);
        await deps.liveProject(tx, input.projectId);
        const n = normalized(entity, input);
        if (await nameTaken(tx, entity, input.projectId, n.name))
          throw fail("shared_library.duplicate_name", 409);
        const id = randomUUID();
        const doc = await tx.put(
          entity,
          id,
          {
            id,
            workspaceId: "local",
            projectId: input.projectId,
            name: n.name,
            description: n.description,
            [defKey(entity)]: n.def,
            [bodyKey(entity)]: n.body,
            status: "active",
            version: 1,
            contentSha256: n.sha,
            createdBy: userId,
            createdAt: deps.now(),
            updatedAt: deps.now(),
          },
          null,
        );
        await appendVersion(tx, userId, doc);
        return view(tx, doc);
      }),
    /** A content change bumps the version and rewrites the cases that follow
     *  the item (ADR-0055 §4); the description alone does not. */
    update: (
      userId: string,
      id: string,
      input: LibraryInput,
      revision?: number,
    ) =>
      run(userId, async (tx) => {
        const doc = await live(tx, id, revision);
        const entity = doc.entity;
        const n = normalized(entity, input);
        if (
          await nameTaken(
            tx,
            entity,
            str(doc.payload, "projectId") ?? "",
            n.name,
            id,
          )
        )
          throw fail("shared_library.duplicate_name", 409);
        const contentChanged = n.sha !== str(doc.payload, "contentSha256");
        if (
          !contentChanged &&
          n.description === (str(doc.payload, "description") ?? "")
        )
          return { item: await view(tx, doc), updatedCases: [] as string[] };
        const next = await tx.put(
          entity,
          id,
          {
            ...doc.payload,
            name: n.name,
            description: n.description,
            [defKey(entity)]: n.def,
            [bodyKey(entity)]: n.body,
            version: (num(doc.payload.version) || 1) + (contentChanged ? 1 : 0),
            contentSha256: n.sha,
            updatedAt: deps.now(),
          },
          doc,
        );
        let updatedCases: string[] = [];
        if (contentChanged) {
          await appendVersion(tx, userId, next);
          updatedCases = await propagate(tx, userId, next);
        }
        return { item: await view(tx, next), updatedCases };
      }),
    impact: (userId: string, id: string) =>
      run(userId, async (tx) => {
        const doc = await live(tx, id);
        const byStatus: Record<string, number> = {};
        const cases = [];
        for (const c of await casesNaming(
          tx,
          str(doc.payload, "projectId") ?? "",
          id,
        )) {
          const data = isObject(c.payload.data) ? c.payload.data : {};
          const mine = [
            ...refs(data, SHARED_REFS),
            ...refs(data, DATASET_REFS),
          ].filter(
            (r) => str(r, "sharedStepId") === id || str(r, "datasetId") === id,
          );
          const follow = mine.some(follows);
          const status = str(c.payload, "status") ?? "draft";
          if (follow) byStatus[status] = (byStatus[status] ?? 0) + 1;
          cases.push({
            id: c.entityId,
            scenarioId: str(c.payload, "scenarioId") ?? "",
            title: str(c.payload, "title") ?? "",
            status,
            follow,
            version: Math.max(0, ...mine.map((r) => num(r.version))),
          });
        }
        cases.sort((a, b) => a.scenarioId.localeCompare(b.scenarioId));
        return { cases, byStatus };
      }),
    setStatus: (
      userId: string,
      id: string,
      status: string,
      revision?: number,
    ) =>
      run(userId, async (tx) => {
        if (status !== "active" && status !== "obsolete")
          throw fail("shared_library.bad_status");
        const doc = await live(tx, id, revision);
        if (str(doc.payload, "status") === status) return view(tx, doc);
        return view(
          tx,
          await tx.put(
            doc.entity,
            id,
            { ...doc.payload, status, updatedAt: deps.now() },
            doc,
          ),
        );
      }),
    remove: (userId: string, id: string, revision?: number) =>
      run(userId, async (tx) => {
        const doc = await live(tx, id, revision);
        if (
          (await casesNaming(tx, str(doc.payload, "projectId") ?? "", id))
            .length > 0
        )
          throw fail("shared_library.in_use", 409);
        await tx.put(doc.entity, id, doc.payload, doc, true);
      }),
    versions: (userId: string, id: string) =>
      run(userId, async (tx) => {
        const doc = await live(tx, id);
        const entity = revisionEntity(doc.entity);
        return (
          await tx.list(entity, str(doc.payload, "projectId") ?? "", {
            where: { itemId: id },
          })
        )
          .map((d) => ({
            id: d.entityId,
            itemId: id,
            version: num(d.payload.version),
            name: str(d.payload, "name") ?? "",
            definition: d.payload[defKey(entity)] ?? [],
            body: d.payload[bodyKey(entity)] ?? [],
            contentSha256: str(d.payload, "contentSha256") ?? "",
            createdBy: str(d.payload, "createdBy") ?? "",
            createdAt: str(d.payload, "createdAt") ?? "",
          }))
          .sort(
            (a, b) =>
              b.version - a.version || b.createdAt.localeCompare(a.createdAt),
          );
      }),
    caseStatus: (userId: string, caseId: string) =>
      run(userId, async (tx) => {
        const doc = await tx.get("test_case", caseId);
        if (!doc || doc.deleted) throw fail("not_found", 404);
        const projectId = str(doc.payload, "projectId") ?? "";
        await deps.liveProject(tx, projectId);
        const data = isObject(doc.payload.data) ? doc.payload.data : {};
        return refStatus(caseId, data, await loadLibrary(tx, projectId, data));
      }),
    preview: (
      userId: string,
      projectId: string,
      caseId: string | undefined,
      data: Obj,
    ) =>
      run(userId, async (tx) => {
        await deps.liveProject(tx, projectId);
        const copy = structuredClone(data);
        await materializeCase(tx, projectId, caseId ?? "new", copy);
        return copy;
      }),
  };
}
