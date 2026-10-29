# Auditoría WCAG 2.1 AA de Pharos 0.1.0 (UX-05)

- **Fecha:** 2026-10-29 · **Pista:** X1 (tercera ola) · **Decisión:**
  [ADR-0027](../adr/0027-accesibilidad-y-validacion-de-formularios.md)
- **Alcance:** la app completa en los dos temas de Faro Nocturno (claro y
  oscuro): inicio, proyectos y su detalle (plan, casos, trazabilidad,
  planificador, ajustes), los 19 pasos del asistente del plan, el editor de
  casos, plantillas, motor de IA, administración, perfil y los 12 diálogos
  (incluidos los de IA, el panel de conflictos y la clave de recuperación).

## Método

| Comprobación              | Dónde                                                     | Qué cubre                                                                                                                                                           |
| ------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contraste de los tokens   | `src/shared/theme/contrast.test.ts` (en `npm run verify`) | Cada par texto/fondo ≥ 4,5:1, foco y bordes de estado ≥ 3:1, en los dos temas                                                                                       |
| axe-core en componentes   | `a11y.test.tsx` de cada módulo y `src/test/a11y.test.tsx` | Reglas WCAG 2.0/2.1 A y AA (sin contraste: jsdom no maqueta) en cada diálogo, cada paso del asistente, el editor de casos, administración y los campos comunes      |
| Comportamiento            | Los mismos tests                                          | Enlace para saltar, foco al abrir y al cerrar, Escape, foco en el resumen de errores, nombres de filas, menú de idioma                                              |
| axe-core en el binario    | `e2e/specs/a11y.e2e.ts` (en `npm run e2e`)                | Las pantallas principales y el asistente en WebView2, contraste incluido, en los dos temas                                                                          |
| axe-core en vivo          | Cliente web (Chromium) con la cuenta de prueba            | Las 6 rutas en los dos temas, los 19 pasos del asistente, las 4 pestañas del proyecto, el planificador con tarjetas, el editor de casos y el menú de idioma abierto |
| Pasada manual con teclado | Cliente web con pulsaciones reales                        | Ver más abajo                                                                                                                                                       |

**Pasada manual con teclado (2026-10-29).** Hecha con pulsaciones reales en el
cliente web y la cuenta de prueba, sobre un proyecto temporal `E2E x1 a11y`
que se borró al terminar:

- El primer Tab llega a "Saltar al contenido" y Intro lleva el foco al
  contenido sin cambiar de ruta.
- "Nuevo proyecto" → nombre → Intro.
- En el diálogo "Nuevo requisito", el foco entra al abrir, ocho Tab no salen
  del diálogo, el anillo de foco se ve y Escape cierra y devuelve el foco al
  botón que lo abrió.
- En el planificador, una tarjeta pasa de Backlog a En progreso con Espacio,
  → y Espacio, y cada paso se anuncia.
- En el editor de casos, un paso se reordena con Espacio, ↓ y Espacio, y el
  movimiento se anuncia.
- En el asistente del plan, guardar con el título vacío muestra el resumen,
  le da el foco y marca el campo.
- Al borrar el proyecto, el diálogo de confirmación empieza en "Cancelar".

**Pendiente de lector de pantalla real.** En esta pista no se pudo usar NVDA
ni el Narrador. Los nombres, roles, estados y anuncios se comprobaron en el
árbol de accesibilidad y con las regiones vivas. La pasada con lector queda
como validación del usuario en `docs/ROADMAP.md` §6.

## Resultados por criterio

"Corregido" quiere decir que el fallo existía y se arregló en esta pista.

| Criterio                                                   | Resultado                              | Notas y seguimiento                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1.1 Contenido no textual                                 | Cumple                                 | Iconos y glifos (✕, ⠿, ✓, ●, ⚠) con `aria-hidden` o con nombre; el logo es `role="img"` con nombre                                                                                                                                                                                                                     |
| 1.3.1 Información y relaciones                             | Cumple · corregido                     | Campos con `<label>` o `aria-label`; listas, tablas y grupos con nombre; las filas de alcance, roles, sprints, hitos, riesgos, pasos y ejemplos dicen su número                                                                                                                                                        |
| 1.4.1 Uso del color                                        | Cumple                                 | Los mensajes dicen "Error:" o "Aviso:" y llevan icono, no solo color                                                                                                                                                                                                                                                   |
| 1.4.3 Contraste mínimo                                     | Cumple · corregido                     | Texto atenuado y semánticos con variante `-text`; descripción de la tarjeta ámbar del inicio (4,44:1); "hoy" del calendario (1,74:1 en oscuro: las variables del tema no llegaban a react-day-picker)                                                                                                                  |
| 1.4.11 Contraste no textual                                | Cumple con una observación · corregido | Foco ≥ 3:1 (navy en claro, ámbar en oscuro y en la barra lateral) y anillo de los campos ≥ 3:1. **Observación:** el borde de los campos (`--color-border`, 1,25:1) es el de la spec; los campos se reconocen por su fondo, su etiqueta y su posición. **Seguimiento:** revisarlo en UX-04                              |
| 1.4.4 / 1.4.10 / 1.4.12 Redimensionar, reflujo y espaciado | No verificado                          | La barra lateral se pliega por debajo de 768 px. **Seguimiento:** pasada a 200 % y a 320 px de ancho en UX-04                                                                                                                                                                                                          |
| 2.1.1 Teclado                                              | Cumple · corregido                     | Pasos del caso y tarjetas del planificador se mueven con el teclado, con anuncios en es/en                                                                                                                                                                                                                             |
| 2.1.2 Sin trampas de teclado                               | Cumple                                 | Los diálogos retienen Tab a propósito y se cierran con Escape (o con su botón, si no se pueden descartar). El editor Gherkin usa Tab para sangrar y explica la salida: Escape y después Tab                                                                                                                            |
| 2.4.1 Evitar bloques                                       | Cumple · corregido                     | El enlace para saltar cambiaba la ruta (el router vive en el hash); ahora solo mueve el foco                                                                                                                                                                                                                           |
| 2.4.2 Página titulada                                      | Cumple con observación                 | La ventana se titula "Pharos". **Seguimiento:** título por vista en el cliente web                                                                                                                                                                                                                                     |
| 2.4.3 Orden del foco                                       | Cumple · corregido                     | Foco en el título del paso al cambiar de paso; foco devuelto al cerrar un diálogo; si el botón que lo abrió ya no existe (fila borrada), va al contenido. **Seguimiento menor:** tras reordenar un paso con el teclado, el foco se queda en el asa de la posición original, porque los pasos se identifican por índice |
| 2.4.6 Encabezados y etiquetas                              | Cumple con observación                 | **Seguimiento:** los ✕ de la lista de proyectos se llaman todos "Eliminar". Se entienden por la fila, pero el selector del E2E depende de ese nombre: cambiarlo junto con `e2e/support.ts`                                                                                                                             |
| 2.4.7 Foco visible                                         | Cumple · corregido                     | Ver 1.4.11                                                                                                                                                                                                                                                                                                             |
| 2.5.3 Etiqueta en el nombre                                | Cumple · corregido                     | El selector de idioma se llamaba "Idioma" y mostraba "ES"; ahora se llama "ES, Idioma"                                                                                                                                                                                                                                 |
| 3.1.1 Idioma de la página                                  | Cumple                                 | `<html lang>` sigue al idioma elegido                                                                                                                                                                                                                                                                                  |
| 3.3.1 Identificación de errores                            | Cumple · corregido (UX-01)             | `aria-invalid` y `aria-describedby` en los campos; el resumen se anuncia (`role="alert"`)                                                                                                                                                                                                                              |
| 3.3.2 Etiquetas o instrucciones                            | Cumple · corregido                     | El nombre del proyecto nuevo, la clave de API y las filas de las listas solo tenían `placeholder`                                                                                                                                                                                                                      |
| 3.3.3 Sugerencia ante errores                              | Cumple                                 | Los mensajes dicen qué falta o el rango válido ("El mínimo es 1")                                                                                                                                                                                                                                                      |
| 4.1.2 Nombre, función y valor                              | Cumple · corregido                     | Diálogos con nombre; `aria-current="step"`; `aria-pressed` en el idioma. El menú de idioma era un `listbox` con botones dentro y la tarjeta del planificador un `role="button"` con botones dentro                                                                                                                     |
| 4.1.3 Mensajes de estado                                   | Cumple                                 | Avisos (`aria-live`), progreso de importación y exportación, estado de la IA y de los conflictos como `role="status"`                                                                                                                                                                                                  |

## Validación de formularios (UX-01)

| Formulario                | Bloquea el guardado (`error`)                      | Aviso, se guarda (`warning`)                                                                                                                 |
| ------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Asistente del plan        | Título vacío                                       | Fechas de sprint al revés o solapadas; sprints, hitos y filas repetidas de alcance, fases, entregables, roles, riesgos y criterios de cierre |
| Editor de casos           | Título vacío                                       | Pasos, precondiciones, poscondiciones, criterios y ejemplos (columnas o filas) repetidos                                                     |
| Requisito                 | Clave inválida o repetida; título vacío            | —                                                                                                                                            |
| Importar requisitos (CSV) | —                                                  | Las filas sin título, con clave inválida o repetida se listan y se omiten (como antes), ahora con nombre y gravedad                          |
| Plantilla                 | Nombre vacío                                       | —                                                                                                                                            |
| Proyecto                  | Nombre vacío al crear; dígitos del ID fuera de 1–8 | —                                                                                                                                            |
| Administración            | Días de retención fuera de 1–3650                  | —                                                                                                                                            |

## Pendiente (resumen)

1. Pasada con NVDA o el Narrador (validación del usuario, ROADMAP §6).
2. Zoom al 200 %, reflujo a 320 px y espaciado de texto (UX-04).
3. Título por vista en el cliente web.
4. Borde de los campos más visible (UX-04, decisión de diseño).
5. Foco tras reordenar un paso con el teclado.
6. Nombre de cada ✕ de la lista de proyectos, junto con el selector del E2E.
