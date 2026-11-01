---
section: Añadido
---

- **Ciclos de prueba.** Cada proyecto tiene la sección «Ciclos»: qué casos se ejecutan, en qué configuraciones, contra qué build y entorno y entre qué fechas, con su clave `CYC-001` y su estado (planificado, activo, cerrado). Los casos se añaden uno a uno o por filtro (etiquetas, requisitos, prioridad, estado y riesgo mínimo), con su asignado; un caso no aprobado se añade con aviso. «Clonar» repite un ciclo para la siguiente regresión.
- **Ejecutar un ciclo** (app de escritorio) crea un run por configuración con la revisión actual de cada caso. El ciclo muestra, para cada caso y configuración, el último resultado de sus runs y un resumen de progreso. Borrar un ciclo conserva sus runs.
- **Configuraciones.** En Ajustes del proyecto, «Configuraciones» define dónde se ejecuta (navegador, sistema, dispositivo e idioma) y las etiquetas con las que una importación la reconoce. Se archivan en lugar de borrarse. Si dos equipos crean sin conexión la misma etiqueta, la tarjeta lo avisa en las dos.
- Ciclos y configuraciones se sincronizan entre equipos y con la web. «Exportar diagnóstico» dice cuántos esperan a enviarse porque el servidor aún no está actualizado.
