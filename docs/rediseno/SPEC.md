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
| `assets/login-faro.jpg` | Foto del login (1024×572; usar ≥ 2400 px en producción) | — |
| `gen/*.js` | Scripts de generación del diseño (no van a la app) | — |

Todas las pantallas aceptan `device` (`desktop`, `tablet`, `mobile`), `theme` (`light`, `dark`), `userMenu` y `collapsed` (menú lateral contraído). Las props `*Open` solo sirven para mostrar estados en el lienzo; en la app son estado interno.

---

## 2. Puntos de corte y layout

| Ancho | Navegación | Notas |
|---|---|---|
| < 600 px | Barra superior navy 56 px + barra inferior (Inicio, Proyectos, Admin, Perfil) | Padding de página 16 px |
| 600–1279 px | Franja de iconos 84 px | Contenido a todo el ancho |
| ≥ 1280 px | Menú lateral 248 px (contraíble a 84 px) | Contenido máx. 1600 px, centrado |

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

---

## 7. Navegación

- **Menú lateral:** Inicio, Proyectos, Administración. El grupo **Proyecto activo** (selector, Plan, Casos, Planificador, Trazabilidad, Ajustes del proyecto) solo aparece dentro de un proyecto. Elemento activo: fondo blanco 8 %, barra izquierda de 3 px `--color-navy-300` e icono navy-300.
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
| Inicio · móvil | 3 pestañas (Resumen, Ejecución, Pruebas) con **burbujas**: rojo = problemas, navy = pendientes, sin burbuja = todo bien. |
| Notificaciones | Panel 400 px (escritorio) / pantalla completa (móvil): agrupadas por día, no leídas con fondo y punto, acción directa, «Marcar todo como leído», Todas / Sin leer. |
| Proyectos | Recientes (4) + tabla con búsqueda, filtros, **orden** (desplegable con dirección) y paginación. |
| Plan | 19 pasos, «Paso N de 19 · Guardado · 1 min» arriba, pie fijo en una línea («Siguiente: …» recortable). Paso 8 entregables ISO 29119-3 + «Otro». Paso 10: 10 herramientas + «Más herramientas (65)» + campo libre. Paso 14: generar sprints desde un rango. Menú **Importar / Exportar**. |
| Casos · lista | Tabla completa con selección múltiple, filtros y paginación. |
| Casos · editor | Navegación «‹ anterior | 142 de 240 | siguiente ›» + «Ir a un caso… (Ctrl P)». Vistas Editor / Gherkin / Dividida (móvil: solo Editor o Gherkin). Edición Gherkin en móvil con barra de palabras clave sobre el teclado. Prioridad y Estado con explicación de cada opción. |
| Trazabilidad | Matriz de 9 columnas; **Mostrar solo huecos** con contador; tarjetas etiquetadas en móvil; «Generar casos con IA» en requisitos sin cubrir. |
| Ajustes del proyecto | Diálogo de eliminación: resumen de lo que se pierde y escribir el prefijo para activar «Sí, eliminar todo». |
| Administración | Pestañas por grupos (Recursos · Aplicación · Cuenta y datos · Soporte), Motor de IA por defecto. Parámetros de IA según el modelo (bloqueados con candado si no se admiten; temperatura opcional en Compatible). Papelera con contador, desglose, restaurar y vaciar. |
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

Respetar `prefers-reduced-motion: reduce` → sin desplazamientos, solo cambios de opacidad ≤ 100 ms.

---

## 10. Accesibilidad

- Contraste AA (tokens `-text` para texto de estado).
- Foco visible con `--color-focus` (navy en claro, ámbar en oscuro y sobre navy).
- Botones de solo icono con `title` y `aria-label`.
- Diálogos con `role="dialog"`, `aria-modal`, título enlazado y Esc para cancelar (excepto confirmaciones destructivas, que requieren «Cancelar»).
- Los menús deben poder recorrerse con flechas y cerrarse con Esc.

---

## 11. Marca

Faro con anillo abierto y tres haces. Versión completa desde 28 px; compacta por debajo (sin ventanas, dos haces, trazos más gruesos). Torre `--color-navy-500` en fondo claro y `--color-navy-300` sobre navy (`surface="navy"`); dorados `--color-accent`.

Tamaños de uso: menú lateral 35 px · franja de iconos 38 px · barra móvil 30 px · login 40 px · favicon 16 px.

---

## 12. Pendiente fuera de esta plantilla (repositorio pharos-ds)

1. Reemplazar `Logo.jsx` y sus ejemplos con `logo/Logo.jsx` y `logo/Logo.examples.md`.
2. Añadir `/* @kind font */` a `--fw-regular`, `--fw-medium`, `--fw-semibold`, `--lh-tight`, `--lh-normal` en `tokens/tokens.css`.
3. Pasar a los archivos de idioma los textos nuevos o cambiados (p. ej. subtítulo de la matriz, textos de notificaciones, papelera, herramientas, entregables).
4. Ejecutar `/design-sync`.
