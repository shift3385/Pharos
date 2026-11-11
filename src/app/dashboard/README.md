# Inicio (`app/dashboard`)

El panel con el que se abre Pharos (SPEC §8): saludo, resumen, periodo y
«Nuevo proyecto» en la cabecera; debajo, los **gadgets**. Las cifras salen de
`model/loadHome.ts` (proyectos, planes) y de una sola lectura de métricas
(`model/loadHomeMetrics.ts`, RED-W6); véase `docs/ARCHITECTURE.md` → Home.

## Gadgets y pizarra (UX-27, ADR-0038)

| Gadget          | Componente                       | Mínimo |
| --------------- | -------------------------------- | ------ |
| `kpiProjects`   | `KpiCard` «Proyectos abiertos»   | 5 × 4  |
| `kpiPending`    | `KpiCard` «Pruebas pendientes»   | 5 × 4  |
| `kpiRate`       | `KpiCard` «Tasa de éxito»        | 5 × 4  |
| `kpiDefects`    | `KpiCard` «Defectos abiertos»    | 5 × 4  |
| `byProject`     | `ExecutionByProject`             | 8 × 7  |
| `upcoming`      | `UpcomingTests`                  | 7 × 9  |
| `exitCriteria`  | `ExitCriteriaCard`               | 7 × 11 |
| `daily`         | `DailyExecutionsChart`           | 8 × 8  |

Distribución por defecto (UX-28, la que guardó el usuario; columna y fila
desde 0): las cuatro cifras clave en la fila 0 (6 × 4 cada una);
`byProject` en 0,4 (9 × 10); `daily` en 0,14 (9 × 9); `upcoming` en 9,4
(7 × 19); `exitCriteria` en 16,4 (8 × 19).

**Nunca hay scroll dentro de un gadget (UX-28).**

- Las listas de «Ejecución por proyecto», «Próximas pruebas» y «Criterios de
  salida» dibujan solo las filas que caben y terminan en «+N más · …»
  (`model/fitRows.ts`: `useFitRows` y `GadgetFitContext`, que solo está
  activo dentro de la pizarra; `FitMore.tsx`).
- En la pizarra, «Ver los datos» de las ejecuciones diarias abre un diálogo.
- Los mínimos son el tamaño en el que lo esencial cabe con filas de 14 px.
- Con filas de menos de 18 px (`COMPACT_BELOW`) la pizarra lleva
  `data-compact`:
  - menos márgenes;
  - leyendas solo con puntos de color, con su nombre en el `title`;
  - sin el texto bajo el gráfico diario.
- La fila no baja de 14 px (`MIN_ROW_HEIGHT`): por debajo de unos 700 px de
  alto de ventana, la página tiene un único scroll.
- Los subtítulos de los paneles son una ayuda «?» (`InfoTip`) junto al
  título, que también sirve de `aria-describedby` de la sección.

- **`model/board.ts`** contiene el modelo puro de la pizarra:
  - una cuadrícula de 24 columnas en la que caben 24 filas a la vista (hasta
    48 si la distribución crece);
  - la distribución por defecto aprobada y los mínimos;
  - `moveBy` y `resizeBy` (teclado), `hideGadget`, `showGadget` (primer
    hueco) y `fromGrid` (lo que devuelve el ratón);
  - `readBoard`, que lee y migra una distribución guardada (`version: 1`).

  Usa la compactación vertical de `react-grid-layout`, así que nada se solapa.
- **`HomeBoard.tsx`** dibuja la pizarra en el escritorio:
  - Usa `GridLayout` y calcula la altura de fila para que las 24 filas llenen
    el alto libre del contenido, sin desplazamiento en una ventana de 1280 × 820.
  - En el modo configurar cada gadget es un `group` enfocable con su asa, su
    etiqueta «ancho×alto · mín» y su botón «Ocultar». Su contenido queda
    `inert`.
  - Las flechas mueven el gadget y Mayús + flechas cambian su tamaño.
  - `HomeStack` apila los gadgets en la tableta.
- **`DashboardPage.tsx`** gestiona el modo configurar:
  - El engranaje («Personalizar Inicio», `aria-pressed`) abre un borrador de
    la distribución.
  - En la cabecera aparecen «Gadgets ocultos», «Restablecer» (con
    `useConfirm`) y «Listo» (guarda).
  - Esc sale sin guardar y pregunta si hubo cambios; salir a otra pantalla
    también pregunta (`useUnsavedChangesGuard`).
  - Cada cambio se anuncia en una región `aria-live`.
  - En el móvil se mantienen las pestañas, en el orden de la distribución y
    sin los gadgets ocultos.
- **`model/useHomeBoard.ts`** guarda la distribución de cada cuenta con
  `savePreference` y `pullPreference` (`@modules/profile`, clave
  `home.board`):
  - primero se usa la copia del equipo;
  - después, la de la cuenta (`/api/me/preferences/home.board`), al abrir
    Inicio y tras cada sincronización.

## «Ejecuciones diarias» y «Próximas pruebas» (UX-32)

- **`DailyLinesChart.tsx`** dibuja una línea en SVG por estado (Pasa, Falla
  y Otras, esta discontinua) en los colores de siempre:
  - un punto con anillo del color de la superficie en cada día mayor que 0;
  - el eje Y llega al valor más alto de las series visibles, como poco 5,
    redondeado (`yAxisMax`);
  - el eje X lleva el primer día, uno por semana y el último, separados al
    menos 48 px según el ancho (`xLabels`);
  - la leyenda son botones (`aria-pressed`) que muestran u ocultan cada
    línea, y siempre queda al menos una (`toggleSeries`);
  - una línea vertical y una burbuja siguen al ratón, el tacto o las
    flechas (`dayAt`);
  - por debajo de 220 px de ancho, el total grande con una línea de
    tendencia;
  - la tabla equivalente queda solo para lectores de pantalla.

  Las funciones puras viven en `model/dailyLines.ts`.
- **`UpcomingTests.tsx`** elige la lista con el `Select` de Pharos (UX-30),
  con icono y número por opción, en lugar de pestañas. «Ver todas» es una
  flecha con `aria-label` y, en «Re-test», cada fila dice cuándo falló
  (`lastAt`). «+N más» cuenta la lista entera.

## Añadir un gadget

1. Añade su id a `GADGETS`, su mínimo a `MIN_SIZE` y su sitio a la
   distribución por defecto (`board.ts`).
2. Añade su contenido y su nombre en `DashboardPage.tsx` (`content`, `names`).
3. Las distribuciones guardadas lo reciben solas en el primer hueco
   (`readBoard`). Si cambia el significado de un gadget existente, sube
   `BOARD_VERSION` y migra en `readBoard`.

## Pruebas

- `model/board.test.ts`: distribución por defecto, mínimos, teclado, ocultar
  y mostrar, migración.
- `HomeBoard.test.tsx`: el modo configurar en la página, «Restablecer» con
  confirmación, Esc, persistencia por cuenta, tableta y móvil.
- `DashboardPage.test.tsx`: el contenido de cada gadget.
- `model/dailyLines.test.ts` y `DailyLinesChart.test.tsx`: el eje Y con
  mínimo 5, las fechas sin solaparse a 7, 14 y 30 días, la leyenda que filtra,
  la burbuja con el ratón y el teclado y el modo estrecho.
- `fitRows.test.tsx`: las filas que caben y «+N más»; ninguna regla de CSS
  deja desplazarse a un gadget.
- `e2e/tours/03-inicio.tour.ts`: sin desplazamiento de página ni de gadget a
  1440 × 900 y a 1280 × 820, la ayuda «?», el
  modo configurar, ocultar y mostrar, y restablecer.
