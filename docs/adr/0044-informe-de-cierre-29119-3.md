# ADR-0044 · Informe de cierre de pruebas (ISO/IEC/IEEE 29119-3) de un ciclo cerrado

- **Estado:** Aceptado (plan, bocetos y decisiones D1–D4 aprobados por el
  usuario el 2026-11-12: «Sí, apruebo todo»; DOC-01, hito 0.4.0 «Estrategia
  medible»). Se apoya en el cierre congelado y la sección «Decisión de
  salida» de [ADR-0041](0041-quality-gate-y-tendencia-entre-ciclos.md) y en
  las métricas, entregables y aprobación del plan de
  [ADR-0040](0040-metricas-del-plan-y-aprobacion.md).
- **Contexto:**
  - El criterio de salida de 0.4.0 pide que la justificación de un criterio
    en «No cumple» quede en el **informe de cierre**. Hasta ahora solo existía
    el informe de estado (EJE-03), que sirve para el seguimiento y no tiene
    los apartados del *Test Completion Report* de 29119-3: desviaciones,
    riesgos residuales, entregables, activos reutilizables, lecciones
    aprendidas y aprobación.
  - El informe de estado guarda sus textos solo en el equipo
    (`localStorage`). Un informe de cierre se aprueba, y la aprobación tiene
    que verse en todos los equipos y en la web.
- **Decisión:**
  - **D1 · Alcance: un ciclo cerrado.** «Informe de cierre» aparece en la
    cabecera de un ciclo cerrado, donde estaba «Cerrar ciclo…». El informe de
    cierre de un plan o de un proyecto, que agrega varios ciclos, queda para
    más adelante (DOC-01b).
  - **Once apartados**, en el orden de 29119-3:
    1. Identificación, con el ID `TCR-<prefijo>-<clave del ciclo>` (la regla
       del `TP-…` del plan, PLN-04).
    2. Resumen: editable; empieza con las cifras y el veredicto.
    3. Desviaciones respecto al plan: el fin planificado (`endsOn`) frente al
       cierre, los casos sin ejecutar y los criterios obligatorios que no se
       cumplen, más un comentario.
    4. Evaluación frente a los criterios de salida: `decisionSection` de
       DOC-02, sin cambios.
    5. Factores que bloquearon el avance: bloqueados, por confirmar, flaky y
       de una revisión anterior, como en el informe de estado, más un
       comentario.
    6. Medidas: las métricas del cierre (congeladas) frente al ciclo cerrado
       anterior y al objetivo del plan (`data.metrics` con tipo), con
       «¿Lo alcanza?».
    7. Riesgos residuales: los defectos abiertos hoy encontrados en las
       ejecuciones del ciclo o enlazados a un requisito del alcance, por
       severidad; los requisitos del alcance sin cubrir o sin pasar, por nivel
       de riesgo; más un comentario.
    8. Entregables: los que guarda Pharos (plan, ejecuciones, defectos y este
       informe) y los del paso «Entregables» del plan, que se marcan a mano.
    9. Activos reutilizables: los casos, las configuraciones y los datos de
       prueba del plan, más un comentario.
    10. Lecciones aprendidas.
    11. Aprobación.
  - **D2 · Dónde se guarda.** Los textos, las marcas de los entregables y la
    aprobación van en `test_cycles.data.completionReport` (`closedAt`,
    `summary`, `summaryEdited`, `deviations`, `blockers`, `risks`, `assets`,
    `lessons`, `delivered`, `approval`). Se escriben con la edición normal del
    ciclo (`cycle_update` / `PUT /api/cycles/:id` con `data`), que ya
    conserva `closures`, así que se sincronizan y quedan en Auditoría. Sin
    migración y sin cambios en Rust ni en el servidor.
  - **D3 · Sigue al último cierre.** `closedAt` ata el informe a un cierre.
    Si el ciclo se reabre y se vuelve a cerrar, el diálogo parte de los
    textos guardados, quita la aprobación y avisa de que eran del cierre
    anterior. Hay que guardarlos para el cierre nuevo antes de aprobar.
  - **D4 · Aprobación como la del plan (PLN-07).** «Aprobar informe» pide
    confirmación, solo con todo guardado, y guarda `{ by, byName, at }`.
    Cambiar un texto o una marca y guardar quita la aprobación. Con roles
    (0.5.0), aprobará otra persona.
  - **Exportaciones.** El PDF lleva los once apartados, con el ID del
    documento y la línea de aprobación (o «Borrador sin aprobar») bajo el
    título. El .xlsx tiene las hojas «Informe» (los once apartados),
    «Decisión» (la de DOC-02), «Medidas», «Riesgos residuales»,
    «Entregables» y «Casos». Reutiliza los helpers de `reportXlsx.ts` y
    `pdfDoc.ts`. El nombre del archivo es
    `Informe_cierre_<proyecto>_<ciclo>_<fecha>`.
- **Alternativas:**
  - Guardar los textos en el equipo, como el informe de estado: la aprobación
    no viajaría a otros equipos ni a la web.
  - Una tabla o entidad propia para los informes: pide migración local y del
    servidor, y la edición del ciclo ya sincroniza y audita `data`.
  - Un alcance de plan o de proyecto ya en 0.4.0: agregar varios cierres
    (veredictos, métricas, entregables) es un diseño propio; queda para
    DOC-01b.
- **Consecuencias:**
  - El criterio de salida de 0.4.0 se cumple: la justificación del gate sale
    en el informe de cierre, en la vista previa, el PDF y el .xlsx.
  - Una app 0.3 ignora `completionReport`. Al editar un ciclo, no lo borra,
    porque la edición solo envía `data` cuando la cambia.
  - Los defectos abiertos se leen «a fecha de hoy», no congelados al cerrar.
    Las métricas sí son las del cierre.
  - El aviso de cierre del ciclo dice que su informe de cierre ya está en la
    cabecera.
