# E2 · paso 3 · Almacén `evidence/` y migración de `planner_attachments` — PLAN

Rama `claude/exec-e2-evidence-946105`. Migraciones locales **0022–0023** (se
reservan en `scripts/migration-registry.json` en el primer commit). Sin migración
de servidor. ADR-0014 manda; lo que aquí precisa el ADR va como enmienda en el
propio ADR-0014 (sección "Implementación, 2026-10-31").

## 1. Formato en disco

- `<data_dir>/evidence/<2 hex>/<hmac hex>.pev`; temporales en `evidence/tmp/`.
- **Claves** (sin entrada nueva en el keychain; la clave de recuperación lo cubre):
  `evidence_key = HKDF-SHA256(db_key, info "pharos-evidence-v1")` como dice el ADR.
  De ella salen dos subclaves con HKDF-Expand (`"name"`, `"file"`): una para el
  HMAC del nombre y otra para AES-GCM, para no usar la misma clave en dos
  primitivas. _Precisión sobre el ADR → enmienda._
- **`.pev` v1:** cabecera de 16 bytes `"PEV1" | version u8 = 1 | chunk u32 LE
(65536) | nonce_prefix 7 bytes aleatorios` + AES-256-GCM STREAM (`StreamBE32`,
  `aead::stream`; feature `stream` de `aes-gcm`, crate ya presente). La cabecera
  va como AAD de cada bloque; el último bloque va marcado (truncado = error).
- El cifrado es aleatorio por archivo (nonce), el nombre es determinista (HMAC del
  sha256). Al leer se recalcula el sha256 en streaming y se compara con el de la
  BD antes de dar por buena la salida (detecta archivos cambiados de nombre).
- Versión de cabecera > 1 → error `evidence-newer-than-app` (mismo patrón que
  `NEWER_DB_ERROR`).
- **Escritura atómica:** `tmp/<uuid>.pev.new` + `sync_all` + `rename` al destino;
  si el destino ya existe, se borra el temporal y no se reescribe (dedupe). Al
  abrir se borra todo `evidence/tmp/` (solo hay texto cifrado incompleto).
- **Dependencias nuevas:** `hkdf 0.12` y `hmac 0.12` (RustCrypto, MIT/Apache,
  mismas `digest`/`sha2` 0.10 del árbol); `aes-gcm` gana la feature `stream`.
  `cargo deny` debe seguir verde (lo compruebo; la CI lo vuelve a correr).

## 2. Esquema (0022) — tal cual el boceto del ADR

- `blobs` (local, no sincroniza): `sha256 PK, size, mime, local_state, stored_at`.
  `local_state`: `present | remote_only | missing | deleting` (`deleting` es
  nuevo: borrado pendiente de disco, ver §4).
- `attachments` (forma LWW completa: `workspace_id, project_id, owner_entity,
owner_id, kind DEFAULT 'evidence', blob_purged_at, created_by, updated_by,
created_at, updated_at, deleted_at, revision`) + índices por dueño y por sha.
  **Sin `UNIQUE`** (diseño §3.4).
- Política de retención por kind: tabla local `evidence_retention (project_id,
kind, days NULL = siempre)`; vacía = valores por defecto del ADR (constantes en
  Rust). Ver pregunta P2.

## 3. API Rust (`src-tauri/src/evidence.rs`) y comandos

- `EvidenceStore` (dir + subclaves), creado en `Db::open_with_key` y guardado en
  `Db` (`db.evidence()`); nunca expone la clave.
- `put_reader(Read) -> PutResult {sha256, size}` y una subida por trozos para la
  UI: `Upload` (cifra y hashea al vuelo, nunca guarda el archivo entero en RAM).
- `open_reader(sha256) -> impl Read` (descifra en streaming, verifica sha256 al
  final), `remove(sha256)`, `collect(conn)` (GC, §4).
- **Comandos Tauri:**
  - `evidence_upload_begin(size) -> uploadId` (rechaza si supera el límite),
    `evidence_upload_chunk` (cuerpo raw, cabecera `x-pharos-upload`, como
    `download_save`), `evidence_upload_cancel`;
  - `planner_attachment_add(cardId, ownerId, uploadId, name, mime)`: cierra la
    subida, inserta `blobs`/`attachments` y el evento `link` en una transacción,
    `persist`;
  - `planner_attachment_save(id, ownerId)`: descifra en streaming directamente a
    la carpeta de descargas (`Downloads`, atómico, Mark-of-the-Web como hoy). Los
    bytes no pasan por la webview. `Downloads` gana una variante que escribe desde
    un `Read`.
  - `planner_attachment_list` / `_delete` siguen con la misma firma.
    `planner_attachment_get` (base64) se elimina; el contrato TS se regenera.
- **Límite por archivo:** 200 MB por defecto (ADR, decisión 1), comprobado en
  Rust al empezar y en cada trozo; la UI lo comprueba antes por `file.size`.
- **Logs:** solo recuentos, tamaños y tipos de error; nunca nombre, mime ni hash.

## 4. Ciclo de vida, GC, retención y purga

- **Orden seguro con `persist`:** el archivo se escribe antes de persistir la BD
  que lo referencia; se borra solo después de persistir la BD que ya no lo
  referencia. Para eso, al quedarse sin referencias vivas un blob pasa a
  `local_state = 'deleting'` (en la misma transacción), `persist`, después
  `collect` borra el archivo y la fila (con el lock de la BD, rechequeando el
  estado; un `put` del mismo contenido entretanto lo devuelve a `present`). Al
  abrir se completa cualquier `deleting` pendiente.
- **Referencia viva** = `attachments` con `deleted_at IS NULL` y
  `blob_purged_at IS NULL`. Borrar una tarjeta (borrado lógico) **no** suelta sus
  blobs (la tarjeta puede volver por un conflicto); la purga de la tarjeta sí.
- **Borrar un adjunto** pasa de `DELETE` a borrado lógico + GC inmediato del blob
  si nadie más lo usa (el usuario espera que el archivo desaparezca). El evento
  `unlink` sigue igual (sin bytes).
- **Purga SYNC-06** (`purge.rs`): el dependiente de `planner_cards` pasa de
  `planner_attachments` a `attachments WHERE owner_entity = 'planner_card'`, y
  además purga los adjuntos con borrado lógico vencido; tras la purga, `collect`.
- **Retención por kind** (ADR): `evidence::expire(conn, now)` marca
  `blob_purged_at`, suelta el blob y escribe un evento `redact` (añado
  `Action::Redact`; el CHECK de 0019 ya admite `redact`, lo verifico). Las
  excepciones del ADR (resultado final fallido/bloqueado, defecto abierto,
  ejecución manual) se expresan como una función por `owner_entity`; hoy solo
  existe `planner_card` (kind `evidence` = siempre), y los pasos 7/8 añaden las
  suyas. Se ejecuta junto a la purga. Tests con adjuntos sintéticos `trace`/`video`.

## 5. Migración de datos (0022 + paso Rust + 0023)

- `MIGRATIONS` gana un paso Rust opcional por entrada. Orden: SQL 0022 (crea
  tablas) → `evidence::migrate_planner_attachments(conn, store)` → SQL 0023
  (`DROP TABLE planner_attachments`) → `VACUUM` del imagen en memoria → `persist`.
  `run_migrations(conn)` de los tests sigue igual (sin store: si hubiera filas
  que mover, error explícito; en BD nuevas no hay).
- **Por fila:** lee el BLOB por E/S incremental de SQLite (`blob_open`, sin copiar
  el archivo entero), lo cifra en streaming al almacén, inserta `blobs` +
  `attachments` con **el mismo id**, `owner_entity = 'planner_card'`,
  `kind = 'evidence'`, `workspace_id/project_id` de la tarjeta, `created_by =
updated_by =` dueño de la tarjeta, `created_at = updated_at` del adjunto
  original. Sin eventos de auditoría (ADR-0015: no se rellena hacia atrás).
- **Determinista y reanudable:** hasta el `persist` final nada de la BD llega a
  disco y el backup SEC-06 (`.bak-<versión>-<última>`) ya se ha hecho antes (la
  lógica actual de `open_with_key`). Si se corta: la BD en disco sigue sin migrar,
  los `.pev` ya escritos se reutilizan (dirección por contenido, no se
  reescriben) y los temporales se borran al abrir. Volver a abrir repite la
  migración y llega al mismo resultado.
- **Tarjeta borrada (lógico):** sus adjuntos se migran igual (ocultos como hoy;
  la purga los quita). **Fila huérfana** sin tarjeta (posible con FKs apagadas):
  se descarta y se cuenta en el log (solo el número); sigue en el backup. Ver P4.
- **La BD encoge:** tras `DROP` + `VACUUM` la imagen ya no lleva los bytes.
  Aviso en docs: los `.bak-*` previos siguen llevándolos hasta que se podan (3).

## 6. UI del planificador (`src/modules/planner`)

- Igual para el usuario: añadir, descargar, borrar. Por dentro: `File.slice` en
  trozos de 4 MiB → `evidence_upload_chunk` (raw), y descarga con
  `planner_attachment_save` (avisos de guardado como hoy en `saveFile`).
- Límite visible: de 10 MB a **200 MB** (cambio que se nota → fragmento
  `changes/DAT-03.md`). Mensaje nuevo si el archivo falta en este equipo
  (`missing`, p. ej. BD copiada sin `evidence/`) o no se puede descifrar.
- Web: sigue `desktopOnly` (sin cambios).

## 7. Sync: nada de bytes

- `attachment` **no** se registra en `oplog::SYNCED` ni en `APPEND_ONLY` en este
  paso (como hoy: auditoría sin fila de oplog). Ver P1.
- Test: tras añadir un adjunto, `build_pending` de ambas clases no lleva ni
  `attachment` ni bytes, y el evento de auditoría solo lleva `{id,name,mime,size,
sha256}` (ya existe un test; lo amplío al flujo nuevo).

## 8. Recuperación, «versión más nueva» y diagnóstico

- `Db::recover` no cambia: la clave recuperada deriva la misma `evidence_key`.
  Test: BD + `evidence/` copiados a otro directorio y abiertos con la clave de
  recuperación → el adjunto se descarga igual; sin `evidence/` → `missing`, sin
  fallo al abrir.
- BD con migraciones desconocidas → se rechaza antes de tocar `evidence/`
  (test: el directorio no se crea ni cambia).
- Diagnóstico: `diag.rs` no lee la carpeta de datos; añado un test de que el
  paquete no contiene nombres, hashes ni bytes de evidencias con un adjunto
  presente, y una regla en el doc del módulo.

## 9. Tests (lo que pide "hecho")

Unitarios en `evidence.rs`: ida y vuelta streaming (0 B, 1 B, 64 KiB exactos,
64 KiB+1, 12 MB), dedupe, clave errónea → error sin texto en claro, bloque
truncado/alterado/reordenado → error, cabecera v2 → `evidence-newer-than-app`,
sin `.new` ni `tmp/` tras escritura o fallo, GC con `deleting` y crash simulado,
límite de tamaño, retención con excepciones.
Migración / actualización (`upgrade_tests.rs`), sobre **ambos** fixtures
(los originales no se tocan; las copias ampliadas se hacen en memoria y se
cifran a un directorio temporal):

- el adjunto original se abre igual (mismos bytes, nombre, mime, tamaño, id);
- ampliado con un adjunto de **12 MB**, uno **duplicado** (1 solo `.pev`) y una
  **tarjeta borrada** con adjunto;
- **interrumpida y reanudada** (fallo inyectado tras la fila N, solo en tests) →
  reabrir completa, mismo estado final, sin temporales;
- **clave errónea** → error de clave, nada migrado, `evidence/` intacto;
- la BD encoge (tamaño de la imagen antes/después) y `planner_attachments` ya no
  existe;
- los tests "keeps every row" pasan a tratar `planner_attachments` como movida
  (comprobación fila a fila contra `attachments` + archivo).
  UI: `plannerApi.test.ts` y `PlannerBoard.test.tsx` para subida por trozos,
  límite de 200 MB y descarga.

## 10. Documentación (misma PR)

README (sección carpeta de datos/backup: "copia de seguridad completa =
`pharos.db.enc` + `evidence/`", restauración y recuperación en otro equipo),
ARCHITECTURE (almacén, formato, orden con `persist`, GC), ADR-0014 (enmienda de
implementación: subclaves, `deleting`, sin barrido de huérfanos, `attachment` aún
sin sync), GLOSARIO (blob, attachment, `.pev`), `changes/DAT-03.md`,
`docs/design/e2-evidence-plan.md` + resumen, comentario de `0006_planner.sql` no
se toca (migraciones inmutables).

## Preguntas para el coordinador (con mi recomendación)

- **P1 · ¿`attachment` (solo metadatos) se sincroniza ya?** El diseño lo pone en
  `lww`, pero hoy los adjuntos del planificador no sincronizan y en otro equipo
  aparecerían como "no disponible aquí" hasta 0.4.0. **Recomiendo no registrarlo
  en este paso**: el esquema ya tiene la forma LWW, así que registrarlo es una
  línea + `APPLIED_SET_VERSION` + línea en `sync.schemas.ts`; que lo haga el paso
  7, cuando los resultados (que sí sincronizan) traen sus adjuntos.
- **P2 · Ajustes en Admin** (límite por archivo y retención por kind). Hoy ningún
  adjunto tiene un kind que caduque. **Recomiendo**: motor, tabla y valores por
  defecto ahora; la pantalla de Admin en el paso 7, que es cuando aparecen
  `trace`/`video`/`log`/`raw_report`. Si preferís la pantalla ya, la añado aquí
  (pestaña de Admin, ADR-0031).
- **P3 · Barrido de `.pev` huérfanos** (sin fila en `blobs`; solo salen de un
  corte en una ventana mínima entre `rename` y `persist`). **Recomiendo no
  barrer automáticamente**: un `.pev` sin fila puede pertenecer a una BD más
  nueva que el usuario apartó al restaurar un `.bak` (README). Se documenta.
- **P4 · Filas huérfanas** de `planner_attachments` sin tarjeta: **recomiendo
  descartarlas** (invisibles hoy, quedan en el backup SEC-06) en vez de inventar
  un proyecto.

## Fuera de alcance

Subida/descarga con servidor (SYNC-04b), `templates.file` (sigue BLOB), rotación
de `evidence_key` (SEC-04/05; documentada en el ADR), adjuntos de resultados y
defectos (pasos 7 y 8).

## Respuestas del coordinador (2026-10-31, plan aprobado)

- **P1:** `attachment` no se registra en el sync; llega con el paso 7 o SYNC-04b.
- **P2:** motor y valores por defecto ahora (documentados en README y
  ARCHITECTURE); la UI de Admin (límite y retención), en el paso 7.
- **P3:** sin barrido automático de `.pev` huérfanos. Entrada en ROADMAP para
  «Verificar evidencias» / reparar a mano, y el diagnóstico lleva solo el
  **recuento** de `.pev` sin referencia.
- **P4:** se eliminan las filas huérfanas sin tarjeta; quedan en la copia SEC-06.
- **Comprobaciones añadidas:** `cargo-deny` y licencias con los crates nuevos;
  una BD migrada por esta versión, abierta con alpha.1, cae en la comprobación
  «datos de una versión más nueva»; migración cortada entre el paso Rust y 0023;
  archivo grande sin cargarlo en RAM; la UI dice el nuevo límite de 200 MB.
