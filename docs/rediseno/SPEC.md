# Rediseño Pharos · App completa — especificación (SPEC)

Modelo a seguir para aplicar el rediseño en la app. Entrada: `RedisenoApp.dc.html` (lienzo con todas las pantallas). Cada pantalla vive en su `Scr*.dc.html`. Todo usa los tokens de Faro Nocturno (`styles.css`) y textos en español.

---

## 1. Archivos

| Archivo | Pantalla | Props propias |
|---|---|---|
| `Login.dc.html` | Inicio de sesión | — |
| `Dashboard.dc.html` | Inicio | `mobileSection`, `rangeOpen`, `notifOpen`, `searchOpen` |
| `ScrProyectos.dc.html` | Proyectos | `sortOpen` |
| `ScrPlan.dc.html` | Plan de pruebas | `step` (1–19), `toolsOpen` |
| `ScrCasosLista.dc.html` | Casos · lista | — |
| `ScrCasos.dc.html` | Casos · editor | `view` (`split`, `editor`, `gherkin`, `gherkinEdit`), `prioOpen`, `estOpen` |
| `ScrPlanificador.dc.html` | Planificador | — |
| `ScrTrazabilidad.dc.html` | Trazabilidad | — |
| `ScrAjustesProyecto.dc.html` | Ajustes del proyecto | `confirmOpen` |
| `ScrAdministracion.dc.html` | Administración | `tab`, `provider` |
| `ScrPerfil.dc.html` | Perfil | — |
| `LogoMark.dc.html`, `Marca.dc.html` | Logo nuevo y hoja de marca | `size`, `surface`, `detail` |
| `logo/Logo.jsx`, `logo/Logo.examples.md` | Reemplazo del componente `Logo` en pharos-ds | — |
| `cambios/CAMBIO-vista-adaptativa.md` | Detalle técnico del cambio de vista por ancho | — |
| `cambios/ACTUALIZACION-para-Claude-Code.md` | Mensaje listo para pegar en Claude Code con los últimos cambios | — |
| `assets/login-faro.jpg` | Foto del login (1024×572; usar ≥ 2400 px en producción) | — |
| `gen/*.js` | Scripts de generación del diseño (no van a la app) | — |

Todas las pantallas aceptan `device` (`desktop`, `tablet`, `mobile`), `theme` (`light`, `dark`), `userMenu` y `collapsed` (menú lateral contraído). `device` es la vista **mínima**: cada pantalla mide su contenedor y baja de vista sola si no cabe (ver §2). Las props `*Open` solo sirven para mostrar estados en el lienzo; en la app son estado interno.

---

## 2. Puntos de corte y layout

> **Enmienda 2026-10-30 (vista adaptativa).** Los puntos de corte siguen siendo los de la tabla
> (600 / 1280 px). Lo que cambia es **qué se mide**: el ancho del **contenedor raíz de la app**,
> no el de `window`. Así la vista también se adapta al estrechar la ventana o si la app va
> embebida. Fuente: [`cambios/CAMBIO-vista-adaptativa.md`](cambios/CAMBIO-vista-adaptativa.md).
> En el código: `ViewportProvider` / `useBreakpoint` con `ResizeObserver`
> ([ADR-0028](../adr/0028-rediseno-de-la-interfaz.md)).

| Ancho | Navegación | Notas |
|---|---|---|
| < 600 px | Barra superior navy 56 px + barra inferior (Inicio, Proyectos, Admin, Perfil) | Padding de página 16 px |
| 600–1279 px | Franja de iconos 84 px | Contenido a todo el ancho |
| ≥ 1280 px | Menú lateral 248 px (contraíble a 84 px) | Contenido máx. 1600 px, centrado |

- **Detección automática:** cada pantalla observa el ancho de su contenedor raíz con `ResizeObserver` (no el de la ventana) y elige la vista según esta tabla; solo vuelve a pintar al cambiar de tramo. Un `device` forzado (`tablet`/`mobile`) nunca sube a una vista más ancha. En la app: hook `useBreakpoint(rootRef)` en el layout raíz que reparte `device` por contexto.
- Toda la app ocupa el alto de la ventana: navegación fija, solo el contenido hace scroll.
- Rejillas con `auto-fit/auto-fill` + `minmax(min(Npx,100%),1fr)` y filas con `flex-wrap`; nunca anchos fijos en cajas con texto.
- Las unidades `cqi` se calculan sobre el contenedor raíz (`container-type: inline-size`).
- Probado en 320×568, 360×640, 375×667, 390×844, 414×896, 430×932, 820×1180, 1024×768, 1180×820, 1440×900, 1920×1080 y 2560×1440.

---

## 3. Tipografía

Fuentes: **Inter** (UI) y **JetBrains Mono** (IDs, código, contadores). Números con `font-variant-numeric: tabular-nums`.

| Uso | Tamaño | Peso |
|---|---|---|
| Título de página | `clamp(22px, 2.4cqi, 28px)` | 600, `letter-spacing:-0.02em` |
| Título de proyecto | `clamp(20px, 2.2cqi, 26px)` | 600 |
| Título de paso / editor | 18–20 px | 600 |
| Título de tarjeta | 15 px | 600 |
| Texto de UI | 13–14 px | 400–500 |
| Ayudas y metadatos | 12–12,5 px | 400 |
| Etiqueta de grupo (MAYÚSCULAS) | 10,5–12 px, `letter-spacing:0.05–0.07em` | 600 |
| Indicador (KPI) | `clamp(20px, 1.9cqi, 24px)` | 600 |
| IDs y código | 11–13 px mono | 500–600 |

**Mínimos:** nunca menos de **10,5 px** (solo etiquetas de la franja de iconos y burbujas); texto de lectura ≥ 12 px; campos de formulario 14–15 px (en móvil 15 px para evitar zoom en iOS).

**Ajuste de texto (en la raíz de cada pantalla):**
- `lang="es"` + `hyphens:auto` → parte palabras por sílabas.
- `overflow-wrap:break-word` → nunca desborda.
- `text-wrap:pretty` en párrafos y `balance` en titulares grandes.
- **Excepciones que no se parten nunca:** correos, rutas, IDs, nombres de archivo → `white-space:nowrap; overflow:hidden; text-overflow:ellipsis; hyphens:manual` y el valor completo en `title`.
- Nombres largos en filas y botones: recorte con «…», nunca salto de línea dentro de un botón.

---

## 4. Color y estados

- Ámbar (`--color-accent`) solo para la **acción principal** de la vista y el logo. Una por vista.
- Colores de estado solo para estados de prueba o sistema: Pasa = success, Falla = error, Bloqueado = warning, No ejecutado = neutral; Borrador = neutral, Revisado = info, Aprobado = success, Obsoleto = neutral tachado.
- Prioridad con bandera: Crítica error, Alta warning, Media info, Baja muted.
- Pastillas de estado: fondo `color-mix(estado 14%, transparent)` + texto en la variante `-text`.
- Acciones destructivas: borde/texto `--color-error-text`; botón sólido solo dentro del diálogo de confirmación.
- Elementos deshabilitados: `opacity:0.45–0.6`, `cursor:not-allowed` y `title` explicando el motivo.
- **Notificaciones y avisos** (toasts, avisos en línea, banners): color e icono del estado, nunca el ámbar de marca: éxito success + `CircleCheck`, error error + `CircleX`, aviso warning + `TriangleAlert`, información info + `Info`. Superficie teñida, barra de 4 px, texto principal (UX-10, ADR-0028).
- **Ayuda de un campo:** corta y esencial en línea, debajo del control; larga y secundaria tras un [?] (`InfoTip`) junto a la etiqueta. Orden: etiqueta → control → pista → mensaje (UX-10).
- **Quitar una fila:** papelera (`Trash2`, «Quitar: …»). El icono X (Lucide `X`) es solo cerrar o descartar, o quitar una etiqueta/chip (UX-10).

---

## 5. Tamaños táctiles y controles

| Control | Escritorio | Móvil |
|---|---|---|
| Botón principal / secundario | 40 px | 44–54 px (login), 36 px en filas de acciones |
| Botón de icono | 32–38 px | 44 px |
| Campo de formulario | 40 px | 44–52 px |
| Opción de menú | 36–42 px | 46–52 px (hojas) |
| Pestaña de barra inferior | — | ≥ 50 px |

- En móvil, los botones de una fila se reparten el ancho (`flex:1 1 120px; min-width:0`) y recortan su texto; el botón **Importar / Exportar** mantiene su ancho natural (`flex:0 0 auto`). Si no caben, la fila salta de línea.

---

## 6. Desplegables, menús y hojas

**Comportamiento común (todos):**
- Abren con clic en su disparador; el disparador y el menú llevan `data-pop` para no cerrarse a sí mismos.
- Se cierran con: **clic fuera**, **scroll fuera del menú** y **Esc**. Seleccionar una opción cierra el menú.
- **Recolocación automática** (`data-menu`): al abrir se mide el espacio dentro de la pantalla:
  - si no cabe abajo y hay más espacio arriba → se abre **hacia arriba** (`bottom: calc(100% + 6px)`);
  - `max-height` = espacio visible disponible (mín. 120 px) con scroll interno;
  - si se sale por un lado → se desplaza hacia dentro con 8 px de margen;
  - ancho máximo = ancho de pantalla − 16 px.
- Separación del disparador: 6–8 px. Radio 12 px, borde `--color-border`, sombra `--shadow-2`.
- Opción seleccionada: fondo `--color-navy-100`, texto navy y ✓ a la derecha.

**En móvil**, las listas de opciones son **hojas desde abajo** (periodo, prioridad, estado): asa superior, título, botón ✕, opciones ≥ 46 px; se cierran tocando el fondo o la ✕.

**Excepciones:**
- El menú del usuario se abre **hacia arriba** desde el pie del menú lateral y **hacia la derecha** desde la franja de iconos.
- Los diálogos de confirmación (eliminar proyecto, vaciar papelera) **no** se cierran con clic fuera ni con scroll: solo con «Cancelar».

**Listas largas dentro de un menú** (p. ej. selector de proyecto con 20+ elementos): buscador fijo arriba, filtros rápidos con contador, lista con `max-height ≈ 260 px` y scroll interno, enlace «Ver todos» al pie.

**Selector de proyecto** (enmienda 2026-11-06, UX-12): donde algo cambia según el proyecto se usa siempre `ProjectPicker` (buscador por nombre o prefijo, prefijo de cada proyecto y el actual marcado), nunca un `<select>` nativo: barra lateral, retención de Evidencias y «Copiar de otro proyecto». «Criterios de salida» añade sus filtros y su orden propios.

**Listas desplegables** (enmienda 2026-11-10, UX-30): ninguna elección de una opción usa un `<select>` nativo (WebView2 lo dibuja con la lista gris del sistema). Se usa el `Select` de Pharos: el campo con el aspecto de los demás, y al abrirlo una lista con el aspecto de los menús (✓ en la elegida, esquinas, sombra, tipografía, modo oscuro) o la hoja inferior en el móvil. Patrón *combobox* de WAI-ARIA: ↑ ↓, Inicio/Fin, la inicial salta a la opción, Intro elige, Esc cierra y el foco vuelve al campo. Las opciones admiten icono, descripción, grupos con título y desactivadas con su motivo.

---

## 7. Navegación

- **Menú lateral:** Inicio, Proyectos, Administración. El grupo **Proyecto activo** (selector, Plan, Tablero, Requisitos, Casos, Ciclos, Ejecuciones, Defectos, Trazabilidad, Ajustes del proyecto) solo aparece dentro de un proyecto. El orden sigue el proceso de prueba (enmienda 2026-11-08, UX-21): la base de prueba antes que los casos y la matriz, que mide la cobertura, al final. Elemento activo: fondo blanco 8 %, barra izquierda de 3 px `--color-navy-300` e icono navy-300.
- **Contraer menú** (botón arriba a la derecha): pasa a la franja de 84 px y aparece **Expandir menú**. Recordar la elección entre sesiones.
- **Barra superior (escritorio/tablet):** migas, buscador (Ctrl K), notificaciones, **acceso rápido claro/oscuro** (luna/sol). El idioma está solo en el menú del usuario.
- **Móvil:** pantallas de proyecto con flecha atrás + título + subtítulo; secciones del proyecto como pastillas desplazables arriba. Mientras se edita Gherkin se oculta la barra inferior.
- **Búsqueda en móvil:** la lupa convierte toda la barra superior en el buscador (flecha cerrar, campo, ✕); logo y nombre se ocultan; resultados agrupados en Casos, Requisitos y Proyectos (filas 44 px).

---

## 8. Funcionalidades e interacciones nuevas

| Dónde | Qué hace |
|---|---|
| Inicio · indicadores | Las 4 tarjetas son enlaces (Proyectos, casos pendientes, ejecución, defectos). Nota «Suma de tus N proyectos abiertos» solo si N > 1. |
| Inicio · periodo | Hoy, 7, 14, 30 días, Este mes, ciclo actual/anterior, rango personalizado e interruptor **Comparar con el periodo anterior** (muestra/oculta las variaciones). |
| Inicio · criterios de salida | Selector de proyecto con buscador, filtros Todos / En riesgo / Cumplen, orden por cierre. Cambia anillo, mensaje, fecha y criterios. Por defecto, el que cierra antes. |
| Inicio · Ejecuciones diarias | Cabecera que salta de línea («+18 % vs. anterior»). Barras de máx. 28 px centradas; días sin datos con raya gris de 2 px. Etiquetas alineadas con su barra (`flex:1 1 0; min-width:0`, mismo `gap`); en tablet y móvil un día sí y otro no, contando desde hoy, y hoy en negrita. Leyenda Pasa · Falla · Sin ejecuciones + mes, con `flex-wrap` y elementos `nowrap`. |
| Inicio · móvil | 3 pestañas (Resumen, Ejecución, Pruebas) con **burbujas**: rojo = problemas, navy = pendientes, sin burbuja = todo bien. |
| Notificaciones | Panel 400 px (escritorio) / pantalla completa (móvil): agrupadas por día, no leídas con fondo y punto, acción directa, «Marcar todo como leído», Todas / Sin leer. |
| Proyectos | Recientes (4) + tabla con búsqueda, filtros, **orden** (desplegable con dirección) y paginación (5, 10 o 20 por página). **Enmienda 2026-11-06 (UX-14):** en todas las tablas, el pie de paginación no aparece mientras todo quepa en el tamaño de página más pequeño. |
| Plan · navegación de pasos | ≥ 1360 px: lista vertical fija a la izquierda (`sticky`, `z-index:2`, scroll propio, nunca salta de línea). 600–1359 px: **stepper horizontal** encima del formulario (Paso N de 17 desde UX-31, título, progreso y tira desplazable de círculos: hechos ✓, actual como píldora con nombre, pendientes con número; el actual se centra solo). < 600 px: barra compacta + «Ver pasos». El panel Estado/Revisiones baja debajo del formulario si no cabe. |
| Plan | 19 pasos, «Paso N de 19 · Guardado · 1 min» arriba, pie fijo en una línea («Siguiente: …» recortable). Paso 8 entregables ISO 29119-3 + «Otro». Paso 10: 10 herramientas + «Más herramientas (65)» + campo libre. Paso 14: generar sprints desde un rango (**enmienda 2026-10-31:** lo cubre el Cronograma nuevo, `prototipos/Cronograma.dc.html` y `cambios/ACTUALIZACION-para-Claude-Code.md` §«Paso 14 · Cronograma»; RED-W5 en `docs/ROADMAP.md`). Menú **Importar / Exportar**. **Enmienda 2026-11-06 (UX-13):** la descripción del paso va en un «?» junto al título; un paso con un solo texto no repite el título como etiqueta y su campo es más grande. **IA-13:** el paso 13 sugiere con IA la responsabilidad de los roles escritos sin ella; el rol lo escribe siempre el usuario. **Enmienda 2026-11-06 (UX-15):** en los pasos de pares (roles, riesgos, cierre), los campos crecen con su texto hasta 12 líneas y nunca se recortan; una cabecera nombra las columnas. La disposición depende del ancho del campo (`@container`), no de la ventana: por debajo de 480 px, cada par se apila con etiquetas visibles y controles de 44 px. Cierre usa columnas 2:1. **Enmienda 2026-11-06 (UX-16):** en el paso 14, sprints e hitos se desplazan en su propia lista y el calendario no se mueve: lado a lado desde 860 px de ancho del paso (lista tan alta como el calendario, dos meses desde 1100 px); debajo, con altura limitada, por debajo de eso. En móvil se desplaza la página. Días de 32 px de alto (40 px en móvil). **Enmienda 2026-11-06 (IA-14):** el paso 17 sugiere con IA criterios con su métrica, sin cambiar lo escrito ni repetir los ya listados. **Enmienda 2026-11-06 (IA-15):** todos los campos de texto del plan tienen asistencia de IA; los textos son directos y breves (hasta 3 frases cortas), con lo que pide ISTQB CTFL 4.0.1 para cada sección. **Enmienda 2026-11-10 (UX-31):** 17 pasos, con la numeración que sigue: «Título» y «Versión, fecha y autor» son el paso 1, «Identificación del plan» (bloque de identificación de ISO/IEC/IEEE 29119-3), y «Tipos» y «Niveles de prueba» el paso 4, «Niveles y tipos de prueba», antes de «Metodología»; un id antiguo (`?step=meta`) lleva al paso unido. Las listas de casillas (niveles y tipos, entregables) van en columnas por grupo con líneas finas entre filas y columnas, cabecera con icono gris y sin contadores, sin texto bajo el título (va en el «?») y una celda «Propios» con ✕ y el campo para añadir. Tipos: Funcionales; No funcionales; Confirmación y regresión (ISTQB v4 §2.2.3: confirmación `retest`, regresión, humo, sanidad, cada uno con tooltip). |
| Casos · lista | Tabla completa con selección múltiple, filtros y paginación. |
| Casos · editor | Navegación «‹ anterior | 142 de 240 | siguiente ›» + «Ir a un caso… (Ctrl P)». Vistas Editor / Gherkin / Dividida (móvil: solo Editor o Gherkin). Edición Gherkin en móvil con barra de palabras clave sobre el teclado. Prioridad y Estado con explicación de cada opción. **Enmienda 2026-11-07 (IA-16):** Precondiciones, Pasos de prueba, Postcondiciones y Criterios de aceptación tienen cada uno un botón de IA, solo con el icono de brillos, en la línea de su título: título | IA | marca de revisión (se parte si no cabe); las propuestas se abren justo debajo (UX-19). Su nombre, en tooltip y para tecnología de asistencia, es «Sugerir…» con la lista vacía y «Revisar…» con contenido. Cada propuesta lleva una etiqueta (Añadir, Reformular, Eliminar) y su motivo; lo que se quita va tachado. Añadir empieza marcado; reformular y eliminar, sin marcar. Resultado esperado usa `AssistButton`, y el borrador muestra lo que sustituye. En el nivel avanzado, igual en las precondiciones compartidas y en las precondiciones, los pasos y el resultado de cada flujo, cuyo botón nombra el flujo. En una checklist, en las comprobaciones. Datos de prueba y Notas no llevan IA, aunque en los niveles básico y de esquema la IA los lee como contexto. **Enmienda 2026-11-07 (UX-19):** cada bloque del formulario va separado por más espacio, un título más marcado y una línea de 1 px que se desvanece en los extremos; Datos de prueba y Notas forman un solo bloque, y la línea no aparece al abrir la tarjeta de un flujo. |
| Trazabilidad | Matriz de 9 columnas; **Mostrar solo huecos** con contador; tarjetas etiquetadas en móvil; «Generar casos con IA» en requisitos sin cubrir. |
| Ajustes del proyecto | Diálogo de eliminación: resumen de lo que se pierde y escribir el prefijo para activar «Sí, eliminar todo». |
| Administración | Pestañas por grupos (Recursos · Aplicación · Cuenta y datos · Soporte), Motor de IA por defecto. Parámetros de IA según el modelo (bloqueados con candado si no se admiten; temperatura opcional en Compatible). Papelera con contador, desglose, restaurar y vaciar. **Enmienda 2026-11-06 (IA-11, UX-11):** la barra de guardar dice qué falta («Por guardar: …») o «Sin cambios», y el aviso nombra lo guardado. Motor de IA: ayuda de cada proveedor en un «?», marca en el proveedor en uso (sin la línea «En uso: …»), «Probar conexión» prueba la clave escrita sin guardarla y un proveedor sin clave no se puede activar ([ADR-0033](../adr/0033-probar-clave-ia-antes-de-guardarla.md)). General: fondo predeterminado al 40 %, vista previa al momento y sombra opcional en las tarjetas. |
| Menú del usuario | Mi perfil, Administración, Idioma, Cerrar sesión. |
| Tema | Botón luna/sol en la barra superior; en Administración → General también «Según el sistema». |
| Login | Foto del faro de fondo con degradado; «Continuar con Google» deshabilitado (Próximamente). En móvil, sin scroll en ninguna altura. |

---

## 9. Animaciones y transiciones

El rediseño es sobrio; las transiciones deben ser cortas y no bloquear:

| Elemento | Recomendación |
|---|---|
| Hover de tarjetas enlazadas | `border-color` + `box-shadow`, 150 ms `ease` |
| Hover de botones y filas | cambio de fondo, 120–150 ms |
| Apertura de desplegables | opacidad 0→1 + `translateY(-4px → 0)`, 140 ms `ease-out`; al abrir hacia arriba, `translateY(4px → 0)` |
| Hojas del móvil | entrada desde abajo `translateY(100% → 0)`, 220 ms `cubic-bezier(.2,.8,.2,1)`; fondo opacidad 0→1, 180 ms |
| Diálogos | fondo 0→1, 160 ms; caja `scale(.98 → 1)` + opacidad, 180 ms |
| Contraer/expandir menú lateral | ancho 248↔84 px, 200 ms `ease`; los textos desaparecen antes de cerrar |
| Interruptores | desplazamiento del círculo, 150 ms |
| Búsqueda en móvil | el campo crece desde la lupa, 180 ms |
| Carga con skeleton (UX-17) | formas con la silueta del contenido final: invisibles 200 ms y opacidad 0→1 en 160 ms; brillo que cruza cada forma, 1,6 s `ease-in-out`, en bucle |

Respetar `prefers-reduced-motion: reduce` → sin desplazamientos, solo cambios de opacidad ≤ 100 ms. El skeleton queda plano, sin brillo.

**Skeleton.** Una carga de menos de 200 ms no muestra ni anuncia nada, y una pantalla que carga por pasos cuenta como una sola espera: no parpadea entre un paso y otro. Sustituye al texto «Cargando…» en pantallas y tarjetas. Los estados de error y vacío no cambian y nunca se muestran mientras se carga: Inicio no dice «sin proyectos» ni suma ceros hasta conocer los proyectos.

---

## 10. Accesibilidad

- Contraste AA (tokens `-text` para texto de estado).
- Foco visible con `--color-focus` (navy en claro, ámbar en oscuro y sobre navy).
- Botones de solo icono con `title` y `aria-label`.
- Diálogos con `role="dialog"`, `aria-modal`, título enlazado y Esc para cancelar (excepto confirmaciones destructivas, que requieren «Cancelar»).
- Toda pregunta al usuario es un diálogo de Pharos (`ConfirmDialog`, o `useConfirm` cuando el código espera la respuesta); nunca `window.confirm`, `alert` ni `prompt` (MAN-03, NC-017; un test lo vigila). Hay dos niveles (NC-014):
  - **Normal** — Esc o un clic fuera equivalen a «Cancelar». Para lo que se puede rehacer o solo pierde lo no guardado: descartar cambios sin guardar, restaurar una revisión, cerrar un run, cambiar de proveedor de IA o reemplazar su clave, quitar del ciclo, desvincular.
  - **Crítica** (`variant="destructive"`) — solo responden sus botones. Es crítica la confirmación cuyo botón borra algo guardado sin vuelta atrás: eliminar un proyecto, caso, requisito, defecto, tarjeta, ciclo, run o plantilla; borrar huérfanos; acortar la retención de evidencias; descartar un borrador de ejecución con sus adjuntos; quitar una evidencia; y los avisos que no deben pasar desapercibidos (la clave de recuperación recién mostrada, una exportación en curso).
- Los menús deben poder recorrerse con flechas y cerrarse con Esc.
- El skeleton es decorativo (`aria-hidden`, sin nada enfocable). La carga se anuncia una sola vez por pantalla, con una región `role="status"` fuera de las formas.

---

## 11. Marca

Faro con anillo abierto y tres haces. Versión completa desde 28 px; compacta por debajo (sin ventanas, dos haces, trazos más gruesos). Torre `--color-navy-500` en fondo claro y `--color-navy-300` sobre navy (`surface="navy"`); dorados `--color-accent`.

Tamaños de uso: menú lateral 35 px · franja de iconos 38 px · barra móvil 30 px · login 40 px · favicon 16 px.

---

## 12. Pendiente fuera de esta plantilla (repositorio pharos-ds)

1. Reemplazar `Logo.jsx` y sus ejemplos con `logo/Logo.jsx` y `logo/Logo.examples.md`.
2. Añadir `/* @kind font */` a `--fw-regular`, `--fw-medium`, `--fw-semibold`, `--lh-tight`, `--lh-normal` en `tokens/tokens.css`.
3. Pasar a los archivos de idioma los textos nuevos o cambiados (p. ej. subtítulo de la matriz, textos de notificaciones, papelera, herramientas, entregables).
4. Aplicar en la app lo de `cambios/ACTUALIZACION-para-Claude-Code.md` (vista automática, gráficas del Inicio, stepper del Plan).
5. Ejecutar `/design-sync`.
