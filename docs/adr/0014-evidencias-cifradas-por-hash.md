# ADR-0014 · Evidencias cifradas fuera de la BD, direccionadas por hash (DAT-03)

- **Estado:** Aceptado (decisión del usuario, 2026-10-28: la opción y las respuestas recomendadas). Bloquea EJE-02; SYNC-04b (0.4.0)
  depende de él.
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
  referencia y, con sync, después de que el servidor confirme que lo tiene. Las
  evidencias de resultados no se borran nunca, salvo con la purga explícita de
  un proyecto.
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
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, deleted_at TEXT
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

- `attachment` es una entidad de sync normal (LWW con borrado lógico). Las de
  `result`, `step_result` y `run_shard` nunca se borran. Los bytes **nunca**
  pasan por el oplog.
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

## Preguntas resueltas (2026-10-28)

El usuario aceptó la recomendación de cada pregunta; lo que sigue queda decidido.

1. **Límite por archivo.** Recomendación: 200 MB por defecto, configurable en
   Admin, para que entren las trazas y los vídeos de Playwright.
2. **Cifrado en el servidor.** Recomendación: cifrado en reposo gestionado por
   el servidor (disco o MinIO con SSE) más TLS. Con cifrado de extremo a
   extremo, ni los miembros del workspace ni la web
   ([ADR-0004](0004-web-cliente-del-servidor.md)) podrían verlas sin repartir
   claves; queda para después de 1.0.
3. **Descarga en otros equipos (0.4.0).** Recomendación: bajo demanda, con la
   opción "disponible sin conexión" por proyecto.
