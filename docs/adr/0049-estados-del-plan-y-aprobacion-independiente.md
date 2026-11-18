# ADR-0049 · Estados del plan por acciones y «Aprobación independiente» por workspace

- **Estado:** Aceptado (2026-11-17).
  - El usuario aprobó la dirección el 2026-11-17: unificar el flujo del plan
    con acciones, como los casos, y añadir una política por workspace.
  - El mismo día respondió a las cinco decisiones del plan (están en las
    decisiones 2, 5 y 6) y aprobó el plan («Aprobado este plan»).
  - En la decisión 8 eligió la opción A, la misma regla para los casos
    («Sí, misma regla»).
  - Cambia la decisión 4 del [ADR-0040](0040-metricas-del-plan-y-aprobacion.md):
    editar un plan aprobado ya no lo deja en «Revisado», sino «En revisión».
- **Contexto:**
  - El estado del plan se elige en un desplegable del paso «Identificación»
    (`StepBody.tsx`). Se puede pasar a mano de «Revisado» a «Borrador» o a
    «Obsoleto» sin motivo ni registro. Solo «Aprobado» tiene una acción
    propia (PLN-07, ADR-0040).
  - La regla vive solo en el cliente: `update_plan` y
    `PUT /api/test-plans/:id` guardan el estado que les llega.
  - El permiso `plan.approve` (solo `test_manager`,
    `src/shared/contracts/workspace-roles.json`) no lo aplica nadie.
  - Pharos sirve a una persona que trabaja sola y a equipos con jerarquía.
    Quien está sola no tiene a nadie que le apruebe nada. En un equipo,
    ISO/IEC/IEEE 29119 y el syllabus ISTQB piden una revisión independiente.
  - En palabras del usuario, «Borrador» es la idea inicial. Un documento
    puede revisarse varias veces hasta que se aprueba, y «Aprobado» es la
    cúspide.
- **Decisión (propuesta):**
  1. **Acciones en lugar del desplegable.** El estado del plan solo cambia
     con estas acciones:
     - Enviar a revisión (nota opcional), solo desde Borrador.
     - Aprobar versión N, con confirmación, desde En revisión.
     - Pedir cambios, con comentario obligatorio: el plan **sigue En
       revisión**, marcado «Cambios pedidos» hasta que se guarda un cambio.
     - Marcar obsoleto, desde cualquier estado.
     - Reactivar, que lleva a En revisión, o a Borrador si el plan nunca se
       envió.

     `reviewed` se muestra como «En revisión». Los valores guardados no
     cambian, así que la app 0.4 sigue leyendo los planes. Aprobar no sube
     la versión, igual que en el ADR-0040.
  2. **Al editar** (decisión del usuario):
     - Guardar un cambio de contenido (el mismo criterio que sube la
       versión, PLN-03) en un plan **Aprobado** lo lleva a **En revisión**:
       sube la versión y quita la aprobación, que queda en el historial.
     - En un plan **En revisión**, el plan sigue En revisión.
     - En Borrador, el plan sigue en Borrador.
     - Un plan nunca vuelve a Borrador.
  3. **Las reglas en el núcleo**, como en CAS-02:
     - comando Rust `test_plan_review` y `POST /api/test-plans/:id/review`;
     - un guardado normal conserva el estado, `data.review` y `data.approval`
       guardados, y aplica la regla de la decisión 2;
     - un archivo importado nunca trae aprobación.
  4. **Datos sin migración del plan.**
     - `data.review` usa la forma de K, con `state:
       "pending" | "changesRequested" | "approved"`.
     - `data.approval` añade `selfApproved` y `revision` a
       `{ by, byName, at, version }`.
  5. **Política «Aprobación independiente» por workspace**
     (`workspaces.independent_approval`):
     - Migración del servidor 0025.
     - En el escritorio, una copia dentro de la 0040 de W, o en la local 0045
       si la 0040 ya se fusionó.
     - Desactivada y fija en el personal y en el local. Activada por defecto
       en los compartidos.
     - La cambia solo un Test Manager (`members.manage`), con confirmación y
       registro en la auditoría (decisión del usuario). Las aprobaciones que
       ya existen no cambian.
  6. **Quién aprueba** (decisión del usuario):
     - **Política desactivada:** no se pide rol de aprobación. Aprueba el
       autor u otra persona que puede editar ese plan o caso (`plan.edit` o
       `case.edit`). Si aprueba el autor, queda como **aprobación propia**.
     - **Política activada:** hace falta el rol (`plan.approve`: Test
       Manager; `case.approve`: Test Manager o Test Analyst) y quien aprueba
       no puede ser el autor.
     - Quien no es miembro nunca aprueba.
     - **El autor** es quien creó el plan o el caso (decisión del usuario).
       En un caso, el `createdBy` de su primera revisión, como hace #93. En
       un plan, `test_plans.created_by` en el escritorio y la misma regla en
       el servidor.
  7. **Sobre la comprobación de W** (`workspaceApproverCheck(pool, { policies })`,
     #93), sin un `ApproverCheck` paralelo:
     - `ApprovalRequest` lleva `subject: "case" | "plan"`.
     - En #93 los pasos «rol» y «el autor no aprueba» son fijos, y las
       `policies` solo pueden añadir rechazos. La decisión 6 necesita que la
       política desactivada quite los dos, así que esos dos pasos pasan a
       una regla sustituible, `opts.rule`.
       - Por defecto, `roleAndNotAuthor`, que se comporta igual que #93
         hoy.
       - PLN-08 instala `independentApproval(pool)`, que aplica la
         decisión 6 según la política del workspace.
     - Las `policies` siguen siendo rechazos extra, después de la regla.
     - El veredicto final lleva `selfApproval: approverId === authorId`.
  8. **Los casos siguen la misma regla** (opción A, decisión del usuario).
     Cambia la regla de edición y la acción «Devolver» del
     [ADR-0047](0047-revision-de-casos-y-baselines.md):
     - Editar un caso aprobado lo lleva a En revisión, y editar uno En
       revisión lo deja ahí.
     - «Devolver» pasa a «Pedir cambios» y el caso sigue En revisión.
     - Un caso solo está en Borrador antes de su primer envío.
     - Lo hace la pista P en el mismo PR, con `case_review.rs`,
       `case-review.ts`, `model/review.ts` y `CaseReviewPanel`. Las
       baselines no cambian.
     - Se descartó la opción B, mantener la diferencia y explicarla en el
       manual: deja dos reglas para lo mismo.
- **Alternativas:**
  - Volver a Borrador al editar un plan aprobado, como CAS-02: el usuario lo
    descartó, porque Borrador es solo la etapa inicial.
  - «Nueva versión» (un plan aprobado queda de solo lectura): un paso más en
    cada cambio. Se descartó.
  - Prohibir siempre la autoaprobación: nadie podría aprobar en el workspace
    personal.
  - Pedir el rol de aprobación también con la política desactivada: el
    usuario lo descartó, porque quien trabaja sola debe poder aprobar.
  - Tomar la jerarquía de una integración (por ejemplo, un proyecto de
    Jira): el usuario lo pidió para más adelante, y queda anotado en INT-05.
    En 0.5.0 la jerarquía es la de un workspace compartido con roles.
- **Consecuencias:**
  - La pista P toca `src/modules/test-plan/**`, `src-tauri/src/test_plan*.rs`,
    las rutas de planes de `server/src/modules/domain/**` y
    `server/src/modules/workspaces/approval.ts`. Con la opción A de la
    decisión 8, también toca el flujo de casos de CAS-02. El cambio de
    `opts.rule` se acuerda con W.
  - Espera a que W2 (workspaces en el escritorio y la UI) y #93 estén en
    `main`.
  - La app 0.4 sigue leyendo los planes. Lo que puede escribir un cliente
    anterior en un workspace lo decide el ADR-0042; el núcleo del servidor
    aplica la decisión 3 a cualquier escritura que le llegue.
  - RED-W2 puede notificar las transiciones del plan con
    `pharos:plan-review`, con la misma carga que `pharos:case-review`.
