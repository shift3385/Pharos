# ADR-0039 · Rumbo hacia la ejecución autónoma y nuevos hitos hasta 1.0

- **Estado:** Aceptado (el usuario aprobó la propuesta de la línea base del
  2026-11-11 y la declaró rectora del proyecto). Enmienda los números de versión
  de [ADR-0002](0002-conflictos-por-entidad.md) y
  [ADR-0003](0003-workspaces-compartidos.md); el resto de esas decisiones sigue
  vigente. La replanificación del 2026-10-26 y la línea base del 2026-10-28
  (ADR-0001…0009) quedan como documentación inicial.
- **Contexto:**
  - Desde `0.2.0` se hizo mucho trabajo de diseño asistido por IA y de
    experiencia de uso (ROADMAP §2.1), marcado como `0.3.0`. Pero ningún ítem
    del hito 0.3.0 previsto (núcleo y equipo) se había empezado. Lo hecho trae
    funcionalidad nueva y migraciones, así que no podía salir como PARCHE.
  - Las métricas no bloquean ni avisan, los criterios de salida se reconocen
    por texto libre y no hay tendencia entre ciclos.
  - El usuario fijó la cúspide del proyecto: que Pharos, según lo que se quiere
    probar y su descripción, diseñe las pruebas y las ejecute de forma
    autónoma, supervisada o no, recogiendo datos y métricas de todo.
- **Decisión:**
  1. **La ejecución autónoma es el eje hasta 1.0**, sin que Pharos tenga un
     motor propio: la IA redacta scripts deterministas en el framework de cada
     plataforma y esos frameworks los ejecutan sin IA, como procesos externos
     (runner local, agente headless o CI). Un agente que maneja la app en
     directo aporta evidencia, no el resultado oficial.
  2. **Se llega por cinco escalones con hito medible:** importar (0.6.0),
     ejecutar con una orden (0.7.0), scripts generados por IA (0.8.0), agente
     supervisado (0.9.0) y autonomía con políticas (1.0.0). Serie nueva
     AUT-01…AUT-06 en el ROADMAP.
  3. **Hitos nuevos:** 0.3.0 Diseño asistido y experiencia (lo hecho);
     0.4.0 Estrategia medible; 0.5.0 Equipo; 0.6.0 Núcleo y automatización
     conectada; 0.7.0 Ejecutar con una orden; 0.8.0 Scripts generados por IA;
     0.9.0 Agente supervisado; 0.10.0 Campo y ecosistema; 1.0.0 Autonomía con
     políticas. El detalle y los criterios de salida están en ROADMAP §3.
  4. **Antes de cualquier agente,** las métricas y los *quality gates* (0.4.0)
     y los roles (0.5.0): sin ellos un agente no sabe si una ejecución pasa ni
     quién puede aprobarla.
  5. **Sin supervisión solo se ejecuta en el agente headless o en CI,** nunca
     en el PC del QA. En local, siempre con aprobación y aislado; cómo aislarlo
     (contenedor o Windows Sandbox) se decide con un spike en 0.7.0 (AUT-06).
  6. **La app móvil de ejecución manual va después del agente (0.10.0):** la
     automatización móvil (Appium, Maestro) corre desde el escritorio, el
     agente o la nube. Se mantiene la regla de ADR-0003: equipo antes que
     móvil.
  7. **`0.1.0` final se da por superada.** Sus validaciones nativas pasan a la
     lista de salida de 0.3.0.
  8. **Integración y flujo:** lo que estaba en `local/app-completa` entra en
     `main` por PR (#62, #61 y tres tramos de su propia historia); después
     `main` vuelve a ser la fuente de verdad y `local/app-completa` una vista
     previa que nunca se separa más de una semana (ROADMAP §7).
- **Alternativas:**
  - Mantener 0.3.0 como «Núcleo y equipo» y dejar lo hecho sin publicar hasta
    terminarlo: meses de trabajo fuera de una versión.
  - Equipo antes que métricas: lo que decía la línea base anterior; se descartó
    porque hoy Pharos lo usa una persona y las métricas son locales.
  - «Campo» (móvil y exploratorio) en 0.7.0, retrasando un número el runner y
    los scripts generados: se descartó por la visión del usuario.
  - Un agente que ejecuta las pruebas con un modelo en tiempo de ejecución: más
    caro y menos fiable (Thoughtworks lo mantiene en «Assess»).
- **Consecuencias:**
  - ADR-0002: la fusión por campo (SYNC-02) pasa de 0.5.0 a **0.6.0**, con la
    API y el CLI; hasta entonces, conflictos por entidad.
  - ADR-0003: los workspaces compartidos (TEN-01, SYNC-07) pasan de 0.3.0 a
    **0.5.0**.
  - ADR-0005 sigue vigente (sin SaaS ni MCP remoto antes de 1.0); Allure entra
    en 0.6.0, como ya preveía.
  - Riesgos que se gestionan en la serie AUT: ejecutar código generado,
    credenciales de los entornos (nunca llegan al modelo ni al oplog,
    ADR-0006), coste de IA, fiabilidad, inyección de instrucciones desde la app
    probada, licencias de los frameworks (Pharos no los empaqueta; k6 es AGPL)
    y plataformas (Windows primero; iOS solo con un agente Mac o una nube).
  - `VERSIONING.md` §2 registra la nueva correspondencia de hitos.
