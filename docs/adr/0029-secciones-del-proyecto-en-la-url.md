# ADR-0029 · Secciones del proyecto en la URL

- **Estado:** Aceptado (plan de la pista F1 aprobado el 2026-10-30; RED-F1)
- **Contexto:** hasta 0.1.0-beta.1, abrir un proyecto no cambiaba la URL.
  `ProjectsPage` guardaba en su estado qué proyecto estaba abierto (y `?open=<id>`
  desde Inicio), y `ProjectDetail` guardaba la pestaña (Plan, Casos,
  Planificador, Trazabilidad, Ajustes) en otro `useState`. El rediseño (SPEC §7,
  [ADR-0028](0028-rediseno-de-la-interfaz.md)) pide más que eso:
  - un grupo **Proyecto activo** en el menú lateral, solo dentro de un
    proyecto, con un selector de proyecto y un enlace por sección;
  - las migas «Proyectos › <proyecto> › <sección>»;
  - en móvil, una barra con flecha atrás, la sección y el proyecto, y las
    secciones como pastillas.

  El shell vive fuera de la página del proyecto, así que necesita saber qué
  proyecto y qué sección están abiertos.

## Decisión

- Cada sección es una ruta: **`/projects/:projectId/:section`**, con
  `section` ∈ `plan | cases | planner | traceability | settings`.
  - Una sección desconocida o ausente lleva a `plan`.
  - `projectPath(id, section?)` y `PROJECT_SECTIONS` son la API pública de
    `@modules/projects`.
- `ProjectDetail` lee la sección de la URL. Las pestañas dentro de la página
  desaparecen: el menú lateral, la franja y las pastillas móviles hacen ese
  papel. El último acceso al proyecto se registra al abrir su ruta, venga de
  donde venga.
- El shell lee la ruta con `useMatch` (`useActiveProject`) y carga la lista de
  proyectos para el selector y los nombres. La recarga al entrar en un
  proyecto y con cada `pharos:synced`.
- Los enlaces antiguos `/projects?open=<id>` redirigen a `/projects/<id>/plan`
  sin cargar antes la lista. Inicio ya enlaza directamente a la ruta nueva.
- La página del proyecto lleva `key={projectId}`:
  - cambiar de proyecto desde el selector, aunque sea dentro de la misma
    sección, monta un espacio nuevo;
  - ningún formulario conserva los datos del proyecto anterior. Si los
    conservara, guardar en Ajustes escribiría los datos de A en B;
  - una respuesta lenta del proyecto anterior se descarta.
- Un proyecto que no existe vuelve a la lista. Puede ser un `projectId`
  desconocido o un proyecto borrado, quizá en otro equipo y recién
  sincronizado. El último acceso solo se registra si el proyecto existe.

## Alternativas

- **Un contexto `ActiveProject`** que `ProjectDetail` publicaría hacia el shell.
  Mantiene la URL tal cual, pero «atrás» y recargar pierden el proyecto. Además
  el estado queda repartido entre dos componentes que se montan en momentos
  distintos. Descartado.
- **Rutas anidadas con `<Outlet>`** por sección: más estructura sin ganar nada
  hoy. Cada sección ya es un componente de su módulo. Se puede adoptar más
  adelante sin cambiar las URLs.

## Consecuencias

- «Atrás», recargar y los enlaces directos conservan el proyecto y la sección.
- El `ErrorBoundary` de las páginas se reinicia al cambiar de sección, porque
  su clave es la ruta.
- V2 y V3 reestilizan las cabeceras de las secciones sobre estas rutas. Un
  enlace a una sección se construye con `projectPath`, nunca a mano.
