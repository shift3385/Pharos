# ADR-0019 · Diseño técnico de los workspaces compartidos con roles (TEN-01)

- **Estado:** Aceptado (decisión del usuario, 2026-10-28: la opción y las
  respuestas recomendadas). Revisado el 2026-10-28 tras la revisión
  independiente (ver "Revisión"): precisiones, sin cambio de decisión. Detalla
  [ADR-0003](0003-workspaces-compartidos.md), que ya fijó el modelo. Se
  implementa en 0.3.0 (SYNC-07).
- **Diseño de conjunto:** [`docs/design/0.2.0-modelo-ejecucion.md`](../design/0.2.0-modelo-ejecucion.md).

## Contexto

- **El servidor guarda documentos por usuario.**
  - `documents` tiene la clave primaria `(user_id, entity, entity_id)` y el
    índice de pull `(user_id, seq)` (`server/migrations/0002_documents.sql`).
  - `sync.repository.ts` filtra por `user_id`; las rutas de `sync.routes.ts`
    dicen "everything is scoped to the authenticated user".
- **El rol del servidor es global.** `users.role` (`0001_init.sql`) va dentro
  del JWT (`tokens.ts`); no hay pertenencia a nada.
- **En local, cada instalación tiene su propio workspace.**
  - `ensure_workspace` (`src-tauri/src/db.rs`) crea un workspace "My workspace"
    con un **UUID aleatorio por instalación**, así que dos equipos del mismo
    usuario sincronizan payloads con `workspaceId` distintos.
  - La visibilidad se filtra por `projects.owner_id`
    (`0005_project_ownership.sql`).
  - `project_members` (roles `owner | editor | auditor`) existe sin uso, y con un
    vocabulario distinto de los roles de la spec §3: Test Manager, Test Analyst,
    Automation Engineer, Product Owner, Viewer.
- **FIX-07 (0.1.0)** separa por usuario el oplog, el cursor y `sync_base` en el
  mismo equipo. Es la base sobre la que se monta esto.
- **Límites:** sin SaaS multi-tenant antes de 1.0 (ADR-0005), solo modo
  autoalojado. SYNC-08 añade la versión de la app en cada petición.
- **Las entidades de 0.2.0** (runs, resultados, defectos, evidencias, auditoría)
  ya llevan `workspace_id`, así que todo cuelga del workspace.

## Opciones

| Opción                                                                                                                        | A favor                                                   | En contra                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **A. El workspace es la frontera de datos y permisos; un rol por workspace** y todos sus proyectos visibles para sus miembros | Simple de explicar, de comprobar en cada push y de probar | Si alguien necesita roles distintos por proyecto, tiene que usar workspaces distintos |
| **B. A + roles por proyecto** (`project_members`)                                                                             | Control fino                                              | Más UI y más comprobaciones; se puede añadir sobre A más adelante sin rehacer nada    |
| **C. Listas de acceso por documento**                                                                                         | Máxima flexibilidad                                       | Imposible de razonar y de auditar; no encaja con los roles                            |

## Decisión: A

### Modelo

- **Tipos de workspace:**
  - `personal`: uno por usuario, creado por el servidor, con sus datos actuales;
  - `shared`: cualquier usuario puede crearlo y queda como su Test Manager;
  - `local`: de un equipo aislado, no se publica nunca o se publica después.
- **Los ids los puede generar el cliente** (UUID), así que un workspace `local`
  se puede publicar sin renumerar nada.
- **Roles y permisos:** se decide en el servidor por cada delta.
- **Invitación** con un enlace o código de un solo uso, que el Test Manager
  copia y envía. En 0.3.0 no hay SMTP: autoalojado y sin dependencias.
- **Compartir un proyecto** desde el workspace personal a uno compartido es una
  operación de servidor atómica, `POST /workspaces/{destino}/move-project`, que:
  1. reescribe el `workspace_id` del proyecto y de todo lo que cuelga de él
     (planes, casos, revisiones, requisitos, runs, resultados, defectos,
     adjuntos, blobs, campos);
  2. deja tombstones en el origen;
  3. lo registra en la auditoría.

  Para los documentos `append_only` es un **cambio de ubicación**, una de las
  tres operaciones de servidor que admite esa clase (ADR-0011). El contenido
  y los hashes no cambian, y la cadena de auditoría sigue siendo válida
  (ADR-0015).

  Los clientes lo reciben por pull de ambos workspaces.

- **Baja de un miembro:** el servidor deja de servirle datos y rechaza sus
  pushes. Su cliente, en el siguiente sync, recibe `403 workspace_revoked`,
  avisa y borra la copia local de ese workspace (pregunta 2).
- **Defensa en profundidad:** el `workspace_id` va en cada consulta del
  repositorio, con tests de aislamiento. La RLS de Postgres queda como opción
  para 0.5.0 (con la API).

### Permisos (boceto)

| Acción                                  | Test Manager | Test Analyst | Automation Eng.         | Product Owner    | Viewer |
| --------------------------------------- | ------------ | ------------ | ----------------------- | ---------------- | ------ |
| Miembros, invitaciones, mover proyectos | ✔            | —            | —                       | —                | —      |
| Proyectos y plan de pruebas             | ✔            | editar plan  | —                       | —                | —      |
| Requisitos (incluido el riesgo)         | ✔            | ✔            | —                       | ✔                | —      |
| Casos, ciclos, configuraciones, campos  | ✔            | ✔            | casos y configuraciones | —                | —      |
| Ejecutar a mano                         | ✔            | ✔            | ✔                       | —                | —      |
| Importar resultados                     | ✔            | ✔            | ✔                       | —                | —      |
| Defectos                                | ✔            | ✔            | ✔                       | crear y comentar | —      |
| Ver todo y exportar                     | ✔            | ✔            | ✔                       | ✔                | ✔      |
| Ver la auditoría                        | ✔            | —            | —                       | —                | —      |

## Esquema (boceto)

Servidor (Postgres):

```sql
CREATE TABLE workspaces (
  id uuid PRIMARY KEY,                      -- puede venir del cliente
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('personal', 'shared')),
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE UNIQUE INDEX workspaces_personal_idx ON workspaces (created_by) WHERE kind = 'personal';

CREATE TABLE workspace_members (
  workspace_id uuid NOT NULL REFERENCES workspaces (id),
  user_id uuid NOT NULL REFERENCES users (id),
  role text NOT NULL CHECK (role IN ('test_manager', 'test_analyst', 'automation_engineer', 'product_owner', 'viewer')),
  added_by uuid NOT NULL, added_at timestamptz NOT NULL DEFAULT now(), removed_at timestamptz,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE workspace_invitations (
  id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces (id),
  role text NOT NULL, token_hash text NOT NULL UNIQUE,      -- sha256, como los refresh tokens
  email text,                                               -- informativo; el enlace es lo que vale
  invited_by uuid NOT NULL, expires_at timestamptz NOT NULL,
  accepted_by uuid, accepted_at timestamptz, revoked_at timestamptz
);

-- documents pasa de "por usuario" a "por workspace"
ALTER TABLE documents ADD COLUMN workspace_id uuid;
ALTER TABLE documents ADD COLUMN author_user_id uuid;      -- quién hizo el push
-- relleno: workspace_id = workspace personal del user_id; payload.workspaceId reescrito con jsonb_set
-- nueva PK (workspace_id, entity, entity_id); nuevo índice de pull (workspace_id, seq); user_id deja de ser clave
```

`users.role` deja de usarse para permisos; se conserva solo como el rol por
defecto con el que alguien crea un workspace.

SQLite local:

```sql
ALTER TABLE workspaces ADD COLUMN kind TEXT NOT NULL DEFAULT 'local';   -- workspace_kind: local | personal | shared
ALTER TABLE workspaces ADD COLUMN my_role TEXT;                         -- caché del rol (la autoridad es el servidor)
ALTER TABLE workspaces ADD COLUMN revoked_at TEXT;
CREATE TABLE workspace_members (                                        -- espejo de solo lectura
  workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
  display_name TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
ALTER TABLE oplog ADD COLUMN workspace_id TEXT;                         -- para enviar por workspace
-- sync_state: un cursor por workspace ('cursor:<workspace_id>')
```

`project_members` deja de usarse (pregunta 1). `projects.owner_id` se mantiene
como dato de autoría, no de visibilidad.

## Protocolo y migraciones (VERSIONING §6)

- **Protocolo de sync v2** (con la versión de SYNC-08):
  - `GET /workspaces` devuelve las pertenencias y los roles;
  - `POST /sync/push` lleva `{ protocol: 2, appVersion, workspaceId, deltas }`.
    Su respuesta añade `rejected: [{ entity, entityId, reason: 'forbidden' }]`
    junto a `conflicts`, y un delta rechazado no escribe nada;
  - `GET /sync/pull?workspace=<id>&since=<seq>`.
- **Compatibilidad con clientes 0.2.x:** durante 0.3.x, el servidor atiende una
  petición v1 como si fuera al workspace personal del usuario. Así, un 0.2.0
  sigue funcionando hasta que se actualiza.
- **Migración del servidor**, en una sola transacción:
  1. crear un workspace `personal` por cada usuario con documentos;
  2. rellenar `documents.workspace_id` y reescribir `payload.workspaceId`;
  3. cambiar la clave primaria y el índice.

  Los `entity_id` son UUID, así que no hay colisiones al cambiar de clave.

- **Migración local, en el primer sync v2:** el workspace `local` "My workspace"
  de cada instalación se **reasigna** al workspace personal del usuario
  (`UPDATE … SET workspace_id = <personal>` en todas las tablas, en una
  transacción, con copia SEC-06 antes). Desde ese momento, dos equipos del mismo
  usuario comparten `workspace_id`. Si no hay servidor, el workspace sigue
  siendo `local`.
- **Comprobación local de permisos.** Los comandos Rust comprueban el rol en
  caché antes de escribir, y la UI desactiva lo que el rol no permite. Si aun así
  un delta se rechaza (rol cambiado sin conexión), queda en el panel de
  conflictos como "rechazado por permisos", con la opción de descartarlo.
- **Las claves visibles** (`<scenario_id>`, `REQ`, `DEF`, `RUN`, `CYC`) tienen que ser
  únicas entre **usuarios** de un workspace, no solo entre equipos: es un
  requisito para el mecanismo de DAT-01.
- **Sustituye la regla 1 de
  [ADR-0020](0020-sync-por-usuario-cascada-y-version.md)** ("el usuario de un
  cambio es el dueño de la entidad" y "un pull nunca sobrescribe una entidad
  de otra cuenta"). Con workspaces compartidos, esa regla descartaría las
  ediciones de los compañeros. Desde 0.3.0:
  - el estado del sync (`oplog`, `sync_base`, `sync_conflicts` y el cursor)
    es por `(user_id, workspace_id)`;
  - un documento recibido se aplica si su `workspace_id` es de uno de los
    workspaces del usuario, sea quien sea su autor;
  - `owner_id` queda solo como dato de autoría;
  - el mapeo `owner_of` por entidad que exige ADR-0020 en 0.2.x (todas las
    entidades nuevas derivan su dueño de `project_id`) deja de hacer falta:
    el filtro es el `workspace_id` que ya lleva cada fila.
- **Los blobs** se indexan por `(workspace_id, sha256)` (ADR-0014).
- **Test de actualización** con los datos de un servidor 0.2.0 y dos clientes
  0.2.0 del mismo usuario: tras migrar, ambos ven un solo workspace y los mismos
  datos.

## Decisiones del usuario (2026-10-28)

1. En 0.3.0 solo hay roles por workspace. Los roles por proyecto (opción B)
   podrán añadirse después sobre `project_members`, si hacen falta.
2. Al revocar a un miembro, su copia local se borra en el siguiente sync, con un
   aviso previo. Queda documentado que una copia que no vuelve a conectarse no se
   puede borrar a distancia.
3. "Compartir proyecto" (moverlo del workspace personal a uno compartido) entra
   en 0.3.0.
4. En 0.3.0 las invitaciones se hacen por enlace o código, sin correo. El SMTP
   llegará con el despliegue (0.5.0).
5. Solo el Test Manager ve la auditoría (coherente con ADR-0015, decisión 2,
   confirmado por el usuario el 2026-10-28).

## Revisión (2026-10-28, tras la revisión independiente)

- **Precisiones, sin cambio de decisión:**
  - este ADR sustituye a la regla 1 de ADR-0020 a partir de 0.3.0;
  - mover un proyecto es un cambio de ubicación para los documentos
    `append_only`;
  - la columna `kind` corresponde al concepto `workspace_kind` del GLOSARIO;
  - las claves de caso se llaman `<scenario_id>` y no `TC-xxx`.
- **Simplificación propuesta al usuario (no aplicada):** marcar este ADR como
  "dirección aceptada; se revisa al planificar SYNC-07". Se implementa en
  0.3.0, después de que 0.2.0 haya cambiado el sync.
