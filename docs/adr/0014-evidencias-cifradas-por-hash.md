# ADR-0014 · Evidencias cifradas fuera de la BD, direccionadas por hash (DAT-03)

- **Estado:** Aceptado (decisión del usuario, 2026-10-28: la opción y las
  respuestas recomendadas). Revisado el 2026-10-28 tras la revisión
  independiente (ver "Revisión"). La retención de evidencias, que sustituye a
  "no se borran nunca", fue confirmado por el usuario el 2026-10-28.
  Bloquea EJE-02; SYNC-04b (0.4.0) depende de él.
- **Diseño de conjunto:** [`docs/design/0.2.0-modelo-ejecucion.md`](../design/0.2.0-modelo-ejecucion.md).

## Contexto

- **Los adjuntos del planificador son BLOBs dentro de la BD.**
  `planner_attachments.bytes` (`0006_planner.sql`); `planner_attachment_add`
  (`src-tauri/src/planner.rs`) decodifica el base64 y llama a `db.persist()`.
- **La BD vive entera en memoria** y cada guardado la serializa, la cifra con
  AES-256-GCM y la escribe de forma atómica (`Db::persist`, `src-tauri/src/db.rs`).
  Cada adjunto encarece **todos** los guardados posteriores (O(tamaño de la BD))
  y ocupa RAM para siempre. SEC-05 (cifrado por página, 0.3.0) quita el coste
  del guardado, pero no el peso en la BD ni en el sync.
- **La ejecución trae evidencias grandes:**
  - capturas, vídeos y trazas de Playwright (decenas de MB);
  - informes en bruto;
  - fotos del móvil (MOB-01).

  Cucumber Messages las trae en BASE64; CTRF y JUnit, solo como rutas locales
  (ING-01 R7).

- SYNC-04b (0.4.0) pide "adjuntos por hash fuera del oplog". El estudio del arte
  coloca los adjuntos en S3/MinIO direccionados por hash.
- `templates.file` también es un BLOB (`0007_templates.sql`), pero son pocos y
  pequeños.

## Opciones

| Opción                                                                                 | A favor                                                                                                                              | En contra                                                                                               |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| **A. Seguir con BLOBs en la BD** y esperar a SEC-05                                    | Cero trabajo; todo dentro de un solo archivo cifrado                                                                                 | RAM y guardados que crecen con cada evidencia; el oplog tendría que llevar binarios; no escala a vídeos |
| **B. Almacén de contenido cifrado en disco** (`evidence/`), con los metadatos en la BD | Guardar la BD deja de depender de las evidencias; deduplicación gratis; streaming de archivos grandes; el sync de binarios va aparte | Un segundo sitio que respaldar y recuperar; recolección de basura                                       |
| **C. Una segunda SQLite cifrada solo para binarios**                                   | Separa los binarios de los datos                                                                                                     | Mismo problema de O(tamaño) y de RAM, solo que en otro archivo                                          |

## Decisión: B

- **Contenido y uso, por separado:**
  - `blob` es el contenido, identificado por el `sha256` del texto en claro;
  - `attachment` es su uso: quién lo adjuntó, a qué, con qué nombre.

  Dos resultados con la misma captura comparten el blob.

- **Ruta en disco:** `evidence/<2 hex>/<hmac>.pev`, con
  `hmac = HMAC-SHA256(evidence_key, sha256)`. Con solo el disco no se puede
  comprobar si existe un archivo conocido, porque el `sha256` en claro solo se
  guarda dentro de la BD cifrada.
- **Clave:** `evidence_key = HKDF-SHA256(db_key, "pharos-evidence-v1")`. No añade
  ninguna entrada al keychain, y la clave de recuperación (SEC-03) también cubre
  las evidencias.
  - **Rotación.** Al derivarse de `db_key`, los nombres y el cifrado de los
    archivos dependen de esa clave. Si `db_key` cambia (rotación, o la
    migración a cifrado por página de SEC-05 con otra clave), hay que
    recifrar y renombrar `evidence/` en segundo plano, de forma reanudable.
    Para evitarlo, SEC-05 puede conservar la misma clave maestra de 32 bytes y
    derivar de ella tanto la clave de página como `evidence_key`. SEC-04 debe
    elegir una de las dos vías.
- **Formato `.pev`:**
  - cabecera con `magic "PEV1"`, versión y tamaño de bloque;
  - AES-256-GCM en modo STREAM (bloques de 64 KiB, `aead::stream` de
    RustCrypto, crates ya presentes, MIT/Apache).

  Se cifra y descifra en streaming, sin cargar el archivo en memoria.

- **Escritura atómica,** como en SEC-02: `.pev.new` + `sync_all` + `rename`. Si
  el blob ya existe, no se reescribe.
- **El hash se calcula al ingerir.** El importador y el CLI leen las rutas de
  CTRF y JUnit (relativas al informe) y decodifican el BASE64 de Messages.
- **Límite por archivo** configurable (pregunta 1).
- **Recolección de basura.** Un blob se borra cuando ningún `attachment` vivo lo
  referencia y, con sync, después de que el servidor confirme que lo tiene.
- **Retención por tipo (confirmado por el usuario el 2026-10-28; sustituye a "las evidencias de resultados
  no se borran nunca").** Con 200 MB por archivo y trazas y vídeos
  de CI a diario, guardarlo todo llena el disco sin límite. Por eso cada
  proyecto tiene una política por `kind`, configurable en Admin. Valores por
  defecto:

  | `kind`                   | Se conserva |
  | ------------------------ | ----------- |
  | `trace`, `video`         | 30 días     |
  | `raw_report`             | 90 días     |
  | `log`                    | 90 días     |
  | `screenshot`, `evidence` | siempre     |
  - **Excepciones:** nunca caduca la evidencia de un resultado final fallido o
    bloqueado, ni la de un resultado vinculado a un defecto abierto, ni nada de
    la ejecución manual.
  - **Al caducar** se borra el blob (en local y, desde 0.4.0, en el servidor).
    El `attachment` se conserva con `blob_purged_at` y su `sha256`, para
    que el histórico diga qué hubo, y se escribe un evento `redact` en la
    auditoría (ADR-0015).
  - El resultado y sus metadatos no cambian; la caducidad la decide una tarea
    local, no el sync.

- **Plantillas:** siguen como BLOB en la BD (fuera de alcance).

## Esquema (boceto)

SQLite local:

```sql
CREATE TABLE blobs (                        -- estado local del contenido; no se sincroniza
  sha256 TEXT PRIMARY KEY, size INTEGER NOT NULL, mime TEXT,
  local_state TEXT NOT NULL,                -- present | remote_only | missing
  stored_at TEXT NOT NULL
);

CREATE TABLE attachments (                  -- uso de un blob; se sincroniza
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
  sha256 TEXT NOT NULL, size INTEGER NOT NULL, mime TEXT, name TEXT NOT NULL,
  owner_entity TEXT NOT NULL,               -- result | step_result | session_note | defect | planner_card | run_shard
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'evidence',    -- evidence | screenshot | video | trace | log | raw_report
  blob_purged_at TEXT,                      -- caducado por la retención; el metadato se conserva
  created_by TEXT NOT NULL, updated_by TEXT NOT NULL, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, deleted_at TEXT, revision INTEGER NOT NULL DEFAULT 1   -- LWW
);
CREATE INDEX attachments_owner_idx ON attachments (owner_entity, owner_id);
CREATE INDEX attachments_sha_idx ON attachments (sha256);
```

Servidor (0.4.0, SYNC-04b):

```sql
CREATE TABLE blobs (
  workspace_id uuid NOT NULL, sha256 text NOT NULL, size bigint NOT NULL, mime text,
  storage_key text NOT NULL,                -- ruta en disco o clave S3/MinIO
  uploaded_by uuid NOT NULL, uploaded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, sha256)        -- sin deduplicación entre workspaces: no revela existencia
);
```

Endpoints:

- `POST /blobs/missing`: el cliente envía una lista de hashes y recibe los que
  faltan en el servidor;
- `PUT /blobs/{sha256}`: el servidor verifica el hash al recibir;
- `GET /blobs/{sha256}`: con la sesión y la pertenencia al workspace
  (ADR-0019).

## Impacto en sync y migraciones

- `attachment` es una entidad de sync normal (LWW con borrado lógico), con los
  campos de auditoría completos. Las de `result`, `step_result` y `run_shard`
  no se borran a mano: solo la retención puede marcar `blob_purged_at`. Los
  bytes **nunca** pasan por el oplog.
- **Dueño** (regla 1 de [ADR-0020](0020-sync-por-usuario-cascada-y-version.md),
  hasta 0.3.0): el dueño de `project_id`.
- Hasta 0.4.0 el sync solo lleva metadatos. En otro equipo una evidencia aparece
  como `remote_only` y no se puede abrir. SYNC-04b añade la subida y la descarga
  bajo demanda.
- **Migración de datos** (Rust, tras la SQL de 0.2.0):
  1. cada fila de `planner_attachments` → blob + `attachments` con
     **el mismo id** (`owner_entity = 'planner_card'`);
  2. se elimina la columna `bytes` (o se recrea la tabla) y se compacta la
     imagen (`VACUUM`).

  La copia `pharos.db.enc.bak-<versión>` (SEC-06) se hace antes. Si la migración
  se corta, los blobs huérfanos los recoge la recolección de basura. El test de
  actualización comprueba que un adjunto de 0.1.0 se abre igual.

- **Copia de seguridad y recuperación:** a partir de aquí, el directorio de
  datos significa `pharos.db.enc` + `evidence/`. SEC-03 y la documentación de
  backup lo tienen que decir.

## Decisiones del usuario (2026-10-28)

1. El límite por archivo es de 200 MB por defecto, configurable en Admin.
2. En el servidor, las evidencias se cifran en reposo con claves que gestiona el
   servidor (disco o MinIO con SSE), y viajan con TLS. El cifrado de extremo a
   extremo queda para después de 1.0: con él, ni los miembros del workspace ni
   la web ([ADR-0004](0004-web-cliente-del-servidor.md)) podrían verlas sin
   repartir claves.
3. En otros equipos (0.4.0) las evidencias se descargan bajo demanda, con la
   opción "disponible sin conexión" por proyecto.

## Revisión (2026-10-28, tras la revisión independiente)

- **Precisiones, sin cambio de decisión:**
  - `attachments` lleva `revision` y `updated_*`, como toda entidad LWW;
  - se documenta la vía de rotación de `evidence_key` para SEC-04/05;
  - el dueño se toma de `project_id`.
- **Cambio sobre lo aceptado, confirmado por el usuario el 2026-10-28:** se añade la retención por tipo, con
  sus excepciones.

## Implementación (E2, paso 3, 2026-10-31)

Hecho en `src-tauri/src/evidence.rs` y las migraciones 0022–0023 (plan:
[`docs/design/e2-evidence-plan.md`](../design/e2-evidence-plan.md)). Precisiones
sobre lo decidido, sin cambiar la decisión:

- **Subclaves.** De `evidence_key` salen dos subclaves con HKDF-Expand
  (`"name"` para el HMAC de los nombres, `"file"` para AES-GCM), para no usar
  una misma clave en dos primitivas. La rotación descrita arriba no cambia.
- **Formato `.pev` v1.** Cabecera de 16 bytes: `"PEV1"`, versión (1), tamaño
  de bloque (u32, 65 536) y el prefijo de nonce de 7 bytes, aleatorio por
  archivo. La cabecera es el dato asociado de cada bloque (`StreamBE32`). Al
  leer se recalcula el sha256 y se rechaza el archivo si no coincide. Una
  versión mayor que 1 da `evidence-newer-than-app`.
- **Temporales** en `evidence/tmp/` (`<uuid>.pev.new`); se vacía al abrir.
- **`local_state = 'deleting'`** se añade a `present | remote_only | missing`.
  Un contenido sin referencias vivas pasa a `deleting` en la misma transacción,
  y su archivo se borra después de guardar la BD (`Db::collect_evidence`). Así
  ningún corte deja una BD que apunte a un archivo borrado.
- **Huérfanos.** Si la migración se corta, al repetirla se reutilizan los
  archivos ya escritos (la recolección no hace falta). Los `.pev` que ninguna
  fila conoce **no se barren solos**: pueden ser de una BD que el usuario
  apartó al restaurar un `.bak`. El diagnóstico los cuenta y DAT-03b (ROADMAP)
  los repara a mano. Las filas de `planner_attachments` sin tarjeta se
  descartan (quedan en la copia SEC-06).
- **Borrado de un adjunto:** borrado lógico (la fila podrá sincronizar) y el
  contenido se libera en el acto si nadie más lo usa. Borrar la tarjeta no
  libera nada; purgarla, sí.
- **Retención:** motor y valores por defecto (`DEFAULT_RETENTION`) con
  `evidence_retention` por proyecto; los ajustes de Admin llegan con el paso 7.
  Hasta entonces solo caduca la evidencia de un `run_shard`: las excepciones de
  los resultados (final fallido o bloqueado, defecto abierto, ejecución manual)
  necesitan sus tablas. Caducar escribe un evento `redact` con actor
  `system:evidence`.
- **`attachment` aún no se sincroniza** (decisión del coordinador,
  2026-10-31): la tabla tiene ya la forma LWW, y registrarla es una línea en
  `oplog::SYNCED`, otra en `sync.schemas.ts` y subir `APPLIED_SET_VERSION`
  (paso 7 o SYNC-04b). SYNC-04b no necesita cambiar el formato local: el
  servidor recibe el texto en claro por TLS y verifica el sha256.
- **Límite** de 200 MB (`MAX_FILE_BYTES`), comprobado al empezar la subida y en
  cada trozo; la UI envía el archivo en trozos crudos de 4 MiB y lo descarga
  directamente desde Rust, sin base64.
