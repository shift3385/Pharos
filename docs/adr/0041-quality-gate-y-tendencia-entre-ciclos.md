# ADR-0041 · Quality gate al cerrar un ciclo y tendencia entre ciclos

- **Estado:** Aceptado (plan, bocetos y decisiones D1–D6 aprobados por el
  usuario el 2026-11-11: «Sí, apruebo todo»; DOC-02 y DOC-06, hito 0.4.0
  «Estrategia medible»). La forma de los datos del plan se acordó con el
  track «plan-iso» (PLN-06, [ADR-0040](README.md)).
- **Contexto:**
  - El usuario preguntó «¿las métricas solo se usan para bonito?». Hasta
    0.3.0 las métricas solo se mostraban: un ciclo se cerraba eligiendo
    «Cerrado» en su formulario, sin mirar los criterios de salida, y nada
    quedaba de la decisión.
  - Los criterios de salida eran texto libre. La derivación
    (`execution/derive.rs` y su gemelo `execution-summary.ts`) adivinaba qué
    medían por palabras («ejecutados», «cobertura»…), y solo sabía medir
    cuatro cosas.
  - Los defectos no guardaban cuándo se corrigieron ni cuántas veces se
    reabrieron, así que el tiempo de corrección y la reapertura no se podían
    medir.
  - El criterio de salida de 0.4.0 pide que cerrar un ciclo con un criterio
    en «No cumple» pida una justificación que quede en el informe de cierre,
    y que Inicio muestre la tendencia de los últimos ciclos. AUT-05 (1.0.0)
    usará el mismo gate para decidir las ejecuciones desatendidas
    ([ADR-0039](0039-rumbo-hacia-la-ejecucion-autonoma.md)).
- **Decisión:**
  - **Catálogo de métricas** (`src/shared/metrics/catalog.ts`, con los mismos
    literales en `derive.rs` y en el servidor). Nueve tipos con su unidad
    fija:
    - en %: `executed`, `passRate`, `coverage`, `reopenRate`, `flakyRate`;
    - en número: `criticalDefects`, `escapedDefects`;
    - por cada 100 casos ejecutados: `defectDensity`;
    - en días: `fixTime`.

    El plan (PLN-06) declara su copia de la lista; la lista es el contrato.
  - **Criterios estructurados.** El plan guarda `data.metrics: PlanMetric[]`
    (`{ id, kind | null, name, op, target, unit?, note? }`), y cada criterio
    de cierre puede apuntar a una con `metricId` y llevar `blocking`
    (obligatorio por defecto; `false` = orientativo, D2). La derivación:
    - con un `metricId` que apunta a una métrica con tipo, toma de ella el
      tipo, el operador y el objetivo, sin leer el texto;
    - con uno que apunta a una métrica sin tipo, el criterio es manual: se
      marca a mano al cerrar;
    - sin `metricId`, o con uno que apunta a una métrica borrada, lee el texto
      como antes (`criterion_kind`/`parse_metric`), así que los planes viejos
      siguen igual;
    - el plan sigue escribiendo el texto del criterio para las exportaciones y
      las apps 0.3.
  - **Métricas por alcance** (`ExecutionSummary.metrics`, también por ciclo):
    - defectos encontrados: no marcados como escape y con su ejecución de
      origen (`foundInRunId`) en el alcance;
    - densidad: encontrados por cada 100 casos con resultado final;
    - escapes: defectos marcados a mano «Encontrado fuera de las pruebas»
      (`data.escaped`, D4), cargados al último ciclo cerrado antes de su alta;
      en un alcance de proyecto, todos;
    - tiempo de corrección: mediana, en días, de alta a la primera vez en
      «Corregido»; los que no se han corregido cuentan aparte;
    - reapertura: encontrados que volvieron a «Abierto» desde «Re-test» o
      «Cerrado», entre los que llegaron a corregirse;
    - flaky: casos ejecutados cuyo resultado final es flaky.
  - **Ciclo de vida del defecto.** El núcleo (escritorio y servidor) escribe
    `data.lifecycle = { fixedAt, closedAt, reopens }` en cada cambio de
    estado; un cliente nunca lo escribe. Los defectos anteriores a 0.4.0 lo
    leen una vez del registro de auditoría (`changes.status = [antes,
    después]`) en el escritorio; en la web empiezan a contar desde ahora.
  - **Quality gate al cerrar** (D1, D3, D5).
    - Un ciclo solo se cierra con «Cerrar ciclo…»: `cycle_close` en el
      escritorio y `POST /api/cycles/:id/close` en la web. Editar el estado a
      «Cerrado» se rechaza (`cycle-close-needs-gate`); reabrir sigue siendo
      editar el estado.
    - El gate evalúa los criterios sobre el resumen del propio ciclo. Un
      criterio obligatorio que falla («No cumple», «Sin datos» o manual
      marcado como no cumplido) pide una justificación de 20 a 2000
      caracteres. Sin ninguno que falle, el veredicto es «Go». Si alguno
      falla, la persona elige «Go con riesgos» o «No-go». Las mismas reglas
      están en `derive.rs::close_record`, en el servidor y en el diálogo.
    - El cierre queda en `test_cycles.data.closures[]` (el último al final),
      con quién, cuándo, el veredicto, el plan, cada criterio con su valor y
      su justificación, y las métricas congeladas. Va en una sola escritura
      auditada. Una edición del ciclo nunca toca `closures`.
  - **Informe go/no-go** (boceto B). En un ciclo cerrado, el informe de
    estado empieza por «Decisión de salida». La sección muestra el
    veredicto, los criterios con su justificación y las métricas frente al
    ciclo cerrado anterior (`ExecutionSummary.previous`). Sale en la vista
    previa, en la hoja «Decisión» del .xlsx y en el PDF.
    `decisionSection` es pura para que el informe de cierre 29119-3 (DOC-01)
    la reutilice.
  - **Tendencia en Inicio** (boceto C, D6 opción A).
    - `HomeProject.trend` lleva los últimos 6 ciclos cerrados (cifras
      congeladas, escapes contados ahora) y el activo, en vivo.
      `HomeProject.objectives` lleva los objetivos del plan. Todo sale en la
      misma lectura de Inicio (RED-W6).
    - El gadget `trend` (mín. 8 × 7) dibuja una métrica con la línea de
      objetivo y el veredicto de cada ciclo. Avisa cuando la métrica empeora
      dos o más ciclos cerrados seguidos o se sale del objetivo.
    - La distribución por defecto pasa a la versión 2. «Próximas pruebas» y
      «Criterios de salida» bajan a 11 filas, y la tendencia ocupa 15 × 8
      debajo de ellas. Siguen siendo 23 filas, sin desplazamiento.
    - Una distribución guardada igual a la de UX-28 pasa a la nueva. Una
      personalizada recibe el gadget solo si cabe en las 24 filas. Si no cabe,
      espera en «Gadgets ocultos» y un aviso lo dice hasta que se vuelve a
      guardar la distribución.
- **Consecuencias:**
  - Las métricas deciden: un cierre con riesgos deja una justificación
    firmada en la auditoría y en el informe, y la tendencia señala qué mirar
    primero.
  - El resumen y las métricas de Inicio crecen (`metrics`, `closure`,
    `previous`, `trend`, `objectives`). El contrato v1 lo acepta porque solo
    añade campos.
  - No hay migraciones: los cierres, el ciclo de vida y los escapes van en
    el `data` JSON, que ya se sincroniza.
  - Una app 0.3 todavía puede cerrar un ciclo editando su estado: el gate
    solo protege a partir de 0.4.0.
  - En la web, el tiempo de corrección y la reapertura de los defectos
    anteriores a 0.4.0 empiezan vacíos (no hay lectura de su auditoría).
