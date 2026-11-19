import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import {
  FEATURES_HEADER,
  SERVER_FEATURES,
  SERVER_VERSION,
  VERSION_HEADER,
} from "../src/modules/sync/sync.version";
import {
  derivedRowId,
  derivedStepId,
  libraryRevisionId,
  shaOf,
} from "../src/modules/domain/shared-library";

// The project library on the web and over sync (CAS-01, ADR-0055): the rules
// of the desktop's `shared_library.rs`, applied by the server.

let app: FastifyInstance;
let pool: Pool;

beforeAll(async () => {
  ({ app, pool } = await setupTestApp());
});
afterAll(async () => {
  await app.close();
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
  await pool.query("TRUNCATE key_blocks");
});

const ALL = SERVER_FEATURES.join(",");

async function tokenFor(email = "lib@pharos.dev"): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: {
      email,
      password: "supersecret1",
      displayName: "L",
      firstName: "Ana",
      lastName: "Gil",
    },
  });
  return res.json().accessToken as string;
}

async function call(
  token: string,
  method: string,
  url: string,
  payload?: unknown,
  features = ALL,
) {
  const res = await app.inject({
    method: method as "GET",
    url,
    headers: {
      authorization: `Bearer ${token}`,
      [VERSION_HEADER]: SERVER_VERSION,
      [FEATURES_HEADER]: features,
    },
    payload: payload as object,
  });
  return { status: res.statusCode, body: res.body ? res.json() : undefined };
}

const login = (projectId: string, last = "Entonces veo mi nombre") => ({
  projectId,
  kind: "shared_step",
  name: "Iniciar sesión",
  body: [
    { id: "L1", text: "Dado que estoy en la página de acceso" },
    { id: "L2", text: "Cuando escribo <usuario> y <clave>" },
    { id: "L3", text: last },
  ],
});

const users = (projectId: string, n = 3) => ({
  projectId,
  kind: "dataset",
  name: "Usuarios válidos",
  definition: [
    { id: "cu", name: "usuario" },
    { id: "ck", name: "clave" },
  ],
  body: [
    { id: "R1", values: { cu: "ana@acme.test", ck: "Clave-1" } },
    { id: "R2", values: { cu: "luis@acme.test", ck: "Clave-2" } },
    { id: "R3", values: { cu: "admin@acme.test", ck: "Clave-3" } },
  ].slice(0, n),
});

const caseWith = (
  projectId: string,
  title: string,
  sharedStepId: string,
  follow = true,
  extra: object = {},
) => ({
  projectId,
  title,
  author: "QA",
  data: {
    gherkinLevel: "basic",
    steps: [{ id: "OWN00001", text: "Cuando pago" }],
    sharedRefs: [
      { id: "CALL0001", sharedStepId, follow, list: "steps", args: {} },
    ],
    ...extra,
  },
});

async function project(token: string) {
  return (await call(token, "POST", "/api/projects", { name: "Tienda" })).body
    .id as string;
}

const texts = (c: { data: { steps: { text: string }[] } }) =>
  c.data.steps.map((s) => s.text);

describe("the library on the web (CAS-01)", () => {
  it("changing a shared step updates the cases that follow it", async () => {
    const token = await tokenFor();
    const p = await project(token);
    const item = (await call(token, "POST", "/api/library", login(p))).body;
    expect(item).toMatchObject({ version: 1, kind: "shared_step", usedBy: 0 });
    const draft = (
      await call(
        token,
        "POST",
        "/api/test-cases",
        caseWith(p, "Borrador", item.id),
      )
    ).body;
    const approved = (
      await call(
        token,
        "POST",
        "/api/test-cases",
        caseWith(p, "Aprobado", item.id),
      )
    ).body;
    const pinned = (
      await call(
        token,
        "POST",
        "/api/test-cases",
        caseWith(p, "Fijado", item.id, false),
      )
    ).body;
    for (const action of ["send", "approve"])
      await call(token, "POST", `/api/test-cases/${approved.id}/review`, {
        action,
        userName: "Ana Gil",
      });

    // The copy, with derived ids, after the case's own step.
    expect(texts(draft)).toEqual([
      "Cuando pago",
      "Dado que estoy en la página de acceso",
      "Cuando escribo <usuario> y <clave>",
      "Entonces veo mi nombre",
    ]);
    expect(draft.data.steps[1].id).toBe(
      derivedStepId(draft.id, "CALL0001", "L1"),
    );
    expect(draft.data.gherkinLevel).toBe("outline");

    const impact = (await call(token, "GET", `/api/library/${item.id}/impact`))
      .body;
    expect(impact.cases).toHaveLength(3);
    expect(impact.byStatus).toEqual({ draft: 1, approved: 1 });

    const saved = await call(token, "PUT", `/api/library/${item.id}`, {
      input: login(p, "Entonces veo mi nombre en la cabecera"),
      revision: item.revision,
    });
    expect(saved.status).toBe(200);
    expect(saved.body.item.version).toBe(2);
    expect(saved.body.updatedCases.sort()).toEqual(
      [draft.id, approved.id].sort(),
    );

    const get = async (id: string) =>
      (await call(token, "GET", `/api/test-cases/${id}`)).body;
    const a = await get(approved.id);
    expect(a.status).toBe("reviewed");
    expect(texts(a)[3]).toBe("Entonces veo mi nombre en la cabecera");
    expect(a.data.sharedRefs[0].version).toBe(2);
    expect(texts(await get(pinned.id))[3]).toBe("Entonces veo mi nombre");

    // The audit event of the rewrite names the cause.
    const ev = await pool.query(
      `SELECT payload FROM documents WHERE entity = 'audit_event' AND payload->>'entityId' = $1
        ORDER BY seq DESC LIMIT 1`,
      [draft.id],
    );
    expect(JSON.stringify(ev.rows[0]?.payload)).toContain(item.id);

    const status = (
      await call(token, "GET", `/api/test-cases/${pinned.id}/library-status`)
    ).body;
    expect(status[0]).toMatchObject({
      state: "outdated",
      latestVersion: 2,
      follow: false,
    });
    expect(
      (await call(token, "GET", `/api/library/${item.id}/versions`)).body,
    ).toHaveLength(2);
    expect(
      (await call(token, "DELETE", `/api/library/${item.id}`)).status,
    ).toBe(409);
  });

  it("a dataset of three rows becomes the case's three Examples rows", async () => {
    const token = await tokenFor();
    const p = await project(token);
    const step = (await call(token, "POST", "/api/library", login(p))).body;
    const ds = (await call(token, "POST", "/api/library", users(p))).body;
    const c = (
      await call(
        token,
        "POST",
        "/api/test-cases",
        caseWith(p, "Compra", step.id, true, {
          datasetRefs: [{ id: "case", datasetId: ds.id }],
        }),
      )
    ).body;
    expect(c.data.examples.headers).toEqual(["usuario", "clave"]);
    expect(c.data.examples.rows).toHaveLength(3);
    expect(c.data.examples.rows[0].id).toBe(derivedRowId(c.id, "case", "R1"));
    expect(
      (await call(token, "GET", `/api/library?projectId=${p}&kind=dataset`))
        .body[0].usedBy,
    ).toBe(1);
  });

  it("names are unique per kind and an advanced case is refused", async () => {
    const token = await tokenFor();
    const p = await project(token);
    const item = (await call(token, "POST", "/api/library", login(p))).body;
    expect((await call(token, "POST", "/api/library", login(p))).status).toBe(
      409,
    );
    const adv = caseWith(p, "Avanzado", item.id);
    adv.data.gherkinLevel = "advanced";
    const res = await call(token, "POST", "/api/test-cases", adv);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("shared_library.advanced_unsupported");
  });
});

describe("the library over sync (CAS-01)", () => {
  const full =
    "key-conflicts,append-only,complete-payload,stable-steps,runs,custom-fields,cycles,defects,requirement-data";

  async function pull(token: string, features: string) {
    const res = await call(
      token,
      "GET",
      "/sync/pull?since=0",
      undefined,
      features,
    );
    return res.body.docs as {
      entity: string;
      payload: Record<string, unknown>;
      revision: number;
      hlc: string;
    }[];
  }

  it("only clients that announce shared-steps pull the library", async () => {
    const token = await tokenFor();
    const p = await project(token);
    await call(token, "POST", "/api/library", login(p));
    const lib = (docs: { entity: string }[]) =>
      docs.filter((d) => /shared_step|dataset/.test(d.entity));
    expect(lib(await pull(token, full))).toHaveLength(0);
    expect(
      lib(await pull(token, `${full},shared-steps`))
        .map((d) => d.entity)
        .sort(),
    ).toEqual(["shared_step", "shared_step_revision"]);
  });

  it("a push of the library without the feature is refused; a version must match its content", async () => {
    const token = await tokenFor();
    const payload = {
      projectId: "p",
      itemId: "s1",
      version: 1,
      name: "X",
      params: [],
      steps: [{ id: "a", text: "t" }],
    };
    const delta = {
      entity: "shared_step_revision",
      entityId: libraryRevisionId(
        "shared_step_revision",
        "s1",
        1,
        shaOf("shared_step", "X", [], payload.steps),
      ),
      op: "append",
      payload,
      revision: 1,
      author: "x",
      hlc: "0000000000001-0000-dev",
    };
    const refused = await call(
      token,
      "POST",
      "/sync/push",
      { deltas: [delta] },
      full,
    );
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe("shared_steps_unsupported");
    const forged = await call(
      token,
      "POST",
      "/sync/push",
      {
        deltas: [
          { ...delta, entityId: "00000000-0000-5000-8000-000000000000" },
        ],
      },
      `${full},shared-steps`,
    );
    expect(forged.status).toBe(400);
  });

  it("a client without the feature keeps the references of a case it saves", async () => {
    const token = await tokenFor();
    const p = await project(token);
    const item = (await call(token, "POST", "/api/library", login(p))).body;
    const c = (
      await call(
        token,
        "POST",
        "/api/test-cases",
        caseWith(p, "Compra", item.id),
      )
    ).body;
    const doc = (await pull(token, `${full},shared-steps`)).find(
      (d) => d.entity === "test_case",
    )!;
    const { sharedRefs: _drop, ...data } = doc.payload.data as Record<
      string,
      unknown
    >;
    const res = await call(
      token,
      "POST",
      "/sync/push",
      {
        deltas: [
          {
            entity: "test_case",
            entityId: c.id,
            op: "upsert",
            payload: { ...doc.payload, title: "Compra editada", data },
            revision: doc.revision + 1,
            baseRevision: doc.revision,
            baseHlc: doc.hlc,
            author: "x",
            hlc: "9999999999999-0000-dev",
          },
        ],
      },
      full,
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body, JSON.stringify(res.body)).toMatchObject({ conflicts: [] });
    const now = (await call(token, "GET", `/api/test-cases/${c.id}`)).body;
    expect(now.title).toBe("Compra editada");
    expect(now.data.sharedRefs[0].sharedStepId).toBe(item.id);
  });
});
