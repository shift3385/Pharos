# Handoff: Rediseño Pharos · App completa

## Overview
Rediseño completo de Pharos (app de gestión de pruebas QA: proyectos, plan de pruebas ISO/IEC/IEEE 29119, casos con Gherkin, planificador kanban, trazabilidad requisito ↔ caso ↔ defecto, administración y perfil). Objetivos: aspecto más profesional manteniendo los colores Faro Nocturno, iconografía de línea uniforme, layout que aprovecha todo el alto y ancho en escritorio, iPad y móvil, un Inicio convertido en dashboard con métricas y un logo nuevo.

## About the Design Files
Los archivos de `prototipos/` son **referencias de diseño hechas en HTML**: muestran el aspecto y el comportamiento esperados, **no son código de producción para copiar**. La tarea es **recrear estos diseños en el código existente de la app Pharos** usando sus componentes (pharos-ds), sus tokens CSS, su i18n y sus patrones. No copies los estilos en línea ni la estructura de los `.dc.html`.

Para verlos: abre `prototipos/RedisenoApp.dc.html` en un navegador (lienzo con todas las pantallas). Cada pantalla también se abre sola (`prototipos/Scr*.dc.html`). Cargan el design system desde `ds/`.

## Fidelity
**Alta fidelidad (hifi).** Colores, tipografía, espaciado, estados e interacciones son finales. Recrear con precisión usando los tokens del design system. Los **datos** (proyectos, casos, cifras, nombres) son de ejemplo.

## Documentos de este paquete
- **`SPEC.md` — especificación obligatoria.** Puntos de corte, escala tipográfica y mínimos, ajuste de texto, colores de estado, tamaños táctiles, comportamiento de desplegables (cierre, recolocación, hojas en móvil), navegación, todas las funcionalidades nuevas por pantalla, animaciones, accesibilidad y marca. Si algo de este README y la SPEC difiere, manda la SPEC.
- **`PROMPT.md` — encargo listo para pegar en Claude Code.**
- **`logo/`** — `Logo.jsx` (reemplazo del componente) y `Logo.examples.md` (ejemplos y tipos).

## Screens / Views
Cada una existe en escritorio (1440×900), iPad (1180×820) y móvil (390×844). Detalle completo en `SPEC.md §8`.

| # | Pantalla | Archivo | Propósito |
|---|---|---|---|
| 01 | Inicio de sesión | `Login.dc.html` | Entrar con correo y contraseña; Google deshabilitado (Próximamente). Foto del faro de fondo. Móvil sin scroll. |
| 02 | Inicio | `Dashboard.dc.html` | Indicadores enlazados, ejecución por proyecto, criterios de salida por proyecto, ejecuciones diarias, próximas pruebas. Móvil: 3 pestañas con burbujas. |
| 03 | Proyectos | `ScrProyectos.dc.html` | Recientes + tabla con búsqueda, filtros, orden y paginación. |
| 04 | Plan de pruebas | `ScrPlan.dc.html` (`step` 1–19) | Asistente de 19 pasos con lista lateral, estado y revisiones. |
| 05 | Casos · lista | `ScrCasosLista.dc.html` | Tabla de casos con filtros, selección y paginación. |
| 05 | Casos · editor | `ScrCasos.dc.html` (`view`) | Editor / Gherkin / vista dividida; navegación entre casos. |
| 06 | Planificador | `ScrPlanificador.dc.html` | Kanban de tareas, defectos y datos de prueba. |
| 07 | Trazabilidad | `ScrTrazabilidad.dc.html` | Matriz de 9 columnas, solo huecos, huecos de trazabilidad. |
| 08 | Ajustes del proyecto | `ScrAjustesProyecto.dc.html` | Nombre, IDs, exportar, eliminar con confirmación. |
| 09–11 | Administración | `ScrAdministracion.dc.html` (`tab`) | Motor de IA (por defecto), Plantillas, General, Sincronización, Seguridad, Diagnóstico. |
| 12 | Perfil | `ScrPerfil.dc.html` | Datos personales y preferencias. |
| 00 | Marca | `Marca.dc.html`, `LogoMark.dc.html` | Logo nuevo, escalas y usos. |

## Interactions & Behavior
Resumen (detalle en `SPEC.md §6–§9`):
- **Desplegables:** cierre con clic fuera, scroll fuera y Esc; se recolocan (hacia arriba si no caben, alto máximo visible, sin salirse por los lados); en móvil las listas de opciones son hojas desde abajo.
- **Navegación:** menú lateral contextual (grupo del proyecto solo dentro de un proyecto) y contraíble; barra superior con búsqueda, notificaciones y modo claro/oscuro; menú del usuario con Cerrar sesión.
- **Importar / Exportar:** siempre un único botón con menú por secciones.
- **Confirmaciones destructivas:** diálogo que solo se cierra con «Cancelar»; eliminar proyecto exige escribir el prefijo.
- **Animaciones:** cortas (120–220 ms), respetando `prefers-reduced-motion`.

## State Management
Estado de UI por pantalla (en el prototipo se simula con props `*Open`; en la app es estado local o global):
- Menús abiertos (periodo, notificaciones, usuario, orden, importar/exportar, prioridad, estado, búsqueda móvil) → solo uno a la vez.
- Menú lateral contraído (persistir), tema (persistir), idioma (persistir).
- Inicio: periodo, «Comparar», proyecto elegido en criterios (+ búsqueda y filtro del selector), pestaña móvil.
- Plan: paso actual, herramientas ampliadas; Casos: vista, caso actual y filtro activo; Trazabilidad: «solo huecos»; Administración: pestaña y proveedor de IA.
- Datos reales: proyectos, casos, ejecuciones, requisitos, defectos, notificaciones, papelera y capacidades de cada modelo de IA (leer de una tabla de capacidades, no fijarlas en código).

## Design Tokens
Usar siempre `var(--…)` de `ds/tokens/tokens.css`. Valores (tema claro / oscuro):
- **Navy:** 900 `#0b1f33`, 700 `#14324f`, 500 `#1f4e79` / `#6fa3cc`, 300 `#6fa3cc`, 100 `#e3eef7` / `#193651`
- **Acento:** `#f2a33c`, texto sobre acento `#4a2e05`
- **Estado (relleno / texto):** success `#1d9e75` / `#167859`; error `#d64545` / `#bc3d3d`; warning `#b8860b` / `#886308`; info `#378add` / `#2b6cac` (en oscuro: `#5dcaa5`, `#f09595`, `#e0b341`, `#6fb1ec`)
- **Superficies:** page `#f7f8fa` / `#0d1620`; surface-1 `#ffffff` / `#14202e`; surface-2 `#f1f4f8` / `#1a2837`; border `#e2e6eb` / `#24344a`; border-input `#828c9a` / `#64758a`
- **Texto:** primary `#1c2530` / `#e8edf2`; secondary `#5f6b7a` / `#93a3b5`; muted `#616973` / `#8491a0`; on-navy `#e8edf2`, on-navy-muted `#93a3b5`
- **Espaciado:** 4, 8, 12, 16, 24, 32, 48 px · **Radios:** 6, 8, 12, pill · **Sombras:** `--shadow-1`, `--shadow-2`
- **Layout:** sidebar 248 px, franja 84 px, barra superior 64 px (escritorio) / 56 px (móvil)
- **Tipografía:** Inter 400/500/600, JetBrains Mono 400/500 — escala en `SPEC.md §3`

## Assets
- **Iconos:** Lucide (`lucide-static@0.460.0`), trazo de línea. Usar la librería de iconos Lucide del proyecto (o añadirla) en lugar de máscaras CSS.
- **Logos de proveedores de IA:** Simple Icons (`simple-icons@13.21.0` en el prototipo): googlegemini, openai, claude, ollama. OpenRouter sin logo disponible (icono `route` provisional). La app usa `simple-icons@15.22.0`, la última con el icono de OpenAI ([ADR-0031](../adr/0031-administracion-por-pestanas.md)).
- **Foto del login:** `prototipos/assets/login-faro.jpg` (1024×572). En producción usar la misma imagen a ≥ 2400 px.
- **Logo de Pharos:** `logo/Logo.jsx`.

## Files
- `prototipos/RedisenoApp.dc.html` — lienzo con todas las pantallas
- `prototipos/*.dc.html` — una pantalla por archivo (ver tabla)
- `prototipos/support.js`, `prototipos/ds-base.js` — runtime para ver los prototipos (no van a la app)
- `ds/` — copia del design system para que los prototipos se vean (en la app usar el pharos-ds del repo)
- `SPEC.md`, `PROMPT.md`, `logo/`

## Antes de empezar (en el repo pharos-ds)
1. Sustituir `Logo.jsx` y sus ejemplos por `logo/Logo.jsx` y `logo/Logo.examples.md`; eliminar el logo anterior.
2. Añadir `/* @kind font */` a `--fw-regular`, `--fw-medium`, `--fw-semibold`, `--lh-tight`, `--lh-normal` en `tokens/tokens.css` (ya aplicado en la copia `ds/`).
3. Publicar la nueva versión de pharos-ds y actualizarla en la app.


## Actualización — Cronograma y Registro
- **prototipos/Cronograma.dc.html** (nuevo): paso 14 del plan. Calendario único con selector Sprint/Hito, «Siguiente sprint», bandas y rombos en el calendario, arrastre de extremos en escritorio, filas editables con fechas dd/mm/aaaa sincronizadas en ambos sentidos y validación de solapamiento/duración. Se monta desde **ScrPlan.dc.html** (actualizado).
- **prototipos/Login.dc.html** (actualizado): añade la vista «Crear cuenta» (enlace «Regístrate») y corrige el doble scroll: la raíz ocupa 100dvh sin scroll y solo scrolla la columna del formulario (en móvil, solo la hoja inferior).
- Instrucciones para Claude Code: **cambios/ACTUALIZACION-para-Claude-Code.md** (secciones «Paso 14 · Cronograma» y «Login / Registro · doble scroll»).
- **En la app (0.2.0):** el paso 14 es el Cronograma nuevo (RED-W5) y «Crear cuenta» tiene un solo scroll (RED-V1c). Ver `docs/ROADMAP.md`.
