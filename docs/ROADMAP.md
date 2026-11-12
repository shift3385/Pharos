# Pharos — Hoja de ruta y backlog

> **Replanificación del 2026-10-26**, basada en el estudio `Pharos QA estado del arte.md`
> (carpeta superior al repo) y aprobada el 2026-10-27. **Línea base del 2026-10-28**:
> cuatro auditorías del MVP y las decisiones D1–D6 del usuario
> ([ADR-0001](adr/0001-linea-base-tres-compuertas.md) a [ADR-0006](adr/0006-claves-ia-y-tls.md)).
> Enmienda §13 y §16 de `PROMPT_PHAROS_v0.3.md`. Este archivo es la fuente del backlog; el
> seguimiento fino de cada fase sigue en `files/PROGRESO.md`. Las versiones siguen SemVer
> ([`VERSIONING.md`](VERSIONING.md)); los hitos antiguos `v0.0.N` se renumeraron
> (v0.0.1 + v0.0.2 → 0.1.0, v0.0.3 → 0.2.0, v0.0.3.x → 0.3.0, v0.0.4…v0.0.7 → 0.4.0…0.7.0,
> v0.1.0 → 0.8.0). La documentación al día es ley del proyecto ([`CONTRIBUTING.md`](../CONTRIBUTING.md)).
>
> **Línea base y rumbo rector del 2026-11-11** ([ADR-0039](adr/0039-rumbo-hacia-la-ejecucion-autonoma.md)):
> inventario de lo hecho desde `0.2.0` (§2.1) y el rumbo que el usuario aprobó y declaró rector
> del proyecto: **la ejecución autónoma como eje hasta 1.0** (§2.2), con los hitos nuevos de §3
> y las versiones y prioridades de §5 reescritas. La replanificación del 2026-10-26 y la línea
> base del 2026-10-28 quedan como **documentación inicial** (sus hitos, en §3.1).

## 1. Qué cambia y por qué

1. **Pharos es el plano de control, no un motor de ejecución.** Planifica, dispara, recibe y
   traza resultados de Playwright, Karate, Bruno, Appium, Maestro, k6, axe o ZAP. Nunca tendrá
   un runner ni un grid propios.
2. **Lo construido es un MVP; antes de crecer se fija una línea base.** Tres compuertas
   (§4): corregir los fallos verificados, montar la ingeniería que impide regresiones y
   decidir el modelo de datos de la ejecución antes de escribirla.
3. **Mínimos de mercado como P0:** requisitos y matriz de trazabilidad (hecho), modelo de
   ejecución Run/Result inspirado en CTRF e importación local de JUnit, Cucumber Messages,
   CTRF y JSON de Playwright.
4. **"Cualquier tipo de QA" con tipos de resultado genéricos** (Result, Finding, Metric,
   Session) y pocos formatos, no con un adaptador por herramienta ([ADR-0005](adr/0005-alcance-hasta-1-0.md)).
5. **IDs estables como tags de Gherkin** (`@TC-001`, `@REQ-014`), nunca el nombre del escenario.
6. **Equipo antes que móvil:** workspaces compartidos en 0.5.0 ([ADR-0003](adr/0003-workspaces-compartidos.md),
   enmendado por [ADR-0039](adr/0039-rumbo-hacia-la-ejecucion-autonoma.md)), móvil en 0.10.0.
7. **El trabajo se hace en pistas paralelas** coordinadas como un equipo pequeño de agentes (§7).
8. **La ejecución autónoma es el eje hasta 1.0** ([ADR-0039](adr/0039-rumbo-hacia-la-ejecucion-autonoma.md)):
   Pharos diseña las pruebas y las lanza, supervisadas o no, sin dejar de ser plano de control.
   La IA redacta scripts deterministas y los frameworks los ejecutan sin IA (§2.2).

## 2. Estado real (2026-11-11; última versión publicada `0.2.0`, del 2026-11-05)

| Área                                                                            | Estado                                                                           | Commits                         |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------- |
| Fases 0–7: base, cuentas, BD cifrada, plan, casos, planificador, plantillas, IA | Implementado                                                                     | `369d335`…`79a0185`             |
| Fase 8: sync con oplog, HLC y panel de conflictos                               | Implementado, con 6 fallos verificados (compuerta A)                             | `bf96ad6`, `fb70768`, `4fdd6a5` |
| Fase 9A: administración                                                         | Implementado                                                                     | `2de8e8e`                       |
| Trazabilidad: requisitos, matriz, tags                                          | Implementado                                                                     | `484e941`                       |
| BD sin texto plano y guardado atómico (SEC-01/02)                               | Hecho                                                                            | `54f1dde`                       |
| Varios proveedores de IA (IA-08) y cuenta de test (BASE-17)                     | Hecho                                                                            | `91f0b9a`                       |
| Tests                                                                           | Cliente 710 · Rust 245 · servidor 92 · scripts 47 · E2E 13 (2026-10-30, `f7dcd62`). CI con 8 checks obligatorios, E2E incluido | —                   |
| Segunda ola: compuerta A cerrada, SEC-03, IA-05/IA-10, Inicio real, carpeta de descarga, PDFs en ZIPs, logs de sync, zod 4 | Hecho (A3, S1, Q1, I1, U1) | `b969824`, `b75e757`, `c000a53`, `24535c4`, `0eab0a1` |
| Tercera ola: compuerta B cerrada, WCAG 2.1 AA y validación común de formularios (UX-05/UX-01), web como cliente puro del servidor y contratos generados (BASE-10/BASE-05), react-router 7 y cobertura en cada PR (BASE-20/BASE-13), E2E obligatorio | Hecho (X1, W1, D1, Q1) | `f1cac23`, `1f93e15`, `446dd7e`, `95958e6` |
| Fase 9: documentación final, guía de la beta y release `0.1.0-beta.1` (UX-06) | Hecho (R1); falta la validación nativa (§6) | — |
| Cuarta ola: rediseño completo de la interfaz (RED-F1, RED-V1..V4, [ADR-0028](adr/0028-rediseno-de-la-interfaz.md)…[0031](adr/0031-administracion-por-pestanas.md)), router de datos y aviso de cambios sin guardar (RED-V3k) | Hecho (F1, V1–V4), con revisión visual del usuario; release `0.2.0-alpha.1` | `279fc93`, `5119bdf`, `b6f90e2`, `9164611`, `59adfd4` |
| Ola de ejecución (E1–E6): compuerta C, Run/Result, ejecución manual, importación JUnit/Cucumber/CTRF/Playwright, ciclos, defectos, matriz con resultados, informe de estado, auditoría | Hecho; release `0.2.0` (2026-11-05) | `966a61d` |
| Después de 0.2.0, ya en `origin/main`: FIX-16, FIX-19, sesión caducada en la web y en el sync de escritorio, SEC-08/09 en el backlog, PLN-02 | Hecho, sin publicar | `4195836`, `2e29e2a` |
| Después de 0.2.0, fuera de `main`: IA-11, IA-13..19, UX-11..35, FIX-18, FIX-20..25, PLN-05, DAT-04, MAN-03, MAN-04 | Hecho en la rama de integración `local/app-completa` (PR #61 y #62 abiertos; el resto sin PR) | `23fb20c` |

Las validaciones nativas pendientes están en §6.

### 2.1 Línea base del 2026-11-11

**Dónde está cada cosa** (comprobado con `git` y `gh` el 2026-11-11):

| Lugar | Qué contiene | Estado |
| --- | --- | --- |
| `origin/main` (`2e29e2a`) | `0.2.0` más #55 (SEC-08/09 en el backlog), #56 (sesión caducada en la web), #57 (FIX-16), #58 (sesión caducada en el sync de escritorio), #59 (FIX-19) y #60 (PLN-02) | `0.2.0` publicado; lo demás sin publicar |
| PR #61, `fix/ai-key-save-and-test` (14 commits) | IA-11, IA-13..16, UX-11..20, FIX-18, PLN-05 | Fusionable; los 8 checks obligatorios en verde; falla el job `manual`, que no es obligatorio |
| PR #62, `feat/key-numbering-on-demand` (1 commit) | DAT-04 | Fusionable; CI en verde |
| `local/app-completa` (`23fb20c`) | 67 commits sobre `origin/main` (40 de trabajo y 27 fusiones): lo de #61 y #62 más IA-17..19, FIX-20..25, UX-21..35, MAN-03 y MAN-04 | Rama de integración que usa la app del usuario; sin PR; contiene `origin/main` entero (0 commits por detrás); 868 archivos, +42.715/−8.800 líneas; migraciones nuevas: local `0038` (IA-17) y servidor `0017` (UX-27) |
| Worktree `datepicker-methodology-cd4bcf` | Selector de fecha de Pharos (`DatePicker`), «Cronograma» con la ayuda en «?» y «Metodología» en dos columnas | En curso en otra sesión; sin commit ni ID todavía |

**Lo hecho desde 0.2.0, por tema** (cada ítem tiene su fila y su estado en §4 y §5):

- **Requisitos e IA sobre diseños:** «Requisitos» como sección propia, antes de Casos (UX-21); requisitos propuestos por la IA desde la carpeta de un proyecto (IA-17, ADR-0036) y desde capturas, bocetos y diseños (IA-18, ADR-0037), con la imagen de origen guardada si se marca (IA-19); propuestas más legibles (UX-23, NC-039).
- **IA en el plan y en los casos:** probar la clave antes de guardarla (IA-11, ADR-0033); responsabilidades, criterios de cierre y textos breves según el syllabus en el plan (IA-13..15); revisión crítica de las listas del caso (IA-16); mensajes sin proveedor ni modelo (UX-18); editor de casos por bloques y la marca de IA en el estado de la lista (UX-19, UX-20).
- **Proyectos:** se abren en el Tablero (UX-22); «Copiar ajustes de:» (UX-25) y asistente «Nuevo proyecto» en tres pasos (UX-29); claves seguidas entre equipos (DAT-04).
- **Inicio:** pizarra de gadgets de 24 × 24 guardada con la cuenta (UX-27, ADR-0038); Inicio afinado, sin desplazamiento dentro de los gadgets (UX-28); «Ejecuciones diarias» en líneas y selector en «Próximas pruebas» (UX-32); eje con números enteros (FIX-25).
- **Plan de pruebas:** cabecera más limpia (UX-24); plan de 17 pasos con «Identificación del plan» y «Niveles y tipos de prueba» (UX-31); título sugerido desde el proyecto (UX-34); historial de revisiones opcional en el plan exportado (PLN-02); maquetación del PDF (PLN-05); sin el «Elaborado por» repetido (FIX-24); pares que crecen y Cronograma fijo (UX-15, UX-16).
- **Componentes y aspecto:** `Select` de Pharos en toda la app (UX-30, FIX-23); cuadros de texto que crecen y barra de scroll de Pharos (UX-33); barra lateral con pestaña en el borde, «Acerca de Pharos» y sincronización animada (UX-26); fondo, sombras y selector de proyecto único (UX-11, UX-12, UX-14); skeletons de carga (UX-17); «Por confirmar» en lugar de «re-test» (UX-35).
- **Correcciones:** FIX-16 (errores de carga con «Reintentar» en la web), FIX-18 (rebote del WebView), FIX-19 (borrador del ejecutor), FIX-20 (N+1 en la web), FIX-21 (doble ojo en la contraseña), FIX-22..25; sesión caducada renovada en la web y en el sync de escritorio.
- **Manual:** manual v2 flujo a flujo, con 19 capítulos, el apéndice de atajos, 236 pasos en verde y una sola persona en las capturas (MAN-03); las tres formas de traer requisitos, recorridas con IA (MAN-04). Registro de no conformidades: NC-001…NC-054.

**No conformidades del manual pendientes de decisión del usuario** ([`NC-log.md`](manual/NC-log.md)):

| NC | Qué faltaba decidir | Decisión del usuario (2026-11-11) |
| --- | --- | --- |
| NC-009 | Editar el asignado de un elemento del ciclo en tableta y móvil (quitar ya avisa) | Sí, con el `Select` de Pharos |
| NC-015 | Eliminar un defecto desde el tablero, la tarjeta móvil y el editor | Sí, desde el editor (vale para todas las vistas), con confirmación crítica |
| NC-023 | Faltan apartados de ISO/IEC/IEEE 29119-3 y CTFL v4 §5.1.1 en el plan: criterios de entrada, suspensión y reanudación, supuestos y restricciones, técnicas, **métricas**, formación, independencia, presupuesto y aprobación | Épica propia del plan (§2.2) |
| NC-027 | El pie de la tira de iconos (sincronización y avatar) queda fuera de la vista a 1024 × 768 | Fijar el pie |
| NC-031 | Guardar sin cambios sube la versión y crea una revisión (igual que PLN-03) | Revisión solo con cambios, junto con NC-023 |
| NC-032 | «Aprobado» no registra quién ni cuándo, y sigue aprobado tras editar | Aprobación con autor y fecha; editar lo devuelve a «Revisado»; junto con NC-023 |
| NC-053 | Títulos cortados en la matriz a 1440 px | Repartir los anchos por contenido |
| NC-054 | «Ocupa» y «Adjuntos por tipo» no cuadran en Evidencias | Decir «N archivos para M adjuntos» |

**Diagnóstico de las métricas** (compartido con el usuario el 2026-11-11 y comprobado en el código):

1. **Ninguna métrica bloquea ni avisa.** Los criterios de salida se calculan en la derivación (`execution/derive.rs`, contrato v1, R11) y se ven en el Inicio y en el informe de estado, pero un ciclo se cierra aunque haya criterios en «No cumple»: los ciclos no los leen.
2. **Los criterios se reconocen por texto libre:** `criterion_kind` busca palabras como «crític», «cobertura», «éxito» o «ejecutad»; un criterio escrito de otra forma queda como «manual» y no se mide.
3. **No hay tendencia entre ciclos.** Cada vista mira un periodo o un ciclo; «Comparar con el periodo anterior» (RED-W4) sigue pendiente.
4. **Faltan métricas clásicas de QA:** densidad de defectos, escapes a producción, tiempo de corrección, tasa de reapertura y estabilidad (*flaky*) en el tiempo.
5. **El plan no tiene apartado de métricas** (parte de NC-023).

**Desfase de versión.** Todo lo hecho desde 0.2.0 está marcado como `0.3.0` en §5, pero **no se ha empezado ningún ítem del contenido previsto para 0.3.0 en §3** (CORE-01, SEC-04/05, SYNC-05, SYNC-07, TEN-01, CAS-01/02), y su criterio de salida no se cumple: dos usuarios en el mismo workspace con roles y el CLI escribiendo con la app abierta. Lo hecho trae funcionalidad nueva y dos migraciones, así que no puede salir como PARCHE ([`VERSIONING.md`](VERSIONING.md) §1 y §6). O se publica como una MENOR con otro tema, o espera en `main` sin publicar hasta que el trabajo en equipo esté hecho. Decisión del usuario (2026-11-11, ADR-0039): sale como 0.3.0 «Diseño asistido y experiencia» y los hitos siguientes se renumeran (§3).

**Validaciones nativas.** La lista de §6 sigue sin recorrer y `0.1.0` final nunca se cortó. Desde 0.2.0 se suman IA-11 e IA-13..19, que piden claves reales y Ollama.

### 2.2 Rumbo rector: la ejecución autónoma como eje

Aprobado por el usuario el 2026-11-11, que lo declaró rector del recorrido y del desarrollo del
proyecto ([ADR-0039](adr/0039-rumbo-hacia-la-ejecucion-autonoma.md)). Los hitos están en §3;
la serie AUT, en §5; el árbol de lo pendiente por área de QA, en la página de la línea base del
2026-11-11 y en `files/PROGRESO.md`. Aprobadas también las decisiones de la línea base: lo hecho
sale como 0.3.0, las métricas van antes que el equipo, la integración por tramos y el flujo
de §7, las NC pendientes según §2.1, y `0.1.0` final se da por superada (sus validaciones de §6
pasan a la salida de 0.3.0).

**El eje: la visión del usuario.** Con sus palabras, la cúspide del proyecto es que Pharos,
«dependiendo de las pruebas que se deseen hacer y la descripción», sea «capaz de diseñar
pruebas y ejecutarlas autónomamente ya sea supervisadas o no con la interacción humana,
recogiendo datos y métricas de todo». Leída contra el estado del arte, es el ciclo completo
guiado por IA sin que Pharos se convierta en motor de ejecución:

1. **Entender** qué probar (requisitos, descripción, diseños, el propio producto) y qué tipo de prueba hace falta.
2. **Diseñar** casos, datos y Gherkin con técnicas ISTQB.
3. **Generar** los scripts en el framework de cada plataforma: web con Playwright; API con Karate o Bruno; escritorio Windows con Appium 3 + NovaWindows o FlaUI (WinAppDriver está abandonado desde 2020); móvil con Appium 3 o Maestro; rendimiento con k6; accesibilidad con axe; seguridad con ZAP. «Artemis», que nombró el usuario, está por confirmar.
4. **Ejecutar** con esos frameworks como procesos externos, en modo supervisado (una persona aprueba el plan o cada paso) o no supervisado (CI o planificado).
5. **Juzgar y registrar:** resultados, evidencias, defectos, métricas y tendencias, con los criterios de salida como *quality gate* y el informe de cierre.

La regla que lo hace viable es la del estado del arte: **la IA redacta tests deterministas y
los frameworks los ejecutan sin IA**. Un agente que maneja el navegador en directo (Playwright
MCP y similares) sirve para explorar y reproducir, y lo que obtiene se guarda como evidencia, no
como el resultado oficial. Los pasos 1 y 2 ya existen en buena parte (IA-05, IA-10, IA-13..19);
el 5 llega con 0.4.0. Los escalones hacia el 3 y el 4, cada uno con un hito medible:

| Escalón | Qué es | Versión | Hito medible |
| --- | --- | --- | --- |
| a · Importar | Resultados de cualquier herramienta, también desde CI | 0.6.0 | Un PR de GitHub reporta JUnit, SARIF, k6 y axe a Pharos |
| b · Ejecutar con una orden | `pharos run`, runner local con «doctor» y disparo de CI | 0.7.0 | «Ejecutar @TC-001» lanza Playwright en local, y la suite de escritorio de Pharos corre desde Pharos, con resultados vinculados |
| c · Scripts generados por IA | La IA escribe el spec desde el caso; una persona lo revisa | 0.8.0 | De un caso aprobado sale un spec de Playwright que se revisa, se ejecuta y queda vinculado; se mide qué parte pasa la revisión sin cambios |
| d · Agente supervisado | El agente propone qué ejecutar, dónde y con qué; una persona aprueba | 0.9.0 | Un plan propuesto por el agente, aprobado por una persona, corre en el agente headless y cada acción queda auditada como `agent:<id>` |
| e · Autonomía con políticas | Ejecución planificada sin intervención, dentro de límites | 1.0.0 | Una ejecución planificada respeta su política, el *quality gate* decide y los defectos se abren como «IA · pendiente de revisión» |

La serie **AUT-01…AUT-06** (§5, «Hacia la ejecución autónoma») recoge los ítems nuevos:
scripts generados por IA, política de ejecución, plan del agente, reparación de scripts,
ejecución no supervisada y aislamiento.

El rumbo mantiene la regla de ADR-0003 (equipo antes que móvil) y el orden de «plano de
control» del estado del arte. No se salta lo básico: las métricas y los *quality gates* (0.4.0)
van antes que cualquier agente, porque sin ellos un agente no tiene con qué decidir si una
ejecución pasa; y los roles (0.5.0) van antes del modo supervisado, porque alguien con permiso
tiene que aprobar. Retrasa la app móvil de ejecución manual (MOB-01) hasta después del agente:
la automatización móvil (Appium, Maestro) corre desde el escritorio, el agente o la nube, no
desde el teléfono. La integración de `local/app-completa` en `main` y el flujo de trabajo
están en §7.

**Riesgos que abre la ejecución autónoma y cómo se gestionan:**

- **Ejecutar código generado.** Un script escrito por la IA puede borrar datos o llamar a
  sistemas reales. Decidido: sin supervisión solo se ejecuta en el agente headless o en CI,
  nunca en el PC del QA; en local, siempre con aprobación y en un entorno aislado (contenedor o
  Windows Sandbox, por decidir en un spike).
- **Credenciales de los entornos.** Se guardan en el llavero o en el almacén del servidor y el
  script las recibe al ejecutarse por variable de entorno; nunca llegan al modelo de IA ni al
  oplog (ADR-0006).
- **Coste de IA.** La IA genera una vez y los frameworks ejecutan muchas; cada proyecto tiene un
  presupuesto de tokens visible, y el modelo local (Ollama) sirve para lo repetitivo.
- **Fiabilidad.** La IA en tiempo de ejecución introduce *flakiness* (Thoughtworks la mantiene
  en «Assess»): lo que decide un resultado oficial es un script determinista, no un modelo.
- **Inyección de instrucciones.** El agente lee la app que prueba; un texto de la pantalla no
  puede darle órdenes (la misma regla que ya aplica IA-18).
- **Licencias.** Pharos no empaqueta los frameworks: los instala el usuario y Pharos los lanza
  como procesos (k6 es AGPL). Antes de integrar cada uno, verificar su licencia.
- **Plataformas.** Escritorio Windows primero, porque Pharos corre ahí y ya se prueba a sí
  mismo con WDIO + tauri-driver; Android por ADB y Appium desde Windows; iOS solo con un agente
  macOS o una nube de dispositivos.
- **Responsabilidad.** Todo lo que hace el agente pasa por el oplog como `agent:<id>` con
  «IA · pendiente de revisión», y la política dice quién aprueba qué.

## 3. Hitos (rumbo rector del 2026-11-11, ADR-0039)

Cada versión sale cuando cumple su criterio de salida, con `npm run version:set` en el commit
de release ([`VERSIONING.md`](VERSIONING.md)). Prioridad dentro de cada hito: §4 (P0…P3).

| Versión | Tema | Contenido | Criterio de salida |
| --- | --- | --- | --- |
| **0.1.0** | MVP consolidado | `v0.1.0-beta.1`; la final se da por superada (ADR-0039) | Sus validaciones nativas (§6) pasan a la salida de 0.3.0 |
| **0.2.0** (publicada el 2026-11-05) | Ejecución | Compuerta C, EJE-01..04, RUN-00, AUD-01, DAT-02/03, CYC-01, FLD-01, DEF-01, ING-02..05 y el rediseño (RED-*) | Cumplido: un run manual y uno de Playwright en la misma matriz |
| **0.3.0** | Diseño asistido y experiencia | Lo hecho desde 0.2.0 (§2.1); el selector de fecha, el Cronograma y la Metodología (en curso); las NC NC-009, NC-015, NC-027, NC-053 y NC-054 | Los commits de `local/app-completa` en `main` por PR; manual en verde; IA-16..19 validadas con una clave real; validaciones nativas de §6 hechas |
| **0.4.0** | Estrategia medible | PLN-06 (plan ISO 29119-3 completo con apartado de métricas, NC-023); PLN-07 (aprobación con autor y fecha, NC-032); PLN-03 y PLN-04 (NC-031); DOC-02 (criterios estructurados y *quality gate* al cerrar un ciclo); DOC-06 (tendencia entre ciclos y métricas clásicas: densidad de defectos, escapes, tiempo de corrección, reapertura, flaky en el tiempo); DOC-01 (informe de cierre 29119-3); AUD-01 (Administración › Auditoría); TRZ-04 completo; RED-W4 | Cerrar un ciclo con un criterio en «No cumple» pide una justificación que queda en el informe de cierre; el Inicio muestra la tendencia de los últimos ciclos |
| **0.5.0** | Equipo | TEN-01 y SYNC-07 (workspaces con roles), CAS-02 (revisión y aprobación por otra persona), SEC-08, SEC-09, SYNC-04b (adjuntos), SYNC-09, IA-12, servidor configurable desde la app, SEC-07 (TLS), RED-W2, RED-W3, AUD-01c | Dos usuarios trabajan en el mismo workspace con roles; un auditor no edita; otra persona aprueba un caso |
| **0.6.0** | Núcleo y automatización conectada (escalón a) | CORE-01, SEC-04/05, INT-01..04 (CLI `upload`/`watch`, API v1 con tokens, webhooks, plantillas de GitHub Actions), ING-06 (SARIF, k6, axe), ING-07 (Allure, TRX, `.xcresult`), CAS-01, SYNC-02, SYNC-10, SYNC-11, DEU-01 | Un PR en GitHub reporta JUnit, SARIF, k6 y axe a Pharos; el CLI escribe con la app abierta |
| **0.7.0** | Ejecutar con una orden (escalón b) | RUN-01 (runner local con «doctor»: Playwright, Karate/Bruno, k6, axe, Appium/FlaUI en Windows), `pharos run`, RUN-02 (Gherkin de ida y vuelta), RUN-03 (la suite de Pharos dentro de Pharos), INT-06 (disparo de CI), AUT-06 (aislamiento) | «Ejecutar @TC-001» en local deja un resultado vinculado; un plan dispara un workflow de GitHub |
| **0.8.0** | Scripts generados por IA (escalón c) | AUT-01, AUT-02, IA-03 (*lint* de oráculo), IA-02 (duplicados), IA-06 (MCP local), IA-09 (modelo por tarea), TPL-01 | Un spec generado desde un caso se revisa, se ejecuta y queda vinculado; Claude Code lee casos por MCP |
| **0.9.0** | Agente supervisado (escalón d) | AUT-03, AUT-04, RUN-04 (agente headless: Windows; Mac para iOS), IA-04 (triage de fallos) | Plan del agente aprobado por una persona, ejecutado en el agente headless y auditado como `agent:<id>` |
| **0.10.0** | Campo y ecosistema | MOB-01, EXP-01 (con exploración asistida como evidencia), EJE-06b, SYNC-05, INT-05 (Jira), INT-07 (TestRail), DOC-03 (paquetes EAA/ASVS) | Un caso ejecutado en el móvil aparece en el escritorio; plan → CI → resultado → defecto en Jira |
| **1.0.0** | Autonomía con políticas (escalón e) | AUT-05 y la decisión explícita de 1.0; DOC-04/05 (aprendizaje, portafolio) cuando haya hueco | Una ejecución planificada respeta su política, el *quality gate* decide y los defectos se abren como «IA · pendiente de revisión»; [`VERSIONING.md`](VERSIONING.md) §1 |

Sin versión todavía: FLD-02, RED-W1, RED-V3*, RED-W7, UX-03, UX-09, EXP-04.

### 3.1 Hitos anteriores (documentación inicial)

Hitos de la replanificación del 2026-10-26 y la línea base del 2026-10-28, sustituidos el
2026-11-11 por ADR-0039. Se conservan como registro.

| Versión                         | Tema                     | Contenido                                                                                                                    | Criterio de salida                                                                                                                                                                                                                                    |
| ------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0.1.0** (`v0.1.0-beta.1`; pendiente validación nativa; `main` ya está en 0.2.0) | MVP consolidado          | Compuertas A y B; SEC-03, SEC-06, SYNC-08, IA-05; Fase 9 (UX-05/06); huecos de la spec (§5)                                  | Compuertas A y B cerradas con evidencia; `cargo test`, `verify` y tests del servidor en CI; conflicto simulado visible; matriz exportable; `.feature` filtrable por `@TC-xxx`; instalador NSIS limpio en Windows 11; validaciones nativas (§6) hechas |
| **0.2.0** (publicada el 2026-11-05: incluye el rediseño de la interfaz, RED-*; sin RED-W1..W4 ni TPL-01) | Ejecución                | Compuerta C cerrada (ADRs); EJE-01..04, RUN-00, AUD-01, DAT-02/03, CYC-01 y FLD-01 (recortables a 0.3.0), DEF-01; ING-02..05 | Un run manual y uno de Playwright aparecen en la misma matriz; editar un caso ejecutado no altera sus resultados                                                                                                                                      |
| **0.3.0** (2026-11-11: ningún ítem empezado; lo hecho desde 0.2.0 es otro tema, §2.1) | Núcleo y equipo          | CORE-01, SEC-04/05, SYNC-05, SYNC-07, TEN-01, CAS-01/02                                                                      | Dos usuarios trabajan en el mismo workspace con roles; el CLI escribe con la app abierta                                                                                                                                                              |
| **0.4.0**                       | Campo                    | MOB-01, EXP-01, SYNC-04b, SYNC-09                                                                                            | Un caso ejecutado en el móvil aparece en el escritorio; una sesión exploratoria genera un Run                                                                                                                                                         |
| **0.5.0**                       | Automatización conectada | INT-01..04, ING-06, SYNC-02, SEC-07, DEU-01                                                                                  | Un PR en GitHub reporta resultados (incluidos SARIF, k6 y axe) a Pharos                                                                                                                                                                               |
| **0.6.0**                       | Runner local             | RUN-01..03, ING-07                                                                                                           | Botón "Ejecutar @TC-001" en local con resultado vinculado                                                                                                                                                                                             |
| **0.7.0**                       | IA de calidad            | IA-02/03/06/09                                                                                                               | Claude Code lee casos vía MCP local; duplicados detectados offline                                                                                                                                                                                    |
| **0.8.0**                       | Ecosistema               | INT-05..07, IA-04, DOC-06                                                                                                    | Ciclo plan → CI → resultado → defecto en Jira                                                                                                                                                                                                         |
| **0.9.x → 1.0.0**               | Normativo y escala       | RUN-04, DOC-01..05                                                                                                           | Quality gates y paquetes normativos; decisión explícita de 1.0 (VERSIONING §1)                                                                                                                                                                        |

Fuera de alcance hasta 1.0 ([ADR-0005](adr/0005-alcance-hasta-1-0.md)): SaaS multi-tenant, MCP
remoto (IA-07), CRDT de texto, auto-updater, observabilidad remota, iOS local.

## 4. Línea base: tres compuertas

Las compuertas A y B bloquean publicar 0.1.0; la C bloquea empezar 0.2.0 y cada ítem se cierra
con un ADR ([ADR-0001](adr/0001-linea-base-tres-compuertas.md)). Prioridad: **P0** bloquea el
hito · **P1** paridad de mercado · **P2** diferenciador · **P3** escala.

### A · Corrección (bloquea publicar 0.1.0)

| ID       | Ítem                                                                                                                             | P   | Estado                                                                                 | Criterio de aceptación                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- | --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| FIX-01   | El contador de pendientes solo cuenta lo que el sync envía                                                                       | P0  | Hecho (A1, en main `50525bf`)                                                          | Editar un requisito y sincronizar deja el indicador en "Sincronizado"                                |
| FIX-02   | Pull paginado: el escritorio repite hasta agotar; la web usa el cursor                                                           | P0  | Hecho (A1, en main `50525bf`)                                                          | 1.200 documentos llegan completos al escritorio y a la web                                           |
| FIX-03   | Push por lotes con reintento                                                                                                     | P0  | Hecho (A1, en main `50525bf`)                                                          | 2.000 cambios pendientes se envían sin error 413                                                     |
| FIX-04   | La web avisa al perder un conflicto, conserva la edición y reintenta un push fallido                                             | P0  | Hecho (A1, en main `50525bf`)                                                          | Conflicto simulado en la web: aviso visible y ningún texto perdido                                   |
| FIX-05   | El borrado en cascada de un proyecto se sincroniza                                                                               | P0  | Hecho (A1, en main `50525bf`)                                                          | Borrar un proyecto en A lo borra con sus planes, casos y requisitos en B                             |
| FIX-06   | `created_by`/`updated_by` guardan el usuario, no el id de la entidad                                                             | P0  | Hecho: escrituras locales (A2) y datos recibidos por sync (A1)                         | Test de repositorio comprueba el autor en proyectos, planes y casos                                  |
| FIX-07   | Oplog, cursor y `sync_base` separados por usuario en el mismo equipo                                                             | P0  | Hecho (A1, en main `50525bf`)                                                          | Tras cambiar de cuenta, B no envía cambios pendientes de A                                           |
| FIX-08   | Casos, planes, requisitos, tarjetas y adjuntos comprueban el dueño (plantillas: FIX-08b; conflictos, oplog y cursor: FIX-07)     | P0  | Hecho (A2, en main `8ee8731`)                                                          | Test: otro usuario no lee ni modifica ninguna de esas entidades                                      |
| FIX-08b  | Plantillas por usuario; actualizar o borrar un id inexistente no escribe oplog (tras fusionar B2, que refactoriza `template.rs`) | P0  | Hecho (A3, en main `b969824`; migración 0018)                                            | Test: otro usuario no lista, lee ni borra plantillas ajenas; un id inexistente no deja fila de oplog |
| FIX-09   | Clave de Gemini en cabecera, timeout y errores sin URL                                                                           | P0  | Hecho con IA-08 (`91f0b9a`)                                                            | Test de `ai.rs`: la clave nunca aparece en la URL ni en el error                                     |
| SYNC-04a | Sincronizar requisitos y tarjetas/defectos                                                                                       | P0  | Hecho (A1, en main `50525bf`)                                                          | Un requisito creado en A aparece en B y los vínculos de los casos resuelven                          |
| DAT-01   | IDs de caso, requisito y defecto únicos entre equipos                                                                            | P0  | Hecho (A3, en main; ADR-0010 enmendado; migraciones local 0017, servidor 0005-0006)    | Dos equipos sin conexión crean casos y tras sincronizar no hay claves duplicadas                     |
| SYNC-06  | Purga real de eliminados (o quitar el texto de Admin que la promete)                                                             | P1  | Hecho (A3, en main; migración 0017)                                                   | Tras N días el registro desaparece y no resucita tras un pull                                        |

También bloquean 0.1.0: SEC-03, SEC-06, SYNC-08, IA-05, UX-05, UX-06 y las validaciones de §6.

Límites conocidos de FIX-08 (rama A2):

- El id del usuario lo envía la UI al núcleo Rust. La comprobación separa las cuentas de un mismo equipo; no protege de una UI manipulada.
- En la web el dueño ya no lo envía la UI: el servidor lo toma de la sesión (BASE-10).
- Un plan sin proyecto (posible por un pull antiguo) no se muestra a nadie: el dueño se deduce del proyecto, y la UI solo llega al plan desde su proyecto.

### B · Ingeniería (bloquea publicar 0.1.0)

| ID      | Ítem                                                                                                                                                         | P   | Estado                                | Criterio de aceptación                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | ------------------------------------- | -------------------------------------------------------------------------- |
| BASE-01 | CI en GitHub Actions (`windows-latest`): `npm run verify`, `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`, servidor con Postgres              | P0  | Hecho (B1, `2f1b30d`); ver BASE-19    | Un PR con un test roto queda en rojo                                       |
| BASE-02 | `main` protegida: solo por PR con los checks de BASE-01                                                                                                      | P0  | Hecho (2026-10-29); `e2e` obligatorio | Un push directo a `main` se rechaza                                        |
| BASE-03 | Auditoría de dependencias npm y Cargo (`cargo deny`, licencias Rust incluidas) y Dependabot; revisa las 5 vulnerabilidades de tooling                        | P1  | Hecho (B1); zod 4 hecho (BASE-18)     | El gate de licencias cubre npm y Cargo; 0 vulnerabilidades altas           |
| BASE-04 | Test de actualización desde una BD 0.1.0 guardada como fixture                                                                                               | P0  | Hecho (A2, en main)                   | Abrir el fixture con HEAD conserva todos los datos                         |
| BASE-05 | Contratos TS ↔ Rust ↔ servidor generados (`ts-rs`/`specta`) y fixtures de sync compartidas                                                                   | P1  | Hecho (W1, [ADR-0026](adr/0026-contratos-generados.md)) | CI falla si un tipo generado difiere del commiteado                        |
| BASE-06 | Servidor endurecido: secreto obligatorio de 32+ en producción, CORS explícito, límite de intentos de login y de tamaño de petición                           | P0  | Hecho (B1, en main)                   | El servidor no arranca en producción con el secreto por defecto o CORS `*` |
| BASE-08 | Logs estructurados (`tracing`), `ErrorBoundary` y "Exportar diagnóstico" con la versión (absorbe UX-07)                                                      | P1  | Hecho (B2, Q1); falta validación nativa | El diagnóstico exportado no contiene datos de usuario                      |
| BASE-09 | Instalador NSIS en pre-versiones (MSI solo en estables), construido en CI                                                                                    | P0  | Hecho (B1); falta QA en Win 11 limpio | El artefacto de CI se instala en un Windows 11 limpio                      |
| BASE-10 | Una sola capa de plataforma (`@shared/platform`); la web como cliente del servidor, sin dominio duplicado ([ADR-0004](adr/0004-web-cliente-del-servidor.md)) | P1  | Hecho (W1)                            | No queda ninguna implementación de dominio sobre `localStorage`            |
| BASE-11 | ADRs y reglas de trabajo dentro del repo                                                                                                                     | P1  | Hecho: `docs/adr/`, `CONTRIBUTING.md` | —                                                                          |
| BASE-12 | Registro de números de migración con test de duplicados y huecos                                                                                             | P1  | Hecho (B1, en main)                   | CI falla si dos migraciones comparten número                               |
| BASE-13 | Cobertura medida como informe (`@vitest/coverage-v8`, `cargo llvm-cov`) y tests de `oplog.rs` y `template.rs`                                                | P2  | Hecho (D1, tests de oplog y plantillas en A3): informe del cliente en cada PR; Rust en local | El informe de cobertura se publica en cada PR                              |
| BASE-14 | Smoke E2E del binario real (WDIO + tauri-driver): arrancar, login, crear proyecto, reabrir                                                                   | P0  | Hecho (Q1): smoke en CI y en local    | El smoke corre en CI y en local                                            |
| BASE-16 | Pre-commit ligero (`lint-staged`, `commitlint`)                                                                                                              | P2  | Hecho (B1, en main)                   | Un commit fuera de Conventional Commits se rechaza                         |
| BASE-17 | Cuenta local de test reproducible (`npm run seed:test-user`)                                                                                                 | P1  | Hecho (`91f0b9a`)                     | Idempotente y bloqueada en producción                                      |
| BASE-18 | Zod 4 en el servidor (aviso alto GHSA-mrhx-c7xc-m3w5), tras fusionar A1; excepción en la auditoría hasta el 2026-12-15                                       | P1  | Hecho (Q1)                            | `npm run check:audit` pasa sin excepciones en `server/`                    |
| BASE-19 | `cargo fmt` y clippy limpios en los archivos de A1/A2; vaciar `scripts/rust-gates.allowlist.json`                                                            | P1  | Hecho: project.rs (A3) y planner.rs (U1); allowlist vacía | La allowlist queda vacía y la CI sigue en verde                            |
| BASE-20 | Avisos moderados: react-router 6 (redirección abierta, arreglado solo en v7) y `uuid` vía exceljs                                                            | P2  | Hecho (D1): react-router 7, `uuid` 11 (el bundle de exceljs aún trae uuid 8, solo usa `v4()`: aviso no aplicable) | `npm audit` de la raíz sin avisos moderados                                |
| BASE-21 | Tests del cliente lentos o inestables con carga (AiEngineTab, TestPlanWizard, ScheduleStep, ProjectsPage, a11y del plan ~11,6 s; seguimiento de E4): `testTimeout` por archivo en los de axe o menos workers en CI | P2  | 0.2.0 · Hecho en local; CI pendiente (E6p): `@test/slow` (20 s por archivo) en 27 archivos lentos por naturaleza, sin timeouts por test redundantes; `legacyWebData` con temporizadores falsos; 10 ejecuciones locales seguidas con carga, 954/954. Lentitud previa conocida: `test-plan/a11y` (hasta 16 s con carga, con sus propios 60 s); traceability y dashboard añaden `@test/slow` en sus PRs | `npm test` en CI sin timeouts en 10 ejecuciones seguidas                   |
| BASE-22 | SQLite empaquetado al día: subir `rusqlite` (hoy 0.32.1) a una versión con `libsqlite3-sys` 0.39.0 o posterior (SQLite 3.54.0) por RUSTSEC-2026-0459 / CVE-2026-119375, comprobar que `serialize`/`deserialize` (SEC-01) siguen igual y quitar la excepción de `deny.toml`. Pharos no está expuesto hoy (la BD solo se abre en memoria, sin `-wal`); la excepción es temporal, decidida por el usuario el 2026-11-11 | P0  | 0.3.0 · Hecho (2026-11-11): `rusqlite` 0.41.1 con `libsqlite3-sys` 0.39.1; la excepción de `deny.toml` se quita. La API pasa de `DatabaseName::Main` a `MAIN_DB` y `serialize` pide la conexión mutable (`Db::save` recibe `&mut Connection`); el formato de la imagen cifrada no cambia. Se descartó la 0.42.0, publicada el mismo día | `cargo deny` en verde sin la excepción; `cargo test` y el test de actualización (BASE-04) en verde |
| MAN-01  | Tours guiados de cada pantalla (WDIO, servidor y BD aislados en :3100) + manual de usuario autogenerado en `docs/manual/` (Markdown + PDF con Edge headless) y `check:manual` que exige un paso o un motivo para cada pantalla, pestaña, diálogo y acción | P1  | Hecho (MAN-01): 15 capítulos (E5 incluida), 206 elementos de inventario, 202 recorridos (98 %); IA con la clave del usuario; hallazgos en FIX-11..14 | `npm run manual` en verde y `check:manual` en `verify:static` |
| MAN-02  | Calidad del manual (revisión exploratoria del PDF de MAN-01), por patrones: índice con enlace y página de cada paso; sin bloques partidos y con menos páginas medio vacías (quedan bloques de fin de capítulo); `focus` (contorno ámbar + «Detalle» en el PDF), `group` (antes/después) y `after` en los tours; pies que explican el propósito, con los datos de prueba como ejemplo y al día con la interfaz (UX-10); recorridos sin esperas frágiles y un solo recorrido a la vez (lock) | P1  | Hecho (MAN-02): los 15 capítulos; `--spec` añade los capítulos previos; revisado el maquetado de todas las páginas del PDF | `npm run manual` en verde, `check:manual`, revisión del maquetado de todas las páginas del PDF (docs/manual/REVIEW.md) |
| MAN-03  | Manual v2, flujo a flujo: cada paso, atajo, función y estado (vacío, error, sin IA, móvil) de los 19 capítulos, con un único ejemplo coherente (Liomar Rodríguez, responsable de QA, prueba la propia app Pharos con la cuenta «Liomar QA»), fuentes con «Para qué sirve», «Atajos de teclado», «Si algo no sale», «En el móvil», «Consejos» y «Véase también», apéndice de atajos generado, y registro de no conformidades (`docs/manual/NC-log.md`) con las encontradas al recorrer la app | P1  | Hecho (MAN-03): 19 capítulos y apéndice; 236 pasos en verde; NC-001…NC-054, resueltas salvo las pendientes de decisión (NC-009 en parte, NC-015, NC-023, NC-027, NC-031, NC-032, NC-053, NC-054; NC-039 la resolvió UX-23); comprobación automática de una sola persona en capturas y textos (NC-052) | `npm run manual` en verde, `check:manual`, `test:scripts`, revisión del PDF capítulo a capítulo con el responsable de QA |
| MAN-04  | El manual recorre con IA las tres formas de traer requisitos (CSV, desde un proyecto y desde diseños) con un segundo producto de ejemplo, la Billetera SafeGuard: su CSV, la carpeta de su proyecto y el boceto de sus pantallas en `e2e/tours/fixtures`; el build de pruebas elige la carpeta sin el selector de Windows (`PHAROS_E2E_PICK_FOLDER`); depende de MAN-03, IA-17, IA-18 e IA-19 | P2  | 0.3.0 · Hecho | `npm run manual` en verde con los recorridos de IA |

### C · Decisiones de modelo (bloquea empezar 0.2.0; cada una cierra con un ADR)

Cerrada el 2026-10-28: el usuario aceptó los ADR 0011–0019. La revisión
independiente introdujo tres cambios, que el usuario también confirmó (§7 del
diseño). Cómo encajan y en qué orden se
implementan: [`docs/design/0.2.0-modelo-ejecucion.md`](design/0.2.0-modelo-ejecucion.md).

| ID      | Decisión                                                                                                                      | P   | Estado                                                                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| DAT-02  | Un resultado apunta a la revisión del caso y a pasos con ID estable                                                           | P0  | Aceptado: [ADR-0011](adr/0011-revision-del-caso-y-pasos-estables.md). Hecho (E2, paso 2): revisiones inmutables y sincronizadas, pasos y filas con id; 0.1.x y 0.2.0-alpha.1 en solo lectura                                                                        |
| DAT-03  | Evidencias cifradas fuera de la BD, direccionadas por hash                                                                    | P0  | Aceptado: [ADR-0014](adr/0014-evidencias-cifradas-por-hash.md). Hecho (E2): almacén `evidence/`, retención y migración de `planner_attachments`; los ajustes de Admin (límite y retención), con el paso 7 |
| AUD-01  | Registro de auditoría append-only (antes/después, actor, `agent:<id>`) desde 0.2.0                                            | P0  | Aceptado: [ADR-0015](adr/0015-registro-de-auditoria.md). Parcial (E1, E2): `journal::record`, cadena de hash, sync `append_only`, auditoría de la web (AUD-01b); falta Admin > Auditoría (0.4.0) |
| KND-01  | Tipos de resultado genéricos: Result, Finding, Metric, Session                                                                | P0  | Aceptado: [ADR-0012](adr/0012-tipos-de-resultado-genericos.md). Formato fijado (E3, paso 4): Pharos Run JSON 1.0.0 con `findings[]`, `metrics[]` y `exploratorySession`; sus tablas en 0.4.0/0.5.0 |
| RUN-00  | Entorno, build, commit, dataset y riesgo del requisito dentro del Run desde el inicio (absorbe EJE-05 y los campos de TRZ-04) | P0  | Aceptado: [ADR-0013](adr/0013-campos-del-run.md). Hecho (E3, paso 4): contexto del Run, `risk_*` del requisito y claves `RUN-`; bandas de riesgo por proyecto con TRZ-04 |
| DEF-01  | El defecto como entidad propia (severidad, estado, clave externa, enlace a Result)                                            | P1  | Aceptado: [ADR-0016](adr/0016-defecto-como-entidad.md). Hecho (E4, paso 8): módulo Defectos (lista, tablero, editor, «Desde un resultado»), migración de las tarjetas (local 0029, servidor 0010), sync `defects`, API web |
| CYC-01  | Ciclo o conjunto de pruebas y matriz de configuración                                                                         | P1  | Aceptado: [ADR-0017](adr/0017-ciclos-y-configuraciones.md). Hecho (E4, paso 6): configuraciones con etiquetas de importación, ciclos `CYC-`, elementos a mano y por filtro, clonar, «Ejecutar» (un run por configuración, escritorio) y progreso por configuración |
| FLD-01  | Campos personalizados tipados por proyecto y tipo de caso                                                                     | P1  | Aceptado: [ADR-0018](adr/0018-campos-personalizados.md). Hecho (E3, paso 5): `case_type`, `automation_status`, campos por proyecto, checklist mínima, hoja «Campos personalizados» del `.xlsx`                                                                  |
| TEN-01  | Diseño de workspaces compartidos ([ADR-0003](adr/0003-workspaces-compartidos.md))                                             | P0  | Aceptado: modelo en [ADR-0003](adr/0003-workspaces-compartidos.md), diseño técnico en [ADR-0019](adr/0019-diseno-workspaces-compartidos.md) |
| SYNC-02 | Conflictos por entidad hasta 0.5.0 ([ADR-0002](adr/0002-conflictos-por-entidad.md))                                           | —   | Decidido                                                                                                                                    |

## 5. Backlog por área

### Seguridad y núcleo

| ID      | Ítem                                                                                                                 | P   | Versión | Estado            | Depende de      | Criterio de aceptación                                                                               |
| ------- | -------------------------------------------------------------------------------------------------------------------- | --- | ------- | ----------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| SEC-01  | BD en memoria (`serialize`/`deserialize`), sin `pharos.db.tmp`                                                       | P0  | 0.1.0   | Hecho (`54f1dde`) | —               | Nunca aparece un SQLite en claro en el directorio de datos                                           |
| SEC-02  | Escritura atómica: `.enc.new` + `sync_all` + `rename`                                                                | P0  | 0.1.0   | Hecho (`54f1dde`) | —               | Matar el proceso a mitad del guardado no corrompe `pharos.db.enc`                                    |
| SEC-03  | Clave de recuperación exportable e importable ([ADR-0024](adr/0024-clave-de-recuperacion.md))                        | P0  | 0.1.0   | Hecho (S1)        | SEC-01          | En otro PC, con el `.enc` y la clave, se recuperan los datos                                         |
| SEC-06  | Copia `pharos.db.enc.bak-<versión>` antes de migrar; una versión antigua no abre una BD con migraciones desconocidas | P0  | 0.1.0   | Hecho (A2)        | SEC-01          | Test: migrar crea la copia; abrir con menos migraciones falla con mensaje claro sin tocar el archivo |
| AUD-01b | Auditar también lo que se edita en la web: el servidor escribe un `audit_event` por cada escritura del dominio, con su propia cadena ([ADR-0015](adr/0015-registro-de-auditoria.md)) | P1  | 0.2.0   | Hecho (E2; migración de servidor 0007) | AUD-01          | Editar un caso en la web deja un evento que el escritorio recibe por sync                            |
| AUD-01c | Una copia `.bak` restaurada a mano conserva el `device_id`: sus eventos nuevos bifurcan la cadena del equipo original. Rotarlo al detectar una restauración (la recuperación con la clave ya lo rota) | P2  | 0.5.0   | Pendiente         | AUD-01          | Restaurar una copia y editar deja una cadena nueva, no una bifurcada                                 |
| DAT-03b | «Verificar evidencias» en Admin: contar y reparar a mano los `.pev` sin fila en `blobs` (borrarlos con confirmación), los contenidos cuyo archivo falta (`missing`) y los que no descifran. Nunca automático: un `.pev` sin fila puede ser de una BD apartada ([ADR-0014](adr/0014-evidencias-cifradas-por-hash.md)) | P2  | 0.2.0   | Hecho (E5, DAT-03b) | DAT-03          | El diagnóstico ya cuenta los huérfanos; la verificación los lista y el usuario decide qué borrar     |
| DAT-04  | Claves seguidas entre equipos: con conexión, el escritorio pide al servidor solo los números que va a usar al crear; la reserva sin conexión baja de 50 a 10 y solo se pide para los tipos que ese equipo numera, cuando se agota ([ADR-0010](adr/0010-claves-entre-equipos.md), enmienda DAT-04) | P2  | 0.3.0   | Hecho: `key_lease_for` y `reserveKeys` antes de crear, `size` en `POST /sync/key-blocks` (sin él, 50: compatible), reserva perezosa en `lease_requests`. Las claves ya asignadas no cambian | DAT-01          | Un proyecto nuevo visto por varios equipos empieza en `REQ-001`, y lo creado en web y escritorio sale seguido |
| DAT-03c | Retención de evidencias por proyecto en Admin y las excepciones de resultados de ADR-0014 (final fallido o bloqueado, defecto abierto, ejecución manual) | P2  | 0.2.0   | Hecho (E6p): «Retención por proyecto» en Administración → Evidencias (por tipo: por defecto, siempre o días; «Guardar» y confirmación al acortar), solo de este equipo (no se sincroniza); excepciones, gracia tras actualizar y límites de la pasada en `evidence/retention.rs`; sin migraciones | DAT-03, EJE-02  | Un `trace` importado de un resultado que pasó caduca a los 30 días; el de uno fallido, no            |
| CORE-02 | Test automatizado del keychain                                                                                       | P2  | 0.1.0   | Hecho (Q1)        | —               | Test en verde                                                                                        |
| SEC-04  | Spike de cifrado por página: sqlite3mc frente a SQLCipher                                                            | P1  | 0.6.0   | Pendiente         | —               | Informe con una opción que compila y su licencia                                                     |
| SEC-05  | SQLite en disco con cifrado por página + WAL                                                                         | P1  | 0.6.0   | Pendiente         | SEC-04, CORE-01 | Guardar no es O(tamaño de la BD); otro proceso escribe con la app abierta                            |
| CORE-01 | `pharos-core` sin dependencia de Tauri (db, migraciones, repos, oplog)                                               | P0  | 0.6.0   | Pendiente         | Compuerta A     | El CLI y el escritorio usan el mismo crate                                                           |
| SEC-07  | TLS obligatorio en despliegue autoalojado ([ADR-0006](adr/0006-claves-ia-y-tls.md))                                  | P1  | 0.5.0   | Pendiente         | —               | El servidor rechaza http fuera de localhost en producción                                            |
| SEC-08  | Cuenta: cambiar la contraseña en «Mi perfil» y códigos de recuperación generados al registrarse (hoy no hay forma de cambiarla ni de recuperarla; no confundir con SEC-03, que protege la BD local) | P1  | 0.5.0   | Pendiente         | —               | Con un código de un solo uso se fija una contraseña nueva y se cierran las demás sesiones; los códigos se guardan con hash en el servidor; los datos locales no se tocan |
| SEC-09  | Restablecer la contraseña por correo (enlace de un solo uso) y por un administrador | P2  | 0.5.0   | Pendiente         | SEC-08, SYNC-07 | El enlace caduca y solo sirve una vez; un administrador del workspace restablece sin ver la contraseña; ambos quedan en auditoría |

### Sincronización

| ID       | Ítem                                                                                                      | P   | Versión | Estado                                     | Depende de | Criterio de aceptación                                            |
| -------- | --------------------------------------------------------------------------------------------------------- | --- | ------- | ------------------------------------------ | ---------- | ----------------------------------------------------------------- |
| SYNC-01  | HLC en el oplog                                                                                           | P1  | 0.1.0   | Hecho (`4fdd6a5`)                          | —          | LWW determinista con relojes desfasados                           |
| SYNC-03  | Panel de conflictos (Fase 8C)                                                                             | P0  | 0.1.0   | Hecho (`4fdd6a5`); falta validación nativa | —          | Un conflicto simulado aparece y se resuelve a mano                |
| SYNC-08  | Cada petición de sync lleva la versión de la app; el servidor rechaza las no soportadas sin escribir      | P1  | 0.1.0   | Hecho (A1, revisado y en main)             | —          | Un cliente de una MENOR no soportada recibe un error claro        |
| SYNC-04a | Ver compuerta A                                                                                           | P0  | 0.1.0   | Hecho (A1, revisado y en main)             | —          | —                                                                 |
| SYNC-06  | Ver compuerta A                                                                                           | P1  | 0.1.0   | Hecho (A3, en main)                        | —          | —                                                                 |
| SYNC-05  | Paquetes de oplog firmados `.pharos-bundle` (modo aislado)                                                | P2  | 0.10.0  | Pendiente                                  | SYNC-01    | Exportar e importar por USB entre dos PCs sin servidor            |
| SYNC-07  | Workspaces con roles, `project_members` activo ([ADR-0003](adr/0003-workspaces-compartidos.md))           | P1  | 0.5.0   | Pendiente                                  | TEN-01     | Un auditor ve el proyecto y no puede editarlo                     |
| SYNC-04b | Sincronizar plantillas; adjuntos por hash fuera del oplog (las tarjetas del planificador van en SYNC-04a) | P1  | 0.5.0   | Pendiente                                  | DAT-03     | Una tarjeta con adjunto creada en escritorio se ve en otro equipo |
| SYNC-09  | Perfil, idioma y preferencias sincronizados (spec §10.3)                                                  | P2  | 0.5.0   | Pendiente                                  | FIX-07     | Cambiar el idioma en un equipo se refleja en otro                 |
| SYNC-02  | Fusión de conflictos por campo ([ADR-0002](adr/0002-conflictos-por-entidad.md))                           | P1  | 0.6.0   | Decidido: por entidad hasta 0.6.0 (ADR-0039) | SYNC-01    | Dos ediciones de campos distintos se fusionan sin preguntar       |
| SYNC-10  | Compactar el oplog sincronizado (hoy dos filas por cambio auditado: la de la entidad y la del evento) y medir el crecimiento de `audit_log` (valores completos en `changes`, un evento por tarjeta movida) | P2  | 0.6.0   | Pendiente                                  | AUD-01     | Las filas ya sincronizadas se compactan sin perder nada que el push o la purga necesiten |
| SYNC-11  | Lápida de las revisiones de caso (`test_case_revision`) al borrar o purgar su proyecto: hoy quedan en el servidor, fuera de `PROJECT_CHILDREN` (DAT-02, Q9) | P2  | 0.6.0   | Pendiente                                  | SYNC-06, DAT-02 | Borrar y purgar un proyecto deja sin contenido sus revisiones en el servidor, sin romper un resultado que apunte a ellas |

### Trazabilidad

| ID     | Ítem                                                                                             | P   | Versión                            | Estado                                                           | Criterio de aceptación                                    |
| ------ | ------------------------------------------------------------------------------------------------ | --- | ---------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------- |
| TRZ-01 | Requisitos `REQ-xxx` con CRUD e importación CSV                                                  | P0  | 0.1.0                              | Hecho (`484e941`)                                                | CRUD + import; registrado en GLOSARIO                     |
| TRZ-02 | Matriz requisito ↔ caso ↔ defecto, exportable a la plantilla `PHAROS_Matriz_Trazabilidad_*.xlsx` | P0  | 0.1.0                              | Hecho (`484e941`)                                                | XLSX fiel a `docs/referencias/`                           |
| TRZ-03 | Tags estables en el `.feature` (`@TC-xxx`, `@REQ-xxx`)                                           | P0  | 0.1.0                              | Hecho (`484e941`); probado con cucumber-js, falta playwright-bdd | `cucumber-js --tags` y playwright-bdd `--grep` lo filtran |
| TRZ-04 | Riesgo ISTQB por requisito → prioridad y cobertura ponderada                                     | P2  | 0.4.0 (campos en 0.2.0 con RUN-00) | Campos (E3, paso 4) y, en E6 (paso 10), la UI del riesgo en el formulario del requisito (escritorio y web), la banda en la matriz, el orden por riesgo y la cobertura por banda en el informe, con las bandas por defecto; faltan las bandas por proyecto y la cobertura ponderada | Matriz ordenable por riesgo                               |

### Ejecución e ingesta (0.2.0)

| ID         | Ítem                                                                                                                     | P   | Estado                                                         | Depende de     | Criterio de aceptación                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ | --- | -------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------- |
| ING-01     | Spike de formatos de resultados                                                                                          | P0  | Hecho (`570ce29`, `docs/spikes/ING-01-formatos-resultados.md`) | —              | Muestras reales + mapeo documentado                                        |
| EJE-01     | Modelo Run / Shard / Result / StepResult / Attachment, append-only                                                       | P0  | Hecho (E3, paso 4): esquema (migración 0024), repositorios, sync (`runs`), final y flaky derivados, Pharos Run JSON 1.0.0; sin UI (EJE-02) | Compuerta C    | Esquema + GLOSARIO; los resultados nunca se sobrescriben                   |
| EJE-02     | Ejecución manual por pasos con evidencias                                                                                | P0  | Hecho (E5, paso 7): pantalla del run (`/projects/:id/runs/:runId`), ejecutor por pasos y por flujo / fila de Outline, borrador local, evidencias por paso y por resultado (archivos y capturas pegadas), «Crear defecto», cerrar / reabrir, «Nuevo run manual»; sin migraciones | EJE-01, DAT-03 | Pasa/falla por paso, adjunto por paso                                      |
| ING-02..04 | Importación local de JUnit XML, Cucumber Messages, CTRF y JSON de Playwright ([ADR-0005](adr/0005-alcance-hasta-1-0.md)) | P0  | Hecho (E4, paso 9): parsers TS con contratos sobre las muestras de ING-01, persistente único (`runs/import.rs`), «Importar informe» en «Ejecuciones» | EJE-01         | Importar el informe de Playwright vincula los resultados por `@TC-xxx`. Cada importador produce Pharos Run JSON y da ids deterministas a shards, resultados **y resultados de paso** (ADR-0013, «Implementación») |
| ING-05     | Resultados "no vinculados" y enlace posterior                                                                            | P0  | Hecho (E4, paso 9): bandeja «Sin vincular» en «Ejecuciones» con vincular / desvincular | ING-02         | Un test sin ID queda en la bandeja y se enlaza a mano                      |
| CYC-02     | Selector de ciclo en «Importar informe»: un run nuevo importado puede pertenecer a un ciclo (su configuración y sus elementos ya se derivan, ADR-0013) | P2  | 0.2.0 · Hecho (E6p): selector «Ciclo» en run nuevo; `cycle-closed` en la vista previa y al importar | CYC-01, ING-02 | Importar en un ciclo suma sus resultados al progreso del ciclo sin editar el run después |
| EJE-06     | API de runs en la web: «Ejecutar» un ciclo y la ejecución manual desde la web (ADR-0013, ADR-0016/0017) | P2  | Hecho (E6, adelantado a 0.2.0): `domain/runs.ts` (crear run y «Nuevo run manual», añadir casos sin solapes, intentos idempotentes por `attemptId`, cerrar / reabrir, «Ejecutar» un ciclo, borrador de defecto desde un intento), los mismos documentos que el escritorio (vectores compartidos), borrador en el navegador; sin migraciones. Adjuntos en la web: EJE-06b | CYC-01, DEF-01 | «Ejecutar» en la web crea un run por configuración y un intento guardado en la web se lee igual en el escritorio |
| EJE-06b    | Adjuntos de ejecución y de defectos en la web: adjuntar, ver y descargar evidencias de pasos, resultados y defectos (hoy «Los adjuntos solo están disponibles en el escritorio»; las evidencias no llegan al servidor hasta SYNC-04b) | P2  | 0.10.0                                                         | EJE-06, SYNC-04b | Una captura de un paso guardada en el escritorio se ve en la web, y un defecto creado en la web acepta adjuntos |
| EJE-07     | Borrar un run (borrado lógico con evento; sus resultados nunca se borran a mano) | P2  | Hecho (E6p, 0.2.0): «Eliminar run» en la pantalla del run con un diálogo que nombra lo que oculta; lápidas lww del run y sus elementos, resultados intactos y ocultos por su run; no se borra un run de un ciclo cerrado; `run-deleted` al escribir en él; sin migraciones ni cambios en el servidor | EJE-02         | Borrar un run lo quita de las listas y del progreso; la purga se lo lleva con sus resultados |
| EJE-04     | Matriz extendida a resultados y defectos                                                                                 | P0  | Hecho (E6, paso 10): la matriz muestra el último resultado final de cada caso (manual o importado: estado, run, fecha, flaky, desactualizado, re-test), defectos con severidad, filtros por ciclo, configuración, build y entorno, orden por riesgo; hoja «Resultados» en el .xlsx. Una derivación de ejecución única (contrato v1, Rust + gemelo TS + vectores) que también usa el Inicio (RED-W6). Criterio de salida de 0.2.0 probado: `a_manual_and_a_playwright_run_share_the_matrix` | TRZ-02, EJE-02 | Requisito → caso → último resultado → defecto                              |
| EJE-03     | Informe de estado (29119-3) generado desde los runs                                                                      | P1  | Hecho (E6, paso 10): informe de estado (ISO/IEC/IEEE 29119-3) del proyecto, un ciclo o el plan en un periodo, desde la derivación: progreso, resultados, defectos (a fecha de hoy), cobertura y riesgos, criterios de salida cumple / no cumple, bloqueos, resumen y recomendaciones editables (borrador local); XLSX y PDF | EJE-02         | Export XLSX/PDF                                                            |
| ING-06     | SARIF, k6 summary y axe JSON → Finding/Metric                                                                            | P1  | 0.6.0                                                          | KND-01         | Un SARIF y un k6 summary se guardan sin cambiar el formato Pharos Run JSON |
| ING-07     | Allure, TRX y `.xcresult`                                                                                                | P2  | 0.6.0                                                          | KND-01         | Cada formato pasa tests de contrato con muestras reales                    |

### Calidad de casos y sesiones

| ID     | Ítem                                                                        | P   | Versión | Criterio de aceptación                                                              |
| ------ | --------------------------------------------------------------------------- | --- | ------- | ----------------------------------------------------------------------------------- |
| CAS-01 | Pasos compartidos, parámetros y datasets                                    | P1  | 0.6.0   | Cambiar un paso compartido actualiza N casos; un dataset de 3 filas da 3 resultados |
| CAS-02 | Flujo borrador → revisión → aprobado y baselines de suite                   | P1  | 0.5.0   | Editar un caso aprobado lo devuelve a borrador; una baseline queda congelada        |
| EXP-01 | Sesiones exploratorias (charter, timebox, notas, evidencias desde el móvil) | P2  | 0.10.0  | Una sesión genera un Run con notas y un defecto vinculado                           |
| FLD-02 | Selector de columnas en la lista de casos (campos personalizados como columnas; ADR-0018, Q4 de E3) | P2  | Sin versión | Mostrar u ocultar columnas, también de campos personalizados, y que se recuerde por proyecto |
| FLD-03 | Campos personalizados de defectos definidos en los Ajustes del proyecto (seguimiento de E4, ADR-0016/0018) | P2  | 0.2.0 · Hecho (E6p): selector «Casos / Defectos» en la tarjeta, copia por entidad | Un campo de defecto creado en Ajustes aparece en el editor de defectos y se sincroniza |

### Integraciones, CLI y runners

| ID     | Ítem                                                                                          | P   | Versión | Depende de       |
| ------ | --------------------------------------------------------------------------------------------- | --- | ------- | ---------------- |
| MOB-01 | Móvil Android: ejecución manual con cámara (sin automatización: el sandbox no lanza procesos) | P0  | 0.10.0  | EJE-02, SYNC-04b |
| INT-01 | CLI `pharos upload` y `pharos watch -- <cmd>` (mismo crate)                                   | P1  | 0.6.0   | CORE-01, ING-02  |
| INT-02 | API REST `/api/v1` (OpenAPI), tokens de proyecto y PAT con scopes                             | P1  | 0.6.0   | SYNC-07          |
| INT-03 | Webhooks salientes firmados con HMAC                                                          | P1  | 0.6.0   | INT-02           |
| INT-04 | Plantillas de GitHub Actions con acciones fijadas por SHA                                     | P1  | 0.6.0   | INT-01           |
| RUN-01 | Runner local (procesos hijo) con "doctor"                                                     | P1  | 0.7.0   | CORE-01          |
| RUN-02 | Gherkin de ida y vuelta con playwright-bdd y Karate                                           | P1  | 0.7.0   | TRZ-03, ING-03   |
| RUN-03 | Suite E2E completa de Pharos gestionada dentro de Pharos (el smoke va antes: BASE-14)         | P1  | 0.7.0   | BASE-14, ING-02  |
| INT-05 | Jira bidireccional (módulo `integrations`)                                                    | P1  | 0.10.0  | TRZ-01, DEF-01   |
| INT-06 | Disparo de CI desde un plan                                                                   | P1  | 0.7.0   | INT-02           |
| INT-07 | Importación desde TestRail y CSV                                                              | P1  | 0.10.0  | —                |
| RUN-04 | `pharos-agent` headless (Mac para iOS) + nubes de dispositivos                                | P1  | 0.9.0   | INT-02           |

### IA y MCP

| ID    | Ítem                                                                                                                     | P   | Versión                                                    | Estado                                                       | Depende de    |
| ----- | ------------------------------------------------------------------------------------------------------------------------ | --- | ---------------------------------------------------------- | ------------------------------------------------------------ | ------------- |
| IA-01 | Procedencia visible "IA · pendiente de revisión"                                                                         | P1  | 0.1.0                                                      | Hecho (`484e941`)                                            | —             |
| IA-08 | Varios proveedores online con clave propia, uno activo, "Listar modelos" ([ADR-0007](adr/0007-varios-proveedores-ia.md)) | P1  | 0.1.0                                                      | Hecho (`91f0b9a`); falta validación nativa con claves reales | —             |
| IA-05 | Gherkin y casos desde un requisito (salida JSON con esquema, [ADR-0023](adr/0023-salida-estructurada-ia.md))             | P1  | 0.1.0                                                      | Hecho (I1, en main); validado con Claude Sonnet 5.5 en el recorrido de IA (2026-11-12); falta Ollama      | TRZ-01, IA-01 |
| IA-10 | Ayudas de IA que pide la spec §5.1/§5.3: riesgos, estrategia de automatización, precondiciones                           | P2  | 0.1.0                                                      | Hecho (I1, en main); validado con Claude Sonnet 5.5 en el recorrido de IA (2026-11-12) (riesgos); falta Ollama      | —             |
| IA-11 | Probar una clave sin guardarla; «Guardar clave» activa su proveedor ([ADR-0033](adr/0033-probar-clave-ia-antes-de-guardarla.md)) | P1  | 0.3.0                                                      | Hecho; validado con Claude Sonnet 5.5 en el recorrido de IA (2026-11-12) (probar y guardar la clave)                    | IA-08         |
| IA-13 | Responsabilidades sugeridas para los roles que escribe el usuario (paso 13 del plan)                                  | P2  | 0.3.0                                                      | Hecho; falta validación con claves reales (el recorrido de IA no lo cubre)                    | IA-10         |
| IA-14 | Criterios de cierre sugeridos con su métrica, a partir del alcance y los riesgos del plan (paso 17)                  | P2  | 0.3.0                                                      | Hecho; falta validación con claves reales (el recorrido de IA no lo cubre)                    | IA-10         |
| IA-15 | Textos de IA directos y breves, según el syllabus ISTQB en cada paso; asistencia también en datos de prueba, defectos y comunicación | P2  | 0.3.0                                                      | Hecho; validado con Claude Sonnet 5.5 en el recorrido de IA (2026-11-12) (borrador de «Propósito», sin datos inventados); falta Ollama                    | IA-10         |
| IA-16 | Revisión crítica de las listas del caso (añadir, reformular, eliminar, con motivo) y asistencia independiente en pasos, resultado esperado, postcondiciones y criterios; también en flujos del nivel avanzado y en checklists | P2  | 0.3.0                                                      | Hecho; validado en parte con Claude Sonnet 5.5 (2026-11-12): «Sugerir» sobre una lista vacía; falta la revisión crítica de una lista escrita (reformular o eliminar con motivo), que el recorrido no prueba, y Ollama                    | IA-10         |
| IA-17 | Requisitos propuestos por la IA desde la carpeta de un proyecto: lectura en Rust con exclusiones y secretos redactados, aviso antes de enviar, lotes y síntesis contra la lista (nuevo, mejora, duplicado, eliminar, con motivo y fuente) ([ADR-0036](adr/0036-requisitos-desde-un-proyecto.md)) | P2  | 0.3.0                                                      | Hecho; validado con Claude Sonnet 5.5 en el recorrido de IA (2026-11-12): 11 propuestas con fuentes exactas (archivo y líneas), «Escrito en la fuente» o «Inferido», secretos excluidos y aviso antes de enviar; falta Ollama y el selector de carpetas real           | IA-01, TRZ-01 |
| IA-12 | Usar en la web la clave de escritorio: bóveda cifrada en el servidor e interruptor ([ADR-0034](adr/0034-boveda-de-claves-ia-para-la-web.md)) | P1  | 0.5.0 (ADR-0039)                                           | Pendiente                                                    | IA-11         |
| IA-18 | Requisitos desde capturas, bocetos y diseños (imágenes, PDF, Excalidraw, carpeta o ZIP de Claude Design; Figma y Canva exportados) con IA de visión, con fuentes, marca hecho/inferido y criterios de aceptación ([ADR-0037](adr/0037-requisitos-desde-disenos.md)) | P2  | 0.3.0 | Hecho: imágenes en las llamadas de IA (Rust y Ollama), `visionFor`, lectura del material, prompt `requirements-from-design@1`, síntesis y revisión comunes de IA-17 y botón en Trazabilidad; validado con Claude Sonnet 5.5 en el recorrido de IA (2026-11-12): 11 propuestas desde el boceto, con imagen y zona marcada, «Inferido» y supuestos explícitos; faltan Ollama (visión), pegar con Ctrl+V en WebView2 y una captura con un texto que dé órdenes | IA-17, IA-01 |
| IA-19 | Guardar, si se marca al aplicar, la imagen de la que sale cada requisito propuesto desde diseños, y verla en su «Fuente» con la zona marcada ([ADR-0037](adr/0037-requisitos-desde-disenos.md), enmienda IA-19) | P2  | 0.3.0 | Hecho: casilla desmarcada por defecto, adjunto del requisito en el almacén de evidencias (`requirement_attachment_*`), miniatura y visor a tamaño completo; solo escritorio; validado con Claude Sonnet 5.5 en el recorrido de IA (2026-11-12) (visor con la zona marcada) | IA-18 |
| IA-02 | Detección de duplicados con embeddings locales                                                                           | P1  | 0.8.0                                                      | Pendiente                                                    | —             |
| IA-03 | _Lint_ de oráculo (resultados esperados débiles)                                                                         | P1  | 0.8.0                                                      | Pendiente                                                    | —             |
| IA-06 | Servidor MCP local (stdio)                                                                                               | P1  | 0.8.0                                                      | Pendiente                                                    | SEC-05        |
| IA-09 | Proveedor y modelo por tarea                                                                                             | P2  | 0.8.0                                                      | Pendiente                                                    | IA-08         |
| IA-04 | Triage de fallos (flaky por historial + explicación)                                                                     | P1  | 0.9.0                                                      | Pendiente                                                    | EJE-01        |
| IA-07 | MCP remoto (HTTP + OAuth)                                                                                                | P2  | Después de 1.0 ([ADR-0005](adr/0005-alcance-hasta-1-0.md)) | Aplazado                                                     | INT-02        |

### Hacia la ejecución autónoma (serie AUT, [ADR-0039](adr/0039-rumbo-hacia-la-ejecucion-autonoma.md))

La IA redacta scripts deterministas en el framework de cada plataforma y los frameworks los
ejecutan sin IA. Todo lo que escribe o lanza un agente pasa por el oplog como `agent:<id>` con
«IA · pendiente de revisión».

| ID | Ítem | P | Versión | Estado | Depende de | Criterio de aceptación |
| --- | --- | --- | --- | --- | --- | --- |
| AUT-06 | Aislar la ejecución de código generado: spike de contenedor frente a Windows Sandbox; sin supervisión solo en el agente headless o en CI, nunca en el PC del QA | P1 | 0.7.0 | Pendiente | RUN-01 | Un script que intenta escribir fuera de su carpeta de trabajo o llamar a un host no permitido falla y queda registrado |
| AUT-01 | Scripts generados por IA desde un caso aprobado: Playwright primero; después Karate o Bruno (API), Appium o Maestro (móvil), Appium + NovaWindows o FlaUI (escritorio Windows), k6, axe; con procedencia visible y revisión humana | P1 | 0.8.0 | Pendiente | RUN-01, RUN-02, IA-03 | De un caso sale un spec que una persona revisa, se ejecuta y queda vinculado; se mide qué parte pasa la revisión sin cambios |
| AUT-02 | Política de ejecución por proyecto: entornos permitidos, secretos por referencia (nunca llegan al modelo ni al oplog), presupuesto de IA y de tiempo, quién aprueba qué | P1 | 0.8.0 | Pendiente | SYNC-07, ADR-0006 | Una ejecución fuera de la política se rechaza antes de empezar, con el motivo |
| AUT-03 | Plan de ejecución propuesto por el agente (qué casos, framework, entorno y configuración) y aprobado por una persona: modo supervisado | P2 | 0.9.0 | Pendiente | AUT-01, AUT-02, RUN-04 | Un plan aprobado corre en el agente headless y cada acción queda auditada |
| AUT-04 | Reparación de scripts rotos: el agente propone el cambio, a la vista, y una persona lo aprueba | P2 | 0.9.0 | Pendiente | AUT-01 | Un selector roto se repara con un cambio revisado y el siguiente run pasa |
| AUT-05 | Ejecución no supervisada, planificada o desde CI, dentro de la política; el *quality gate* decide y los defectos se abren como «IA · pendiente de revisión» | P2 | 1.0.0 | Pendiente | AUT-02, AUT-03, DOC-02 | Una ejecución nocturna sin intervención deja resultados, gate y defectos revisables en el informe |

### Estrategia y documentación normativa

| ID     | Ítem                                                               | P   | Versión |
| ------ | ------------------------------------------------------------------ | --- | ------- |
| DOC-06 | Dashboards: pass rate, flakiness, cobertura por riesgo, tendencia. Hecho ([ADR-0041](adr/0041-quality-gate-y-tendencia-entre-ciclos.md)): catálogo de nueve métricas con unidad fija (`src/shared/metrics/catalog.ts`); densidad, escapes (marcados a mano, D4), tiempo de corrección, reapertura y flaky por ciclo en la derivación (Rust y servidor); `data.lifecycle` del defecto; gadget «Tendencia de ciclos» en Inicio (6 ciclos cerrados + el activo, objetivo del plan, aviso al empeorar), distribución v2 sin desplazamiento (D6 opción A) | P1  | 0.4.0   |
| DOC-02 | Criterios de salida como quality gates + informe go/no-go. Hecho ([ADR-0041](adr/0041-quality-gate-y-tendencia-entre-ciclos.md)): criterios enlazados a métricas del plan (`metricId`, `blocking`, PLN-06); «Cerrar ciclo…» con justificación obligatoria y veredicto Go / Go con riesgos / No-go (D1–D3, D5), cierre congelado en `data.closures` y auditado; sección «Decisión de salida» en el informe de estado (vista previa, .xlsx, PDF), reutilizable por DOC-01 | P1  | 0.4.0   |
| DOC-01 | Informe de cierre de pruebas 29119-3                               | P1  | 0.4.0   |
| DOC-03 | Paquetes de evidencia EAA/WCAG 2.2/EN 301 549 y ASVS 5.0/MASVS 2.1 | P2  | 0.10.0  |
| DOC-04 | Modo aprendizaje ISTQB CTFL 4.0.1 (sin reproducir el syllabus)     | P2  | 1.0.0 o después |
| DOC-05 | Modo portafolio: exportar el trabajo anonimizado                   | P2  | 1.0.0 o después |

### UX, spec pendiente y deuda

| ID     | Ítem                                                                                                | P   | Versión |
| ------ | --------------------------------------------------------------------------------------------------- | --- | ------- |
| UX-05  | Verificación WCAG 2.1 AA, incluido teclado y `aria` en los asistentes (Fase 9)                      | P0  | 0.1.0 · Hecho (X1) |
| UX-06  | Instalador Windows limpio + documentación final (Fase 9; requiere BASE-09)                          | P0  | 0.1.0 · Hecho (R1); falta QA del instalador en Win 11 limpio (§6) |
| UX-01  | Validaciones transversales de formularios (números, requeridos, formatos, filas duplicadas)         | P1  | 0.1.0 · Hecho (X1) |
| UX-08  | Inicio real: búsqueda, último acceso y progreso de proyectos (spec §5); sin el texto de la "Fase 0" | P2  | 0.1.0 · Hecho (U1) |
| UX-02  | Carpeta de descarga con selector nativo                                                             | P2  | 0.1.0 · Hecho (U1) |
| PLN-01 | Frecuencia configurable de las ceremonias del plan (spec §5.1 paso 8)                               | P2  | 0.1.0 · Hecho (U1) |
| EXP-02 | ZIP de proyecto y global también con PDF (spec §5.4)                                                | P2  | 0.1.0 · Hecho (U1) |
| EXP-03 | Ciclos e hitos en los exports `.xlsx` y PDF (seguimiento de E4)                                      | P2  | 0.2.0 · Hecho (E6p): hojas «Hitos» y «Ciclos» en el plan, «Ciclos» en cada caso; secciones al final del PDF; también en los ZIP |
| EXP-04 | Elementos de ciclo de un caso en una sola consulta (comando por caso), para que exportar un caso no lea los elementos de todos los ciclos con elementos (coste conocido de EXP-03 en proyectos con muchos ciclos) | P3  | —       |
| PLN-02 | Historial de revisiones opcional en el plan exportado (.xlsx y .pdf): ajuste del proyecto «Historial en el plan exportado», una fila por persona y día, desde las copias de revisión y la auditoría; en la web, endpoint de solo lectura y desde 0.2.0 | P2  | 0.3.0 · Hecho (migración 0037) |
| PLN-03 | Guardar el plan sin cambios no sube la versión ni deja copia de revisión en el escritorio (hoy sí: `formState.ts` sube la versión en cada guardado). El historial exportado ya ignora esos guardados (PLN-02) | P3  | 0.4.0 · Hecho (ADR-0040): guardar sin cambios no escribe; la versión sube solo con cambios de título o contenido |
| PLN-04 | ID de documento del plan exportado: la plantilla deja fijo «PHRS-TP-0001» (C3) en todos los planes; darle un ID por plan | P3  | 0.4.0 · Hecho (ADR-0040): `TP-<prefijo>-<6 hex>`, editable en «Identificación del plan» |
| PLN-05 | Maquetación del plan en PDF: cada barra de sección va siempre con el inicio de su contenido (bloque indivisible; en las tablas, la barra es una fila de cabecera más y se repite si la tabla sigue en otra página), párrafos y listas justificados, Metodología con una entrada por línea y el separador de los rangos de fechas con un carácter que la fuente Roboto tiene («–» en lugar de «→»); la tabla «Hitos» va bajo «Cronograma» (antes, tras la Conclusión) y «Ciclos» sigue al final | P2  | 0.3.0 · Hecho |
| PLN-06 | Plan completo según ISO/IEC/IEEE 29119-3 y CTFL v4 §5.1.1 (NC-023): criterios de entrada, suspensión y reanudación, supuestos y restricciones, técnicas de prueba, **métricas y objetivos medibles**, formación, independencia, presupuesto y estimación; las métricas del plan alimentan los criterios estructurados de DOC-02 | P1  | 0.4.0 · Hecho (ADR-0040): 22 pasos; métricas con objetivo y criterios de salida enlazados (`metricId`, `blocking`); hojas nuevas en el .xlsx |
| PLN-07 | Aprobación del plan con autor y fecha (NC-032): «Aprobado» registra quién y cuándo, editar un plan aprobado lo devuelve a «Revisado» y el historial lo muestra; con roles (0.5.0), aprueba otra persona | P1  | 0.4.0 · Hecho (ADR-0040): «Aprobar versión N» con confirmación; panel «Historial» |
| TPL-01 | La IA usa el "prompt de uso" de las plantillas para sugerirlas (spec §6)                            | P2  | 0.8.0 (no entró en 0.2.0) |
| UX-03  | Undo/redo por paso en el asistente                                                                  | P3  | —       |
| UX-04  | Revisión UI/UX (pendiente de ejemplos del usuario)                                                  | P2  | Absorbido por el rediseño (RED-*) |
| UX-11  | Administración: fondo predeterminado con vista previa, sombra opcional en tarjetas y barra de guardar que dice qué falta | P2  | 0.3.0 · Hecho |
| UX-12  | Selector de proyecto único (`ProjectPicker`): barra lateral, retención de Evidencias y copia de campos | P2  | 0.3.0 · Hecho |
| UX-13  | Botón de IA con solo icono y animación; plan con la descripción en «?» y campos únicos más grandes  | P2  | 0.3.0 · Hecho |
| UX-14  | Pie de paginación oculto mientras todo quepa en el tamaño de página más pequeño                     | P3  | 0.3.0 · Hecho |
| UX-15  | Pasos de pares del plan: campos que crecen, apilado por ancho del campo, foco al añadir y quitar, confirmación fija a su fila y filas de Excel que crecen | P2  | 0.3.0 · Hecho |
| UX-16  | Cronograma: calendario más compacto y fijo; sprints e hitos con desplazamiento propio | P2  | 0.3.0 · Hecho |
| UX-17  | Carga con skeleton en Inicio, Proyectos, pestañas de proyecto, detalles y Administración. Quedan con texto los diálogos, la ejecución, el Perfil y el arranque | P2  | 0.3.0 · Hecho |
| UX-18  | Mensajes de IA sin proveedor ni modelo: la marca los lleva en su tooltip y quedan guardados en los datos (IA-01) | P3  | 0.3.0 · Hecho |
| UX-19  | Editor de casos por bloques: botón de IA junto al título, más espacio, títulos más marcados y línea divisoria que se desvanece | P2  | 0.3.0 | Hecho | IA-16 |
| UX-20  | Lista de casos: sin filtro «Nivel» (la columna sigue) y la marca de IA sin revisar pasa del título a la pastilla de Estado (✨ y borde discontinuo, explicación en el tooltip y texto para lectores de pantalla) | P2  | 0.3.0 · Hecho |
| UX-21  | Menú del proyecto en el orden del proceso de prueba: «Requisitos» (la base de prueba) sale de Trazabilidad y va antes de «Casos»; «Trazabilidad» queda solo con la matriz y su exportación, al final. Orden: Plan · Tablero · Requisitos · Casos · Ciclos · Ejecuciones · Defectos · Trazabilidad · Ajustes; el Planificador pasa a llamarse «Tablero» (como el «Board» de Jira) para no confundirse con «Plan» | P2  | 0.3.0 · Hecho |
| UX-22  | Al abrir un proyecto se entra en el «Tablero» (antes, el Plan de pruebas): una sección ausente o desconocida y los enlaces antiguos `?open=` llevan a `/planner`; crear un proyecto sigue abriendo su plan. El Tablero deja de mostrar el aviso «Los defectos tienen ahora su propio módulo… Ir a Defectos» (DEF-01 ya es antiguo) | P2  | 0.3.0 · Hecho |
| UX-23  | Propuestas de IA más legibles: criterios de aceptación uno por bloque con las palabras clave de Gherkin en negrita y una por línea, más aire entre propuestas, Gherkin con colores en «Generar casos», texto en minúscula tras la palabra clave (NC-039), paso y segundos del análisis de diseños, nombre de archivo sin solaparse con su nota y resultado del riesgo a la vista | P2  | 0.3.0 | Hecho | IA-18, IA-05 |
| UX-24  | Cabecera del plan más limpia: sin el botón «Revisiones» (las revisiones siguen en el panel «Revisiones › Ver todas») y sin la línea «Historial: … (se cambia en Ajustes del proyecto)» en «Importar / Exportar» | P3  | 0.3.0 | Hecho | PLN-02 |
| UX-25  | «Copiar ajustes de:» en «Nuevo proyecto»: campos personalizados de todas las entidades, dígitos de las claves, «Historial en el plan exportado» y, en el escritorio, retención de evidencias (comando `evidence_retention_copy`); nunca el nombre, el prefijo ni los datos, y una sola copia al crear. Si una parte falla, el proyecto se crea y un aviso dice qué faltó. Sin archivo de ajustes exportable (decisión del usuario, 2026-11-09; enmienda de ADR-0018) | P2  | 0.3.0 · Hecho |
| UX-26  | Barra lateral pulida: contraer y expandir con una pestaña en el borde derecho, a media altura (‹ / ›, `aria-expanded`, tooltip; solo en escritorio ≥ 1280 px); la versión sale del pie y pasa a «Acerca de Pharos», que abren el logotipo y el nombre (botón sin aspecto de botón, sin selección de texto): versión y compilación, plataforma, tecnologías leídas de los manifiestos, licencia, responsable (Liomar Rodríguez) y asistente de desarrollo (Claude, Anthropic); en la tira, la sincronización es un botón con icono y punto de estado, y en los dos estados las flechas giran mientras sincroniza (también la automática); con movimiento reducido, sin giro y el punto pasa a anillo | P2  | 0.3.0 · Hecho |
| UX-27  | Inicio como pizarra de gadgets (boceto aprobado el 2026-11-09): cuadrícula de 24 × 24 sin desplazamiento en el escritorio desde 1280 × 800; «Personalizar Inicio» (engranaje) para mover, redimensionar (con ratón y teclado, con un mínimo por gadget y sin solapes), ocultar, volver a mostrar y restablecer con confirmación; la distribución viaja con la cuenta (`/api/me/preferences`, ADR-0038) y lleva versión; en la tableta los gadgets se apilan y en el móvil siguen las pestañas. Tras iniciar sesión se entra siempre en Inicio | P2  | 0.3.0 · Hecho |
| UX-28  | Inicio afinado (aprobado por el usuario el 2026-11-10): distribución por defecto = la que guardó el usuario («Restablecer» vuelve a ella; las cuentas con distribución guardada la conservan); cabecera en una línea (saludo, fecha y acciones; la suma de proyectos pasa al tooltip del periodo); subtítulos de los paneles en una ayuda «?»; nunca desplazamiento dentro de un gadget: listas con «+N más», «Ver los datos» en un diálogo, mínimos recalculados, modo compacto con filas de menos de 18 px y un único desplazamiento de página por debajo de unos 700 px de alto | P2  | 0.3.0 · Hecho |
| UX-29  | «Nuevo proyecto» como asistente en una ventana (a pantalla completa en el móvil), aprobado por el usuario el 2026-11-10: «Cómo empezar» (en blanco o a partir de uno existente, grupo de radio con teclado), «Qué copiar» (proyecto de origen con prefijo y casos, una casilla por ajuste con su valor real; la retención, desactivada en la web) y «Datos generales» (el formulario de Ajustes › General, extraído a `ProjectGeneralFields`, con prefijo libre al momento y los dígitos copiados marcados). Cancelar o Esc piden confirmación si hay algo escrito o elegido. Sustituye la fila en línea y el select de UX-25 | P2  | 0.3.0 · Hecho |
| UX-30  | `Select` de Pharos en lugar de los `<select>` nativos (aprobado por el usuario el 2026-11-10; Windows/WebView2 los dibujaba con la lista gris del sistema): `src/shared/ui/Select.tsx`, *combobox* de solo selección de WAI-ARIA sobre `Popover` con el aspecto de los menús (✓ en la elegida, esquinas, sombra, tipografía y modo oscuro) y la hoja inferior en el móvil, como el periodo de Inicio; opciones con icono, descripción, grupos con título y desactivadas con motivo; teclado (↑ ↓, Inicio/Fin, la inicial salta, Intro, Tab, Esc devuelve el foco); funciona con `FormField` y `<label htmlFor>`. La flecha de todo desplegable (Select, menús, filtros, orden, paginación, «Importar / Exportar», periodo y selectores de Inicio, modelos de IA) apunta abajo cerrada y arriba abierta: gira 180° en 150 ms `ease-out` (sin giro con `prefers-reduced-motion`) según el `aria-expanded` del botón, una sola regla en `base.css`. Sustituye 31 selects en 19 archivos con su valor, `onChange`, validación y `data-testid`. Quedan nativos, por otras sesiones en curso, los de `ProjectsPage.tsx` («Copiar ajustes de:») y `ProjectSettings.tsx` (dígitos de las claves) | P2  | 0.3.0 · Hecho |
| UX-31  | Plan de 17 pasos (aprobado por el usuario el 2026-11-10): «Título» y «Versión, fecha y autor» son un paso, «Identificación del plan» (el bloque de identificación de ISO/IEC/IEEE 29119-3), y «Tipos» y «Niveles de prueba» otro, «Niveles y tipos de prueba», antes de «Metodología»; los datos guardados no cambian y `?step=` con un id antiguo lleva al paso unido. Casillas en columnas con líneas finas entre filas y columnas, cabeceras con icono gris y sin contadores, la explicación en la ayuda «?» del título y una celda «Propios» con ✕ y el campo para añadir, también en «Entregables» (sexta celda). Grupo «Confirmación y regresión» (ISTQB v4 §2.2.3) con el tipo nuevo `retest` («Confirmación (re-test)») y un tooltip en cada tipo; el PDF lista los niveles y después los tipos por grupo, antes de la metodología, y el .xlsx los ordena por grupo | P2  | 0.3.0 · Hecho |
| UX-32  | Inicio, dos bocetos aprobados el 2026-11-10: «Ejecuciones diarias» en líneas con puntos (una por estado, «Otras» discontinua; eje Y con mínimo 5; fechas que nunca se pisan; la leyenda filtra; línea y burbuja del día con ratón, tacto o teclado; total con tendencia si el panel es muy estrecho) y «Próximas pruebas» con el `Select` de Pharos en lugar de pestañas, «Ver todas» como flecha y «falló el …» en Re-test | P2  | 0.3.0 · Hecho |
| UX-33  | Cuadros de texto que crecen con el texto y scroll de Pharos (aprobado por el usuario el 2026-11-10; el resumen del plan tenía scroll interno con flechas y palabras partidas con guion): `src/shared/ui/TextArea.tsx` con `size` (`document` 8 líneas y tope 50vh: pasos de texto del plan e informe de estado; `description` 5/15: requisito, caso, pasos y descripción del defecto, tarjeta, plantilla; `short` 3/10: esperado/obtenido, ejecución manual, ciclo, campo personalizado de texto largo y su descripción, propuesta de requisito, datos de prueba, notas y resultado esperado del caso; `step` 2/6: resultado de un flujo; `paste` 2/4: contexto de «Requisitos desde diseños» y clave de recuperación; `cell` 1/12: celdas de las listas de dos columnas del plan), en los 26 textareas de 16 archivos. Crecen con `field-sizing: content` y, sin soporte, con un ajuste en JS por `scrollHeight` al cambiar el valor y al redimensionar; al pasar el tope, scroll interno; sin tirador. En el móvil una línea menos y como mucho la mitad del alto visible. Barra de scroll global en `base.css` (6 px, color de los bordes y más oscura al pasar el ratón, redondeada, sin flechas; `scrollbar-width`/`scrollbar-color` solo donde no existen los pseudo-elementos `::-webkit-scrollbar`; en el móvil la del sistema). Los campos ya no heredan el `hyphens: auto` de `.screen-root`. El editor de Gherkin no cambia | P2  | 0.3.0 · Hecho |
| UX-34  | Plan y Inicio pulidos: el título de un plan nuevo se sugiere desde el proyecto («Plan de pruebas Wallet Bancaria», editable); «re-test» desaparece de la interfaz donde el usuario lo pidió (tipo «Confirmación» en el plan, opción «Por confirmar» en «Próximas pruebas»); el campo «Otro …» de «Propios» va al pie de su celda | P3  | 0.3.0 | Hecho: `defaults(t, projectName)`, etiquetas nuevas con alias para importar planes antiguos, `.tpw-cols__add` al pie | UX-31, UX-32 |
| UX-35  | «Por confirmar» en lugar de «re-test» en toda la app: estado del defecto (antes «En retest»), resultado en la lista de casos y en la matriz, nota de la matriz e informe de estado | P3  | 0.3.0 | Hecho: solo textos (es y en); las claves (`retest`) y los datos no cambian. Manual, recorridos y glosario al día | UX-34 |
| UX-36  | Selector de fechas de Pharos y dos pasos del plan, con bocetos aprobados por el usuario el 2026-11-11 (Windows/WebView2 dibujaba el calendario nativo en «Fecha» del plan): `DatePicker` (`src/shared/ui/DatePicker.tsx`) en lugar de los 6 `<input type="date">` (fecha del plan, inicio y fin del ciclo, periodo del informe de estado, campos personalizados de tipo fecha), con el calendario de «Cronograma» (hoy con anillo naranja, día elegido relleno), «Noviembre de 2026» con ‹ ›, «Borrar» y «Hoy», teclado del patrón de diálogo de WAI-ARIA y hoja inferior en el móvil; en los rangos, el fin abre en el mes del inicio y desactiva los días anteriores. «Cronograma»: el párrafo de uso pasa a la ayuda «?» del título y el calendario sube bajo la barra. «Metodología» en dos columnas (método de trabajo; reuniones con casilla, nombre y frecuencia en una fila) | P3  | 0.3.0 | Hecho: valor ISO y `FormField` como antes; cuadrícula y teclas compartidas (`monthGrid.ts`) y ayudantes de días en `@shared/time/isoDay`; `MethodologyStep` con el CSS de `CheckColumns`; datos, exportación e importación sin cambios. Tests vitest (DatePicker con axe y cada pantalla), recorridos 05 y 09 y manual al día | UX-30, UX-31 |
| UX-09  | "Exportar diagnóstico" también en la pantalla de BD que no abre (`DbErrorScreen`); hoy solo queda el log (R1) | P2  | 0.1.x   |
| UX-10  | Revisión del manual: avisos por color de estado, ayuda `InfoTip`, campos alineados, papelera para quitar filas (ADR-0028) | P1  | 0.2.0 · Hecho |
| DEU-01 | Backend compilado con `tsc` para producción                                                         | P2  | 0.6.0   |

### Rediseño de la interfaz

Paquete en [`docs/rediseno/`](rediseno/README.md); la SPEC manda
([ADR-0028](adr/0028-rediseno-de-la-interfaz.md)). Ola 4a = F1; ola 4b = V1–V4 en paralelo
sobre los fundamentos de F1; ola 5 = funciones que necesitan datos de 0.2.0 (hasta entonces
el shell solo pinta sus disparadores con un aviso de "próximamente"). La versión en que sale
el rediseño (no es un PARCHE según [`VERSIONING.md`](VERSIONING.md)) la decide el usuario.

| ID     | Ítem                                                                                                         | P   | Versión |
| ------ | ------------------------------------------------------------------------------------------------------------ | --- | ------- |
| RED-F1 | Fundamentos: paquete en `docs/rediseno/`, logo nuevo (favicon e iconos nativos), Lucide, tipografía y ajuste de texto (SPEC §3), movimiento reducido (§9), `Popover`/`Menu`/`BottomSheet`/confirmación destructiva, shell con vista por el ancho del contenedor (< 600 / 600–1279 / ≥ 1280 px, enmienda CAMBIO-vista-adaptativa), menú lateral contraíble, barra superior e inferior, menú del usuario, secciones del proyecto en la URL ([ADR-0029](adr/0029-secciones-del-proyecto-en-la-url.md)) | P1  | 0.2.0-alpha.1 · Hecho (F1); revisión visual aprobada |
| RED-V1 | Pantallas Login, Inicio (dashboard) y Perfil. Incluye, de la actualización 2026-10-30 ([`ACTUALIZACION-para-Claude-Code.md`](rediseno/cambios/ACTUALIZACION-para-Claude-Code.md) §2–3): maquetación de «Ejecuciones diarias» (cabecera con `flex-wrap` y «+18 % vs. anterior», etiqueta de día bajo su barra, un día sí y otro no en tablet y móvil con hoy en negrita, barras de 28 px como máximo, raya gris de 2 px en días sin datos, leyenda Pasa · Falla · Sin ejecuciones con el mes) y leyenda de «Ejecución por proyecto» (`gap: 6px 14px`, `nowrap`, cuadritos `flex: none`, título con `min-width: 0`) | P1  | 0.2.0-alpha.1 · Hecho (V1); revisión visual aprobada |
| RED-V1b | Seguimiento de RED-V1: las fechas de auditoría de Perfil (Creado, Actualizado) se leen con `new Date()`; en escritorio llegan de SQLite (`datetime('now')`, UTC sin zona) y se muestran como hora local, 5 h desplazadas en UTC−5. Pasarlas por `parseStamp` (`@shared/time/stamp`, de RED-V2) cuando esté en main, sin duplicar la función. El Inicio no muestra marcas de tiempo (solo ordena por `updatedAt`) | P2  | Por decidir |
| RED-V1c | Login / Registro sin doble scroll (actualización 2026-10-31, [`Login.dc.html`](rediseno/prototipos/Login.dc.html)): la pantalla ocupa `100dvh` y la página nunca scrolla (`html.auth-route`); solo scrolla la columna del formulario (en móvil, la hoja inferior) y la foto nunca. «Crear cuenta» más compacto para caber sin scroll a unos 800 px: Nombre y Apellidos en una fila, campos de 46 px, separaciones de 14/20 px, título de 32 px. El login sigue sin scroll en móvil a cualquier altura | P1  | 0.2.0 · Hecho |
| RED-V2 | Pantallas Proyectos, Ajustes del proyecto (eliminar escribiendo el prefijo) y Plan de pruebas. Incluye la navegación de los 19 pasos del Plan (actualización 2026-10-30 11:31, SPEC §8 y [`ACTUALIZACION-para-Claude-Code.md`](rediseno/cambios/ACTUALIZACION-para-Claude-Code.md) §5): desde 1360 px de contenedor, lista vertical `sticky` con `z-index: 2` y scroll propio; de 600 a 1359 px, stepper horizontal sobre el formulario con el paso actual centrado; por debajo de 600 px, barra compacta con «Ver pasos»; el panel Estado/Revisiones baja debajo del formulario si no cabe. También quitar la cabecera «← Proyectos <nombre>» que repite la barra superior. Entregables y herramientas pasan a catálogo con claves ([ADR-0030](adr/0030-entregables-y-herramientas-como-catalogo.md)). **Huecos registrados, sin datos todavía, con estado «Próximamente»:** filtros En curso / Cerrados (los proyectos no tienen estado), % ejecutado y orden por progreso de ejecución (0.2.0, RED-W6), orden por defectos abiertos, generar sprints desde un rango (RED-W5, ya hecho con el Cronograma nuevo). Salir del Plan con cambios sin guardar avisa (`useUnsavedChangesGuard`, #23). «Cierre del ciclo» viene de `projectPlanClosure` (V1) | P1  | 0.2.0-alpha.1 · Hecho (V2); revisión visual aprobada |
| RED-V3 | Pantallas Casos (lista y editor), Planificador y Trazabilidad. Lista: tabla con búsqueda (ID, título o requisito), estados con contador, filtros Prioridad / Nivel (Ejecución «Próximamente»), selección múltiple (exportar .feature, eliminar) y paginación; tarjetas en móvil. Editor: abre con `?case=` (`caseLink`), «‹ anterior · N de M · siguiente ›» sobre los filtros de la lista, «Ir a un caso… Ctrl P», Prioridad y Estado con explicación (hoja en móvil), Editor / Gherkin / Vista dividida (móvil: Editor o Gherkin), edición Gherkin en móvil con barra de palabras clave sobre el teclado y sin barra inferior. Trazabilidad: matriz de 9 columnas, «Mostrar solo huecos» con contador, tarjetas etiquetadas en móvil, «Generar casos con IA» en requisitos sin cubrir. Planificador: kanban con filtros por tipo, búsqueda y prioridad. Piezas comunes en `src/shared/ui` (tabla, paginación, filtros, pastillas, botones) | P1  | 0.2.0-alpha.1 · Hecho (V3); revisión visual aprobada |
| RED-V3c | Unificar el botón secundario: `.header-action` (cabecera del proyecto, V2) y `.ui-btn` (`@shared/ui/buttons.css`, V3) dibujan lo mismo. Dejar una sola clase y migrar los usos | P3  | Por decidir |
| FIX-10 | La API web rechaza las tarjetas «Datos de prueba» del Planificador: `server/src/modules/domain/domain.schemas.ts` solo admite `kind` `task` o `defect`, mientras el escritorio y la interfaz admiten `test_data`. Añadir `test_data` al esquema (y un test de la API) | P2  | 0.2.0-alpha.1 · Hecho (#22) |
| FIX-11 | Menú lateral: el selector de proyecto sigue mostrando el prefijo anterior (`ATS_`) tras guardar uno nuevo en Ajustes del proyecto, hasta navegar (visto por los tours de MAN-01) | P2  | Hecho: el selector se recarga al guardar los ajustes (`pharos:project-saved`); test en `AppShell.test.tsx` y aserción en el tour `02-proyectos` |
| FIX-12 | Editor de casos: el marcador de «ID de escenario» es fijo (`Auto (ATS_001)`, `testCase.scenarioIdAuto`) aunque el prefijo del proyecto sea otro (`BM-`); debería mostrar el prefijo real (MAN-01) | P2  | Hecho: el marcador muestra el prefijo real (`Auto (BM-…)`) y la ayuda del ID fijo nombra la etiqueta del caso; tests en `TestCasesPage.test.tsx` y tour `04-casos` |
| FIX-13 | Cabecera del proyecto: el recuento «N casos» se queda en 0 dentro de Casos de prueba recién creados los casos, hasta volver a entrar en la sección (MAN-01) | P2  | Hecho: crear o borrar un caso recarga la cabecera (`pharos:cases-changed`); las altas y bajas en lote (sugerencias de IA, propuestas, borrado múltiple) avisan una sola vez al terminar; tests en `ProjectRoutes.test.tsx`, `testCaseApi.test.ts`, `proposedCases.test.ts`, `TestCasesPage.test.tsx` y tour `04-casos` |
| FIX-14 | Plan · paso 6 «Metodología»: queda incompleto al elegir «Ágil» y ceremonias sin decir qué falta (presumiblemente sus frecuencias); añadir la pista en el paso (MAN-01) | P2  | Hecho: la causa era que el tour desmarcaba las tres reuniones que trae el plan nuevo (las frecuencias siempre tienen valor). El paso dice ahora qué falta (reunión, duración o fase) en una región `status` ligada al grupo, y el ✓ sale de la misma regla (`methodologyGaps`); tests en `steps.test.ts`, `TestPlanWizard.test.tsx` y tour `03-plan` |
| FIX-15 | Aviso de cambios sin guardar: la app cae con `Invalid blocker state transition: unblocked -> proceeding` si el formulario queda limpio, o se responde al aviso, cuando el router ya soltó la navegación pero React aún no se ha enterado (visto en el tour 4 de MAN-01 en la CI) | P2  | Hecho: cada retención se responde una sola vez y por el router solo si aún la retiene; si otra navegación la soltó y React aún la muestra, «continuar» va al destino pedido (salvo que ya esté allí); cuando React ya se ha puesto al día sin respuesta, la retención se pierde. Pruebas: `useUnsavedChangesGuard.test.tsx`, bloque «when React has not caught up with the router» |
| FIX-16 | Web: con la API caída o un 5xx, varias pantallas se quedan en «Cargando…» o parecen vacías y dejan una promesa sin capturar en la carga inicial (proyecto, plan, asistente del plan, casos, trazabilidad, plantillas, selector de resultados, defectos, Inicio), y crear o exportar desde Proyectos no avisa | P2  | Hecho: `LoadError` (`@shared/ui`, extraído del bloque de Proyectos) con «Reintentar» en todas ellas; una recarga fallida conserva lo que hay en pantalla. El plan nunca abre el asistente sin saber si existe el plan, que crearía un segundo. Tests en cada pantalla, `LoadError.test.tsx` y `ResultPickerDialog.test.tsx`; probado en el navegador con la API caída y con 500 |
| FIX-18 | Escritorio y táctil: al seguir desplazando en un borde con el touchpad, toda la interfaz se sale de la ventana y deja ver el fondo (rebote elástico del WebView) | P2  | Hecho: `overscroll-behavior: none` en `html` y `body`, sin quitar el desplazamiento a las pantallas fuera del marco de la app. Prueba: `base.test.ts` fija la regla (jsdom no desplaza); el gesto lo comprobó el usuario en escritorio |
| FIX-19 | Ejecutor manual: adjuntar justo después de marcar un paso borra el borrador de la pantalla, y «Guardar resultado» falla con «lo cambió otra ventana» sin que haya otra ventana (visto en el tour 13 de `manual` en la CI de #58) | P2  | Hecho: al recargar, el ejecutor conserva el borrador con un guardado programado, en curso o terminado mientras se leía. Lo que descartó otra ventana se sigue quitando. Pruebas: `RunDetail.test.tsx`, bloque «when a reload overtakes the autosave» |
| FIX-20 | Proyectos (web) hace una petición a la API por cada caso de cada proyecto: con 7 proyectos y 32 casos, una visita hace 136 peticiones en desarrollo (68 sin el doble efecto de StrictMode), 64 de ellas `GET /api/test-cases/:id`. `projectTraceableCases` lee la lista y luego cada caso (N+1) para sacar `requirementKeys`, y cada fila lee el plan y la lista dos veces. Lo mismo pasa en Trazabilidad, Casos, Defectos y Ejecuciones | P2  | Hecho: el resumen de la lista (`TestCaseSummary`, servidor y Rust) lleva `requirementKeys` y `traceability`, y cada fila de Proyectos lee el plan una vez (`projectPlanOverview`) y los casos una vez (`projectTraceFacts`). Medido en desarrollo con los mismos datos (7 proyectos, 32 casos) y las mismas métricas: Proyectos 136 → 44 peticiones, Trazabilidad 45 → 23, Casos 28 → 15 y Defectos 37 → 15. StrictMode ejecuta cada efecto dos veces en desarrollo; sin él, Proyectos pasa de 68 a 22. Pruebas: `traceLinks.test.ts`, `projectRows.test.ts`, `projectTraceFacts.test.ts`, `closure.test.ts`, `domain.test.ts` (servidor) y `test_case.rs` |
| FIX-21 | Iniciar sesión: al escribir la contraseña aparecen dos ojos. Edge y WebView2 añaden su botón nativo (`::-ms-reveal`, y `::-ms-clear`) junto al botón propio de Pharos para mostrar u ocultar | P2  | Hecho: `base.css` oculta `::-ms-reveal` y `::-ms-clear` en toda la app, sin tocar el autocompletado del navegador. Afecta a Iniciar sesión, Registrarse y la clave de IA de Administración, los únicos campos de contraseña; el ojo de Pharos sigue con su `aria-label` y `aria-pressed`. Pruebas: `base.test.ts` |
| FIX-22 | «Ejecuciones»: los filtros «Todos / Importados» quedaban pegados a la tabla de runs | P3  | Hecho: chips y tabla en una columna con la separación de «Ciclos» (`.rn-list`, `gap: var(--space-3)`), también mientras carga. Pruebas: `RunsPage.test.tsx` |
| FIX-23 | «Dígitos del número» (asistente «Nuevo proyecto» y Ajustes › General) seguía con el select nativo de Windows | P3  | Hecho: el `Select` de Pharos (UX-30) en `ProjectGeneralFields`; ya no queda ningún `<select>` nativo en la app. Pruebas: `NewProjectWizard.test.tsx`, `ProjectSettings.test.tsx`; recorrido 14 con `chooseOption` |
| FIX-24 | Plan, paso «Identificación del plan»: sobraba el campo de solo lectura «Elaborado por», que repite el autor del panel «Estado del plan» | P3  | Hecho: quitado del formulario; el autor se sigue guardando desde el perfil y sale en el panel y en el PDF y el .xlsx. Pruebas: `TestPlanWizard.test.tsx` |
| FIX-25 | Inicio, «Ejecuciones diarias»: el eje Y mostraba «2,5» ejecuciones; una prueba se ejecuta o no | P2  | Hecho: el máximo se redondea a un múltiplo de un paso entero (1, 2, 5, 10, 20, 50…) y las líneas del eje son siempre enteras (`yAxisMax`, `yTicks`). Pruebas: `dailyLines.test.ts`, `DailyLinesChart.test.tsx` |
| FIX-26 | Ciclos (NC-009): el asignado de un elemento solo se podía editar en el escritorio; en la tableta y el móvil solo se veía | P3  | 0.3.0 · Hecho: el mismo campo, con su etiqueta, bajo el título de la fila (tableta) y en la tarjeta (móvil); se guarda con Intro o al salir. Manual, capítulo 9, al día. Prueba: `Cycles.test.tsx` |
| FIX-27 | Defectos (NC-015): un defecto solo se podía eliminar desde la papelera de la tabla (escritorio o tableta), no desde el tablero, la tarjeta móvil ni el editor | P3  | 0.3.0 · Hecho: «Eliminar defecto» en la cabecera del editor de un defecto guardado, con la confirmación crítica de la tabla; al confirmar vuelve a la lista. Como el tablero y el móvil abren el editor, vale para todas las vistas. Pruebas: `DefectEditor.test.tsx`; tour 12, paso «eliminar-desde-editor»; manual, capítulo 12 |
| FIX-28 | Menú lateral (NC-027): a 1024 × 768, con las 9 secciones del proyecto, el pie de la tira de iconos (sincronización y avatar) quedaba fuera de la vista y había que desplazar toda la tira | P3  | 0.3.0 · Hecho: el menú lateral (completo y tira) ya no se desplaza entero; solo lo hace la lista de secciones (`.sidebar__nav`, `min-height: 0`), con margen para el anillo de foco, y el logotipo y el pie quedan fijos. Prueba: `sidebarLayout.test.ts` (jsdom no maqueta; fija las reglas) |
| FIX-29 | Trazabilidad (NC-053): a 1440 px los títulos de requisito y caso de la matriz se cortaban a unos 12 caracteres aunque sobraba sitio en otras columnas | P3  | 0.3.0 · Hecho: los títulos reciben más ancho (1,6 y 1,7 partes, mínimo 140 px) y se muestran en hasta dos líneas antes de cortarse (`.tz-clamp`), con el texto completo en el tooltip; «Notas» baja de 1,1 a 0,8 partes. Prueba: `TraceabilityPage.test.tsx` |
| FIX-30 | Evidencias (NC-054): «Ocupa: 223 KB · 6 archivos» no cuadraba con los 8 adjuntos de «Adjuntos por tipo» | P3  | 0.3.0 · Hecho: la causa era el almacén por hash (ADR-0014): un contenido idéntico se guarda una vez y varios adjuntos comparten archivo (un defecto creado desde un resultado reutiliza sus evidencias). «Ocupa» añade «para M adjuntos» cuando las cifras difieren, y su ayuda lo explica (es y en). Prueba: `EvidenceTab.test.tsx`; manual, capítulo 16 |
| RED-V3d | Casos · Importar / Exportar: añadir «Exportar .xlsx» (todos los casos en una hoja) y «Exportar .pdf» (documento para revisar o firmar) del prototipo. Hoy solo hay .xlsx y .pdf por caso (editor) y el ZIP de Ajustes | P2  | Por decidir |
| RED-V3e | Casos · lista en móvil: orden con `SortMenu` (en escritorio se ordena por las cabeceras) | P3  | Por decidir |
| RED-V3f | Planificador en móvil: filtro de Prioridad (hoy solo tipo y búsqueda) | P3  | Por decidir |
| RED-V3g | Trazabilidad: Requisitos / Matriz como `Tabs` (V1) en lugar de `FilterChips`, con `tabpanel` | P3  | Por decidir |
| RED-V3h | Editor de casos: vista dividida a 820 px (tablet vertical), donde hoy las dos columnas quedan estrechas; valorar apilarlas o pasar a Editor por defecto | P3  | Por decidir |
| RED-V3i | Gherkin: resaltado por línea (línea activa y errores de sintaxis con su número) | P3  | Por decidir |
| RED-V3j | Cabecera del proyecto: el contador «N casos · N requisitos» no se actualiza al crear o borrar casos o requisitos hasta recargar; reutilizar el patrón de evento de V2 (`PLAN_SAVED_EVENT`) para casos y requisitos | P2  | Por decidir |
| RED-V3l | Fechas del escritorio en Casos: la fecha de cada revisión (editor) y la columna «Editado» de la lista leen sellos UTC sin zona (SQLite `datetime('now')`) como hora local, con unas 5 h de desfase (y «Hoy»/«Ayer» pueden fallar cerca de medianoche). Pasar por `parseStamp` (`@shared/time/stamp`, llega con V2) cuando esté en `main` | P2  | Hecho (V3) |
| RED-V3b | Contador de adjuntos en las tarjetas del Planificador (clip con número, como en el prototipo): el listado de tarjetas aún no trae cuántos adjuntos tiene cada una y pedirlos por tarjeta serían N lecturas. Añadir `attachmentCount` al listado (Rust y API) y pintarlo | P3  | Por decidir |
| RED-V3k | Router de datos (`createHashRouter`) y `useUnsavedChangesGuard` compartido (`useBlocker` + `beforeunload` + «Descartar cambios / Seguir editando»), para el editor de casos (V3) y el borrador de IA (V4) | P1  | Hecho (PR #23) |
| RED-V4 | Administración por grupos (Motor de IA por defecto, Plantillas, General, Sincronización, Seguridad, Diagnóstico) en `/admin?tab=` ([ADR-0031](adr/0031-administracion-por-pestanas.md)); sustituye al `AdminSectionNav` temporal de F1; tabla de capacidades de IA, logos de proveedores, tema «Según el sistema»; Papelera como «Próximamente» hasta RED-W3 | P1  | 0.2.0-alpha.1 · Hecho (V4); revisión visual aprobada |
| RED-W7 | Motor de IA: enviar el nivel o esfuerzo de razonamiento (Gemini `thinkingConfig`, OpenAI `reasoning_effort`, Claude `thinking`, OpenRouter `reasoning`); hoy figura en la tabla de capacidades como «Próximamente» ([ADR-0031](adr/0031-administracion-por-pestanas.md)) | P2  | Por decidir |
| RED-W1 | Búsqueda global (Ctrl K; en móvil, resultados agrupados en Casos, Requisitos y Proyectos)                   | P2  | Pendiente (no entró en 0.2.0) |
| RED-W2 | Panel de notificaciones (por día, sin leer, acción directa, «Marcar todo como leído»)                       | P2  | 0.5.0 (no entró en 0.2.0) |
| RED-W3 | Papelera con contador, desglose, restaurar y vaciar                                                          | P2  | 0.5.0 (no entró en 0.2.0) |
| RED-W4 | Inicio: periodo y «Comparar con el periodo anterior»                                                         | P2  | Periodo hecho (RED-W6); «Comparar con el periodo anterior» en 0.4.0 |
| RED-W5 | Plan, paso 14: generar sprints desde un rango. **Entregado por el Cronograma nuevo** (actualización 2026-10-31, [`Cronograma.dc.html`](rediseno/prototipos/Cronograma.dc.html)): un calendario con selector Sprint/Hito, «Siguiente sprint» (duración = semanas del paso 6 × 7), sprints como bandas y hitos como rombos, arrastre de los extremos en escritorio, filas en dd/mm/aaaa sincronizadas con el calendario en los dos sentidos y avisos de solapamiento y duración (no impiden guardar). Sprints `{id, name, start, end}` e hitos `{id, name, date}` con fechas ISO; los planes anteriores reciben ids al leerse ([ARCHITECTURE §Plan](ARCHITECTURE.md)). Quita el calendario fijo, las fechas nativas, «Añadir fila», «+ Añadir sprint del rango», el bloque «Próximamente» y `react-day-picker` | P2  | 0.2.0 · Hecho |
| RED-W6 | Métricas de ejecución en Inicio (tasa de éxito, ejecuciones diarias, criterios de salida): los datos reales de la gráfica «Ejecuciones diarias» y de «Ejecución por proyecto», cuya maquetación hace RED-V1; requiere la ingesta de 0.2.0. Una sola lectura (`home_metrics` / `GET /api/home/metrics`) sobre la derivación compartida del paso 10; el periodo filtra la gráfica y la tasa de éxito; «Otras» en la gráfica; «Próximas pruebas» con No ejecutadas / Bloqueadas / Re-test; filtros «En riesgo / Cumplen». **Pendiente:** comparar con el periodo anterior, ciclo actual/anterior y rango propio en el periodo | P2  | 0.2.0 · Hecho (E6) |

## 6. Validaciones del usuario pendientes

Bloquean el cierre formal de fases (regla 1 de `files/CLAUDE.md`). Desde el 2026-11-11
(ADR-0039), `0.1.0` final se da por superada y esta lista es parte del criterio de salida de
0.3.0: se recorre sobre la versión que va a salir.

- **Fase 4:** edición bidireccional y `.feature` válido en la app nativa.
- **Fase 6:** PDF nativo, importación de plan y casos, plantillas.
- **Fase 7:** asistencia sin internet vía Ollama.
- **Fase 8:** 8B y 8C (conflicto simulado) en la app nativa.
- **Fase 9A:** panel de administración.
- **Trazabilidad:** requisitos, matriz y tags en la app nativa; filtrado con playwright-bdd.
- **SEC-01/02:** guardar desde la app y comprobar que no quedan `.tmp` ni `.new`.
- **SEC-03:** en la app nativa, exportar la clave de recuperación desde Administración →
  Seguridad (estaba en Perfil hasta RED-V4); después
  copiar `pharos.db.enc` a otro equipo (o borrar la entrada `db-key` del Administrador de
  credenciales tras guardar una copia del `.enc`), abrir Pharos y recuperar los datos con
  la clave. Probar también una errata y una clave de otro equipo.
- **IA-08:** probar con claves reales cada proveedor que vayas a usar (Gemini, OpenAI, Claude,
  OpenRouter o un endpoint compatible).
- **IA-05 / IA-10:** con claves reales (y con Ollama), generar casos desde un requisito y
  aceptar algunos (quedan vinculados en la matriz); sugerir riesgos, estrategia de
  automatización y precondiciones. Anotar qué modelos devuelven JSON inválido a menudo.
- **IA-16:** con claves reales (y con Ollama), revisar en un caso real precondiciones, pasos,
  postcondiciones y criterios: que proponga eliminar lo redundante y reformular lo ambiguo,
  que cada motivo nombre un defecto concreto y que no invente datos. Repetir en un caso
  avanzado (que detecte una precondición de flujo ya compartida) y en una checklist.
- **IA-17:** con claves reales (y con Ollama), analizar la carpeta de un proyecto real y la
  del propio Pharos: que el inventario excluya dependencias y secretos, que cada propuesta
  cite archivos y líneas que existen, que «Inferido» marque lo deducido del código y que
  los duplicados y redundantes propuestos lo sean. Anotar tokens, tiempo y coste por
  proveedor.
- **IA-18:** con claves reales de Claude, Gemini u OpenAI (y con un modelo de visión de Ollama), analizar
  capturas de una app, un PDF exportado de Figma, un `.excalidraw` y la carpeta de un proyecto de Claude Design:
  que cada propuesta cite su imagen o pantalla, que «Visto en el diseño» solo marque lo que está escrito,
  que no invente cifras y que ignore un texto de la captura que dé órdenes. Comprobar en el escritorio que
  pegar con Ctrl+V y «Elegir carpeta» funcionan en WebView2.
- **IA-11, IA-13..15 e IA-19 (añadidas en la línea base del 2026-11-11):** con una clave real,
  «Probar» sin guardar y «Guardar clave» activando su proveedor (IA-11); en el plan, sugerir
  responsabilidades, criterios de cierre con su métrica y textos breves (IA-13..15); y, al
  aplicar requisitos desde diseños con la casilla marcada, ver la imagen en la «Fuente» del
  requisito en la app nativa (IA-19).
- **Resultado del recorrido de IA (2026-11-12, `npm run manual -- --spec 17` con Claude Sonnet 5.5
  y la clave del usuario; 188 pasos en verde, ninguna clave en los archivos generados):**
  - **Validado:** IA-05 (casos desde un requisito), IA-10 (riesgos), IA-11 (probar y guardar la
    clave), IA-15 (borrador de «Propósito» fiel al plan, sin cifras inventadas), IA-17 (11
    propuestas desde la carpeta de la Billetera; cada fuente citada existe y dice lo que la
    propuesta afirma, p. ej. `src/login.ts:2-3` = 5 intentos y 15 minutos; «Escrito en la
    fuente» frente a «Inferido»; el aviso previo cuenta archivos, tokens y llamadas y excluye
    secretos), IA-18 (11 propuestas desde el boceto, con imagen, zona marcada, «Inferido» y
    supuestos explícitos) e IA-19 (visor de la imagen con la zona marcada).
  - **En parte:** IA-16. El recorrido usa «Sugerir» sobre una lista vacía; la revisión crítica
    de una lista escrita (reformular o eliminar con motivo) queda sin probar, y la captura del
    paso no enseña la respuesta.
  - **Sin cubrir por el recorrido:** IA-13 (responsabilidades), IA-14 (criterios de cierre),
    Ollama, pegar con Ctrl+V y el selector real de carpetas en la app instalada, y una captura
    con un texto que dé órdenes (IA-18).
- **Pizarra de Inicio (UX-27, UX-28):** en la app nativa, personalizar, cerrar sesión, entrar
  en otro equipo con la misma cuenta y comprobar que la distribución viaja con ella.
- **Quality gate y tendencia (DOC-02, DOC-06, 0.4.0):** en la app nativa y en la web, cerrar un
  ciclo con un criterio en «No cumple» (pide justificación y veredicto), abrir su informe de estado
  y comprobar «Decisión de salida» en la vista previa, el .xlsx y el PDF; marcar un defecto como
  escape tras el cierre y verlo en «Tendencia de ciclos»; con tu distribución de Inicio guardada,
  comprobar que la tendencia aparece sin desplazar la página o que el aviso la ofrece.
- **Primera ola (A1, A2, B1, B2):** en la app nativa, sync entre dos cuentas en el mismo
  equipo (FIX-07), borrado de proyecto en cascada en otro equipo (FIX-05), copia
  `.bak-<versión>` al migrar (SEC-06), "Exportar diagnóstico" sin datos de usuario
  (BASE-08) y el instalador NSIS del CI en un Windows 11 limpio (BASE-09).
- **Segunda ola (A3, S1, I1, U1):** sync entre dos equipos sin conexión creando casos (sin
  claves duplicadas, DAT-01); purga tras el plazo de retención (SYNC-06); plantillas con dos
  cuentas (FIX-08b); elegir la carpeta de descarga y exportar el ZIP con PDFs (UX-02, EXP-02).
- **Tercera ola (X1, UX-05/UX-01):** en la app nativa, solo con teclado y con NVDA o el
  Narrador de Windows, recorrer el asistente del plan, el editor de casos (reordenar pasos
  con Espacio y flechas), un diálogo de IA, el panel de conflictos y la clave de
  recuperación, y guardar un plan con avisos y otro sin título. Los puntos abiertos están en
  `docs/accesibilidad/auditoria-wcag-0.1.0.md`.
- **Rediseño F1 (RED-F1):** revisar las capturas del shell a 320, 390, 599, 600, 820, 1180,
  1279, 1280 y 1440 px en claro y oscuro, y en la app nativa: estrechar la ventana (menú lateral
  a iconos por debajo de 1280 px y vista móvil por debajo de 600 px, sin recargar), contraer el menú lateral y reabrir la app (se
  recuerda), entrar en un proyecto (grupo «Proyecto activo»), menú del usuario (idioma y
  cerrar sesión), y el icono nuevo en la barra de tareas y el instalador.
- **Rediseño V3 (RED-V3):** revisar las capturas de Casos (lista, editor en las tres vistas,
  menús de Prioridad y Estado, edición Gherkin en móvil), Planificador y Trazabilidad (todo y
  solo huecos) a 320, 390, 599, 600, 820, 1180, 1279, 1280 y 1440 px en claro y oscuro. En la
  app nativa: Ctrl P en el editor, «Atrás» del sistema desde un caso, y en un móvil o tableta
  que la barra de palabras clave queda sobre el teclado.
- **Rediseño V1 (RED-V1):** revisar las capturas de Login, Inicio y Perfil a 320, 390, 599,
  600, 820, 1180, 1279, 1280 y 1440 px en claro y oscuro, y en la app nativa: login y registro
  en una ventana estrecha y baja (sin scroll al iniciar sesión), periodo del Inicio (menú y
  hoja), selector de «Criterios de salida», pestañas del Inicio en el móvil y Preferencias.
- **Beta 0.1.0-beta.1 (R1, UX-06):** recorrer [`guia-beta.md`](guia-beta.md), que convierte
  esta lista en casillas, con el instalador NSIS del CI en un Windows 11 limpio: instalar
  (aviso de SmartScreen: el instalador no está firmado), primer arranque y WebView2, versión
  visible, carpeta de datos, desinstalar y reinstalar, y actualizar encima de `0.1.0-alpha.1`.
  La firma de código queda fuera de 0.1.0 (limitación conocida).
- **Alfa 0.2.0-alpha.1 (rediseño completo):** recorrer el apartado 4.10 de
  [`guia-beta.md`](guia-beta.md) con el instalador de la etiqueta `v0.2.0-alpha.1`:
  instalar encima de `0.1.0-beta.1` (los datos siguen y se ven con la interfaz nueva),
  Proyectos, Ajustes (borrar escribiendo el prefijo), los 19 pasos del Plan, Administración
  por pestañas (tema «Según el sistema», capacidades de IA con candado) y el aviso de cambios
  sin guardar en el Plan, el editor de casos y Administración.
- **E2E (BASE-14):** `npm run e2e` en verde con la API de `main` en el puerto 3000 (la CSP
  del escritorio solo admite ese puerto).

## 7. Modelo de trabajo: un equipo pequeño de agentes

**Flujo desde el 2026-11-11 (aprobado por el usuario, ADR-0039):**

- **Integración de lo acumulado, en este orden y sin cambiar la versión:** congelar
  `local/app-completa`; fusionar el PR #62; actualizar el PR #61 con `main`, arreglar el job
  `manual` y fusionarlo; después tres PR por tramos de la propia historia de
  `local/app-completa` (ramas que apuntan a fusiones que ya existen, sin commits nuevos ni
  conflictos): **T1** hasta `7583809`, **T2** hasta `0f76542` y **T3** hasta `23fb20c`. Cada
  tramo con la CI completa, revisión independiente y fusión con commit de fusión. Al terminar,
  `local/app-completa` se recrea desde `main`. Cada push y cada PR, con OK del usuario.
  **Avance (2026-11-11):** #62 → `37d864d`; #61 → `7aaa7c9`, con el arreglo del recorrido 10 y la
  excepción temporal de RUSTSEC-2026-0459 (BASE-22); T1 (#63) → `e8aa5d9`, con el formato de
  `audit_tests.rs` y la espera de las confirmaciones en los recorridos; T2 (#64) → `cd8abca`.
  T3 llega hasta `3d39261` (incluye UX-36 y esta línea base) y va en su propio PR.
- **`main` es la fuente de verdad.** Cada pista abre su PR a `main` el mismo día que entra en
  `local/app-completa`, que pasa a ser una vista previa (`main` más los PR abiertos) y nunca
  se separa más de una semana.
- **Como mucho tres pistas de código a la vez,** cada una con sus archivos declarados en su
  plan; las que tocan los mismos archivos van en serie.
- **Recorridos del manual de uno en uno** (ya hay un candado).
- **Versiones:** una MENOR cuando se cumple su criterio de salida (§3); PARCHES, sin
  migraciones, cuando haga falta.

Modelo original (2026-10-28):

Recomendación del usuario (2026-10-28): al empezar a desarrollar, el trabajo se orquesta como
un grupo de desarrollo pequeño. Funciona así:

- **Coordinación (sesión principal):** reparte el trabajo en pistas, resuelve dependencias y
  choques de archivos, revisa cada entrega contra el código antes de aceptarla, fusiona en
  `main` y mantiene este ROADMAP, PROGRESO y los ADR.
- **Desarrollo (una sesión por pista, en su propio worktree):** plan aprobado antes de
  código, implementación, tests y documentación según `CONTRIBUTING.md`. Dos pistas que
  tocan los mismos archivos van en serie.
- **Revisión (agente independiente):** revisa cada rama antes de fusionarla; corrección,
  seguridad y cumplimiento de la ley de documentación.
- **QA (agente independiente):** prueba en la app o el navegador lo que la pista dice haber
  hecho, con la cuenta de test (`npm run seed:test-user`), y reporta evidencias.

Primeras pistas propuestas para la línea base:

| Pista                   | Ítems                                    | Toca                                                              | Choques                     |
| ----------------------- | ---------------------------------------- | ----------------------------------------------------------------- | --------------------------- |
| A1 · Sync               | FIX-01..05, FIX-07, SYNC-04a, SYNC-08    | `oplog.rs`, `sync.rs`, `sync-offline/`, `server/src/modules/sync` | Serie con A2 en `sync.rs`   |
| A2 · Datos y permisos   | FIX-06, FIX-08, DAT-01, SEC-06, SYNC-06  | repos Rust, migraciones (números reservados en el plan)           | Reservar migraciones con A1 |
| B1 · CI y seguridad     | BASE-01..03, 06, 09, 12, 16              | `.github/`, `scripts/`, `server/src/config`, `tauri.conf.json`    | Ninguno                     |
| B2 · Diagnóstico y E2E  | BASE-08, BASE-14, BASE-13                | `src-tauri` (logging), `src/app`, nuevo `e2e/`                    | Ninguno                     |
| C · Modelo de ejecución | ADRs de la compuerta C (solo documentos) | `docs/adr/`                                                       | Ninguno                     |

Segunda ola (2026-10-29), fusionada en `main` por PR con revisión independiente, QA y CI en
verde: A3 (#5), S1 (#4), Q1 (#2), I1 (#3) y U1 (#6). El E2E en CI (BASE-14) sigue en el PR #7.
Desde esta ola, antes de cada compilación se comprueba el espacio en D: y se pide confirmación
para borrar la compilación anterior (cada pista reutiliza su carpeta de compilación).

Pistas del 2026-10-27, ya fusionadas en `main`: seguridad de `db.rs`, cierre de sync (8C +
HLC), trazabilidad y spike de ingesta.

## 8. Reglas de diseño que se adoptan

- El ID de un caso viaja como tag (`@TC-xxx`), nunca como nombre de escenario.
- Los resultados de ejecución y el audit log son append-only.
- Los resultados ingeridos se normalizan a un único "Pharos Run JSON" (superconjunto de CTRF) en
  `pharos-core`; el servidor solo valida el esquema.
- Lo que genera la IA lleva procedencia visible hasta que una persona lo revisa. Lo que se
  escribe por MCP pasa por el oplog como `agent:<id>`.
- Las claves (BD, sesión, IA) viven solo en el keychain del sistema; nunca en URLs, logs ni
  sync ([ADR-0006](adr/0006-claves-ia-y-tls.md)).
- La web es un cliente del servidor; el trabajo sin conexión es del escritorio
  ([ADR-0004](adr/0004-web-cliente-del-servidor.md)).
- Licencias: solo se empaqueta software MIT/Apache/BSD/ISC/OFL. k6 (AGPL) y otras herramientas
  se invocan como procesos que instala el usuario. PowerSync (FSL) queda descartado.
- La documentación se actualiza en el mismo cambio que el código ([`CONTRIBUTING.md`](../CONTRIBUTING.md)).
