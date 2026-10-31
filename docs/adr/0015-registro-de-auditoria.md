# ADR-0015 · Registro de auditoría append-only desde 0.2.0 (AUD-01)

- **Estado:** Aceptado (decisión del usuario, 2026-10-28: la opción y las
  respuestas recomendadas). Revisado el 2026-10-28 tras la revisión
  independiente (ver "Revisión"). Quién ve la auditoría fue confirmado por el usuario el 2026-10-28.
- **Diseño de conjunto:** [`docs/design/0.2.0-modelo-ejecucion.md`](../design/0.2.0-modelo-ejecucion.md).

## Contexto

- **Reglas de diseño de ROADMAP §8:**
  - los resultados y el audit log son append-only;
  - lo que se escribe por MCP pasa por el oplog como `agent:<id>`.
- **El oplog no sirve como auditoría.** Es un _outbox_ técnico:
  - `oplog::record` (`src-tauri/src/oplog.rs`) guarda `payload = "{}"` y el
    estado se lee en vivo al hacer push (`read_payload`, `src-tauri/src/sync.rs`),
    así que no conserva ni el antes ni el después;
  - sus filas se marcan como sincronizadas y están pensadas para compactarse o
    purgarse (SYNC-06);
  - no registra los cambios que llegan por pull;
  - solo cubre las entidades que se sincronizan.
- **Los campos de autor estaban mal** (FIX-06: `created_by` guardaba el id de
  la entidad). La pista A2 lo corrige con la migración `0015` y guarda el
  usuario. La auditoría parte de esos datos ya corregidos.
- **Mercado.** El audit log es requisito enterprise y la puerta a mercados
  regulados (21 CFR Part 11, estudio del arte, §"Los diferenciadores").

## Opciones

| Opción                                                                                      | A favor                                                                                               | En contra                                                                                                                                                           |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Ampliar el oplog** con el antes y el después y no purgarlo                             | Una sola tabla                                                                                        | Mezcla un mecanismo técnico compactable con un registro que no se puede tocar; solo cubre lo que se sincroniza; los cambios remotos quedan fuera                    |
| **B. Tabla `audit_log` propia, append-only, escrita en la misma transacción que el cambio** | Separación clara; controla el volumen (una importación = un evento); se sincroniza como `append_only` | Hay que llamarla en cada comando que modifica datos                                                                                                                 |
| **C. Triggers de SQLite**                                                                   | Nada se escapa                                                                                        | El actor no llega al trigger sin trucos; diferencias de JSON complejas; no refleja la intención (5.000 eventos por importación); otra solución distinta en Postgres |

## Decisión: B, con una sola puerta de escritura

- **Una función para el oplog y la auditoría:**
  `journal::record(conn, Change { entity, id, op, actor, before, after })`
  escribe la fila del oplog y el evento de auditoría en la misma transacción. Se
  sustituyen las llamadas actuales a `oplog::record`, y así las dos cosas no
  pueden divergir.
- **Un test de guardia** recorre los comandos Tauri que modifican datos y
  comprueba que cada uno deja un evento.
- **Actor:**
  - `user:<uuid>`;
  - `agent:<client_id>` (MCP, 0.7.0), con `on_behalf_of = user:<uuid>`;
  - `system:<componente>` (migración, purga, sync);
  - `ci:<token_id>` (0.5.0).

  Lo que la IA redacta en la UI lo guarda la persona (`user:`) y la procedencia
  IA-01 indica su origen.

- **Qué se guarda:**
  - **Entidades editables:** las diferencias por campo,
    `changes = { campo: [antes, después] }`. Para `data` (JSON) se compara al
    primer nivel de claves.
  - **Entidades append-only** (Result, Finding…): no se repiten. Una importación
    genera **un** evento (`import`) con recuentos, y cerrar un intento manual
    genera uno (`execute`).
  - **Cambios remotos:** sus eventos llegan por sync desde el equipo de origen.
    Al aplicar un pull no se crea ningún evento local, salvo al resolver un
    conflicto (`resolve_conflict`).
- **Cadena de hash por dispositivo y workspace** `(device_id, workspace_id)`:
  - `hash = sha256(prev_hash ‖ JCS(evento sin changes, workspace_id ni project_id) ‖ changes_sha256)`;
  - una cadena por workspace: un miembro que solo sincroniza el workspace A ve
    todas sus cadenas completas;
  - la ubicación (`workspace_id`, `project_id`) no entra en el hash, así que
    mover un proyecto de workspace (ADR-0019) no rompe la cadena. El evento
    conserva `chain_workspace_id`, el workspace en el que se encadenó;
  - al calcularse sobre `changes_sha256`, se puede **redactar** el contenido
    (purga, derecho de supresión) sin romper la cadena: se borra `changes` y se
    conserva su hash. La redacción es una operación de servidor sobre
    documentos `append_only` (ADR-0011) y deja su propio evento `redact`.
- **Dueño de un evento** (regla 1 de
  [ADR-0020](0020-sync-por-usuario-cascada-y-version.md), hasta 0.3.0):
  - con `project_id`, el dueño del proyecto;
  - sin `project_id`, el usuario del actor si es `user:`;
  - un evento `system:` sin proyecto (por ejemplo, de una migración) se queda en
    local y no se envía.
- **Lecturas:** no se auditan en 0.2.0. El registro de accesos llega con la API
  del servidor (0.5.0).
- **Retención:** no se purga en `0.x`. Se consulta en Admin > Auditoría (filtros
  por entidad, actor y fecha) y se exporta a CSV/JSON.
- **Arranque:** solo se registra lo que ocurre desde 0.2.0. Para lo anterior, el
  historial son las revisiones.

## Esquema (boceto)

SQLite local:

```sql
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT,
  at TEXT NOT NULL,                         -- UTC ISO-8601 con ms
  hlc TEXT NOT NULL, device_id TEXT NOT NULL,
  actor TEXT NOT NULL, on_behalf_of TEXT,
  action TEXT NOT NULL,                     -- create | update | delete | restore | import | execute | link | unlink | resolve_conflict | redact
  entity TEXT NOT NULL, entity_id TEXT NOT NULL,
  entity_key TEXT,                          -- ATS_001, REQ-014, DEF-003… (lectura humana)
  changes TEXT,                             -- JSON { campo: [antes, después] }; NULL si se redactó
  changes_sha256 TEXT NOT NULL,
  summary TEXT,                             -- JSON para importaciones: recuentos, formato, archivo
  origin TEXT NOT NULL DEFAULT 'local',     -- local | migration
  chain_workspace_id TEXT NOT NULL,         -- cadena en la que se encadenó (no cambia al mover)
  prev_hash TEXT, hash TEXT NOT NULL
);
CREATE INDEX audit_entity_idx ON audit_log (entity, entity_id);
CREATE INDEX audit_at_idx ON audit_log (workspace_id, at);
```

Servidor: documentos `audit_event` (`append_only`) hasta 0.5.0. Después, una
tabla `audit_events` con la misma forma, en la que el rol de BD de la API solo
tiene `INSERT` y `SELECT`. Los cambios de pertenencia y de roles (ADR-0019) se
auditan en el servidor.

## Impacto en sync y migraciones

- `audit_event` es `append_only`. Al estar ordenados por `hlc`, los eventos de
  varios equipos forman un historial común; cada cadena de hash se verifica por
  `(device_id, chain_workspace_id)`.
- Migración aditiva: la tabla es nueva y no se rellena con nada anterior.
- El volumen se mantiene acotado porque los resultados no generan un evento
  cada uno.
- SYNC-06 (purga real) escribe un evento `redact` en lugar de borrar eventos.

## Decisiones del usuario (2026-10-28)

1. Hay cadena de hash desde 0.2.0. Evita un cambio de esquema cuando lleguen los
   paquetes normativos (DOC-03, Part 11) y permite redactar contenido.
2. **Aclaración confirmado por el usuario el 2026-10-28.** En 0.2.0 la auditoría la ve el
   propio usuario; desde 0.3.0, solo el **Test Manager** del workspace. La
   respuesta aceptada incluía también "Viewer con permiso de auditoría" a través
   del antiguo rol `auditor` de `project_members`, pero ADR-0019 no usa
   `project_members` y su tabla de permisos da la auditoría solo al Test
   Manager. Queda esto último; un rol de auditor puede volver con los roles
   por proyecto.

## Revisión (2026-10-28, tras la revisión independiente)

- **Precisiones, sin cambio de decisión:**
  - la cadena pasa a ser por `(device_id, workspace_id)`;
  - la ubicación queda fuera del hash;
  - la redacción es una operación de servidor;
  - se define el dueño de un evento según la regla de ADR-0020;
  - FIX-06 ya está corregido en A2.
- **Aclaración confirmado por el usuario el 2026-10-28:** quién ve la auditoría (decisión 2).
- **Simplificación descartada (decisión del usuario, 2026-10-28):** que el evento apuntara a las
  revisiones de antes y después en lugar de copiar las diferencias. Se mantiene
  `changes`: el evento se entiende sin consultar las revisiones, el volumen es
  pequeño y la redacción es más sencilla.

## Enmienda de implementación (E1, 2026-10-31)

Aprobada por el coordinador el 2026-10-31 junto con el plan de E1. Precisa la
decisión sin cambiarla:

- **Clave de la cadena hasta 0.3.0:** `(device_id, chain_workspace_id,
  chain_owner)` en lugar de `(device_id, workspace_id)`.
  - En 0.2 todas las cuentas de un equipo comparten el único workspace local,
    pero cada cuenta solo sincroniza sus eventos (regla 1 de ADR-0020). Con la
    clave original, la copia de cada cuenta en el servidor tendría huecos y no
    se podría verificar.
  - `chain_owner` es el dueño del evento (`user_id`), fijado al escribirlo.
  - **Paso a 0.3.0:** cuando ADR-0019 haga del workspace la frontera de datos,
    los eventos nuevos llevan `chain_owner = ''` y empiezan una cadena por
    `(device_id, workspace)`. Las cadenas anteriores no cambian y se siguen
    verificando con su `chain_owner`; la columna se queda.
- **Columnas añadidas al boceto** (migración `0019_audit_log.sql`):
  - `chain_seq` (1, 2, 3… por cadena), para detectar huecos y ordenar la
    verificación;
  - `chain_owner`;
  - `user_id`, la cuenta con la que se sincroniza (`''` = solo local);
  - `redacted_at`.
- **El dueño se fija al escribir** y no se vuelve a derivar: el de un actor
  `user:` es esa cuenta (en 0.2 solo el dueño de un proyecto lo edita); el de
  un actor `system:` es el dueño del proyecto, o `''`. Así un evento no cambia
  de cadena después.
- **Cabecera hasheada:** el evento sin `changes`, `workspace_id`, `project_id`,
  `user_id`, `prev_hash`, `hash` ni `redacted_at`. JCS (RFC 8785) solo para el
  subconjunto que usa la cabecera (claves ASCII, cadenas, enteros, booleanos,
  null); otra cosa es un error. `changes` y `summary` viajan como el texto JSON
  guardado, y `changes_sha256` es el sha256 de ese texto.
- **Solo añadir, también en la BD local:** triggers que rechazan `DELETE` y
  todo `UPDATE` salvo la redacción (`changes` → NULL y `redacted_at` puesto,
  una sola vez). La purga nunca toca `audit_log`.
- **Un evento por intención:** borrar un proyecto es un evento `delete` con los
  recuentos de la cascada en `summary`; importar requisitos por CSV, un evento
  `import` con sus recuentos (sus filas siguen teniendo cada una su fila de
  oplog). Una actualización que no cambia ningún campo no deja evento.
- **Adjuntos del planificador:** eventos `link` / `unlink` sobre la tarjeta,
  con nombre, tipo, tamaño y sha256, sin fila de oplog propia hasta SYNC-04b.
- **Resolver un conflicto** deja un evento `resolve_conflict` en los dos
  sentidos (con `"resolution": "local"` o `"remote"` en `summary`).
- **Lo que se edita en la web** lo audita el servidor desde AUD-01b (ver
  «Enmienda de AUD-01b» más abajo).
- **Sincronización:** los eventos pendientes no cuentan en el indicador de
  cambios pendientes. El diagnóstico exportado lleva su número
  (`pendingAuditEvents`), para ver si se acumulan contra un servidor sin
  `append-only`.

### Tras la revisión de E1 (2026-10-31)

- **Bifurcación al copiar la base.**
  - Una base recuperada con la clave de recuperación recibe un `device_id`
    nuevo (`oplog::rotate_device_id`), así que sus eventos empiezan una cadena
    nueva en lugar de bifurcar la del equipo original.
  - Una copia `.bak` restaurada a mano conserva el `device_id`, y la cabeza de
    su cadena retrocede: la cadena se bifurca y `verify_chain` lo verá como un
    eslabón roto. Lo cubre AUD-01c (ROADMAP).
- **Eventos rechazados.**
  - Un evento que el servidor rechaza (`appendRejected`) se marca y no se
    vuelve a enviar. Se conserva en local y el diagnóstico lo cuenta
    (`rejectedAuditEvents`).
  - **Para SYNC-06:** la redacción cambia el contenido del documento en el
    servidor. Una copia sin redactar que se reenvíe después chocará y se
    rechazará, y así debe ser: la redacción de servidor tendrá que propagarse a
    los equipos (el pull no aplica cambios a eventos que ya tiene) antes de que
    estos reenvíen nada.
- **Actor `user:` sin id** (un cambio hecho sin sesión, por ejemplo un
  proyecto sin `ownerId`): el evento no tiene dueño y se queda en el equipo,
  igual que el cambio, que no tiene a quién sincronizarse.
- **El pull no verifica el hash.** Guarda lo que tiene el servidor; quien
  comprueba una cadena es `verify_chain` (Admin > Auditoría).
- **Solo añadir, también frente a `INSERT OR REPLACE`.** SQLite no dispara los
  triggers de borrado en un REPLACE salvo con `recursive_triggers`, así que un
  trigger rechaza insertar un id que ya existe.
- **Crecimiento.**
  - Cada cambio auditado escribe dos filas de oplog, y un evento con los
    valores cambiados; reordenar 200 tarjetas son 200 eventos (112 ms en un
    build de depuración).
  - Nada se compacta todavía: las filas de oplog sincronizadas esperan a
    SYNC-10, y la auditoría no se purga en `0.x`.

## Enmienda de AUD-01b: auditoría de la web (E2, 2026-10-31)

Aprobada por el coordinador el 2026-10-31 junto con el plan de E2 · AUD-01b.
Extiende la decisión a lo que se edita en la web, sin cambiarla:

- **El servidor escribe su propia cadena por cuenta:** `(device_id "web",
  chain_workspace_id "web", chain_owner = la cuenta)`.
  - En 0.2 el servidor no tiene workspace, y el `workspaceId` de los
    documentos lo pone cada escritorio; un valor fijo deja la clave estable.
  - Cuando llegue ADR-0019, los eventos nuevos de la web pasan al workspace real
    con `chain_owner = ''`, la misma transición que en el escritorio.
- **Mismo evento y mismo hash que el escritorio.** Cada escritura del dominio
  (`DomainTx.put`, `server/src/modules/audit/`) guarda, en la misma
  transacción y bajo el candado de escritura de la cuenta, un documento
  `audit_event` con la forma de `audit.rs::payload`:
  - `actor = "user:<id>"`, `origin = "local"`, `hlc` del reloj del servidor
    (posterior al del cambio) y `at` en ISO-8601 UTC con milisegundos;
  - `workspaceId` vacío: cada escritorio lo archiva en su propio workspace (la
    ubicación queda fuera del hash y del contenido);
  - el diff con las reglas de `journal::diff`; sin evento para una
    actualización que no cambia nada ni para una escritura rechazada (409/404);
    una importación de requisitos es un evento `import` con sus recuentos, y
    borrar un proyecto, un `delete` con los recuentos de la cascada.
- **Sin `origin = 'web'`:** el CHECK de la migración local 0019 haría que un
  escritorio lo descartara. `deviceId "web"` ya distingue los eventos de la
  web.
- **Cabeza de la cadena** en `audit_chain_heads` (migración de servidor 0007),
  leída y movida bajo el candado de la cuenta: dos escrituras concurrentes de
  la misma cuenta nunca toman el mismo `chain_seq`.
- **`device_id "web"` está reservado.** `/sync/push` rechaza un
  `audit_event` que lo declare (`appendRejected`, motivo `reserved_chain`),
  así que solo el servidor alarga esa cadena y ningún cliente puede bifurcarla.
  Los escritorios tienen UUID como `device_id`; ninguno real se ve afectado.
- **`/sync/push` no se audita:** cada equipo envía sus propios eventos.
- **Una forma canónica, dos implementaciones.** `audit.chain.ts` porta JCS
  (con el mismo rechazo de lo que queda fuera del subconjunto), `hash_of` y
  `verify_chain`. El fichero compartido
  `src/shared/contracts/fixtures/audit/chain.json` (formas canónicas, valores
  rechazados y una cadena web tal como la devuelve `/sync/pull`) lo comprueban
  `cargo test` y los tests del servidor: si las dos implementaciones se
  separan, falla uno de los dos.
- **En el escritorio no cambia nada:** con `append-only`, el pull guarda los
  eventos de la web como los de cualquier equipo, y
  `audit::verify_chain(conn, "web", "web", cuenta)` los verifica. Los
  clientes sin `append-only` no los reciben.
