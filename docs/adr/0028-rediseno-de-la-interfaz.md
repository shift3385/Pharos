# ADR-0028 · Rediseño de la interfaz: alcance, olas y fundamentos

- **Estado:** Aceptado (plan aprobado por el usuario y por la sesión
  coordinadora el 2026-10-30; RED-F1)
- **Contexto:** el usuario entregó un paquete de rediseño de alta fidelidad
  ("Faro Nocturno", ahora en [`docs/rediseno/`](../rediseno/README.md)). Busca un
  aspecto más profesional con los mismos colores. Pide iconos de línea
  uniformes y un layout que aproveche el alto y el ancho en escritorio, iPad y
  móvil. Incluye un Inicio con métricas y un logo nuevo. El paquete trae:
  - `SPEC.md`, la especificación obligatoria;
  - `PROMPT.md`, el encargo;
  - prototipos HTML (`prototipos/*.dc.html`);
  - una copia del design system (`ds/`);
  - el componente del logo (`logo/`).

  Algunas funciones de los prototipos necesitan datos que la app aún no tiene:
  la búsqueda global, las notificaciones, la papelera, comparar con el periodo
  anterior, generar sprints desde un rango y las métricas de ejecución, que
  llegan con la ingesta de ejecuciones de 0.2.0.

## Decisión

1. **La SPEC manda.** Si `docs/rediseno/README.md` y `docs/rediseno/SPEC.md`
   difieren, vale la SPEC. Ante una duda, se pregunta al usuario antes de
   inventar. Los prototipos son **solo referencia visual**: no se copian su
   HTML, sus estilos en línea ni sus datos de ejemplo. Se reimplementa con los
   componentes de `src/shared/ui`, los tokens `var(--…)` y el i18n (es y en).
2. **Visual primero, funciones nuevas después.** El trabajo va en olas:
   - **F1 · Fundamentos (RED-F1):** paquete en `docs/rediseno/`, logo nuevo
     (también favicon e iconos nativos), Lucide, tipografía y ajuste de texto
     (SPEC §3), movimiento reducido (§9), primitivas compartidas y el shell
     (puntos de corte, menú lateral, barra superior y barra inferior).
     Bloquea todo lo demás.
   - **V1–V4 · Pantallas, en paralelo:** V1 Login/Inicio/Perfil, V2
     Proyectos/Ajustes/Plan, V3 Casos/Planificador/Trazabilidad, V4
     Administración. Cada pista reestiliza sus pantallas con las primitivas de
     F1. El usuario las revisa con capturas a 320, 390, 820, 1180 y 1440 px, en
     claro y oscuro.
   - **Ola 5 · Funciones con datos (RED-W1..W6):** búsqueda global,
     notificaciones, papelera, comparar periodos, sprints desde un rango y
     métricas de ejecución. Dependen de 0.2.0. Hasta entonces el shell pinta
     sus disparadores con un aviso de "próximamente", sin datos inventados.
3. **Lucide como librería de iconos** (`lucide-react`, licencia ISC). Sustituye
   a los glifos Unicode, a las máscaras CSS y a los SVG en línea, empezando por
   el shell. Se importa icono a icono, para que el paquete solo incluya los que
   se usan. Los logos de proveedores de IA (Simple Icons) son cosa de V4.
4. **Puntos de corte únicos, por el ancho del contenedor de la app** (SPEC §2,
   enmendada el 2026-10-30 por
   [`CAMBIO-vista-adaptativa`](../rediseno/cambios/CAMBIO-vista-adaptativa.md)).
   Los valores siguen siendo los originales, 600/1280 px. La enmienda cambia lo
   que se mide: el contenedor y no la ventana. Una versión intermedia del
   diseño probó 640/1024 y la del 30 de octubre a las 11:31 volvió a 600/1280:
   - Tramos: < 600 px móvil; 600–1279 px franja de iconos de 84 px; ≥ 1280 px
     menú lateral de 248 px, contraíble a la franja (la elección se recuerda).
   - Se mide el contenedor raíz y no `window`, así la vista se adapta también
     al estrechar la ventana o si la app va embebida.
   - `ViewportProvider`, por encima de las rutas (también cubre el login),
     observa ese contenedor con un `ResizeObserver` y da la vista por contexto
     a `useBreakpoint`:
     - mide el primer valor antes de pintar, para que la navegación no
       parpadee;
     - solo vuelve a pintar al cambiar de tramo;
     - se desconecta al desmontar.
   - El CSS usa el atributo `data-viewport` del contenedor o `@container`,
     nunca media queries sobre la ventana.
   - Solo se decide en el DOM lo que cambia de estructura: menú lateral o barra
     inferior, desplegable u hoja.
5. **Primitivas compartidas en `src/shared/ui`**, que usan todas las pistas:
   - `Popover`/`Menu` (SPEC §6/§10):
     - se cierran con un clic fuera, un scroll fuera y Escape;
     - se recolocan hacia arriba y hacia dentro, con alto máximo visible;
     - se recorren con las flechas;
     - solo hay uno abierto a la vez.
   - `BottomSheet`: hoja inferior en móvil.
   - `ResponsiveMenu`: un menú en escritorio y una hoja en móvil.
   - `ConfirmDialog variant="destructive"`: solo se cierra con «Cancelar». Con
     `confirmText`, pide escribir un texto para activar el botón.
   - `TruncatedText`: correos, rutas e IDs sin partir.
   - Clases tipográficas de `typography.css`.
6. **Marca:** el logo de `docs/rediseno/logo/Logo.jsx` sustituye al anterior
   en todos los sitios. Usa la versión completa desde 28 px, la compacta por
   debajo y `surface="navy"` sobre fondos navy. Los iconos nativos se regeneran
   desde ese logo (`src-tauri/icons/README.md`).
7. **Navegación (SPEC §7):** Plantillas y Motor de IA pasan a Administración.
   Sus rutas siguen hasta V4. Hasta entonces, un `AdminSectionNav` temporal las
   enlaza encima de las tres páginas. Cada proyecto tiene su propia URL
   ([ADR-0029](0029-secciones-del-proyecto-en-la-url.md)).

8. **Enmienda RED-V3 (2026-10-30): ranuras de la pantalla en el shell.** Una
   pantalla puede pedir cosas al shell sin importar `src/app`:
   - `ShellChromeProvider` (en `AppShell`) y `useHideMobileChrome`, en
     `src/shared/ui`, ocultan la barra superior, las pastillas y la barra inferior del
     móvil mientras se edita Gherkin a pantalla completa (SPEC §7/§8);
   - la cabecera del proyecto es de V2 (`ProjectHeader`, `@modules/projects`);
     cada sección pone sus botones con `useHeaderActions`
     (`@shared/ui/headerActions`), sin importar `projects`.
   Botones de acción (`ui-btn`) y buscador de lista (`ui-search`) también
   son comunes, para que ningún módulo dependa del CSS de otro.
9. **Enmienda RED-V3k (2026-10-30): router de datos y cambios sin guardar.**
   El `HashRouter` declarativo no permite retener una navegación, y el
   editor de casos (V3) y el borrador de IA (V4) pierden cambios con el
   «Atrás» del sistema. `main.tsx` pasa a `createHashRouter` con una sola
   ruta comodín que pinta `App`, que conserva sus `<Routes>`: el cambio es
   mínimo y las rutas de las pistas no se tocan. Encima,
   `useUnsavedChangesGuard` (`useBlocker` + `beforeunload` +
   `ConfirmDialog`) es el único mecanismo para «Descartar cambios / Seguir
   editando». Se descartó interceptar enlaces y duplicar la entrada del
   historial: era frágil y dejaba un «Atrás» de más.
   - La ruta comodín tiene `ErrorBoundary: RethrowRouteError`: un fallo en el
     shell sigue llegando a nuestro `ErrorBoundary variant="app"` (registro
     y «Exportar diagnóstico»), no a la pantalla en inglés del router.
   - **Un guardián por pantalla:** React Router admite un solo bloqueador por
     router (gana el último). Solo lo usa el componente dueño del formulario;
     si se montan dos, avisa en desarrollo.
   - `bypass` deja pasar la siguiente navegación (también tras un `await`);
     `ignore` decide si un cambio solo del query string cuenta como salir.

## Alternativas

- **Rediseñar pantalla a pantalla sin fundamentos comunes:** cada pista
  reinventaría los desplegables, el cierre por scroll y las hojas en móvil.
  Habría cuatro comportamientos distintos y más choques en los mismos
  archivos. Descartado.
- **Implementar ya las funciones de la ola 5 con datos simulados:** enseñaría
  cifras que no existen. Descartado: el usuario prefiere visual primero.
- **Copiar el CSS de los prototipos:** viene en línea, con datos de ejemplo y
  sin i18n. Descartado por el propio paquete.
- **Otra librería de iconos (Heroicons, Material Symbols):** el paquete está
  dibujado con Lucide (`lucide-static@0.460.0`). Cambiarla obligaría a
  reinterpretar cada icono.

## Consecuencias

- El shell y las primitivas de F1 son el contrato de V1–V4. Un cambio en
  ellos durante la ola 4b se coordina entre pistas.
- La tipografía y el ajuste de texto (`hyphens:auto`, `overflow-wrap`) se
  aplican a todo el contenido del shell (`.screen-root`). Una pantalla con
  correos o IDs largos debe usar `TruncatedText` o `.u-truncate`.
- Con `prefers-reduced-motion: reduce` desaparecen los desplazamientos. Solo
  quedan fundidos de opacidad de 100 ms o menos.
- «Cerrar sesión» e «Idioma» están en el menú del usuario. El E2E abre ese
  menú antes de cerrar sesión.
- `lucide-react` entra en las dependencias de producción y pasa la comprobación
  de licencias (ISC).

## Enmienda 2026-10-30 · Login, Inicio y Perfil (RED-V1)

- **Estados vacíos honestos hasta 0.2.0.** Las piezas del Inicio que dependen de
  resultados de ejecución (RED-W6) tienen ya su maquetación final, pero no
  enseñan cifras inventadas:
  - «Tasa de éxito» es una tarjeta sin enlace, deshabilitada, con el motivo en
    su `title`;
  - «Ejecución por proyecto» muestra 0 ejecutados de N y la barra entera «No
    ejecutado»;
  - «Ejecuciones diarias» pinta la raya gris de «sin datos» en cada día;
  - cada criterio de salida dice «Sin datos», y los filtros «En riesgo» y
    «Cumplen» están deshabilitados;
  - los ciclos, el rango personalizado y «Comparar» (RED-W4) aparecen
    deshabilitados con su motivo.
  Lo que ya existe se muestra real: proyectos, casos vivos, fecha de cierre y
  criterios del plan, y defectos abiertos del Planificador.
- **Foto del login.** `src/modules/auth/ui/assets/login-faro.jpg` es la del
  prototipo (1024 × 572). En producción debe usarse la misma imagen a ≥ 2400 px.
- **Login sin scroll en el móvil.** Por debajo de 600 px el login mide su alto
  (`container-type: size`, unidades `cqh`) y nunca hace scroll. **Excepción:**
  el formulario de registro (cinco campos) puede hacer scroll dentro de su hoja;
  la cabecera con la foto se queda en su alto mínimo.
- **Google.** El botón «Continuar con Google» es un marcador deshabilitado. Su
  logo es el único glifo que no es de Lucide (Lucide no trae marcas): un SVG
  monocromo en `currentColor`. Al activar el inicio con Google se usará el
  logo oficial según su guía de marca.
- **Periodo en la pestaña «Ejecución» del Inicio móvil.** El prototipo solo
  lo pone en «Resumen», pero el único widget al que afecta («Ejecuciones
  diarias») está en «Ejecución». Por decisión del usuario, en el móvil el
  selector aparece en las dos pestañas, encima de la gráfica en
  «Ejecución», con el mismo estado.
- **Selector de idioma en el login móvil.** El prototipo móvil no lo tiene; sin
  él no se podría cambiar de idioma antes de entrar, así que va en la cabecera
  de la foto.
- **Controles comunes nuevos** en `src/shared/ui`: `Switch`,
  `SegmentedControl` y `Tabs` (V3 y V4 los usan). Dentro de un menú,
  «Comparar con el periodo anterior» es una opción con el interruptor dibujado:
  un `role="switch"` no puede vivir en un `role="menu"`.
- **Clave de recuperación.** Su sitio en el rediseño es Administración ›
  Seguridad (RED-V4). Sigue en Perfil hasta que V4 la monte allí, para no
  depender del orden de las fusiones; `RecoveryKeySection` se exporta desde
  `@modules/profile` y el PR de V4 la quita de Perfil.
