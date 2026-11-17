# ADR-0047 · Revisión de casos (borrador → revisión → aprobado) y baselines de suite

- **Estado:** Aceptado. El usuario aprobó el plan y los bocetos de CAS-02 el
  2026-11-17 («Sí, apruebo los cuatro»), con las cuatro recomendaciones:
  `reviewed` se muestra como «En revisión»; editar un caso en revisión lo
  devuelve a Borrador; la baseline marca «Solo los casos aprobados» por
  defecto; las baselines se sincronizan ya, en un commit aparte acordado con
  la pista de workspaces. Antes ya había decidido que aprueba cualquier Test
  Manager o Test Analyst que no sea el autor, y que basta con un revisor.
- **Contexto:**
  - El criterio de salida de 0.5.0 «Equipo» (ROADMAP §3) dice «otra persona
    aprueba un caso». Hoy el estado de un caso es un desplegable: cualquiera
    lo pone en «Aprobado», no queda quién ni cuándo, y editar un caso
    aprobado lo deja aprobado.
  - CAS-02 pide además baselines de suite: un conjunto de casos congelado,
    que no cambia aunque los casos sí.
  - Los roles llegan con la pista de workspaces (TEN-01, ADR-0042) en la ola
    2. Este flujo no puede esperarlos, pero tiene que dejarles el sitio.
  - La aprobación del plan (PLN-07, ADR-0040) ya fijó el patrón:
    confirmación, quién y cuándo, y editar quita la aprobación.
- **Decisión:**
  1. **Los estados guardados no cambian:** `draft`, `reviewed`, `approved`,
     `obsolete`. La 0.5 muestra `reviewed` como «En revisión» (pendiente de
     aprobación). La app 0.4 sigue leyendo los datos como «Revisado».
  2. **Solo el comando de revisión mueve el estado.** Es
     `test_case_review` en el escritorio y `POST /api/test-cases/:id/review`
     en la web, con las acciones `send | approve | return | obsolete |
     reactivate`:
     - `send`: de Borrador a En revisión, con una nota opcional.
     - `approve`: de En revisión a Aprobado, con confirmación.
     - `return`: de En revisión a Borrador, con un comentario obligatorio.
     - `obsolete`: desde cualquier estado, y quita la aprobación.
     - `reactivate`: de Obsoleto a Borrador.

     El desplegable de estado sale del editor. Un guardado normal conserva
     el estado guardado y nunca pone `reviewed` ni `approved`.
  3. **Quién y cuándo, en `data`, como el plan:**
     - `data.review = { state: pending | returned | approved, sentBy,
       sentByName, sentAt, revision, version, note?, returnedBy?,
       returnedByName?, returnedAt?, comment? }`;
     - `data.approval = { by, byName, at, version, revision, selfApproved }`.

     Los dos viajan con el caso y se sincronizan como su contenido, sin
     migración. Un guardado o un import nunca los escriben: el núcleo los
     quita de lo que llega y repone los guardados. En el servidor, la cuenta
     sale de la sesión, nunca del cliente.
  4. **Editar quita la aprobación.** Un guardado que cambia el contenido de
     un caso En revisión o Aprobado lo devuelve a Borrador y borra
     `review` y `approval`. Si el caso estaba aprobado, sube también la
     versión (`1.2` → `1.3`, como `nextVersion` del plan). La regla vive en
     el núcleo (`case_review::after_save`, `case-review.ts::afterSave`), así
     que vale también para el import, la IA y el CLI. El editor avisa antes
     de guardar.

     **Contenido** es el título y `data`, salvo `review`, `approval`,
     `aiProvenance` y `custom`. Los valores vacíos no cuentan. La prioridad,
     el tipo, la automatización y los campos personalizados no cuentan.
  5. **Un caso nuevo** empieza en Borrador, u Obsoleto si así llega, y nunca
     trae registros de revisión.
  6. **Quién aprueba, detrás de una interfaz** (`ApproverCheck`), igual en
     TypeScript (`src/modules/test-cases/review/approver.ts`), en el
     servidor (`server/src/modules/domain/case-review.ts`) y en Rust
     (`case_review.rs`):
     - recibe `{ workspaceId, projectId, caseId, authorId, approverId }`;
     - responde `{ ok: true, selfApproval }` o `{ ok: false, reason:
       "author" | "role" | "notMember" }`.

     Hasta que lleguen los roles, la comprobación es `otherThanAuthor`:
     aprueba alguien que no es el autor (`created_by`), y con un solo miembro
     en el workspace el autor puede aprobar, con `selfApproved: true`. La
     pista de workspaces instala la suya con `setApproverCheck`: Test Manager
     o Test Analyst y distinto del autor. Basta con un revisor. El autor es
     la cuenta que creó el caso; `author` sigue siendo solo el nombre
     impreso.
  7. **Notificaciones:** después de que el núcleo acepta una transición, el
     cliente emite `pharos:case-review` (`onCaseReview` en el índice del
     módulo). La carga es `{ kind: sent | approved | returned, caseId,
     scenarioId, title, projectId, authorId, actorId, actorName, at,
     version, revision, comment?, selfApproval? }`. Es un contrato estable:
     se añaden campos, nunca se renombran ni se quitan. `revision` diferencia
     dos envíos de la misma versión, y la pista de notificaciones deduplica
     por `caseId:revision:kind`.
  8. **Quien revisa ve qué cambió.** La comparación es con el último estado
     anterior aprobado o enviado (`test_case_review_base`, `GET
     /api/test-cases/:id/review-base`), campo a campo. Los pasos se emparejan
     por su ID estable (DAT-02), así que mover un paso se ve como «movido».
  9. **Baselines de suite** (migración local 0042: `case_baselines`,
     `case_baseline_items`):
     - una baseline guarda, por caso, la fila inmutable de su revisión
       actual (`revision_id`, DAT-02), con el número, el estado, la clave y
       el título copiados para la lista;
     - nunca se edita ni se borra: los disparadores lo impiden, y para
       cambiarla se crea otra (ISTQB: una línea base solo cambia por control
       de cambios);
     - se crea con todos los casos del proyecto, con el filtro de la lista o
       con la selección. «Solo los casos aprobados» viene marcado y se puede
       desmarcar. Una baseline sin casos se rechaza;
     - se sincroniza como entidad de solo-añadir `case_baseline`
       (`sync_class.rs`, `APPEND_ONLY_ENTITIES`; `APPLIED_SET_VERSION` 8),
       con `workspaceId` y `projectId` como ubicación fuera del contenido,
       así que mover un proyecto mueve sus baselines (ADR-0019), y borrarlo
       las deja como lápida (`PROJECT_CHILDREN`). Solo la reciben y la
       envían los clientes que anuncian la función `case-baselines`
       (VERSIONING §6.5), y el escritorio la retiene hasta que su servidor la
       anuncia. La pista de workspaces lo aceptó en la ola 1. La migración
       0024 del servidor no hace falta;
     - comparar es trabajo del cliente (`compareBaselines`) sobre el
       contenido que devuelven los dos lados. Se compara una baseline con
       otra o con el estado actual (`case_baseline_current`), y cada caso
       sale como añadido, quitado, contenido cambiado, solo estado cambiado
       o sin cambios, con el detalle por campo.
- **Alternativas:**
  - **Un estado nuevo `in_review`.** Rompe la lectura de la app 0.4 y deja
    `reviewed` sin sentido. Se descartó (decisión 1 del usuario).
  - **Mantener En revisión al editar.** Se podría aprobar algo distinto de lo
    enviado. Se descartó (decisión 2).
  - **Aplicar las reglas solo en la pantalla, como el plan.** El import, la
    IA y el CLI podrían saltárselas, y con dos personas eso deja de ser un
    detalle. Se aplican en los dos núcleos.
  - **Una tabla de aprobaciones con varios revisores.** El usuario decidió
    que basta uno. La auditoría ya guarda cada transición.
  - **Una baseline que copie el contenido de cada caso.** Duplica lo que ya
    guarda `test_case_revisions`, que es inmutable y ya se sincroniza.
- **Consecuencias:**
  - Cada transición es una revisión más del caso, con su fila de revisión y
    su evento de auditoría.
  - Los casos aprobados antes de la 0.5 no tienen `data.approval`, así que
    se muestran como «Aprobado (sin registro…)» hasta la siguiente
    aprobación.
  - Los ciclos siguen avisando de los casos sin aprobar (ADR-0017). Ahora
    «aprobado» significa que lo aprobó alguien.
  - La lista gana el filtro «Por revisar», el aviso «Devuelto», la ayuda con
    quién y cuándo, el envío a revisión en lote y «Congelar en baseline».
  - Hasta TEN-01, cada workspace tiene un solo miembro, así que toda
    aprobación es una autoaprobación registrada. Con los roles, el mismo
    código pide otra persona.
  - La comprobación de roles de la pista de workspaces
    (`workspaceApproverCheck`) se instala con `setApproverCheck` en el
    servidor, en TypeScript y en Rust. Responde `notMember`, `role` o
    `author`, y en un workspace personal de un solo miembro deja la
    autoaprobación de esta decisión.
