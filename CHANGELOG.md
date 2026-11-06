# Changelog

Todos los cambios relevantes de Pharos se documentan aquí.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
el proyecto usa [Semantic Versioning](https://semver.org/lang/es/). Las reglas
están en [`docs/VERSIONING.md`](docs/VERSIONING.md). Desde el 2026-10-30 los cambios
nuevos se escriben como fragmentos en [`changes/`](changes/README.md) y se pasan aquí al
publicar cada versión ([ADR-0032](docs/adr/0032-fragmentos-del-changelog.md)).

## [Sin publicar]

## [0.2.0] - 2026-11-05

### Añadido

- **Registro de auditoría.** Cada cambio en proyectos, planes, casos, requisitos, tareas del planificador y plantillas queda registrado en un registro que no se puede modificar, con quién lo hizo y qué cambió. Se sincroniza con el servidor. Su vista en Administración llegará más adelante.
- **«Exportar diagnóstico»** incluye ahora cuántos eventos de auditoría esperan a enviarse y cuántos rechazó el servidor (solo los recuentos, nunca su contenido).
- **Auditoría de la web.** Lo que se edita en la web también queda en el registro de auditoría: quién lo hizo, cuándo y qué cambió. Los equipos de escritorio lo reciben al sincronizar y pueden comprobar que nadie lo ha alterado.
- **Ciclos de prueba.** Cada proyecto tiene la sección «Ciclos»: qué casos se ejecutan, en qué configuraciones, contra qué build y entorno y entre qué fechas, con su clave `CYC-001` y su estado (planificado, activo, cerrado). Los casos se añaden uno a uno o por filtro (etiquetas, requisitos, prioridad, estado y riesgo mínimo), con su asignado; un caso no aprobado se añade con aviso. «Clonar» repite un ciclo para la siguiente regresión.
- **Ejecutar un ciclo** (app de escritorio) crea un run por configuración con la revisión actual de cada caso. El ciclo muestra, para cada caso y configuración, el último resultado de sus runs y un resumen de progreso. Borrar un ciclo conserva sus runs.
- **Configuraciones.** En Ajustes del proyecto, «Configuraciones» define dónde se ejecuta (navegador, sistema, dispositivo e idioma) y las etiquetas con las que una importación la reconoce. Se archivan en lugar de borrarse. Si dos equipos crean sin conexión la misma etiqueta, la tarjeta lo avisa en las dos.
- Ciclos y configuraciones se sincronizan entre equipos y con la web. «Exportar diagnóstico» dice cuántos esperan a enviarse porque el servidor aún no está actualizado.
- **Importar un informe en un ciclo.** «Importar informe» → «Run nuevo» permite elegir el ciclo del run: sus resultados cuentan en el progreso del ciclo sin editar nada después. Los ciclos cerrados no aparecen; si un ciclo se cierra mientras importas, Pharos lo dice y no importa nada.
- **Administración → Evidencias** (solo en escritorio): cuánto ocupan los adjuntos cifrados, por tipo, cuántos caducaron y la retención de los informes importados.
- **«Verificar evidencias»** comprueba que cada adjunto está y se descifra, y lista los archivos que ninguna fila conoce, los que faltan y los dañados, con dónde se usan. Nunca borra ni repara nada por sí sola: los archivos sin registro se borran solo si los eliges y confirmas (nunca los creados o modificados en las últimas 24 horas ni, en Windows, los que otro programa tiene abiertos, ni nada si otra ventana de Pharos ha cambiado la base de datos en disco), y un adjunto que falta o está dañado se repara volviendo a adjuntar el mismo archivo. La verificación se puede cancelar, y lo que marca como «falta» o «dañado» se sigue viendo tras reiniciar.
- **Retención por proyecto** en Administración → Evidencias (solo en escritorio): para cada tipo de evidencia de un proyecto eliges cuánto se conserva antes de que caduque su archivo: el valor por defecto, «Siempre» o un número de días. Nada se guarda hasta pulsar «Guardar», y acortar un plazo pide confirmación con cuántos archivos caducarían. Es un ajuste de este equipo: no se sincroniza.
- **Valores por defecto:** trazas y vídeos, 30 días; registros e informes en bruto, 90 días; capturas y otras evidencias, nunca.
- **Cambio de comportamiento:** hasta ahora no caducaba ninguna evidencia de un resultado. Desde esta versión caduca la de los resultados importados, salvo tres excepciones que nunca caducan: la del intento final fallido o bloqueado de cada test, la de un resultado vinculado a un defecto abierto y la de la ejecución manual. Por tanto también caduca la evidencia de los intentos que no son el final (reintentos), de los omitidos y de los de estado «otro». Caducar borra el archivo de este equipo, nunca el resultado.
- **Periodo de gracia al actualizar:** la evidencia de resultados que ya existía cuenta su edad desde el primer arranque de esta versión, así que nada de lo que ya tenías caduca antes de que pase un plazo completo (por ejemplo, 30 días para las trazas).
- **Módulo «Defectos».** Cada proyecto tiene su sección Defectos, con una lista (filtros por estado y severidad, búsqueda) y un tablero por estado. Un defecto tiene clave `DEF-001`, **severidad** (impacto: crítica, mayor, menor, trivial) aparte de la prioridad (urgencia), pasos para reproducir, resultado esperado y obtenido, build y entorno donde se encontró, la build que lo corrige, a quién está asignado y una clave o enlace externo. Se vincula a casos de prueba, requisitos y resultados de ejecución, y guarda evidencias cifradas en el equipo.
- **Ciclo de vida fijo**: Nuevo → Abierto → En curso → Corregido → En retest → Cerrado. Desde En retest vuelve a Abierto si el arreglo falla; Nuevo y Abierto pueden pasar a Rechazado o Aplazado, y Cerrado, Rechazado y Aplazado se reabren. Cerrar o rechazar pide la resolución (corregido, duplicado, no reproducible, no se corregirá, funciona según el diseño). En el tablero, arrastrar a una columna que el ciclo no admite muestra un aviso.
- **«Desde un resultado»** (app de escritorio): crea el defecto a partir de un intento fallido con los pasos de la revisión ejecutada, lo obtenido, la build y el entorno del run, lo vincula al resultado y a su caso, y le añade las evidencias del resultado sin copiar los archivos.
- **Ejecución manual paso a paso** (app de escritorio). En «Ejecuciones», «Nuevo run manual» crea un run con los casos elegidos, y cada run tiene su pantalla: entorno, build, configuración, ciclo, estado, progreso y sus casos. Se ejecuta cada caso sobre la revisión que el run congeló, paso a paso: pasa, falla, bloqueado u omitido, lo obtenido en cada paso, notas y cronómetro. Un caso con Outline o con flujos se ejecuta fila a fila y flujo a flujo.
- **Borrador local.** Lo marcado se guarda mientras trabajas y sigue ahí si cierras la app; nada se sincroniza hasta «Guardar resultado», que deja un intento inmutable. Volver a ejecutar crea otro intento; el último es el final.
- **Evidencias por paso y por resultado:** archivos, imágenes pegadas con Ctrl+V y capturas (con la herramienta del sistema y pegar), cifradas en este equipo. Aún no se sincronizan (SYNC-04b).
- **«Crear defecto»** desde un paso o un intento fallido, relleno con el caso, el paso, lo obtenido, el build y el entorno, y con las mismas evidencias.
- **Cerrar y reabrir un run.** El run de un ciclo se abre desde su pestaña Runs, y el progreso del ciclo cuenta cada flujo y fila ejecutados.
- **Pensado para el teclado:** P/F/B/S marcan el paso, J/K mueven, Ctrl+Enter guarda; «?» muestra todos los atajos.
- **Matriz con resultados.** En «Trazabilidad → Matriz», cada caso muestra su último resultado final, venga de un run manual o de un informe importado (por ejemplo, de Playwright): el estado, la clave del run con enlace y la fecha, y los avisos «Flaky», «Desactualizado» (se ejecutó una revisión anterior del caso) y «Re-test» (falló y su defecto ya está corregido). Los defectos llevan su severidad.
- **Filtros y orden por riesgo en la matriz.** Los resultados se filtran por ciclo, configuración, build y entorno, y los filtros quedan en la dirección de la página. Por defecto, los requisitos de más riesgo van primero; también se puede ordenar por ID.
- **Riesgo del requisito.** El formulario del requisito pide la probabilidad y el impacto, de 1 a 5. Su producto es el nivel de riesgo (bajo hasta 4, medio hasta 12, alto por encima), en escritorio y en la web.
- **La matriz en Excel trae una hoja «Resultados»** con el último resultado de cada caso: run, fecha, configuración, origen, flaky, desactualizado y defectos con su severidad. La hoja «Matriz» sigue siendo la de la plantilla.
- **Informe de estado (ISO/IEC/IEEE 29119-3).** En «Ejecuciones» y en cada ciclo, «Informe de estado» resume el proyecto, un ciclo o el plan en un periodo: progreso, resultados por estado, defectos por severidad y estado (a fecha de hoy), cobertura y riesgos, los criterios de salida del plan (cumple / no cumple) y los bloqueos. El resumen se rellena con las cifras y se puede cambiar; con las recomendaciones, se guarda solo en ese equipo. Se exporta a Excel y a PDF en la carpeta de descargas.
- **Ejecución manual en la web.** La versión web ya crea runs («Nuevo run manual»), añade casos, ejecuta paso a paso con los mismos atajos de teclado, guarda intentos, cierra y reabre runs, y «Ejecutar» un ciclo crea un run por configuración, como en el escritorio. Lo que se guarda en la web se ve igual en el escritorio y al revés.
- **El borrador de la web se queda en ese navegador:** sigue ahí si cierras la pestaña, pero no se ve en otro navegador ni en otro equipo. Guardar dos veces el mismo intento (o desde dos pestañas) deja uno solo.
- **«Crear defecto»** desde un intento fallido también en la web, relleno con el caso, el paso, lo obtenido, el build y el entorno. Los adjuntos solo están disponibles en el escritorio: en la web no se adjuntan ni se pegan capturas (llegan con SYNC-04b), e importar informes y la bandeja «Sin vincular» siguen en la app de escritorio.
- **Cancelar un run en otro lado** (la web u otro equipo) descarta, al sincronizar, los borradores que ese run tenía en el escritorio y sus adjuntos.
- **Eliminar un run** desde su pantalla. Antes, el diálogo dice lo que se oculta (elementos, resultados, importaciones, evidencias, borradores que se descartan, el ciclo cuyo progreso deja de contarlo y los defectos vinculados). El run desaparece de las listas y del progreso, también en los equipos que sincronizan. Sus resultados nunca se borran a mano: la purga se los lleva con el run pasada la retención de Administración. Un run de un ciclo cerrado no se puede eliminar.
- **Hitos y ciclos en las exportaciones.** El `.xlsx` del plan trae dos hojas nuevas: «Hitos» (los del Cronograma) y «Ciclos» (los del proyecto, con fechas, hito, sprint, configuraciones y el mismo progreso que muestra la pantalla de Ciclos). El `.xlsx` de cada caso trae la hoja «Ciclos» con los ciclos en los que está, su alcance y su asignado. Los PDF terminan con las mismas tablas, y los ZIP del proyecto y global las llevan. Las hojas de siempre no cambian y se pueden seguir importando.
- **Campos personalizados por proyecto.** En Ajustes del proyecto, «Campos personalizados» crea campos propios para los casos (texto, número, fecha, sí/no, selección, selección múltiple, usuario, URL), con orden, obligatoriedad, valor por defecto y a qué tipo de caso aplican. Se archivan en lugar de borrarse, y sus valores se conservan. «Copiar de otro proyecto» trae los campos de otro proyecto. Se sincronizan entre equipos y con la web.
- **Tipo de caso y estado de automatización.** Cada caso puede ser «Estándar» o «Checklist» (una lista de comprobaciones, sin Gherkin) y estar «Manual», «Por automatizar» o «Automatizado». La lista de casos muestra la automatización y filtra por tipo, automatización y campos de selección o sí/no. Los casos que ya tenías quedan como estándar y manual, sin cambiar sus revisiones.
- **Exportación.** El `.xlsx` de un caso con tipo, automatización o campos añade la hoja «Campos personalizados», que la importación vuelve a leer; la plantilla no cambia y un caso sin estos datos se exporta igual que antes. El `.feature` no cambia, y la exportación en lote deja fuera las checklists (lo indica el aviso).
- **«Exportar diagnóstico»** dice cuántos campos esperan a enviarse porque el servidor aún no está actualizado.
- **Campos personalizados de defectos.** En Ajustes del proyecto, «Campos personalizados» tiene ahora el selector «Casos / Defectos»: los campos que crees para defectos aparecen en el editor de defectos y se sincronizan entre equipos y con la web. «Copiar de otro proyecto» copia los campos de la entidad elegida.
- **Importar resultados de pruebas automáticas.** La nueva sección **Ejecuciones** de cada proyecto importa informes de Cucumber Messages, CTRF, JUnit XML, el JSON de Playwright y Pharos Run JSON. Cada test se vincula a su caso por la etiqueta del caso (`@TC-001`), a la versión del caso vigente al ejecutarse. Una vista previa dice qué se va a vincular antes de guardar nada. Importar el mismo archivo en el mismo run no duplica nada, y los informes de varios shards pueden ir al mismo run.
- **Bandeja «Sin vincular».** Los tests sin etiqueta de caso (o con una que no existe en el proyecto) quedan en una bandeja y se pueden vincular a un caso a mano; sus resultados no cambian.
- **Evidencias de los informes.** El archivo importado y sus capturas, vídeos y trazas (incluidos en el informe o en la carpeta que elijas) se guardan cifrados como evidencias.
- **Manual de usuario** en `docs/manual/`: quince capítulos en español (acceso, proyectos, plan, casos, trazabilidad, planificador, ciclos, ejecuciones, defectos, administración, IA, móvil, ejecución manual, evidencias y qué hacer si algo sale mal), paso a paso y con capturas de la aplicación real, también en PDF con portada, índice y números de página, que acompaña al instalador de cada versión. Se regenera con `npm run manual` cada vez que la aplicación cambia, y el CI de `main` avisa si el manual guardado quedó desfasado.
- **Pruebas guiadas de cada pantalla**: cada paso del manual es también una prueba automática del binario de escritorio, con su propio servidor y su propia base de datos, sin tocar los datos de quien prueba.
- **Cronograma nuevo en el paso 14 del plan.** Un solo calendario donde eliges «Sprint» o «Hito»: haz clic en el día de inicio y en el de fin para crear un sprint, o en un día para añadir un hito. Los sprints se ven como bandas y los hitos como rombos; en escritorio puedes arrastrar los extremos de un sprint seleccionado.
- **«Siguiente sprint»** añade el sprint que sigue al último, con la duración del paso 6 (semanas de sprint × 7).
- Debajo, cada sprint e hito es una fila editable con fechas **dd/mm/aaaa** que se sincronizan con el calendario en los dos sentidos. Se avisa si dos sprints se solapan, si un sprint no dura lo que dice la Metodología (planes ágiles) o si falta una fecha; son avisos: el plan se guarda igualmente.
- El calendario se maneja con el teclado (flechas, Inicio/Fin, RePág/AvPág, Intro, Esc) y cada día dice al lector de pantalla qué sprint o hito tiene.
- Sustituye al calendario fijo, a las fechas de cada fila, a «Añadir fila», a «+ Añadir sprint del rango» y al aviso «Próximamente». Los planes que ya tenías se abren igual, con sus sprints e hitos.
- **Inicio con datos de ejecución.** Las cifras salen de los runs: «Pruebas pendientes» cuenta los casos sin ejecutar y los bloqueados, «Tasa de éxito» es la del periodo elegido y «Defectos abiertos» avisa de los críticos.
- **«Ejecución por proyecto»** muestra el último resultado de cada caso en una barra (pasa, falla, bloqueado, otros y sin ejecutar), con ejecutados / total y el porcentaje.
- **«Ejecuciones diarias»** dibuja cada día lo registrado, manual o importado, apilado en Pasa, Falla y Otras; al pasar el ratón ves el detalle del día, y el lector de pantalla lo recibe como tabla.
- **El periodo filtra de verdad** la gráfica y la tasa de éxito (hoy, 7, 14 o 30 días, este mes) sin volver a cargar; el resto del Inicio es el estado actual.
- **«Criterios de salida»** dice si cada criterio del plan se cumple (Cumple, No cumple o Sin datos), con el anillo del porcentaje ejecutado; sin plan, usa los tres criterios por defecto. El selector filtra «En riesgo» y «Cumplen».
- **«Próximas pruebas»** separa No ejecutadas, Bloqueadas y Re-test (fallaron y su defecto ya está corregido), con su recuento.
- Si las ejecuciones no se pueden cargar, cada tarjeta lo dice con «Reintentar» y el resto del Inicio sigue visible.

### Cambiado

- **Cada paso de un caso tiene identidad propia.** Al editar, reordenar, insertar o borrar pasos (también en el Gherkin), cada paso conserva su identidad, y cada guardado deja una revisión del caso que no cambia y se sincroniza. Es la base para que los resultados de una ejecución apunten siempre al paso y a la versión que se ejecutaron. Tus casos se convierten solos al actualizar, sin perder nada, y los `.feature` y `.xlsx` exportados no cambian.
- **«Exportar diagnóstico»** dice cuántos casos esperan a enviarse porque el servidor aún no está actualizado.
- **Adjuntos del planificador de hasta 200 MB** (antes, 10 MB). Ahora se guardan cifrados en la carpeta `evidence` junto a la base de datos, en lugar de dentro de ella: guardar ya no se hace más lento con cada adjunto, y la actualización a esta versión reduce el tamaño de `pharos.db.enc`. Añadir, descargar y borrar funcionan igual.
- **La copia de seguridad completa son `pharos.db.enc` y la carpeta `evidence`.** Para llevar los datos a otro equipo hay que copiar las dos; sin `evidence`, los adjuntos indican que no están en este equipo.
- Los adjuntos de tarjetas que ya no existían (no se veían en la app) no se trasladan; siguen en la copia `pharos.db.enc.bak-…` que se guarda antes de actualizar.
- **«Exportar diagnóstico»** incluye cuántas evidencias hay por estado y cuántos archivos de `evidence` no reconoce la base de datos (solo recuentos; nunca nombres ni contenido).
- **Los defectos salen del planificador.** Al actualizar, cada tarjeta «Defecto» pasa al módulo Defectos con la misma clave, título, prioridad, casos vinculados y adjuntos; su columna se convierte en estado (Backlog → Nuevo, En progreso → En curso, En revisión → En retest, Hecho → Cerrado como corregido) y su severidad queda en «Mayor». El planificador queda para tareas y datos de prueba, y avisa de dónde están ahora los defectos.
- **Trazabilidad e Inicio cuentan los defectos nuevos.** Un defecto está abierto si no está Cerrado ni Rechazado (un defecto Aplazado sigue abierto), y «críticos» en Inicio son los de severidad crítica, no los de prioridad crítica.
- **Sincronización:** una versión anterior de Pharos ya no puede crear ni cambiar defectos en un servidor actualizado; en solo lectura conserva la copia del planificador que tenía hasta que se actualiza.
- **Servidor de sincronización: la migración `0010` reconstruye el índice de claves de `documents`** (para incluir las claves `DEF-` de los defectos, conservando las `CYC-` de `0009`) sin `CONCURRENTLY` y, en la misma transacción, convierte una a una las tarjetas «Defecto» guardadas en defectos. Mientras dura (unos segundos por cada mil tarjetas de defecto), las escrituras de sincronización esperan; en un servidor con muchos documentos, conviene aplicar la actualización en un momento de poco uso. La `0009` (ciclos) se aplica antes que la `0010`.
- **Servidor de sincronización: la migración `0008` reconstruye el índice de claves de `documents`** (para incluir las claves `RUN-` de los runs) sin `CONCURRENTLY`. Mientras dura, las escrituras de sincronización esperan; en un servidor con muchos documentos, conviene aplicar la actualización en un momento de poco uso.
- **Manual de usuario más claro y fácil de recorrer**:
  - **El índice del PDF:** cada capítulo y cada paso es un enlace a su página, con su número de página.
  - **El maquetado:**
    - un paso ya no se separa de su captura;
    - «Consejos» no se parte entre dos páginas;
    - casi desaparecen las páginas medio vacías (el manual pasa de 139 a 115 páginas).
  - **Lo que muestran las capturas:**
    - cuando un paso trata de un control concreto, la captura lo rodea en ámbar y el PDF añade al lado un «Detalle» ampliado;
    - los cambios de estado se ven antes y después (por ejemplo, la contraseña oculta y en claro).
  - **Los textos:**
    - explican para qué sirve cada paso, no solo qué pulsar;
    - presentan los datos de prueba como ejemplos;
    - coinciden con la interfaz actual.
- **Pruebas guiadas más estables**: esperan a que cada campo, lista o aviso aparezca, en lugar de dar fallos ocasionales en equipos lentos. Además, dos ejecuciones ya no pueden pisarse en el mismo equipo: la segunda no arranca mientras la primera siga en marcha.
- **Las notificaciones se distinguen por su color e icono.** Éxito en verde con ✓ en un círculo, error en rojo con ✕ en un círculo, aviso en ámbar con un triángulo e información en azul con una «i». Antes el éxito usaba el naranja de la marca y se confundía con los errores. Los avisos dentro de las pantallas (por ejemplo, «Defecto desde un resultado» o el aviso de la IA) usan los mismos colores e iconos.
- **Ayuda con [?] en lugar de párrafos sobre los campos.** Junto a la etiqueta de un campo con una explicación secundaria aparece un botón [?]: la ayuda se ve al pasar el ratón, al llegar con el tabulador o al tocarlo, sigue a su campo si la página se desplaza y se cierra con Esc o tocando fuera. Empieza por la «Clave» de «Nuevo campo personalizado»: el formato va en el [?] y «No se puede cambiar después» sigue a la vista bajo el campo.
- **Campos alineados.** Las pistas cortas de un campo van ahora debajo del control, así los campos que están uno al lado del otro (por ejemplo «Clave» y «Tipo») quedan a la misma altura.
- **Quitar una fila es una papelera.** En las listas con «+ Añadir» (Alcance y demás pasos del plan), sprints e hitos, flujos, filas y columnas de ejemplos, adjuntos y entregables propios, el botón para quitar es una papelera llamada «Quitar: …», y sigue pidiendo confirmación si la fila tiene texto. El icono X queda solo para cerrar y para quitar una etiqueta.

### Corregido

- **Menú lateral:** al guardar un prefijo nuevo en «Ajustes del proyecto», el selector de proyecto lo muestra al momento, sin tener que cambiar de sección.
- **Editor de casos:** el campo «ID de escenario» de un caso nuevo muestra el prefijo real del proyecto (por ejemplo, `Auto (BM-…)`) en lugar de `ATS_001`. La ayuda de un caso guardado nombra su propia etiqueta (`@BM-001`).
- **Cabecera del proyecto:** el recuento «N casos» se actualiza en cuanto creas o borras un caso, sin salir de «Casos de prueba».
- **Plan · paso 6 «Metodología»:** si al paso le falta algo para darse por completo, lo dice debajo de los campos («Elige al menos una reunión del equipo…», o una fase en la metodología tradicional), y los lectores de pantalla lo anuncian.
- **La app ya no se cae al salir de un formulario justo cuando termina de guardarse.** Si se pulsaba un enlace mientras un guardado acababa, o se respondía al aviso de cambios sin guardar en ese mismo instante, a veces aparecía la pantalla de error en lugar de la sección pedida. Ahora la navegación sigue su curso con normalidad; «Descartar cambios» y «Seguir editando» funcionan igual que antes.
- **«Crear cuenta» ya no muestra dos barras de desplazamiento.** La pantalla de entrada ocupa exactamente la ventana: solo se desplaza la columna del formulario (en el móvil, la hoja inferior) y la foto queda fija. El formulario de registro es más compacto (Nombre y Apellidos en una fila) y cabe sin desplazarse en pantallas de unos 800 px de alto.
- **«Mi perfil» ya no pierde lo que escribes mientras carga.** El formulario queda desactivado, con «Cargando…», hasta que el perfil se ha leído; antes, lo escrito en ese momento se sobrescribía y un nombre vacío impedía guardar sin avisar. Si el perfil no se puede leer, el formulario se abre con los datos de la sesión.

### Cambios incompatibles

- **Las versiones anteriores de Pharos quedan en solo lectura.** En cuanto el servidor se actualiza, las apps 0.1.x y 0.2.0-alpha.1 pueden leer, pero no enviar cambios hasta que se actualicen. Muestran: «Actualiza Pharos para enviar cambios; tus cambios pendientes se conservan». Mientras tengan un cambio pendiente tampoco reciben novedades; al actualizar se envía todo.

## [0.2.0-alpha.1] - 2026-10-30

Primera alfa de 0.2.0: el rediseño completo de la interfaz (ola 4) sobre todo lo de
`0.1.0-beta.1`. La ejecución de pruebas llega más adelante en 0.2.0.

### Añadido

- **Base para avisar de cambios sin guardar (RED-V3k):** un mecanismo común que el editor de
  casos (V3) y el borrador de IA (V4) usarán para preguntar «Descartar cambios» o «Seguir
  editando» antes de salir con un enlace, el menú lateral, las pastillas de sección, el
  «Atrás» del sistema o del móvil, o cerrando la ventana. Un fallo en el marco de la app
  sigue mostrando la pantalla de error de Pharos con «Exportar diagnóstico».
- **Rediseño, fundamentos (RED-F1, [ADR-0028](docs/adr/0028-rediseno-de-la-interfaz.md)):**
  - El paquete del rediseño está en [`docs/rediseno/`](docs/rediseno/README.md). Su `SPEC.md`
    manda.
  - Navegación nueva:
    - Menú lateral de 248 px que se contrae a una franja de iconos de 84 px. Pharos recuerda la
      elección.
    - Barra superior con migas, búsqueda (Ctrl K), notificaciones y cambio rápido de tema.
    - En el móvil, barra superior navy y barra inferior (Inicio, Proyectos, Admin, Perfil).
    - Menú del usuario con Mi perfil, Administración, Idioma y Cerrar sesión.
  - La vista se elige por el ancho de la ventana de la app: por debajo de 600 px, móvil; de 600
    a 1279 px, franja de iconos; desde 1280 px, menú lateral. Al estrechar la ventana cambia sin
    recargar (enmienda «vista adaptativa» del diseño, 2026-10-30).
  - La búsqueda y las notificaciones avisan de que llegan en una próxima versión.
  - El estado de sincronización está al pie del menú lateral, sobre el usuario. En la franja de
    iconos es solo un punto, que sincroniza al pulsarlo.
  - Cada sección del proyecto tiene su propia dirección (`#/projects/<id>/<sección>`,
    [ADR-0029](docs/adr/0029-secciones-del-proyecto-en-la-url.md)). «Atrás» y recargar
    conservan el proyecto y la sección.
  - Dentro de un proyecto, el grupo «Proyecto activo» cambia de proyecto y de sección.
  - Desplegables comunes: se cierran con clic fuera, scroll fuera o Escape, se recolocan
    para no salirse de la pantalla y se recorren con las flechas. En el móvil son hojas
    desde abajo.
  - Confirmación destructiva que solo se cierra con «Cancelar» y puede pedir escribir un
    texto.
  - Iconos de línea (Lucide), escala tipográfica con partición de palabras por sílabas,
    sin partir correos, rutas ni IDs, y respeto de «reducir movimiento».
- **Rediseño de Casos, Planificador y Trazabilidad (RED-V3):**
  - **Casos · lista:** tabla con búsqueda por ID, título o requisito, estados con contador,
    filtros de Prioridad y Nivel, selección múltiple (exportar .feature o eliminar con
    confirmación) y paginación. En el móvil, tarjetas y un solo panel de filtros. La columna
    Ejecución dice «No ejecutado» y su filtro llega con la ingesta de ejecuciones.
  - **Casos · editor:** cada caso tiene su dirección (`?case=`), así que «Atrás» vuelve a la
    lista. «‹ anterior · 142 de 240 · siguiente ›» recorre la lista con sus filtros, «Ir a un
    caso…» (Ctrl P) busca cualquiera, y salir con cambios sin guardar pregunta antes.
    Prioridad y Estado explican cada opción. Vistas Editor, Gherkin y Vista dividida (en el
    móvil, Editor o Gherkin). En el móvil, el Gherkin se lee con desplazamiento lateral y se
    edita a pantalla completa con una barra de palabras clave sobre el teclado; la barra
    inferior se oculta mientras.
  - **Trazabilidad:** indicadores, matriz de 9 columnas con los requisitos sin cubrir en rojo
    y «Generar casos con IA» en ellos, «Mostrar solo huecos» con contador, tarjetas
    etiquetadas en el móvil, paginación por requisito y huecos de la cadena con la migración
    del texto libre. Menú Importar / Exportar (requisitos .csv, matriz .xlsx).
  - **Planificador:** filtros por tipo con contador, búsqueda y prioridad; tarjetas con icono
    y color de tipo, clave del defecto, etiquetas, bandera de prioridad y casos vinculados.
  - Eliminar casos, requisitos o tarjetas pide confirmación y solo se cancela con «Cancelar».
- **Administración rediseñada (RED-V4, [ADR-0031](docs/adr/0031-administracion-por-pestanas.md)):**
  - Una sola pantalla con pestañas agrupadas: Recursos (Motor de IA, abierta por defecto, y
    Plantillas) · Aplicación (General) · Cuenta y datos (Sincronización, Seguridad) · Soporte
    (Diagnóstico). Cada pestaña tiene su dirección (`#/admin?tab=…`) y aparece en las migas.
  - **Motor de IA:** proveedores con su logo; clave, modelo y parámetros según el modelo.
    Lo que el modelo no admite queda bloqueado con un candado y explica por qué. En
    «Compatible» eliges si se envía la temperatura. El nivel o esfuerzo de razonamiento
    aparece como «Próximamente». «Probar conexión» dice cuánto tardó la respuesta.
  - **General:** tema **«Según el sistema»** además de Claro y Oscuro, e idioma.
  - **Sincronización:** estado, cuenta, conflictos y «Sincronizar ahora» en un solo sitio.
  - **Seguridad:** la clave de recuperación, que sale de Perfil.
  - **Papelera:** aparece en General como «Próximamente» (llega con RED-W3).
  - **Plantillas:** planes y casos por separado, con buscador y un menú «Más acciones» por
    plantilla.
- **Rediseño, piezas de tabla comunes (RED-V3, para Casos, Trazabilidad y Proyectos):** tabla
  con selección múltiple, orden por columna y tarjetas en el móvil; paginación con «Por
  página»; filtros rápidos con contador; menús de filtro con varias opciones; pastillas de
  estado y banderas de prioridad con los colores del diseño; opciones de menú con una línea
  que explica cada una.
- **Rediseño, controles comunes (RED-V1a, para Inicio, Perfil, Casos y Administración):**
  interruptor, selector segmentado (una opción entre pocas, con flechas) y pestañas, en
  formato de pastillas o subrayadas, con burbujas de contador y pestañas deshabilitadas que
  explican el motivo.
- **Rediseño de Login, Inicio y Perfil (RED-V1):**
  - **Login:** foto del faro con el lema y tres puntos de la marca junto al formulario; en el
    móvil, la foto arriba y el formulario debajo, sin scroll al iniciar sesión.
    «Regístrate» bajo el título, mostrar u ocultar la contraseña, «Continuar con Google»
    deshabilitado («Próximamente») y el idioma al pie.
  - **Inicio:** indicadores que llevan a su sitio (proyectos abiertos, pruebas pendientes,
    defectos abiertos del Planificador), periodo de los datos, «Ejecución por proyecto»,
    «Criterios de salida» del plan con selector de proyecto (búsqueda y orden por cierre),
    «Ejecuciones diarias» y «Próximas pruebas» por prioridad, que abren el caso. En el móvil,
    tres pestañas (Resumen, Ejecución, Pruebas); el periodo se elige también en «Ejecución»,
    junto a la gráfica a la que afecta. Lo que depende de ejecuciones (tasa de
    éxito, ejecuciones por día, si se cumple cada criterio, comparar periodos) lo dice en
    lugar de mostrar cifras hasta 0.2.0.
  - **Perfil:** tarjeta con tus datos y estado de sincronización, Preferencias (idioma y
    tema). La clave de recuperación pasa a Administración → Seguridad (RED-V4).

### Cambiado

- **Motor de IA:** proveedor, modelo, parámetros, Ollama y la clave escrita se guardan con
  «Guardar», en una barra fija al pie de la pestaña. Antes cada cambio se aplicaba al momento.
  Cambiar de pestaña o de proveedor, o salir de Administración, con cambios sin guardar pide
  confirmación.
- **General:** «Guardar ajustes» está en una barra al pie que cubre las dos secciones y solo se
  activa si hay cambios.
- **IA:** Claude y los modelos de razonamiento de OpenAI ya no reciben una temperatura que no
  admiten. «Compatible» solo la envía si activas «Enviar»; si ya la usabas, sigue enviándose.
- `#/templates` y `#/ai` abren la pestaña correspondiente de Administración.
- Eliminar una plantilla y descartar los cambios web sin enviar usan la confirmación
  destructiva: solo se cierran con «Cancelar».

- **Logo nuevo:** un faro con anillo abierto y haces de luz. Tiene versión compacta para
  tamaños pequeños y cambia también en el favicon y en los iconos de la app y del
  instalador.
- **Plantillas y Motor de IA** pasan a Administración. Ya no están en el menú lateral.
- **Cerrar sesión e Idioma** pasan al menú del usuario. El idioma ya no está en la barra
  superior.
- La pestaña de ajustes del proyecto se llama «Ajustes del proyecto».
- **Proyectos (RED-V2):** «Recientes» con los 4 últimos que abriste y «Todos los proyectos» en
  una tabla con búsqueda por nombre o prefijo, orden (último acceso, nombre, última
  modificación, cobertura de requisitos…) con dirección, y páginas de 12, 24 o 48. En el móvil
  cada proyecto es una fila de dos líneas. Eliminar pasa a Ajustes del proyecto; el menú «⋯»
  de cada fila abre el proyecto, sus ajustes o lo exporta en ZIP. El % ejecutado, los filtros En curso / Cerrados y los órdenes sin
  datos aparecen como «Próximamente».
- **Ajustes del proyecto (RED-V2):** nombre, prefijo y dígitos con una vista previa de la
  numeración, «Exportar proyecto (ZIP)» y «Eliminar proyecto». Para eliminar hay que escribir el
  prefijo (o el nombre, si no hay prefijo). El diálogo dice cuántos planes, casos, requisitos y
  tarjetas se pierden, y solo se cierra con «Cancelar».
- **Plan de pruebas (RED-V2):**
  - Arriba, «Paso N de 19 · Guardado · hace N min», y abajo un pie fijo en una línea
    («Siguiente: …» o «Finalizar plan»).
  - Los pasos se ven según el ancho: una lista vertical a la izquierda desde 1360 px, una tira
    de pasos con el actual centrado desde 600 px, y una barra con «Ver pasos» en el móvil.
  - «Estado del plan» y las últimas revisiones van junto al formulario, o debajo si no caben.
  - «Revisiones», «Importar / Exportar» (un solo menú) y «Guardar» están en la cabecera.
    Guardar ya no vuelve al paso 1. Salir del plan con cambios sin guardar pregunta antes.
  - Paso 8: los entregables de ISO/IEC/IEEE 29119-3 por grupos, más los propios. Paso 10: las
    10 herramientas más usadas, «Más herramientas (65)» con buscador y un campo libre. Paso 14:
    «Generar sprints a partir de un rango», todavía «Próximamente». Paso 19: «Antes de
    terminar» con los pasos que faltan. El paso 1 permite cambiar el estado del plan.
  - Los entregables y las herramientas se guardan como claves, y se exportan en el idioma de
    la exportación. Los planes anteriores se leen sin migración
    ([ADR-0030](docs/adr/0030-entregables-y-herramientas-como-catalogo.md)).
- El Inicio ya no lista los proyectos con buscador: están en Proyectos, y el Inicio
  enlaza a cada uno desde «Ejecución por proyecto».
- **Cabecera del proyecto (RED-V2):** cada sección del proyecto empieza con una cabecera con
  el prefijo, el nombre, el estado del plan y el número de casos y requisitos. Sustituye a la
  barra «← Proyectos <nombre>», que repetía la barra superior del móvil.

### Corregido

- **Web:** el servidor ya acepta tarjetas del planificador de tipo «Datos de prueba»
  (`test_data`). Antes solo admitía tarea y defecto, así que en la web no se podían crear ni
  editar.
- **Fechas de guardado:** «Guardado · hace N min», «Actualizado» y las revisiones del plan se
  mostraban con la hora UTC como si fuera local (cinco horas de diferencia en América). Las
  fechas guardadas sin zona se leen ahora como UTC.

## [0.1.0-beta.1] - 2026-10-29

Primera beta de 0.1.0. Cierra las compuertas A y B de la línea base y todo el
contenido del hito; falta la validación nativa (guía:
[`docs/guia-beta.md`](docs/guia-beta.md)).

- **Primera ola:** sincronización corregida (varias cuentas en un equipo,
  borrado en cascada, sincronizaciones grandes), copia antes de migrar y
  protección contra datos más nuevos (SEC-06), versión de la app en cada sync
  (SYNC-08), integración continua, smoke E2E y diagnóstico exportable.
- **Segunda ola:** claves únicas entre equipos y purga de lo borrado (DAT-01,
  SYNC-06), clave de recuperación (SEC-03), casos desde un requisito y más
  ayudas de IA (IA-05, IA-10), Inicio real, carpeta de descarga y PDF en los
  ZIP.
- **Tercera ola:** accesibilidad WCAG 2.1 AA y validación común de
  formularios (UX-05, UX-01), la web como cliente puro del servidor y
  contratos generados (BASE-10, BASE-05), dependencias sin avisos de
  seguridad y el E2E obligatorio para fusionar.
- **Documentación final (UX-06):** README al día y guía de la beta.

Conocido: el instalador NSIS no está firmado (SmartScreen avisa al
instalar) y la app instalada necesita la API en `localhost:3000` del mismo
equipo.

### Añadido

- **La web trabaja contra el servidor (BASE-10, ADR-0004):** la versión web ya
  no guarda proyectos, planes, casos, requisitos ni tarjetas en el navegador:
  lee y escribe en el servidor, que aplica las mismas reglas que la app de
  escritorio (numeración de IDs, IDs que no se reutilizan, posiciones del
  planificador). Lo que haces en la web llega a tus equipos en la siguiente
  sincronización, y al revés. Si otro equipo cambió un elemento mientras lo
  editabas, al guardar un aviso lo dice y tu edición sigue en el formulario;
  guardar de nuevo reemplaza esa versión. Un ID ya usado se rechaza al guardar,
  con un aviso. En la web puedes cambiar tu nombre en el perfil (el rol no).
  Por ahora los adjuntos, tus propias plantillas y el historial de revisiones
  solo están en la app de escritorio; la web muestra las plantillas de PHAROS.
  La primera vez que sincronizas en la web con esta versión, los cambios que
  una versión anterior dejó sin enviar se envían. Lo que el servidor no acepta,
  y los adjuntos, plantillas e historial que solo estaban en el navegador, se
  guardan aparte: un aviso arriba ofrece "Descargar" (`pharos-web-unsent-<fecha>.json`)
  y solo se borran cuando confirmas que guardaste el archivo o decides
  descartarlos. Cada cuenta recibe solo lo suyo. Si un elemento se eliminó en
  otro sitio mientras lo editabas, al guardar un aviso lo dice.
- **Contratos generados (BASE-05, ADR-0026):** los tipos que la app de
  escritorio intercambia con la interfaz y con el servidor se generan desde
  Rust, y la CI falla si dejan de coincidir. Al comprobarlos, un caso abierto
  en la app de escritorio ahora incluye su proyecto (`projectId`), como ya
  hacía la sincronización.
- **Accesibilidad WCAG 2.1 AA (UX-05):** Pharos se usa entero con el teclado.
  - Un enlace "Saltar al contenido" es la primera parada del tabulador.
  - Todos los diálogos reciben el foco al abrirse, no lo dejan escapar con
    Tab, se cierran con Escape (salvo mientras guardan, durante una
    exportación o con la clave de recuperación en pantalla) y devuelven el
    foco al botón que los abrió.
  - En el asistente del plan, el paso actual se anuncia y al cambiar de paso
    el foco va a su título.
  - Los pasos de un caso se reordenan con el teclado: Espacio en el asa,
    flechas y Espacio; cada movimiento se anuncia. Las tarjetas del
    planificador igual, con su asa ⠿: las flechas izquierda y derecha las
    cambian de columna.
  - Al cerrar un diálogo, el foco vuelve al botón que lo abrió; si ese botón
    ya no existe (por ejemplo, tras borrar un proyecto), va al contenido.
  - El selector de idioma dice el idioma actual ("ES, Idioma") y se cierra
    con Escape.
  - Cada fila de las listas y tablas (alcance, roles, sprints, hitos, riesgos,
    pasos, ejemplos) y cada botón ✕ dicen a qué fila pertenecen.
  - El editor Gherkin explica cómo salir de él con el teclado: Escape y
    después Tab.
- **Validaciones comunes en los formularios (UX-01):** todos los formularios
  avisan igual, junto al campo y con el lector de pantalla.
  - Guardar ya no se queda deshabilitado sin explicación. Si falta algo
    imprescindible (el título del plan o del caso, el nombre de la plantilla,
    una clave de requisito válida y única, los dígitos del ID de caso entre 1
    y 8, o los días de retención entre 1 y 3650), un resumen dice qué es y
    lleva a cada campo.
  - Lo demás es un aviso y no impide guardar el borrador: fechas de sprint al
    revés o solapadas, y filas, columnas o ejemplos repetidos (los pasos se
    pueden repetir sin aviso). El
    mensaje de "guardado" dice cuántos avisos quedan por revisar.

- **Inicio real (UX-08):** la pantalla de inicio ya no muestra el texto de la
  "Fase 0". Ofrece "Iniciar nuevo proyecto de pruebas" y "Continuar proyecto
  existente", y lista tus proyectos con búsqueda por nombre (sin distinguir
  mayúsculas ni tildes), último acceso en este equipo, estado del plan y
  progreso (casos aprobados sobre los que no están obsoletos).
- **Carpeta de descarga (UX-02):** en Administración → Ajustes eliges con el
  selector de carpetas de Windows dónde se guardan todas las exportaciones y el
  diagnóstico; "Usar Descargas" vuelve a la carpeta de Descargas. Un archivo
  nunca se sobrescribe (se añade " (2)") y el aviso muestra la ruta completa.
  Si la carpeta no existe o no se puede escribir en ella, el archivo va a
  Descargas y un aviso lo dice; si no se puede guardar, un aviso de error
  explica por qué. Los adjuntos del planificador se guardan marcados como
  descargados de Internet, para que Windows avise antes de abrirlos.
- **PDF en los ZIP (EXP-02):** el ZIP de un proyecto y el de "exportar todo"
  incluyen ahora el plan y cada caso también en `.pdf`, junto al `.xlsx`. Si
  un PDF no se puede generar, el ZIP se guarda sin él y un aviso dice cuál
  falta.
- **Frecuencia de las reuniones del equipo (PLN-01):** en el paso Metodología
  del asistente del plan, cada ceremonia ágil elegida (diaria, revisión,
  retrospectiva, planificación) tiene su frecuencia: a diario, dos veces por
  semana, semanal, cada dos semanas, una vez por sprint o mensual. Por defecto,
  la diaria a diario y las demás una vez por sprint. Se exporta en el `.xlsx` y
  el `.pdf` ("Diaria (a diario)") y la importación del plan la recupera. Un
  plan guardado con una versión anterior muestra los valores por defecto.
- **Casos desde un requisito con IA (IA-05):** el botón ✨ de cada requisito
  (pestaña Trazabilidad) pide a la IA escenarios Gherkin y casos de prueba. Antes
  de enviar dice a qué proveedor y modelo va el requisito. Revisas las
  propuestas, ves su Gherkin y solo se crean las que aceptas, como borradores
  vinculados al requisito (aparecen en la matriz) y marcados "IA · pendiente de
  revisión" con el proveedor y el modelo reales. Si algún caso no se puede
  guardar, la ventana sigue abierta con solo esos seleccionados para
  reintentarlos, sin duplicar los ya creados.
- **Más ayudas de IA de la spec (IA-10):** sugerencia de la estrategia de
  automatización y de un banco de riesgos con mitigación en el plan, y de
  precondiciones en el editor de casos. Eliges qué sugerencias añadir.
- **Respuestas de la IA validadas (ADR-0023):** lo estructurado llega como JSON y
  se comprueba contra un esquema antes de usarlo. Una respuesta inválida, un
  rechazo o un timeout se explican con "No se aplicó nada" y se puede
  reintentar; nunca se aplica a medias. Con Ollama se usa su modo JSON y una
  llamada colgada falla a los 120 s, como las online. La prioridad se acepta
  aunque el modelo la escriba en español o con mayúsculas ("Alta" → high).

- **Varios motores de IA online (IA-08):** además de Gemini, ahora se puede usar
  OpenAI, Claude (Anthropic), OpenRouter o cualquier servicio compatible con la
  API de OpenAI (Groq, DeepSeek, Mistral, LM Studio o vLLM locales…). Se elige
  un proveedor activo y cada uno guarda su propia clave en el keychain y su
  propio modelo. El botón "Listar modelos" consulta los modelos que ofrece tu
  clave, y la procedencia de lo generado muestra el proveedor real.
- `npm run seed:test-user` (en `server/`) crea la cuenta local de pruebas del
  README en una base nueva o reseteada; no hace nada si ya existe y se niega a
  ejecutarse en producción.
- **Requisitos y tarjetas del planificador se sincronizan (SYNC-04a):** un
  requisito o un defecto creado en un equipo aparece en los demás, y los casos
  vinculados a `REQ-xxx` resuelven allí. Mover una tarjeta de columna también
  se sincroniza. Los adjuntos y las plantillas siguen siendo locales (SYNC-04b).
- **La web avisa cuando pierde un conflicto (FIX-04):** si otro dispositivo
  guardó una versión más reciente, la web muestra un aviso, conserva tu edición
  y abre el mismo panel de conflictos que el escritorio para elegir versión.
- **La web reintenta lo que no pudo enviar (FIX-04):** un cambio hecho con el
  servidor caído queda en "Cambios pendientes" y se envía solo al volver.
- **Copia antes de actualizar (SEC-06):** cuando una versión nueva va a
  actualizar la base de datos local, antes guarda el archivo tal cual estaba,
  cifrado, como `pharos.db.enc.bak-<versión>-<última migración>` en la carpeta
  de datos de la app. Se conservan las 3 copias más recientes. Si la copia no se
  puede guardar, la app no actualiza nada. Cómo restaurarla: README.
- **Datos de una versión más nueva (SEC-06):** si abres Pharos con datos que
  guardó una versión más reciente, la app muestra una pantalla que lo explica y
  no abre ni modifica esos datos. Esta protección empieza en esta versión:
  `0.1.0-alpha.1` no la tiene y abriría esos datos sin avisar. Para volver a
  ella, restaura antes la copia `.bak`.
- **Clave de recuperación (SEC-03):** en Perfil → Clave de recuperación puedes
  ver, una vez y tras confirmar, la clave que abre tu base de datos local: 56
  caracteres en 14 grupos de 4. Guárdala en papel o en un gestor de
  contraseñas. Si pierdes el almacén de credenciales de Windows (PC nuevo,
  Windows reinstalado), copia `pharos.db.enc` a la carpeta de datos, abre
  Pharos y escribe la clave: tus datos vuelven y la clave queda guardada de
  nuevo. Una errata se detecta antes de tocar nada (ADR-0024).
- **Exportar diagnóstico (BASE-08):** en Administración → Diagnóstico, y en la
  pantalla de error, un botón guarda en tu carpeta de descargas un `.zip` para
  informar de un fallo: versión, sistema operativo, WebView2, migraciones
  aplicadas y los registros recientes. Nunca incluye tus proyectos, casos,
  perfil, base de datos, claves ni tokens; correos, tokens y rutas con tu
  usuario se enmascaran. Si la base local no abre, su pantalla aún no ofrece
  el botón: adjunta el log del día (guía de la beta, apartado 5).
- **Registros de la app:** el escritorio guarda un log diario en
  `%LOCALAPPDATA%\com.pharos.desktop\logs` (se conservan 7 días).
- **Los fallos de sincronización quedan en el log (BASE-08):** además del aviso,
  cada fallo deja una línea en el log que recoge "Exportar diagnóstico": al
  sincronizar a mano o en segundo plano, al listar o resolver conflictos, y
  los cambios que el servidor rechaza. Solo guarda el código HTTP y el tipo de
  error, nunca el texto del servidor ni el contenido de tus datos. Un fallo que
  se repite en segundo plano se anota una sola vez.
- **Pantalla de error:** si una vista falla, ya no queda la ventana en blanco:
  aparece un aviso con "Reintentar", "Recargar" y "Exportar diagnóstico", y el
  resto de la app sigue funcionando.
- **Versión visible (UX-07):** la versión instalada aparece al pie de la barra
  lateral y en Administración → Diagnóstico.
- Para desarrollo: smoke E2E del binario real (`npm run e2e`, BASE-14) e
  informes de cobertura (`npm run coverage`, `npm run coverage:rust`, BASE-13).
- **El smoke E2E corre en CI (BASE-14):** cada PR y cada cambio en `main`
  arrancan el binario real en Windows contra una API local (unos 7 minutos) y
  suben los resultados como artefacto (es obligatorio para fusionar, ver
  "Cambiado"). Para ello,
  una compilación debug con perfil E2E abre ella misma el puerto de DevTools
  de WebView2; una release nunca lo hace.
- **Instalador de Windows desde CI (BASE-09):** cada cambio en `main` genera el
  instalador NSIS como artefacto descargable. Las versiones alfa, beta y rc
  solo tienen instalador NSIS; las estables tendrán además MSI.
- **Claves únicas entre equipos (DAT-01):** dos equipos que crean casos,
  requisitos o defectos sin conexión ya no repiten claves. Cada equipo numera
  con un bloque de números que le reserva el servidor al sincronizar, así que
  la numeración tiene huecos entre equipos (`ATS_007` en uno, `ATS_051` en
  otro): la clave identifica, no cuenta.
  - Sin conexión y sin números reservados, el elemento recibe una clave
    provisional (`ATS_?KQZD`) que se sustituye por la definitiva en el
    siguiente sync. Mientras tanto no se exporta como tag: el `.feature` sale
    sin él y la exportación lo avisa. Los proyectos ya sincronizados antes de
    esta versión usan claves provisionales hasta su primer sync con conexión.
  - Si dos equipos escriben a mano la misma clave, el servidor se la da al
    primero. El otro elemento aparece en Conflictos → "Claves repetidas", con
    una clave provisional, hasta que escribes otra o eliges "Asignar la
    siguiente". Una clave nunca cambia sola.
  - En la web una clave repetida se rechaza al guardar, con un aviso
    (BASE-10).
    Créalo o corrígelo desde el escritorio.
- **Purga de lo borrado (SYNC-06):** lo que borras se elimina definitivamente
  del escritorio tras los días de retención de Administración (30 por
  defecto), con su historial y sus adjuntos. Un borrado que aún no llegó al
  servidor espera al siguiente sync, y un elemento con un conflicto abierto
  espera a que lo resuelvas. Lo purgado no vuelve con la sincronización y sus
  claves (`ATS_007`, `REQ-003`, `DEF-002`) nunca se reutilizan. El servidor
  vacía el contenido de lo borrado tras `SYNC_TOMBSTONE_DAYS` días (30) y solo
  conserva la marca de borrado. Migración local `0017`.
- **Integración continua (BASE-01):** cada cambio pasa automáticamente los
  tests del cliente, del núcleo Rust y del servidor, el formato y el lint de
  Rust, y las auditorías de dependencias y de licencias.

### Cambiado

- **Contraste AA en los dos temas (UX-05):** el texto atenuado y los textos de
  éxito, error, aviso e información se ven más oscuros en el tema claro; los
  botones de borrar usan un rojo más oscuro; las insignias navy del tema
  oscuro tienen el fondo un poco más oscuro. El indicador de foco es navy en
  el tema claro (el ámbar no se distinguía sobre blanco) y ámbar en el oscuro
  y en la barra lateral, y los campos muestran un anillo de foco visible.
  El borde de los campos de texto y los selectores es más oscuro, para
  distinguirlos del fondo en los dos temas.
- **Formularios en diálogos:** si has escrito algo en una plantilla o un
  requisito, Escape, un clic fuera o Cancelar preguntan antes de
  descartarlo. Un campo obligatorio vacío se marca al intentar guardar, no
  nada más abrir el formulario.
- **Calendario del cronograma:** el día de hoy se marca en navy en lugar de
  ámbar. Los colores del tema no llegaban al calendario, que mostraba el azul
  por defecto de la librería, casi ilegible en el tema oscuro.
- **Crear proyecto:** "Crear" ya no se deshabilita con el nombre vacío; al
  pulsarlo, un mensaje dice que el nombre es obligatorio.

- Cada PR publica la cobertura del cliente (BASE-13): el resumen (líneas,
  sentencias, funciones y ramas) en el resumen del job `client` y el informe
  completo como artefacto `coverage-client`. Es un informe, no un gate; los
  tests del cliente se ejecutan una sola vez (`npm run verify:static` y luego
  `npm run coverage`) y un test roto sigue dejando el job en rojo. La
  cobertura de Rust sigue en local (`npm run coverage:rust`): en CI costaría un
  segundo build completo instrumentado.
- El smoke E2E del escritorio (`e2e`) es ahora un check obligatorio para
  fusionar en `main`, junto a los otros siete (BASE-02, BASE-14).
- Las exportaciones y el diagnóstico ya no los guarda el navegador interno en
  Descargas: los guarda la app en la carpeta de descarga, y el aviso dice la ruta
  (UX-02). El campo de texto "Carpeta de descargas" de Ajustes, que no se
  aplicaba, se sustituye por el selector.
- **Keychain probado (CORE-02):** la sesión y las claves de IA guardadas en el
  Administrador de credenciales de Windows pasan por un único módulo con tests
  automáticos contra el keychain real: guardar, leer, sobrescribir, borrar,
  texto Unicode, el tamaño máximo que admite Windows y accesos simultáneos.
  Los tests mostraron que, si un mismo proceso usa el keychain desde varios
  hilos a la vez, Windows puede perder un borrado. Ahora esas operaciones van
  de una en una, también cuando la IA lee su clave mientras se guarda otra.
- **Cada sincronización lleva la versión de la app (SYNC-08):** el servidor
  acepta su versión MENOR y la anterior; una app no admitida no escribe nada y,
  desde esta versión, muestra "Actualiza la app para sincronizar".
- El contador "Cambios pendientes" cuenta elementos, no ediciones: diez
  ediciones del mismo caso son un cambio pendiente.
- Un cambio que el servidor rechaza por su contenido (demasiado grande o no
  válido) ya no bloquea la sincronización: se avisa, queda pendiente y el resto
  se envía y se recibe.

- **Los IDs de caso, requisito y defecto nunca se reutilizan (DAT-01,
  ADR-0010):** si borras `ATS_003`, el siguiente caso es `ATS_004`, no otra vez
  `ATS_003`, porque un tag `@ATS_003` en la automatización no debe pasar a
  señalar otro caso. Antes, los casos sí reutilizaban el número del borrado.
- **El ID de un caso no cambia una vez asignado (DAT-01):** el campo es de solo
  lectura al editar un caso existente.
- **Un ID escrito a mano no recupera el de un borrado (DAT-01):** crear un caso
  o un requisito con el ID de uno borrado da error. Al importar requisitos por
  CSV, las filas con la clave de un requisito borrado no se importan y se
  avisa de cuáles son.
- Los campos de auditoría "creado por" y "modificado por" de proyectos, planes y
  casos guardan ahora el usuario que hizo el cambio (antes guardaban el ID del
  propio registro o el nombre del autor). La actualización corrige los registros
  existentes con el dueño del proyecto (FIX-06).

- La configuración de IA anterior se migra sola: el modelo que tenías pasa a
  ser el modelo de Gemini.
- "Probar conexión" muestra el mensaje real del proveedor cuando falla (clave
  incorrecta, modelo inexistente…).
- La barra superior y la lateral quedan fijas: en páginas largas solo se
  desplaza el contenido (antes se desplazaba toda la ventana).

### Corregido

- **El puerto 3000 ya no se queda ocupado por una API vieja:** cerrar la
  ventana o la tarea de `npm start` podía dejar vivo el proceso de la API, y la
  siguiente no arrancaba o el escritorio y el E2E hablaban con la antigua.
  Ahora `npm start` y `npm run dev` (en `server/`) detienen antes cualquier API
  de Pharos que ocupe el puerto (de esta copia o de otro worktree) y, si es otro
  programa, no lo tocan y dicen cuál es. `npm run e2e` rechaza una API que sea
  de otra copia. `node scripts/api-port.mjs owner` muestra quién usa el puerto.
- **Exportar a PDF ya funciona (EXP-02):** el plan y los casos en `.pdf` se
  quedaban sin generar, sin aviso, porque no se cargaban las fuentes del PDF
  ("Roboto-Medium.ttf"). Ahora se generan en la app y dentro de los ZIP.
- **Indicador atascado en "Pendiente" (FIX-01):** editar un requisito, una
  tarjeta o una plantilla ya no deja el indicador en "Cambios pendientes" tras
  sincronizar; solo cuenta lo que el sync envía.
- **Conflictos en la web:** si otro equipo vuelve a cambiar un elemento en
  conflicto, el panel muestra su versión más reciente, no una antigua.
- **Deshacer el borrado de un proyecto:** si el borrado choca con una edición
  en otro equipo y eliges "Usar la del servidor", el proyecto vuelve con sus
  planes, casos, requisitos y tarjetas.
- Lo que llega por sincronización (proyectos, planes, casos, requisitos y
  tarjetas) registra como `created_by`/`updated_by` la cuenta dueña, no el
  nombre de autor escrito a mano; un pull ya no reintroduce el fallo de FIX-06.
- Un cambio hecho antes de que llegara su proyecto ya no se queda sin enviar en
  silencio: se envía cuando llega el proyecto, y mientras tanto el indicador
  lo dice.
- **Sincronizaciones grandes (FIX-02, FIX-03):** con más de 500 documentos el
  escritorio y la web reciben todo, página a página, y miles de cambios
  pendientes se envían por lotes, con reintento, sin error 413.
- **Borrar un proyecto (FIX-05):** sus planes, casos, requisitos y tarjetas
  también desaparecen en los demás equipos. Los hijos de proyectos borrados
  antes de esta versión se reparan solos en el servidor.
- El servidor respondía "error interno" (500) a peticiones mal formadas
  (JSON roto, cuerpo demasiado grande, tipo de contenido no admitido). Ahora
  responde con el error 4xx correspondiente.
- **Clave que falta en el keychain (SEC-03):** si faltaba la clave de la base
  local pero el archivo cifrado existía, la app creaba y guardaba una clave
  nueva y luego no podía abrir los datos. Ahora no guarda nada y te pide la
  clave de recuperación.
- **Primer guardado que no se descifra (SEC-03):** si solo existía
  `pharos.db.enc.new` y la clave no lo descifraba, la app lo borraba y empezaba
  con una base vacía. Ahora lo conserva y te pide la clave de recuperación.
  Una entrada del keychain dañada también lleva a la recuperación, y la clave
  que se reemplaza se guarda una vez como `db-key.prev`.

### Seguridad

- **Varias cuentas en el mismo equipo (FIX-07):** los cambios pendientes, el
  cursor de sincronización y los conflictos son de cada cuenta. Al cambiar de
  cuenta, la nueva nunca envía ni sobrescribe lo de la anterior. En la web, la
  copia local de los datos se vacía al cerrar sesión y al entrar otra cuenta;
  los cambios sin enviar de cada cuenta se conservan.
- **Servidor endurecido (BASE-06):**
  - En producción el servidor no arranca con el secreto JWT de ejemplo, con un
    secreto de menos de 32 caracteres o con `CORS_ORIGIN=*`.
  - Inicio de sesión y registro limitados a 10 intentos por minuto y por IP.
    La app muestra "Demasiados intentos. Espera un momento y vuelve
    a intentarlo."
  - Límite de tamaño de petición: 1 MiB en general y 8 MiB en la
    sincronización.
- **Dependencias actualizadas (BASE-03):**
  - rustls, rustls-webpki y h2 (6 vulnerabilidades en las conexiones TLS de
    las llamadas a la IA).
  - fastify y sus dependencias.
  - vitest y vite (herramientas de desarrollo con avisos críticos).
  - zod 4 en el servidor (BASE-18), que corrige el aviso alto
    GHSA-mrhx-c7xc-m3w5. La auditoría de npm ya no tolera ningún aviso.
  - react-router 7 en lugar de react-router-dom 6 (BASE-20), que corrige la
    redirección abierta GHSA-wrjc-x8rr-h8h6 y GHSA-337j-9hxr-rhxg. La
    navegación no cambia.
  - `uuid` 11 para exceljs (BASE-20, GHSA-w5hq-g745-h8pq). El `npm audit` de
    la raíz queda sin avisos. La app sigue llevando el uuid 8 que exceljs trae
    ya empaquetado en su `dist/exceljs.min.js`, pero el aviso no le afecta:
    solo toca v3/v5/v6 con el argumento `buf`, y exceljs solo llama a `v4()`.
- Para desarrollo: el driver del smoke E2E (`msedgedriver`) solo se descarga
  del servidor de Microsoft y debe estar firmado por Microsoft antes de
  ejecutarse.
- Licencias de Rust auditadas: solo permisivas, igual que en npm.
- La clave de Gemini ya no viaja en la URL sino en una cabecera; las peticiones
  de IA tienen un tiempo máximo y sus errores nunca incluyen la URL ni la clave.
- Un endpoint compatible personalizado debe usar `https` (http solo en
  `localhost`), para que la clave no viaje sin cifrar.
- **Cada usuario solo ve y cambia lo suyo (FIX-08):** en un equipo con dos
  cuentas, los casos, planes, requisitos y adjuntos de una no se pueden leer ni
  modificar desde la otra. Borrar algo que no existe ya no deja un cambio
  pendiente de sincronizar.
- **Plantillas por usuario (FIX-08b):** una plantilla importada es de la cuenta
  que la importó; otra cuenta del mismo equipo no la ve, no la descarga, no la
  edita ni la borra. Las plantillas incluidas con la app las ven todas y ya no
  se pueden editar: un cambio de una cuenta las cambiaba para todas. Las
  plantillas importadas antes de esta versión pasan a la única cuenta con
  proyectos en el equipo. Si hay varias, quedan como "Compartida": todas las
  cuentas las ven y ninguna las edita ni las borra; para cambiar una,
  descárgala e impórtala de nuevo. Editar o borrar una plantilla que no existe
  ya no deja un cambio pendiente.

### Cambios incompatibles

- El servidor rechaza la sincronización de apps sin versión (`0.1.0-alpha.1`);
  esas apps solo muestran "push 426". Hay que desplegar el servidor y la web
  juntos y actualizar la app de escritorio: una app nueva contra un servidor
  antiguo no puede enviar requisitos ni tarjetas. Al actualizar, cada cuenta
  descarga sus datos una vez más desde el principio (sin pérdida). Migraciones
  locales `0012` y `0013` y del servidor `0004` (ADR-0020).
- **Claves repetidas que ya existían (DAT-01):** si dos equipos habían creado
  la misma clave antes de esta versión, al actualizar se conserva en el
  elemento con el id más bajo y los demás pasan a `ATS_004-dup1`, `-dup2`…, en
  el servidor y en cada equipo por igual. Esas claves ya eran ambiguas; revisa
  los tags de automatización que las usen. En el escritorio, un elemento que
  el servidor ya tenía aparece un momento en "Claves repetidas" hasta que el
  siguiente sync trae su clave nueva. Migraciones local `0017` y del servidor
  `0005` y `0006`.
- **Desplegar servidor y app juntos (DAT-01):** contra un servidor antiguo la
  app sincroniza, pero sus claves nuevas se quedan provisionales. Una app
  anterior a esta versión contra el servidor nuevo sincroniza igual, salvo
  cuando envía una clave que otro elemento ya usa: entonces el servidor
  responde "actualiza la app" (426) en lugar de un rechazo que esa app tomaría
  por aceptado, y no se pierde nada.

## [0.1.0-alpha.1] - 2026-10-28

Primera versión etiquetada. Reúne lo construido para los hitos antes llamados
v0.0.1 (planificación y diseño) y v0.0.2 (trazabilidad). Queda pendiente, antes
de `0.1.0`: clave de recuperación (SEC-03), auditoría WCAG AA, instalador y
validaciones nativas pendientes.

### Añadido

- **Base:** app de escritorio Tauri 2 + React con tema "Faro Nocturno"
  claro/oscuro, español/inglés y arquitectura de monolito modular.
- **Cuentas:** registro e inicio de sesión contra el backend (Argon2id, JWT con
  refresh) y reapertura sin conexión con la sesión cacheada en el
  Administrador de credenciales de Windows.
- **Datos locales:** SQLite cifrada con AES-256-GCM, perfil con alias y nombre
  oficial, y campos de auditoría automáticos.
- **Proyectos:** cada proyecto es una carpeta con su plan, sus casos, su
  trazabilidad y su planificador; cada usuario solo ve los suyos.
- **Plan de pruebas:** asistente de 21 campos (ISO/IEC/IEEE 29119), calendario
  del cronograma e historial de revisiones con restauración.
- **Casos de prueba:** asistente basado en la plantilla Agile Test Scenario;
  vistas Editor/Gherkin sincronizadas en vivo (con vista dividida); niveles
  Básico, Outline y Avanzado; resaltado de sintaxis; exportación `.feature`.
- **Planificador:** kanban por proyecto con etiquetas, prioridad y adjuntos
  cifrados, sin conexión.
- **Plantillas y exportación:** repositorio de plantillas, importación de
  planes y casos desde `.xlsx` por cabeceras, exportación a `.xlsx` y `.pdf`
  y ZIP por proyecto o global con barra de progreso.
- **IA:** motor intercambiable entre Gemini (en línea, clave en el keychain) y
  Ollama (local, con descarga del modelo), botones "Asistir con IA" en plan y
  casos, y "Sugerir pruebas" desde el plan.
- **Sincronización:** registro local de cambios (oplog) con relojes HLC,
  envío y recepción contra el backend, indicador de estado, botón "Sincronizar
  ahora" y panel de conflictos. El cliente web lee y escribe en el backend.
- **Administración:** panel con accesos a plantillas e IA, fondo personalizado
  y preferencias de retención y descarga.
- **Trazabilidad:** requisitos `REQ-xxx` (CRUD e importación CSV), matriz
  requisito ↔ caso ↔ defecto con huecos de cobertura, exportación de la matriz
  a `.xlsx`, defectos con clave `DEF-xxx` y migración del campo de texto libre.
- **Tags estables en Gherkin:** `@REQ-xxx` en el Feature y el ID del caso en
  cada escenario; se conservan al reimportar y permiten filtrar con Cucumber o
  playwright-bdd. ZIP de `.feature` por proyecto.
- **Procedencia de la IA:** lo generado por IA queda marcado como pendiente de
  revisión, con el proveedor que lo produjo.
- **Versionado:** política SemVer con una única versión para app, núcleo Rust y
  backend; `npm run check:version` (incluido en `npm run verify`) y
  `npm run version:set`.

### Cambiado

- El núcleo Rust se compila con el toolchain MSVC (antes GNU + MinGW); con
  ello `cargo test` vuelve a funcionar.
- `dev.bat` funciona con PostgreSQL nativo cuando no hay Docker.

### Seguridad

- La base de datos local ya no se escribe nunca sin cifrar en disco: se carga
  y se guarda en memoria, y el archivo cifrado se reemplaza de forma atómica.
- Corregida una fuga entre usuarios de la misma instalación: los proyectos son
  ahora propiedad de cada usuario.

[Sin publicar]: https://github.com/shift3385/Pharos/compare/v0.2.0-alpha.1...HEAD
[0.2.0-alpha.1]: https://github.com/shift3385/Pharos/compare/v0.1.0-beta.1...v0.2.0-alpha.1
[0.1.0-beta.1]: https://github.com/shift3385/Pharos/compare/v0.1.0-alpha.1...v0.1.0-beta.1
[0.1.0-alpha.1]: https://github.com/shift3385/Pharos/releases/tag/v0.1.0-alpha.1
