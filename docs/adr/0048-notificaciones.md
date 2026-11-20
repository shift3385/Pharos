# ADR-0048 · Notificaciones que viajan por el servidor

- **Estado:** Aceptado (plan y bocetos de la pista R aprobados por el usuario
  el 2026-11-17: «Sí, apruebo los cuatro»; RED-W2).
- **Contexto:**
  - La campana de la barra superior abría un aviso «próximamente» desde
    RED-V1. El hito 0.5.0 «Equipo» ([ADR-0039](0039-rumbo-hacia-la-ejecucion-autonoma.md))
    trae dos personas en el mismo workspace, y con ellas lo que una hace y
    afecta a la otra.
  - El usuario eligió los eventos de 0.5.0: invitación recibida, caso enviado
    a revisión o aprobado, defecto asignado, ciclo cerrado y conflictos de
    sincronización.
  - Casi todos son para **otra persona**: quien asigna un defecto no es quien
    lo recibe. Una notificación que solo vive en el equipo que la crea no le
    llega a nadie.
  - Las invitaciones son de la pista W (workspaces, [ADR-0042]) y las
    revisiones, de la pista K (CAS-02, [ADR-0047]). Hace falta una API pequeña
    que puedan llamar.
- **Decisión:**
  - **Las notificaciones viajan por el servidor.**
    - La migración del servidor `0023_notifications` crea `notifications`, una
      fila por destinatario: tipo, quién la causó (id y nombre), workspace,
      proyecto, `subject` (entidad, id, clave y título), `data` (≤ 2 KB),
      `dedupe_key`, `created_at` y `read_at`.
    - `seq` sube en cada alta **y** en cada marca de leída: cada equipo del
      destinatario trae lo cambiado desde su cursor
      (`GET /api/me/notifications?since=`), marcas incluidas. Leer en un
      equipo deja de estar «sin leer» en los demás.
    - El mismo evento enviado dos veces (un reintento, un evento de K que se
      repite) se guarda una vez por destinatario: índice único
      `(recipient_id, dedupe_key)`.
    - Se guardan **90 días** y como mucho **500** por persona; la respuesta
      del pull lleva los ids que siguen guardados, y el equipo borra los
      demás.
  - **Una API con dos puertas y la misma forma.**
    - En el servidor, `emitNotification(db, { kind, actorId, recipientIds |
      { workspaceId }, workspaceId?, projectId?, subject, data?, dedupeKey? })`
      (`server/src/modules/notifications`), dentro de la transacción de quien
      la llama. W la usa para las invitaciones.
    - En el cliente, `notify({ kind, to: { userIds } | { workspace: true },
      workspaceId?, projectId?, subject, data?, dedupeKey? })`
      (`@modules/notifications`), que acaba en `POST /api/notifications`.
      **Nunca lanza ni espera a la red**: una notificación no hace fallar el
      cambio del que habla. Sin conexión, el escritorio la guarda en una cola
      y la envía después.
    - Quien la causa nunca recibe la suya. El actor lo pone el servidor desde
      la sesión, nunca el cliente.
    - `data.path` (una ruta de la app que empieza por «/») cambia adónde lleva
      la acción directa; si no, cada tipo tiene la suya (Revisar, Ver
      defecto, Ver informe…).
  - **Quién puede notificar a quién es cosa del workspace.**
    - Una interfaz `Membership` (`canNotify`, `members`) responde.
      `workspaceMembership(q, { isMember, listMembers })` la construye con las
      consultas de W (`server/src/modules/workspaces/members.ts`): dos
      personas se notifican si las dos son miembros activos del workspace del
      evento; sin workspace, nadie más. Hasta que W se fusione, la de por
      defecto solo acepta al propio emisor, que luego se descarta. Así no hay
      spam entre cuentas que no comparten nada.
    - `{ workspace: true }` se expande a los miembros activos del workspace
      (`listMembers`), sin el emisor; en el servidor se puede limitar por rol
      (`{ workspaceId, roles }`).
    - Lo que emite el propio servidor desde los ganchos de W va marcado
      `trusted`: quien recibe una invitación o a quien quitan del workspace
      no es (o ya no es) miembro. Un cliente nunca puede marcarlo.
  - **Los ganchos de W** (`WorkspaceHooks`: `invitationCreated`,
    `memberJoined`, `memberRemoved`) se conectan a
    `notificationWorkspaceHooks(membership)`
    (`server/src/modules/notifications/workspaceHooks.ts`), dentro de la
    transacción de W:
    - `invitation.received`, a la cuenta registrada cuyo correo coincide con
      la invitación; si no hay ninguna, no se avisa a nadie (una invitación
      es un código).
    - `member.joined` (pedido por W y aprobado por el coordinador), a los
      Test Managers del workspace.
    - `member.removed`, a quien quitan.
  - **Los conflictos de sincronización no viajan.** Son de un equipo: cuando
    sube el número de conflictos, el shell crea una notificación local
    (`sync.conflict`) cuya acción abre los conflictos. El servidor rechaza ese
    tipo.
  - **Copia cifrada en el escritorio.** La migración local
    `0043_notifications` guarda la copia de lo recibido, las locales, la cola
    de salida y el cursor (`src-tauri/src/notifications.rs`), con la misma
    retención. La web no guarda nada: lee el servidor cada vez.
  - **Cuándo se piden.** Al entrar, cada minuto con la ventana visible y
    conexión, tras cada sincronización (`pharos:synced`), al volver la
    conexión y al abrir el panel.
  - **Los eventos de 0.5.0.**
    - `invitation.received`, `member.joined` y `member.removed`: W, en el
      servidor, por sus ganchos.
    - `case.review_requested`, `case.approved`, `case.changes_requested`: K
      dispara `pharos:case-review` en `window` tras guardar; el shell lo
      escucha y lo convierte (el autor, o el workspace para pedir revisión).
      Se deduplica por `caseId:revision:kind`: la versión del caso no cambia
      al enviar, devolver y volver a enviar.
    - `plan.approved`, `plan.changes_requested` (*FIX-43*): como los del caso,
      al autor del plan (`createdBy`) cuando otra persona lo aprueba o pide
      cambios; el plan dispara `pharos:plan-review` tras guardar y se
      deduplica por `planId:revision:kind`. Una aprobación propia no avisa.
    - `defect.assigned`: al guardar un defecto cuyo responsable cambia a una
      cuenta. Hoy el responsable es texto libre, así que solo notifica cuando
      W dé un selector de miembros. *Hecho en FIX-41:* «Asignado a» elige un
      miembro del workspace actual y guarda su cuenta; un nombre escrito antes
      se conserva y no avisa a nadie.
    - `cycle.closed`: al cerrar un ciclo, a los miembros del workspace.
  - **El panel.** Por día («Hoy», «Ayer», la fecha), filtro «Sin leer», una
    acción directa por fila y «Marcar todo como leído»; el número sin leer en
    la campana (9+ desde 10). En el móvil, una hoja desde abajo. Sin sonidos
    ni avisos del sistema operativo en 0.5.0.
- **Alternativas descartadas:**
  - **Solo en el equipo.** Ninguno de los eventos aprobados llegaría a otra
    persona.
  - **Derivarlas al recibir el sync** (comparar el antes y el después de cada
    documento en cada equipo). Ata las notificaciones al núcleo del sync (de
    W) y a la forma de cada documento, y repite el trabajo en cada equipo.
  - **Que el servidor las derive de cada `push`.** Igual de atado al sync y a
    la forma de los documentos, y no cubre las invitaciones.
  - **Notificaciones como documentos del sync.** Serían por dueño, no por
    destinatario, y heredarían oplog y conflictos para algo que no los
    necesita.
- **Consecuencias:**
  - Un servidor 0.4 no tiene las rutas: el cliente 0.5 lo trata como «sin
    notificaciones» y no falla. Una app 0.4 no las pide.
  - Hasta que W fusione sus miembros, el panel muestra solo los conflictos
    locales. Lo demás está construido y probado con una `Membership` de
    prueba.
  - W conecta `workspaceMembership(pool, { isMember, listMembers })` a
    `createNotificationStore` en `app.ts` y `notificationWorkspaceHooks` a
    sus `WorkspaceHooks`, con `path` a sus pantallas. K ya dispara su
    evento.
  - Las notificaciones no se auditan: son mensajes a una persona, no datos de
    un proyecto (`audit_tests.rs`, EXEMPT).

[ADR-0042]: README.md
[ADR-0047]: README.md
