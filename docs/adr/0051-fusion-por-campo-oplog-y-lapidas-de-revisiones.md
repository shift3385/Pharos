# ADR-0051 · Fusión de conflictos por campo, compactar el oplog y lápidas de las revisiones

- **Estado:** Aceptado (pista S, 2026-11-18). El usuario aprobó el plan y
  sus siete recomendaciones ese mismo día («Sí, los dos»): texto largo
  atómico, aprobación frente a contenido siempre pregunta, un aviso de fusión
  por sincronización y la fila `audit_event` se queda y se compacta. **Sustituye a
  [ADR-0002](0002-conflictos-por-entidad.md)**, que queda «Sustituido por
  ADR-0051». Toca [ADR-0020](0020-sync-por-usuario-cascada-y-version.md) §2
  (cascada) y [ADR-0011](0011-revision-del-caso-y-pasos-estables.md)
  (append-only).
- **Contexto:**
  - Desde 0.5 varias personas editan los mismos proyectos (workspaces
    compartidos, ADR-0042). Con conflictos por entidad, dos ediciones de
    campos distintos obligan a elegir una versión entera y a perder la otra.
  - `sync_base` guarda la revisión y el HLC de la base, pero no su contenido,
    y sin él no hay fusión a tres bandas.
  - El oplog crece sin límite (dos filas por cambio auditado, nunca
    borradas).
  - Las revisiones de caso de un proyecto borrado se quedan vivas en el
    servidor.
- **Decisión:**
  1. **La fusión es del cliente, a tres bandas, y el protocolo no cambia.**
     - La base se guarda (`sync_base.base_payload`, migración local 0047)
       cuando una entidad sincronizada recibe su primer cambio pendiente, y
       se borra al sincronizar.
     - Al detectar un conflicto (en el pull o con el rechazo del push), el
       escritorio fusiona.
       - **Sin solapes:** escribe el resultado, mueve la base a la versión
         remota y deja un delta nuevo. No pregunta.
       - **Con solapes:** el panel pregunta solo por los campos en conflicto.
     - La web hace lo mismo ante un `409 stale_write`.
     - El servidor sigue comparando la base (`decide`).
  2. **Reglas por tipo de campo**, en `src/shared/contracts/merge-fields.json`,
     con vectores de prueba comunes a Rust y TS:
     - **escalar:** gana el lado que cambió; si cambiaron los dos y difieren,
       hay conflicto;
     - **texto largo:** atómico;
     - **conjunto:** unión de los añadidos menos la unión de los quitados;
     - **lista con ids** (pasos, filas, flujos, sprints, hitos): se fusiona
       por id y por subcampo. Es conflicto un borrado frente a una edición
       del mismo elemento y un doble reordenamiento distinto;
     - **`data`:** clave a clave, y una clave desconocida es atómica;
     - **grupos acoplados:**
       - el riesgo;
       - revisión o aprobación del caso y del plan frente a su contenido,
         que nunca se fusiona;
       - cerrar un ciclo frente a editarlo.
     - Borrado frente a edición sigue siendo un conflicto de entidad.
     - El resultado pasa el validador de la entidad; si no lo pasa, el
       conflicto es de entidad.
  3. **La auditoría registra cada fusión:** `resolve_conflict` con
     `summary.resolution = "merged"`, `auto` y el origen de cada campo.
  4. **Compactar el oplog** después de un sync completo, como mucho una vez
     al día:
     - se borran las filas sincronizadas de más de 24 h;
     - se conserva la última fila `delete` de los hijos de un proyecto
       borrado localmente.
     - Las filas `audit_event` no se eliminan del diseño.
     - Reducir `audit_log` se decide con las cifras de la medición
       (apartado «Medición»).
  5. **Lápidas de las revisiones de caso.**
     - La cascada del borrado de un proyecto también marca como borradas sus
       `test_case_revision`, con `deletedWith`. Se excluye una revisión a la
       que apunte un resultado vivo de otro proyecto.
     - Si el proyecto vuelve, el servidor las revive.
     - La migración de servidor 0028 repara los proyectos ya borrados.
     - `compactTombstones` les vacía el contenido como a cualquier lápida.
- **Alternativas:**
  - **Fusión en el servidor.** Necesita la base en el servidor (historial por
    documento) y un protocolo nuevo, y una 0.5 no la entendería.
    Descartada.
  - **CRDT por campo** (un HLC por campo). Cambia la forma de todas las
    entidades y deja en solo lectura a toda app anterior. Es
    desproporcionado para dos o tres personas por workspace.
  - **Guardar siempre la base completa.** Duplica la base de datos. Se
    guarda solo mientras hay pendientes.
  - **Fusión de texto por líneas (diff3).** Puede romper el Markdown o el
    formato sin que nadie lo vea. Descartada.
  - **Quitar la fila `audit_event` del oplog** (`audit_log.synced_at`).
    Ahorra solo mientras se trabaja sin conexión y toca el push append-only.
    Descartada.
- **Consecuencias:**
  - Dos ediciones de campos distintos ya no llegan al panel: criterio de
    SYNC-02.
  - Hay una migración local aditiva (0047) y una de servidor de reparación
    (0028). No hay funcionalidad de sync nueva, y una 0.5 sigue resolviendo
    por entidad.
  - Los conflictos y pendientes anteriores a la actualización no tienen base
    guardada: se resuelven por entidad una última vez.
  - El oplog deja de crecer en régimen normal; queda lo pendiente.
  - Única excepción a «una lápida sigue siendo lápida»: las lápidas de
    cascada de las revisiones reviven con su proyecto.

## Decisiones del usuario (2026-11-18)

1. Un texto largo es atómico: no hay fusión por líneas.
2. Una revisión o aprobación frente a un cambio de contenido siempre
   pregunta.
3. Un solo aviso de fusiones automáticas por sincronización, con enlace a la
   auditoría.
4. La fila `audit_event` del oplog se queda; se compactan las ya
   sincronizadas.

## Implementación de SYNC-11 (PR S2, 2026-11-18)

- **Servidor.**
  - `REVISION_TOMBSTONE_SQL` corre dentro de la cascada del borrado del
    proyecto, después de los hijos: los resultados y elementos de ejecución
    del propio proyecto ya son lápidas, así que solo un resultado o un
    elemento de ejecución **vivo de otro proyecto** salva una revisión.
  - La lápida conserva el contenido y añade `deletedWith`. La revisión no se
    cuenta en el resumen de la cascada: en el escritorio se va con su caso.
  - Una revisión que llega **después** del borrado (un equipo que envía
    tarde) se guarda ya como lápida con `deletedWith`, como los resultados.
  - Cuando el servidor guarda el proyecto vivo otra vez, revive las
    revisiones con `deletedWith` de ese proyecto que aún tienen su
    `projectId`.
  - **Límite conocido:** pasada la purga (`SYNC_TOMBSTONE_DAYS`), la lápida
    ya no tiene contenido y no se puede revivir. Un proyecto que vuelve más
    tarde conserva sus casos, pero el servidor ya no tiene sus revisiones
    antiguas; los equipos que las tenían las conservan.
- **Migración 0028.** Repara los proyectos borrados antes, con la misma
  excepción. Un traslado (`movedTo`) no es un borrado.
- **Escritorio y clientes 0.5.** Sin cambios: una lápida append-only no borra
  nada en un equipo, y la purga local ya borra las revisiones con su caso.

## Contrato y motores de la fusión (PR S3, 2026-11-18)

Precisiones sobre la decisión 2, sin cambiarla. Aún no está conectado al
sync: lo conecta S4.

- **Contrato:** `src/shared/contracts/merge-fields.json`.
  - **Tipos:** `scalar`, `text`, `set`, `idList`, `object` y `map`. Un campo
    que no aparece es `scalar`.
  - **Rutas:** las claves de la carga, y `data.<clave>` un nivel por debajo.
  - **Contabilidad:**
    - `id`, `workspaceId`, `ownerId`, `createdAt` y `revision` se toman del
      servidor;
    - `updatedAt` es el máximo de los dos.
  - **Grupos:** el riesgo del requisito y el contenido de un adjunto o una
    plantilla (`sha256`, `size`, `mime`).
- **Guardas.**
  - **Revisión del caso y del plan** (`status`, `version`, `data.review`,
    `data.approval`). Hay conflicto de la entidad entera cuando un lado solo
    tocó esos campos (aprobar, pedir cambios) y el otro cambió el contenido.
    Dos ediciones de contenido que reabren la misma revisión la dejan igual
    en los dos lados, porque la reapertura es determinista (`case_review`).
    Por eso se fusionan.
  - **Ciclo cerrado** (`when: "closed"`): cerrar un ciclo frente a cualquier
    otro cambio es un conflicto de entidad.
- **Motores:** `src/modules/sync-offline/domain/merge.ts` y
  `src-tauri/src/sync_merge.rs`. Siguen el mismo algoritmo y pasan los mismos
  vectores (`src/shared/contracts/fixtures/sync/merge-vectors.json`).
  - **Resolver** es volver a llamar con `choices` (`{ clave: "local" | "remote" }`).
  - **Claves de conflicto:**
    - un campo (`title`);
    - un grupo (`group:risk`);
    - un elemento por id (`data.steps#S1`) o una de sus claves
      (`data.steps#S1.text`);
    - el orden de una lista (`data.steps@order`).
  - `origins` dice de qué lado viene cada campo de primer nivel, y es lo que
    escribe la auditoría.
- **Listas.**
  - Una lista con elementos sin `id`, o con un `id` repetido, se trata como
    un escalar.
  - Si solo un lado reordena, su orden gana. Lo añadido por el otro lado
    entra detrás del elemento que tenía delante.

## Fusión conectada al sync, al panel y a la web (PR S4, 2026-11-18)

Precisiones sobre la decisión 1, sin cambiarla.

- **La base (migración local 0047).** `journal::record` guarda el `before`
  del primer cambio local de una entidad sincronizada en
  `sync_base.base_payload`, solo si no tiene ya cambios pendientes.
  `set_base` la borra cada vez que la base se mueve. Las plantillas (otra
  forma de instantánea) y las entidades append-only no la guardan.
- **Al detectar el conflicto** (`upsert_conflict`, en el pull y con el
  rechazo del push, que pasa por el mismo `apply_doc`):
  - sin solapes, `apply_merged` escribe la versión combinada, la re-basa
    sobre la remota (como «la mía»: un delta nuevo cuya base es la remota y
    cuya base guardada es el contenido remoto) y lo audita como
    `resolve_conflict` con `summary { resolution: "merged", auto: true,
    fields }`. No abre conflicto;
  - con solapes o una guarda, abre el conflicto con `sync_conflicts.merge`
    (`origins` y `conflicts`, o `guard`). Una versión remota más nueva de
    un conflicto abierto recalcula `merge`.
  - Sin base guardada o con un borrado, el conflicto es por entidad, como
    antes (`merge` nulo).
- **Resolver.** `sync_conflict_resolve` acepta `merged` con `choices`; si
  falta una clave, responde `merge-unresolved`. «Mía»/«del servidor»
  re-basan también la base guardada.
- **El aviso.** Las fusiones sin preguntar se apuntan en `sync_state`
  (`auto_merged:<cuenta>`, como mucho 50) y `sync_auto_merged_take` las
  entrega y olvida al final de cada sync: un solo aviso por sincronización.
- **La web.** `serverApi.put` recuerda el elemento tal como lo leyó. Ante un
  `409 stale_write` fusiona, sobre ese elemento, las claves que la edición
  envía con la versión del 409; sin solapes, guarda encima y avisa
  «Alguien cambió este elemento… Se combinó». Con solapes, pregunta en un
  diálogo (`WebMergeDialog`, boceto 3) qué queda en cada campo y guarda;
  «Volver sin guardar», o un elemento que no se leyó en esta página, lo deja
  como antes (aviso y «guarda de nuevo para reemplazar»). `serverApi` no es
  React: pregunta con un evento (`web/mergePrompt.ts`) que el diálogo,
  montado una vez por el shell de la web, contesta.
