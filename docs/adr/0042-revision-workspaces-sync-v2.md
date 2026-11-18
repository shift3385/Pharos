# ADR-0042 · Revisión de los workspaces compartidos frente al sync de 0.4 (TEN-01, SYNC-07, SYNC-04b)

- **Estado:** Aceptado (decisión del usuario, 2026-11-17: «Sí, apruebo»,
  el borrador y las siete recomendaciones del plan de la pista W). Revisa
  [ADR-0019](0019-diseno-workspaces-compartidos.md), que pedía revisarse «al
  planificar SYNC-07». Mantiene su decisión (modelo A) y cambia el cómo en los
  puntos marcados **[cambia]**.
- **Ya decidido por el usuario (2026-11-17):** modelo A (un rol por
  workspace; un proyecto se comparte moviéndolo) y **sin RLS de Postgres en
  0.5.0**: el aislamiento se prueba con tests.

## Contexto: qué ha cambiado desde ADR-0019

El sync de 0.2–0.4 añadió piezas que el boceto de 2026-10-28 no conocía:

- **Puerta por funcionalidades.** VERSIONING §6.5 ya no distingue clientes
  por un número de protocolo, sino por la cabecera `x-pharos-sync-features`
  (`stable-steps`, `runs`, `cycles`, `defects`…) y por `features` en las
  respuestas. Un `protocol: 2` en el cuerpo sería un segundo mecanismo para lo
  mismo.
- **La web escribe en `documents`** (EJE-06, AUD-01b): `domain.store.ts`,
  `audit.store.ts` y `key_blocks` filtran por `user_id`, igual que el sync.
  La web escribe `workspaceId: "local"` en cada documento
  (`domain.service.ts`).
- **El `workspaceId` de las cargas no significa nada hoy.** El escritorio
  manda el UUID aleatorio de su «My workspace» (`ensure_workspace`), distinto
  en cada equipo, y la web manda `"local"`. Al aplicar un pull, el escritorio
  lo ignora y escribe en su propio workspace (`apply_page`).
- **La cadena de auditoría** hashea `chainWorkspaceId` pero no la ubicación
  (`workspaceId`, fuera de la cabecera: `audit.chain.ts::header`). Mover o
  reasignar la ubicación de un evento no rompe la cadena.
- **`documents_seq` es una secuencia global**, y el orden de visibilidad lo
  garantiza el candado por usuario (`LOCK_USER_SQL`).
- **En el escritorio, la visibilidad y los permisos son «dueño del
  proyecto»:** `project::owns` (48 llamadas) y `oplog::owner_of` (que firma
  cada fila del oplog con el dueño, FIX-07).

## Decisión

### 1. Modelo (sin cambios de fondo)

- Tipos `personal` (uno por usuario, no admite miembros), `shared` y `local`
  (solo en el equipo; nunca viaja).
- Roles por workspace: `test_manager`, `test_analyst`,
  `automation_engineer`, `product_owner`, `viewer`, con la tabla de permisos
  de ADR-0019.
  - **[precisión]** El «auditor» del criterio de salida de 0.5.0 es el rol
    `viewer`. La UI lo llama «Viewer (solo lectura)».
  - **[precisión]** Un workspace siempre tiene al menos un Test Manager: el
    servidor rechaza quitar o degradar al último.
- **[cambia] Una sola fuente para la matriz de permisos:**
  `src/shared/contracts/workspace-roles.json`, con capacidades con nombre
  (`members.manage`, `case.edit`, `case.approve`, …). La leen el servidor, el
  cliente TS y Rust (`include_str!`), y un test de paridad lo comprueba. Es la
  API de roles para las pistas C y K (§8).

### 2. Protocolo: funcionalidad `workspaces`, no `protocol: 2` **[cambia]**

- El cliente 0.5 anuncia `workspaces` en `x-pharos-sync-features`, y el
  servidor 0.5 la lista en `features`. No hay campo `protocol` en el cuerpo.
- Rutas nuevas, que exigen sesión, versión soportada y `workspaces`:
  - `GET /workspaces`: pertenencias, roles y miembros visibles;
  - `POST /workspaces`, `PATCH /workspaces/:id` (nombre),
    `DELETE /workspaces/:id` (solo un `shared` sin proyectos vivos);
  - `POST /workspaces/:id/invitations`, `DELETE …/invitations/:inv`,
    `POST /invitations/accept` con `{ code }`;
  - `PATCH /workspaces/:id/members/:user` (rol), `DELETE …/members/:user`
    (quitar, o salir uno mismo);
  - `POST /workspaces/:id/move-project` con `{ projectId }`.
- El sync existente toma el workspace de la petición:
  - `POST /sync/push` lleva `workspaceId` en el cuerpo;
  - `GET /sync/pull?workspace=<id>&since=<seq>`: un cursor por workspace;
  - `POST /sync/key-blocks` lleva `workspaceId`.
- **Respuesta del push:** añade
  `rejected: [{ entity, entityId, reason, workspaceId? }]`. Un delta
  rechazado no escribe nada. `reason` es:
  - `forbidden`: el rol no lo permite;
  - `moved`: la entidad vive en otro workspace del usuario, cuyo id se
    devuelve;
  - `not_found`: vive en un workspace al que el usuario no pertenece. No se
    dice cuál.
- **Baja o workspace borrado:** `403 workspace_revoked` en push, pull y
  key-blocks de ese workspace.
- **Escritorio 0.5 con un servidor 0.4** (sin `workspaces` en `features`):
  sigue con el sync de hoy, un solo workspace y sin UI de miembros, y avisa
  «Este servidor no admite workspaces compartidos».

### 3. Una app 0.4 frente a un servidor 0.5: solo lectura **[cambia]**

- **Push:** sin `workspaces`, todo push recibe
  `426 read_only_client_version` antes de leer o escribir nada (VERSIONING
  §6.5). La razón no es solo la forma de los datos: una 0.4 no sabe de roles,
  y si pudiera enviar, un Viewer editaría.
- **Pull:** sin `workspace=`, el servidor devuelve la unión de los
  workspaces activos del usuario, ordenada por el `seq` global, con un cursor
  único (el que la 0.4 ya tiene). Para no saltarse un `seq`, la lectura toma
  en modo compartido el candado de cada uno de esos workspaces
  (`pg_advisory_xact_lock_shared`), y los escritores lo toman en exclusivo.
  - **Lo que ve.** Una 0.4 aplica en su único workspace local y filtra por
    `owner_id`. Por eso sigue viendo, en solo lectura y con las ediciones de
    sus compañeros, los proyectos que ella creó, aunque ya estén en un
    workspace compartido. Los proyectos creados por otros llegan, pero no
    los muestra hasta actualizar.
  - **Lápidas de traslado.** No se le envían: ve el proyecto movido como
    sigue, no como borrado. Se marcan con `payload.movedTo`.
  - **Auditoría.** Solo recibe eventos de auditoría de workspaces donde es
    Test Manager.
- **Límite conocido** (como en 0.2): una 0.4 con cambios pendientes se queda
  en el push con el 426 y no recibe novedades hasta actualizar. Nada se
  pierde: al actualizar, sus cambios se envían al workspace que les toque.
- `acceptedMinors` ya admite 0.4 y 0.5; no cambia.

### 4. Servidor: `documents` por workspace (migración 0019)

Todo en una transacción, en este orden:

1. Se crean `workspaces`, `workspace_members` y `workspace_invitations` como
   en ADR-0019. **[precisión]** La invitación guarda el hash SHA-256 de un
   código de 128 bits. Caduca a los 7 días, sirve una sola vez y se puede
   revocar.
2. Se crea un workspace `personal` **por cada usuario**, aunque no tenga
   documentos (así el registro no necesita un caso aparte). Cada usuario es
   su `test_manager`. A partir de aquí, el registro crea el personal en la
   misma transacción que el usuario.
3. **[cambia]** `documents.user_id` se renombra a `author_user_id`, pasa a
   admitir nulos y pierde el `ON DELETE CASCADE`: borrar una cuenta ya no
   puede borrar datos compartidos. Se añade `workspace_id`, que se rellena
   con el personal de `author_user_id`.
4. Se reescribe `payload.workspaceId` al personal con `jsonb_set`, también en
   los documentos `append_only`, porque la ubicación queda fuera de su
   contenido (`LOCATION_KEYS`) y del hash de la cadena. Hoy guarda el UUID
   aleatorio de cada equipo o `"local"` de la web. Se queda tal cual
   `chainWorkspaceId`, que es la identidad de una cadena ya hasheada.
5. Nueva clave primaria `(workspace_id, entity, entity_id)`. Los índices
   `documents_pull_idx`, `documents_project_idx` y `documents_key_idx` se
   recrean con `workspace_id` en lugar de `user_id`. Se añade
   `documents_entity_idx (entity, entity_id)` para la regla `moved` y
   `not_found` del §2.
6. **[cambia]** `key_blocks.owner_id` pasa a `workspace_id`: el del proyecto.
   Puede pedir bloques cualquier miembro con un rol que cree esa clase de
   clave.
7. **[cambia]** `audit_chain_heads` añade `workspace_id`. La cadena web pasa
   a ser una por `(usuario, workspace)` con
   `chainWorkspaceId = <workspace_id>`. La cadena `"web"` anterior se queda
   cerrada como está, en el personal, y sigue siendo verificable.
8. `LOCK_USER_SQL` pasa a `LOCK_WORKSPACE_SQL`. El candado se toma por
   workspace, y `move-project` toma los dos en orden de id, para no
   bloquearse.

**Cómo se comprueba la migración.** Con una clave primaria por usuario, el
paso a `(personal(user), entity, entity_id)` es una biyección, así que no
puede haber colisiones. El test de la migración lo comprueba con datos reales
de un servidor 0.4.

**El repositorio, la web y la auditoría** reciben un
`WorkspaceCtx { userId, workspaceId, role }` en lugar de `userId`.
`workspace_id` va en cada consulta, como pide ADR-0019. Las rutas de la web
resuelven el workspace del proyecto de la ruta, y para crear un proyecto se
indica el workspace.

### 5. Mover un proyecto (`move-project`) **[precisión]**

- **Quién puede:** quien sea Test Manager en el origen y en el destino. En la
  práctica, del personal propio a un compartido que administra.
- **Qué hace,** en una transacción:
  1. reescribe `workspace_id` y `payload.workspaceId` del proyecto y de todo
     lo que cuelga de él (`PROJECT_CHILDREN`, más revisiones de caso,
     eventos de auditoría con ese `projectId` y adjuntos), con un `seq`
     nuevo;
  2. deja en el origen una lápida por documento movido, con
     `payload.movedTo = <destino>`;
  3. mueve `key_blocks`;
  4. copia los blobs de `(origen, sha256)` a `(destino, sha256)` (§7);
  5. escribe un evento de auditoría `move` en ambos workspaces.
- **Clientes 0.5:** al recibir la lápida de traslado no borran nada.
  Esperan el documento del destino, que les llega con su propio cursor y
  cambia la ubicación local.
- **Ediciones en vuelo:** un push al origen de algo ya movido recibe
  `moved`. El cliente cambia la fila de ubicación y la reenvía al destino.

### 6. Escritorio (migración local 0040)

- `workspaces` añade `kind` (`local | personal | shared`), `server_user_id`
  (la cuenta del servidor a la que pertenece la copia), `my_role` (caché; la
  autoridad es el servidor) y `revoked_at`. Hay una tabla espejo
  `workspace_members` (solo lectura), y `oplog.workspace_id`. El cursor pasa
  a `cursor:<user>:<workspace>`.
- **[cambia] La visibilidad deja de ser «dueño del proyecto»:**
  - en un workspace `personal` o `shared`, ve quien es miembro, según
    `workspace_members`;
  - en el `local`, sigue mandando `owner_id`, como hoy y con FIX-07.

  `project::owns` pasa a `access::require(conn, user, project_id, cap)`, y
  `oplog::owner_of` pasa a `workspace_of`. La fila del oplog la firma quien
  hace el cambio, no el dueño del proyecto: en un workspace compartido, el
  dueño del proyecto es otro.
- **Una sola comprobación de rol antes de escribir:** en `journal::record`,
  por donde pasa todo cambio (oplog y auditoría), con la capacidad derivada
  de `(entidad, op)`. La UI desactiva lo que el rol no permite, con un
  `title` que lo explica. Un delta rechazado por el servidor (rol cambiado
  sin conexión) va al panel de conflictos como «Rechazado por permisos», con
  «Descartar».
- **[cambia] Primer sync con `workspaces`,** con copia SEC-06 antes:
  1. Para cada cuenta del equipo, sus filas del workspace `local`
     (`owner_id` = cuenta) pasan al personal de esa cuenta, que da
     `GET /workspaces`. Así se respeta FIX-07 cuando dos cuentas comparten
     equipo.
  2. Los cursores vuelven a 0, y ese primer ciclo hace **pull antes que
     push** en todos los workspaces del usuario. El pull reubica en su
     workspace compartido lo que ya se movió en el servidor.
  3. Se envían los pendientes. Como `build_pending` construye la carga desde
     la fila actual, ya llevan el `workspaceId` correcto.
  4. **«Sin acceso».** Un proyecto que el servidor conocía (`sync_base`) y
     que no llegó en ningún workspace se marca «Sin acceso en el servidor»:
     solo lectura, se puede exportar o borrar y nunca se envía. Es lo que le
     pasa a una 0.4 a la que quitaron de un workspace antes de actualizar.

  Si no hay servidor, el workspace sigue siendo `local`.
- **Baja** (`workspace_revoked`): aviso «Ya no eres miembro de «X»; su copia
  en este equipo se eliminará» y, al aceptarlo, se borra la copia local y sus
  pendientes (decisión 2 de ADR-0019). La tarjeta permite exportar antes.

### 7. SYNC-04b: plantillas y adjuntos por hash (migraciones 0020 y 0041)

- **Servidor (0020):** `blobs (workspace_id, sha256, size, mime, storage_key,
  uploaded_by, uploaded_at, PK (workspace_id, sha256))`, como en ADR-0014.
  - **Almacén:** en disco, en `BLOB_DIR` (por defecto `server/data/blobs`).
    S3 o MinIO quedan detrás de una interfaz `BlobStore`. El cifrado en
    reposo depende del volumen (decisión 2 de ADR-0014) y queda documentado
    en la guía de despliegue de la pista D.
  - **Endpoints:** `POST /blobs/missing`, `PUT /blobs/:sha256` (el servidor
    verifica el hash y aplica el límite de 200 MB) y `GET /blobs/:sha256`,
    todos con `?workspace=`, la pertenencia y la capacidad de lectura o de
    adjuntar.
  - **Retención:** al caducar en el servidor, se borra el blob y el
    `attachment` conserva `blob_purged_at`.
- **`attachment` y `template` pasan a sincronizarse** como entidades LWW.
  - Los bytes nunca van por el oplog: se suben después del push de los
    metadatos y se bajan bajo demanda. La opción «disponible sin conexión»
    por proyecto es de ADR-0014.
  - Las plantillas son del workspace. **[cambia]** ADR-0014 las dejaba como
    BLOB en la BD; la migración local 0041 las pasa al almacén de evidencias
    (`templates.file` → blob + `sha256`), así que viajan por el mismo
    camino.
  - La puerta es la funcionalidad `blobs`. Sin ella, ni se envían metadatos
    de adjuntos ni se piden bytes.

### 8. API de roles para otras pistas (C: SEC-09; K: CAS-02)

- **Servidor (`server/src/modules/workspaces/`):**
  - `can(role, cap): boolean`, con el `Capability` tipado desde el JSON;
  - `requireCapability(cap, { from: "param" | "query" | "body" | "project" })`,
    un preHandler de Fastify que deja
    `req.workspace = { id, role, kind }` o responde `403 forbidden` o
    `403 workspace_revoked`;
  - `membership(q, userId, workspaceId)`;
  - `managedMembers(q, managerId)`: los usuarios de los workspaces
    `shared` en los que `managerId` es Test Manager.
- **Escritorio (Rust):** `access::require(conn, user, workspace_or_project, cap)`.
- **Cliente (TS):** `useWorkspaceRole(workspaceId)` devuelve
  `{ role, can(cap) }`, y `<RequireCapability cap>` envuelve la UI.
- **CAS-02 (interfaz de K).** K define `ApproverCheck` en TS, en el
  servidor y como trait de Rust:

  ```ts
  interface ApprovalRequest {
    workspaceId;
    projectId;
    caseId;
    authorId;
    approverId;
  }
  type ApprovalVerdict =
    | { ok: true; selfApproval: boolean }
    | { ok: false; reason: "author" | "role" | "notMember" };
  ```

  K arranca con `otherThanAuthor(memberCount = 1)`. W registra con
  `setApproverCheck` la regla del usuario, `workspaceApproverCheck`:
  1. sin pertenencia, `notMember`;
  2. con un rol sin `case.approve` (solo `test_manager` y `test_analyst` lo
     tienen), `role`;
  3. si quien aprueba es el autor, `author`;
  4. en otro caso, `{ ok: true, selfApproval: false }`.

  En un workspace `personal` o `local`, que solo tiene un miembro, se
  conserva la regla de K y queda `selfApproval: true`: si no, nadie podría
  aprobar nunca.
- **Notificaciones (interfaz de R).**
  - W exporta `isMember(q, userId, workspaceId)` y
    `listMembers(q, workspaceId, { roles? })`, que devuelve
    `{ userId, role }[]` de los miembros activos. R los usa para validar los
    destinatarios y expandir `{ workspace: true }`.
  - W llama a `emitNotification(client, …)` de R dentro de su propia
    transacción.
  - `invitation.received` solo se emite si la nota de correo de la
    invitación coincide con un usuario registrado: la invitación es un
    código, y su destinatario no se conoce hasta que se acepta.
  - Al aceptar, W emite `member.joined` a los Test Manager del workspace.
    Es un tipo nuevo que se propone a R.
  - Al quitar a alguien, W emite `member.removed` a esa persona.
- **SEC-09 por administrador:** ROADMAP dice «un administrador del
  workspace». Se propone que un Test Manager solo pueda restablecer la
  contraseña de alguien que esté en `managedMembers` y que **no** sea Test
  Manager de otro workspace. Así nadie toma la cuenta de un igual. Lo decide
  C con el usuario.

### 9. Pruebas obligatorias (sin RLS)

- **Aislamiento**, en `server/test/workspaces.isolation.test.ts`: para cada
  ruta (push, pull, key-blocks, blobs, web y audit), un usuario que no es
  miembro recibe 403 o `not_found` y no lee ni escribe nada. Un Viewer ve y
  no escribe. Un miembro dado de baja recibe `workspace_revoked`. Un test
  recorre las consultas SQL del repositorio y falla si alguna sobre
  `documents` no filtra por `workspace_id`.
- **Actualización desde 0.4**, que es el test que pide ADR-0019:
  - se carga en Postgres un volcado de un servidor 0.4.0 con dos usuarios;
    uno de ellos tiene dos equipos con «My workspace» distintos, documentos
    de web (`"local"`), auditoría, bloques de claves y defectos;
  - se aplica 0019 y se comprueba el número de filas, la biyección de
    claves, el `payload.workspaceId` y que las cadenas sigan siendo válidas;
  - las dos BD locales 0.4 (en Rust, `upgrade_tests.rs`) hacen su primer
    sync 0.5. Las dos acaban con el mismo `workspace_id`, los mismos datos y
    ningún pendiente perdido;
  - un cliente con las funcionalidades de 0.4 hace pull de la unión y recibe
    426 en el push.
- **Dos usuarios** (criterio de salida, e2e contra la API en un puerto ≠
  3000): A crea un compartido, invita a B como Viewer y a C como Test
  Analyst, y mueve un proyecto. B lo ve y no puede editarlo, ni en la UI ni
  forzando el push. C edita, y A lo ve.

## Alternativas

- **`protocol: 2` en el cuerpo, como decía ADR-0019:** dos mecanismos para lo
  mismo. Se descarta en favor de la funcionalidad.
- **0.4 sirviendo solo el workspace personal:** un proyecto movido se le
  borraría (lápida de traslado). Se descarta.
- **RLS de Postgres ahora:** descartada por el usuario para 0.5.0. Se puede
  añadir encima, porque todas las consultas ya llevan `workspace_id`.
- **Cursor único para todos los workspaces en 0.5:** al unirse a un
  workspace nuevo habría que releer todo. Se descarta; solo lo usan las 0.4.

## Consecuencias

- Es la migración de servidor más grande hasta ahora. Recrea la clave
  primaria y tres índices de `documents` en una transacción, así que el sync
  se para mientras dura. Medido el 2026-11-17 en el equipo de desarrollo
  (PostgreSQL 18): 38 s con 200 000 documentos de unos 400 bytes, unos 3 min
  por millón. Se avisa en `changes/SYNC-07-incompatible.md`.
- **La web cambia:** selector de workspace y rutas con el workspace del
  proyecto.
- `project_members` local sigue sin usarse; queda para la opción B.
  `users.role` solo da el rol por defecto al crear un workspace.
- **Plan de PRs:**
  - **W1:** servidor + API de roles, para desbloquear a C y K;
  - **W2:** escritorio y UI;
  - **W3:** SYNC-04b.

  Cada PR lleva sus docs.
- **Entre W1 y W2,** el escritorio de `main` es una 0.5 que aún no anuncia
  `workspaces`, y no debe quedarse en solo lectura. Por eso W1 aplica el 426
  de solo lectura solo a las MENOR anteriores. A una compilación de la misma
  MENOR sin `workspaces` la atiende con la unión en el pull y con el push a su
  workspace personal, con comprobación de rol. Esa regla transitoria solo
  existe en compilaciones de desarrollo y W2 la quita, así que `main` no se
  rompe entre medias.

## Decisiones del usuario (2026-11-17)

Aprobó el borrador y las siete recomendaciones del plan:

1. La funcionalidad `workspaces` en `x-pharos-sync-features`, no
   `protocol: 2`.
2. Una app 0.4 queda en solo lectura, y su pull es la unión de sus
   workspaces sin las lápidas de traslado.
3. El «auditor» del criterio de salida es el rol `viewer`. Se mantiene la
   decisión 5 de ADR-0019: solo el Test Manager ve la auditoría.
4. SEC-09 por administrador: un Test Manager solo restablece a personas de
   sus workspaces compartidos que no sean Test Manager en otro. Lo hace C.
5. Un proyecto al que se perdió el acceso queda «Sin acceso»: solo lectura,
   con exportar y borrar, sin borrado automático.
6. Las plantillas pasan al almacén de evidencias y son del workspace.
7. Los blobs del servidor van en disco (`BLOB_DIR`), detrás de una
   interfaz.

## Implementación del servidor (W1, 2026-11-17)

Precisiones sobre lo decidido, sin cambiar la decisión:

- **Sin `workspaceId`, el personal.** Un push o una petición de bloques sin
  `workspaceId` va al workspace personal del usuario, aunque el cliente
  anuncie `workspaces`. Un pull sin `workspace` devuelve la unión.
- **La regla «MENOR anterior en solo lectura» va por versión.** Hasta que el
  release fije la versión 0.5.0, el servidor es 0.4.x. Mientras tanto, una
  app 0.4 publicada cuenta como «de la misma MENOR sin `workspaces`»:
  trabaja en su personal, con su rol comprobado, y recibe 426 en lugar de
  un `rejected` que no sabría leer. Desde 0.5.0 queda en solo lectura. La
  regla de la misma MENOR se queda: es inocua y W2 no necesita quitarla.
- **`moved` y `not_found` miran solo los workspaces del usuario.** Solo
  cuentan los workspaces a los que el usuario pertenece o perteneció. Los
  ids de otras cuentas siguen siendo independientes, como antes, porque
  nunca hubo unicidad global de ids. La excepción son las series de claves,
  que son por id de proyecto en todo el servidor (`key_blocks`): pedir
  bloques de un proyecto guardado en otro workspace se rechaza, como antes
  un proyecto de otra cuenta.
- **Eventos de auditoría enviados.** En un workspace compartido tienen que
  ser del propio usuario (`chainOwner`). En el personal no se comprueba,
  como hasta ahora.
- **La matriz de roles.** La fuente es
  `src/shared/contracts/workspace-roles.json`. El servidor tiene un espejo
  en `roles.ts`, porque su imagen se construye solo con `server/`, y un
  test los mantiene iguales. Rust la leerá con `include_str!` en W2.
- **La web.** Lee en todos los workspaces del usuario. Escribe en el
  workspace del proyecto, con el rol de ese workspace. Un proyecto nuevo va
  al personal hasta que W2 permita elegir dónde.
- **Mover un proyecto.** Su evento de auditoría es un `update` del
  proyecto con `changes.workspaceId` y `summary.moved`. No es una acción
  nueva, porque el CHECK del escritorio la descartaría.
- **Ganchos para otras pistas.**
  - `createWorkspaceService` acepta `WorkspaceHooks`
    (`invitationCreated`, `memberJoined` y `memberRemoved`, dentro de la
    transacción), con las formas de evento de `notificationWorkspaceHooks`
    de R. Están conectados en `app.ts` (`notificationWorkspaceHooks` y
    `workspaceMembership(pool, { isMember, listMembers })`): una invitación
    a una cuenta registrada, una entrada y una baja llegan como
    notificaciones.
  - `invitationCreated` siempre se dispara; su `inviteeUserId` solo lleva
    un valor cuando la nota es el correo de una cuenta registrada.
  - `memberRemoved` no se dispara cuando alguien sale por su cuenta.
  - Las rutas de los botones (`WORKSPACE_PATHS`) son las de las pantallas
    de W2.
  - `workspaceApproverCheck(pool)` implementa la interfaz de K. `app.ts`
    lo instala con `setApproverCheck` al arrancar.
    - La comprobación en sí solo exige pertenecer al workspace. El resto lo
      deciden las `policies`, en orden, y la primera que rechaza decide.
      Las de por defecto (`DEFAULT_APPROVAL_POLICIES`) son la regla del
      usuario:
      - `requiresApproverRole`: `case.approve` o `plan.approve`, según
        el `subject` de la petición (`"case"` por defecto, o `"plan"`);
      - `authorNeverApproves`.
    - El veredicto aprobado lleva `selfApproval` cuando quien aprueba es
      el autor.
    - PLN-08 sustituirá las de por defecto por su «Aprobación
      independiente». Desactivada, sin políticas, cualquier miembro aprueba
      y el autor queda como autoaprobación.
    - `ApprovalRequest` gana `subject?: "case" | "plan"` (en
      `case-review.ts` y en su gemelo del cliente). El autor de un plan es
      su `created_by`.
    - El autor de un caso lo da el `createdBy` de su primera revisión
      (`test_case_revision`), que escriben el escritorio y la web. La web
      lo muestra así a todos los miembros. Antes era quien leía el caso.
    - En el escritorio, la comprobación entra con W2, que trae la copia
      local de los miembros.
- **Migraciones antiguas.** Los tests de las migraciones 0004 y 0006 las
  vuelven a aplicar en un esquema aparte, migrado hasta la anterior
  (`tests/schema-at.ts`). El test de actualización de 0.4 usa el mismo
  mecanismo.

