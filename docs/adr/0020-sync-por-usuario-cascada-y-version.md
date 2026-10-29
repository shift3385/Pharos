# ADR-0020 · Sync por usuario, cascada en el servidor y versión del cliente

- **Estado:** Aceptado (plan de la pista A1 aprobado por el usuario, 2026-10-28)
- **Contexto:** la auditoría del 2026-10-28 encontró fallos del sync en la
  compuerta A:
  - el oplog, el cursor y `sync_base` eran globales: con dos cuentas en el mismo
    equipo, B enviaba los cambios pendientes de A con su token (FIX-07);
  - borrar un proyecto solo sincronizaba su lápida, no la de sus hijos (FIX-05);
  - requisitos y tarjetas no se sincronizaban (SYNC-04a), y sus claves
    (`REQ-004`, `DEF-004`) se numeran en local, así que dos equipos sin conexión
    pueden repetirlas hasta que llegue DAT-01;
  - el servidor no sabía qué versión de la app le hablaba (SYNC-08).
- **Decisión:**
  1. **Todo el estado del sync es de una cuenta.** `oplog`, `sync_base` y
     `sync_conflicts` llevan `user_id`; el cursor es `cursor:<user_id>`. El
     usuario de un cambio es el **dueño de la entidad**: `projects.owner_id`, el
     dueño del proyecto de un plan, caso o requisito, y `planner_cards.owner_id`.
     `oplog::record` lo deriva solo, sin cambiar su firma. Lo que no tiene dueño
     derivable (plantillas, filas antiguas sin proyecto) queda con `''`: se
     conserva, pero nunca se envía ni se cuenta. Un pull nunca sobrescribe una
     entidad local de otra cuenta. El cierre de sesión no borra nada.
  2. **La cascada del borrado de un proyecto la hace el servidor.** Al aceptar
     la lápida de un proyecto, marca como borrados en la misma transacción sus
     planes, casos, requisitos y tarjetas (por el `projectId` de su payload),
     cada uno con un `seq` nuevo. Funciona igual desde el escritorio, la web o
     un cliente antiguo. La migración `0004` del servidor repara los hijos de
     proyectos ya borrados. Borrar algo ya borrado no es un conflicto.
  3. **Claves duplicadas hasta DAT-01: se conservan los dos.** La migración
     local `0013` cambia el índice único `(project_id, requirement_key)` por uno
     normal. Crear un requisito en este equipo sigue rechazando una clave
     repetida; solo el sync puede traer duplicados, y nunca hace fallar el pull
     ni descarta un requisito.
  4. **Versión en cada petición de sync.** La cabecera `x-pharos-version` lleva
     la versión del `package.json` raíz. El servidor acepta su MENOR y la
     anterior de la misma MAYOR (hoy 0.1 y 0.0) y rechaza las demás, o la falta
     de cabecera, con `426 unsupported_client_version` antes de leer o escribir.
- **Alternativas:**
  - Cascada en el cliente (lápidas de cada hijo desde el escritorio y la web, y
    cascada al aplicar). Toca más módulos y no repara lo ya guardado en el
    servidor.
  - Usuario activo guardado al iniciar sesión en vez de derivarlo del dueño.
    Depende de que la capa TS lo fije siempre; un fallo estamparía filas con la
    cuenta equivocada.
  - Apartar el requisito con la clave repetida como conflicto. No toca el
    esquema, pero el requisito no aparecería en este equipo hasta DAT-01.
  - Aceptar peticiones sin versión. Las apps `0.1.0-alpha.1` seguirían
    sincronizando, pero sin garantía de compatibilidad.
- **Consecuencias:**
  - Con workspaces compartidos (SYNC-07, 0.3.0) el dueño ya no será quien hace
    el cambio; el sync se tendrá que rediseñar por workspace.
  - Tras actualizar, cada cuenta descarga todo una vez desde el cursor 0. Es
    idempotente: un documento igual a su base se ignora.
  - Borrar un proyecto gana a una edición simultánea en otro equipo; si ese
    equipo tiene la edición sin enviar, la ve como conflicto, no la pierde.
  - DAT-01 tiene que deduplicar las claves antes de volver a exigir unicidad.
  - Una app `0.1.0-alpha.1` ya instalada no sincroniza con el servidor nuevo
    hasta actualizarse; recibe un error claro.
