# ADR-0049 · Estados del plan por acciones y «Aprobación independiente» por workspace

- **Estado:** Propuesto (2026-11-17).
  - El usuario aprobó la dirección el 2026-11-17: unificar el flujo del plan
    con el de los casos y añadir una política por workspace.
  - Pasa a «Aceptado» cuando el usuario apruebe el plan y los bocetos de la
    pista P y elija la variante de la decisión 2.
  - Cambia la decisión 4 del [ADR-0040](0040-metricas-del-plan-y-aprobacion.md):
    editar un plan aprobado ya no lo deja en «Revisado».
- **Contexto:**
  - El estado del plan se elige en un desplegable del paso «Identificación»
    (`StepBody.tsx`). Se puede pasar a mano de «Revisado» a «Borrador» o a
    «Obsoleto» sin motivo ni registro. Solo «Aprobado» tiene una acción
    propia (PLN-07, ADR-0040).
  - Al editar un plan aprobado, este vuelve a «Revisado» (`formState.ts`,
    `toInput`). En cambio, un caso vuelve a borrador
    ([ADR-0047](README.md), CAS-02). Son dos reglas para lo mismo.
  - La regla vive solo en el cliente: `update_plan` y
    `PUT /api/test-plans/:id` guardan el estado que les llega.
  - El permiso `plan.approve` (solo `test_manager`,
    `src/shared/contracts/workspace-roles.json`) no lo aplica nadie.
  - Pharos sirve a una persona que trabaja sola y a equipos con jerarquía.
    Quien está sola no tiene a nadie que le apruebe nada. En un equipo,
    ISO/IEC/IEEE 29119 y el syllabus ISTQB piden una revisión independiente.
- **Decisión (propuesta):**
  1. **Acciones en lugar del desplegable.**
     - El estado del plan solo cambia con Enviar a revisión (nota opcional),
       Aprobar versión N (con confirmación), Devolver (comentario
       obligatorio), Marcar obsoleto y Reactivar (vuelve a Borrador). Son las
       mismas transiciones que los casos (ADR-0047).
     - `reviewed` se muestra como «En revisión». Los valores guardados no
       cambian, así que la app 0.4 sigue leyendo los planes.
     - Aprobar no sube la versión, igual que en el ADR-0040.
  2. **Al editar.**
     - **Variante A (recomendada):** guardar un cambio de contenido (el mismo
       criterio que sube la versión, PLN-03) en un plan En revisión o Aprobado
       lo devuelve a Borrador. Si estaba aprobado, sube la versión y quita la
       aprobación, que queda en el historial.
     - **Variante B:** un plan aprobado es de solo lectura hasta que se pulsa
       «Nueva versión», que crea N+1 en Borrador.
     - El usuario elige una de las dos al aprobar los bocetos.
  3. **Las reglas en el núcleo**, como en CAS-02:
     - comando Rust `test_plan_review` y `POST /api/test-plans/:id/review`;
     - un guardado normal conserva el estado, `data.review` y `data.approval`
       guardados, y aplica la regla de la decisión 2;
     - un archivo importado nunca trae aprobación.
  4. **Datos sin migración del plan.** `data.review` y `data.approval` usan
     la forma de K: `data.approval` añade `selfApproved` y `revision` a
     `{ by, byName, at, version }`.
  5. **Política «Aprobación independiente» por workspace**
     (`workspaces.independent_approval`):
     - Migración del servidor 0025.
     - En el escritorio, una copia dentro de la 0040 de W, o en la local 0045
       si la 0040 ya se fusionó.
     - Desactivada y fija en el personal y en el local. Activada por defecto
       en los compartidos.
     - La cambia un Test Manager (`members.manage`), con confirmación y
       registro en la auditoría. Las aprobaciones que ya existen no cambian.
  6. **Quién aprueba**, una sola comprobación para planes y casos: la
     `workspaceApproverCheck(pool, { policies })` de W (#93), sin un
     `ApproverCheck` paralelo. `ApprovalRequest` lleva
     `subject: "case" | "plan"`.
     1. Quien no es miembro: `notMember`.
     2. Sin la capacidad del `subject` (`plan.approve` para planes;
        `case.approve` para casos): `role`.
     3. El autor: lo decide la regla `independentApproval`, una entrada de
        `policies`. Con la política activada, `author`. Con la política
        desactivada, `null`, y el autor aprueba como **aprobación propia**.
     4. Cualquier otra persona: puede aprobar. El veredicto final lleva
        `selfApproval: approverId === authorId`.
     - Para eso, la regla fija «el autor no aprueba» de #93 (su paso 4)
       pasa a ser la política por defecto (`authorNeverApproves`), y la
       capacidad sale del `subject`. Son dos cambios pequeños en el código
       de W que se acuerdan con W.
     - **El autor** es quien creó el plan o el caso. En un caso, el
       `createdBy` de su primera revisión, como hace #93. En un plan,
       `test_plans.created_by` en el escritorio y la misma regla en el
       servidor.
     - La aprobación propia se marca en la pantalla, en el historial y en los
       exportes («Aprobado por: … (aprobación propia)»).
- **Alternativas:**
  - Mantener «Revisado» al editar un plan aprobado (ADR-0040): deja dos
    reglas distintas para planes y casos.
  - Prohibir siempre la autoaprobación: nadie podría aprobar en el workspace
    personal.
  - Tratar la autoaprobación como permitida sin marcarla: un informe no
    distinguiría una aprobación revisada por otra persona de una propia.
  - Una política por proyecto: el usuario la pidió por workspace, que es
    donde viven los roles.
- **Consecuencias:**
  - La pista P toca `src/modules/test-plan/**`, `src-tauri/src/test_plan*.rs`,
    las rutas de planes de `server/src/modules/domain/**` y
    `server/src/modules/workspaces/**`. También toca la interfaz
    `ApproverCheck` de K, en un commit que K y W revisan.
  - Espera a que #83 (CAS-02) y W2 (workspaces en el escritorio y la UI)
    estén en `main`.
  - La app 0.4 sigue leyendo los planes. Lo que puede escribir un cliente
    anterior en un workspace lo decide el ADR-0042; el núcleo del servidor
    aplica la decisión 3 a cualquier escritura que le llegue.
  - RED-W2 puede notificar las transiciones del plan con
    `pharos:plan-review`, con la misma carga que `pharos:case-review`.
