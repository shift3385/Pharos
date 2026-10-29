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
- **Simplificación propuesta al usuario (no aplicada):** para las entidades con
  revisión (casos, ADR-0011), el evento podría apuntar a las revisiones de antes
  y después en lugar de copiar las diferencias. Se ahorra espacio y se pierde
  la lectura directa del evento.
