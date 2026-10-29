# Changelog

Todos los cambios relevantes de Pharos se documentan aquí.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
el proyecto usa [Semantic Versioning](https://semver.org/lang/es/). Las reglas
están en [`docs/VERSIONING.md`](docs/VERSIONING.md).

## [Sin publicar]

### Añadido

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
  usuario se enmascaran. Funciona aunque la base local no haya podido abrirse.
- **Registros de la app:** el escritorio guarda un log diario en
  `%LOCALAPPDATA%\com.pharos.desktop\logs` (se conservan 7 días).
- **Pantalla de error:** si una vista falla, ya no queda la ventana en blanco:
  aparece un aviso con "Reintentar", "Recargar" y "Exportar diagnóstico", y el
  resto de la app sigue funcionando.
- **Versión visible (UX-07):** la versión instalada aparece al pie de la barra
  lateral y en Administración → Diagnóstico.
- Para desarrollo: smoke E2E del binario real (`npm run e2e`, BASE-14) e
  informes de cobertura (`npm run coverage`, `npm run coverage:rust`, BASE-13).
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
  - Límite conocido: en la web no hay panel de claves repetidas. Un cambio
    web cuya clave ya existe queda en "Cambios pendientes" marcado como
    rechazado hasta que la web use el servidor como única fuente (BASE-10).
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

### Corregido

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

[Sin publicar]: https://github.com/shift3385/Pharos/compare/v0.1.0-alpha.1...HEAD
[0.1.0-alpha.1]: https://github.com/shift3385/Pharos/releases/tag/v0.1.0-alpha.1
