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
| `byProject`     | `ExecutionByProject`             | 8 × 6  |
| `exitCriteria`  | `ExitCriteriaCard`               | 6 × 8  |
| `upcoming`      | `UpcomingTests`                  | 6 × 8  |
| `daily`         | `DailyExecutionsChart`           | 8 × 8  |

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
    el alto libre del contenido, sin desplazamiento desde 1280 × 800.
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
- `e2e/tours/03-inicio.tour.ts`: la vista sin desplazamiento a 1280 × 800, el
  modo configurar, ocultar y mostrar, y restablecer.
