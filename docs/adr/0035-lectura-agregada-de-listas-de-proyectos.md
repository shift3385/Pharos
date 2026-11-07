# ADR-0035 · Lectura agregada de las listas de proyectos en la web

- **Estado:** Aceptado (2026-11-06, FIX-17)
- **Contexto:** en la web, cada llamada a un módulo es una petición HTTP. La lista
  de Proyectos leía, por proyecto, el plan (dos veces), los casos (dos veces) y
  los requisitos, y además cada caso en detalle para saber sus requisitos
  (`projectTraceableCases`). Inicio leía el plan de cada proyecto. Las llamadas
  crecían con los proyectos y, en Proyectos, también con los casos: en dev (con
  StrictMode, que duplica los efectos) y 20 proyectos con 200 casos, 602 llamadas
  en Proyectos y 44 en Inicio. En escritorio el mismo código llama a la base
  local, sin red.
- **Decisión:**
  - `GET /api/projects/overview` devuelve en una sola respuesta cada proyecto con
    su plan (estado, cronograma y criterios de salida), su número de casos y su
    cobertura de requisitos. Lee con `DomainStore.read`, sin bloqueos, como la
    derivación de ejecución: una consulta por tipo de entidad.
  - Proyectos e Inicio la usan en la web (`projectApi.webOverview`). Cada
    pantalla hace una lectura de la lista, más la de métricas en Inicio, sea cual
    sea el número de proyectos o de casos.
  - El escritorio sigue componiendo sus comandos locales: no tiene el problema, y
    su Inicio no calcula casos ni cobertura que no muestra. No cambia Rust.
  - La fecha de cierre y los criterios se siguen derivando en el cliente, con
    `planClosure`, en las dos plataformas. La cobertura se calcula en el servidor
    con la regla de la matriz: un requisito está cubierto si algún caso enlazado
    no es obsoleto.
- **Consecuencias:**
  - El número de llamadas de estas pantallas ya no depende de los datos. El coste
    pasa a una sola respuesta y a tres lecturas de la base.
  - La regla de cobertura queda en un sitio más del servidor
    (`project-overview.ts`, además de `execution-summary.ts` y de `buildMatrix`).
    Una prueba la fija, incluido el caso obsoleto.
  - Inicio recibe también casos y cobertura, que no usa; a cambio hay un solo
    endpoint.
  - El cliente web necesita un servidor con este endpoint. Sin él, la lista falla
    con el error de carga de cada pantalla: se despliegan juntos.
  - Otras pantallas con lecturas por caso (Trazabilidad, a través de
    `projectTraceableCases`) quedan fuera de este cambio.
- **Alternativas descartadas:**
  - Reutilizar `GET /api/home/metrics`: no trae el plan ni el total de casos, y
    leería ejecuciones, resultados y defectos que estas listas no necesitan.
  - Parámetros por lotes en cada endpoint (`/api/test-cases?projectIds=…`):
    seguirían siendo varias llamadas, y la cobertura seguiría necesitando los
    datos de todos los casos en el navegador.
  - Un comando agregado también en escritorio: añade Rust y contratos sin ganancia
    visible, porque ahí no hay red.
