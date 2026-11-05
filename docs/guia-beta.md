# Guía de pruebas de Pharos

Esta guía es para quien prueba **Pharos 0.2.0-alpha.1** en Windows 11: todo lo
de la beta `0.1.0-beta.1` con la interfaz rediseñada (apartado 1.1). Explica
qué trae la versión, cómo instalarla, qué comprobar (con casillas para ir
marcando) y cómo informar de un problema. Los detalles técnicos están en el
[README](../README.md) (en inglés); el plan de versiones, en
[`ROADMAP.md`](ROADMAP.md).

> Una beta puede tener fallos. Antes de usarla con datos que te importen, guarda
> la clave de recuperación (paso 4.6) y una copia de `pharos.db.enc`.

**¿Cómo se usa cada pantalla?** El [manual de usuario](manual/README.md)
(`docs/manual/`) lo explica paso a paso, con capturas de la aplicación real:
quince capítulos, de la entrada a la ejecución manual, las evidencias y qué hacer si algo sale mal. Su PDF
(`Pharos-manual-de-usuario.pdf`, con índice y números de página) viaja
junto al instalador (en el mismo artefacto del CI), se descarga como artefacto
`manual` del CI en `main` o se genera en local con `npm run manual:build`
(en `docs/manual/`). El manual se regenera solo cuando la
aplicación cambia: cada paso es también una prueba automática
([`e2e/README.md`](../e2e/README.md) → Tours).

## 1. Qué trae la 0.1.0

- **Proyectos** con su plan de pruebas (asistente de 21 campos, ISO/IEC/IEEE
  29119, con frecuencia de las ceremonias ágiles), sus casos de prueba
  (editor y Gherkin sincronizados) y su planificador kanban.
- **Inicio** con búsqueda de proyectos, último acceso y progreso.
- **Trazabilidad:** requisitos `REQ-xxx`, matriz requisito ↔ caso ↔ defecto y
  tags estables (`@REQ-014`, `@ATS_001`) en los `.feature`.
- **Plantillas** e importación/exportación a `.xlsx`, `.pdf`, `.feature` y ZIP
  (con PDF), en la **carpeta de descarga** que elijas.
- **IA opcional** con tu propia clave (Gemini, OpenAI, Claude, OpenRouter o un
  servicio compatible) o sin internet con Ollama: asistir campos, generar casos
  desde un requisito, sugerir riesgos, estrategia y precondiciones. Nada se
  aplica sin que lo aceptes.
- **Sincronización** sin conexión entre equipos, con panel de conflictos y
  claves que nunca se repiten.
- **Seguridad de los datos:** base local cifrada, copia automática antes de
  actualizar, clave de recuperación y protección contra datos de una versión
  más nueva.
- **Accesibilidad WCAG 2.1 AA:** todo se usa con el teclado y con lector de
  pantalla.
- **Exportar diagnóstico** para informar de fallos sin enviar tus datos.

### 1.1 Qué cambia en 0.2.0-alpha.1: la interfaz rediseñada

- **Navegación nueva:** menú lateral que se contrae a una franja de iconos;
  en tablet, franja de iconos; en el móvil (web), barra superior y barra
  inferior. Dentro de un proyecto, el grupo «Proyecto activo» cambia de
  proyecto y de sección. El idioma y «Cerrar sesión» están en el menú del
  usuario.
- **Inicio** con indicadores, criterios de salida del plan (evaluados con
  los resultados), próximas pruebas y gráficos de ejecución con datos reales
  (RED-W6).
- **Proyectos** con recientes, tabla con búsqueda, orden y paginación;
  **Ajustes del proyecto** con borrado que pide escribir el prefijo.
- **Plan** de 19 pasos con lista de pasos, barra de progreso y panel de
  estado; entregables ISO 29119-3 y 75 herramientas en catálogo.
- **Casos** con tabla, filtros y selección múltiple; editor con vistas
  Editor / Gherkin / Dividida y «Ir a un caso…» (Ctrl P).
- **Administración** en una sola pantalla con pestañas: Motor de IA,
  Plantillas, General (tema «Según el sistema»), Sincronización, Seguridad
  (aquí está ahora la clave de recuperación), Evidencias y Diagnóstico.
- Al salir de una pantalla con cambios sin guardar, Pharos pregunta antes.

**Todavía no incluye:** ejecución de pruebas (llega más adelante en 0.2.0;
los controles de ejecución salen deshabilitados con «Próximamente»), sincronizar
adjuntos y plantillas propias, ni instalador firmado. Si la base local no
abre, la pantalla que lo explica no ofrece "Exportar diagnóstico" (apartado 5).

### 1.2 Lo que llega con la próxima 0.2.0: Defectos (DEF-01)

- **Los defectos tienen su propio módulo,** «Defectos», dentro de cada
  proyecto: lista y tablero por estado, severidad aparte de la prioridad,
  ciclo de vida (Nuevo → Abierto → En curso → Corregido → En retest →
  Cerrado, con Rechazado y Aplazado), resolución al cerrar o rechazar, y
  vínculos a casos, requisitos y resultados.
- **El planificador queda para tareas y datos de prueba.** Al actualizar,
  cada tarjeta «Defecto» pasa a Defectos con la misma clave `DEF-xxx`, sus
  casos vinculados y sus adjuntos.

## 2. Antes de empezar

La app instalada inicia sesión y sincroniza contra la API de Pharos en
`http://localhost:3000` del **mismo equipo**. Necesitas:

- [ ] Windows 11 con WebView2 (viene instalado).
- [ ] PostgreSQL en marcha (servicio nativo en el puerto 5432, o Docker).
- [ ] Git y Node.js ≥ 22.18 con npm, para ejecutar la API.
- [ ] La API de Pharos en la misma versión que la app: clona el repositorio
      (`git clone https://github.com/shift3385/Pharos.git`) y, dentro,
      `git checkout v0.2.0-alpha.1`. Después, `npm install` en la raíz y en
      `server/`, un `.env` y las bases `pharos_db` / `pharos_test_db`
      (README → "First-time setup"). Cada vez que pruebes:
      `cd server && npm start`. **Al cambiar de versión, vuelve a ejecutar
      `npm install`** en la raíz y en `server/`: las versiones nuevas pueden
      traer dependencias nuevas. En PowerShell con los scripts deshabilitados,
      usa `npm.cmd` en lugar de `npm`.
- [ ] Una cuenta: "Regístrate" en la pantalla de inicio de sesión, o la cuenta
      de pruebas local con `cd server && npm run seed:test-user` (sus datos
      están en el README).

No hace falta Rust ni Visual Studio para instalar la app; solo para
compilarla.

## 3. Instalar

1. En GitHub, **Actions → Installer**, filtra por la rama o etiqueta
   **`v0.2.0-alpha.1`** y abre esa ejecución (en verde). En **Artifacts**,
   descarga `pharos-0.2.0-alpha.1-<commit>-windows`. Usa solo la ejecución de
   la etiqueta: los cambios posteriores en `main` generan artefactos con el
   mismo nombre de versión, pero con código aún no publicado. Hace falta haber
   iniciado sesión en GitHub y el artefacto caduca a los 30 días.
2. Descomprime el `.zip`: contiene `Pharos_0.2.0-alpha.1_x64-setup.exe`.
3. Ejecútalo. **El instalador no está firmado**, así que Windows SmartScreen
   muestra "Windows protegió tu PC": pulsa **Más información → Ejecutar de
   todas formas**.
4. Sigue el asistente. Si faltara WebView2, el instalador lo descarga (necesita
   internet).
5. Abre Pharos desde el menú Inicio.

## 4. Lista de comprobación

Marca cada casilla al comprobarla. Si algo falla, sigue el apartado 5 antes de
seguir.

### 4.1 Instalación en un Windows 11 limpio

- [ ] SmartScreen avisa de que el instalador no está firmado y deja continuar
      con "Ejecutar de todas formas".
- [ ] La instalación termina sin errores y Pharos aparece en el menú Inicio.
- [ ] El primer arranque abre la pantalla de inicio de sesión (WebView2
      funciona: no hay ventana en blanco).
- [ ] Al pie del menú lateral y en Administración → Diagnóstico la versión
      es `0.2.0-alpha.1`.
- [ ] Tras iniciar sesión existe `%APPDATA%\com.pharos.desktop\pharos.db.enc`
      y no quedan archivos `.tmp` ni `.new` al guardar (SEC-01/02).
- [ ] Hay un log del día en `%LOCALAPPDATA%\com.pharos.desktop\logs`.
- [ ] Cerrar y abrir sin la API en marcha: la app abre con la sesión guardada.
- [ ] Desinstalar desde Configuración → Aplicaciones → Aplicaciones instaladas.
      Pharos desaparece del menú Inicio y anota si la carpeta de datos
      `%APPDATA%\com.pharos.desktop` se conserva.
- [ ] Volver a instalar: los proyectos siguen ahí.

### 4.2 Actualizar desde una versión anterior (si la tenías)

- [ ] Desde `0.1.0-beta.1`: instalar `0.2.0-alpha.1` encima y abrirla. Los
      proyectos, planes, casos, requisitos y tarjetas siguen intactos y se ven
      con la interfaz nueva. Esta versión no cambia la base de datos, así que
      no se crea copia `.bak-…`.
- [ ] Desde `0.1.0-alpha.1`: además aparece
      `pharos.db.enc.bak-<versión>-0011_sync_conflicts`, la copia previa a
      la actualización (SEC-06).

### 4.3 Plan, casos y exportaciones

- [ ] Crear un proyecto y su plan con el asistente; guardar un plan sin
      título (un resumen dice qué falta) y otro con avisos (se guarda y dice
      cuántos avisos quedan).
- [ ] Crear casos: el editor y la vista Gherkin se actualizan entre sí; el
      `.feature` exportado es válido (Fase 4).
- [ ] Exportar el plan y un caso a `.pdf` y `.xlsx` (Fase 6).
- [ ] Con hitos en el Cronograma y un ciclo con ese caso: el `.xlsx` del plan
      trae las hojas «Hitos» y «Ciclos» (con el mismo progreso que la pantalla
      de Ciclos) y el del caso, la hoja «Ciclos»; los PDF terminan con esas
      tablas. Importar ese `.xlsx` da el mismo plan o caso (EXP-03).
- [ ] Importar un plan y casos desde `.xlsx` y usar una plantilla (Fase 6).
- [ ] Elegir una carpeta de descarga en Administración → General y exportar el
      ZIP del proyecto: lleva el plan y cada caso en `.xlsx` y `.pdf`
      (UX-02, EXP-02).
- [ ] Panel de administración: ajustes, retención, fondo, accesos (Fase 9A).

### 4.4 Trazabilidad

- [ ] Crear requisitos y vincular casos; la matriz muestra los huecos de
      cobertura y se exporta a `.xlsx`.
- [ ] El `.feature` lleva `@REQ-xxx` y el ID de cada caso, y se puede filtrar
      por `@ATS_xxx` con playwright-bdd o Cucumber.
- [ ] En el formulario de un requisito, poner Probabilidad e Impacto (1–5): en
      la matriz el requisito lleva «Riesgo N · Alto/Medio/Bajo» y los de más
      riesgo salen primero («Orden: ID de requisito» vuelve al orden por clave).

### 4.4b Defectos (próxima 0.2.0)

- [ ] Con defectos en el planificador de la versión anterior: tras actualizar,
      aparecen en «Defectos» con la misma clave, los mismos casos vinculados y
      los mismos adjuntos; el planificador ya no los muestra y lo avisa.
- [ ] Crear un defecto, vincularlo a un caso y verlo en la matriz de
      Trazabilidad; cerrarlo (pide la resolución) y comprobar que la matriz
      deja de marcarlo como abierto.
- [ ] En el tablero, arrastrar un defecto «Nuevo» a «Corregido»: no se deja y
      lo explica.
- [ ] En Ajustes del proyecto → «Campos personalizados», elegir «Defectos» y
      crear un campo: aparece en el editor de defectos, se guarda con el
      defecto y llega al otro equipo tras sincronizar; los campos de casos
      no cambian (FLD-03).

### 4.4c Importar resultados de pruebas automáticas (ING-02..05)

En un proyecto, **Ejecuciones → Importar informe** acepta Cucumber Messages
(`--format message:informe.ndjson`), CTRF, JUnit XML, el JSON de Playwright
(`--reporter=json`) o Pharos Run JSON. Un test se vincula a su caso por la
etiqueta del caso (`@TC-001`, con el prefijo del proyecto). Con JUnit solo
se vincula si el test lleva la propiedad `test_id`, porque JUnit no
conserva las etiquetas.

- [ ] Importar el informe de Playwright o Messages de un proyecto con esos
      casos: la vista previa dice cuántos se vinculan, y el run aparece en
      **Runs** con sus resultados.
- [ ] Importar el mismo archivo otra vez en el mismo run: no se duplica nada.
      Como run nuevo, Pharos avisa y pide confirmarlo.
- [ ] Con un CI por shards, importar el primer shard como run nuevo con
      «Dejar el run abierto» y los demás en ese run.
- [ ] Si el informe nombra capturas o trazas por su ruta (CTRF, Playwright,
      JUnit), elegir la carpeta `test-results`: se guardan como evidencias.
- [ ] **Sin vincular** lista los tests sin caso y el motivo; «Vincular…» los
      asigna a un caso (sus resultados no cambian) y «Desvincular» lo retira.
- [ ] Un Cucumber JSON se rechaza con un mensaje que indica usar Messages.
- [ ] Con un ciclo activo, importar un informe como run nuevo eligiendo ese
      «Ciclo»: el progreso del ciclo suma sus resultados sin tocar el run.
      Un ciclo cerrado no aparece en el selector (CYC-02).

### 4.4d Ejecución manual paso a paso (EJE-02)

En un proyecto, **Ejecuciones** tiene «Nuevo run manual» (elige casos, entorno,
build y, si las hay, configuración) y cada run abre su pantalla. Un run de un
ciclo («Ejecutar» en Ciclos) se abre desde la pestaña Runs del ciclo. También
en la web (EJE-06), sin archivos: allí el borrador se guarda en el navegador y
no se ve en otro equipo ni en otro navegador.

**Atajos** (con un paso enfocado y sin escribir en un campo): **P** pasa,
**F** falla, **B** bloqueado, **S** omitido, **J/K** o las flechas para moverse,
**N** para escribir lo obtenido, **T** cronómetro, **Ctrl+Enter** guarda el
resultado, **Ctrl+Shift+N** siguiente elemento, **?** la lista.

**Las evidencias se quedan en este equipo:** se guardan cifradas y aún no se
sincronizan (llega con SYNC-04b). Otro equipo ve el resultado, pero no sus
adjuntos.

- [ ] Crear un run manual con dos casos, uno de ellos con Outline o con
      flujos: el caso con filas o flujos muestra un selector y cada fila o
      flujo se ejecuta por separado.
- [ ] Marcar los pasos con el teclado, escribir lo obtenido en un paso
      fallido, cerrar la app y volver a abrirla: el borrador sigue ahí (el
      cronómetro, en pausa).
- [ ] Hacer una captura (Win+Mayús+S), enfocar un paso y pulsar Ctrl+V: la
      captura aparece en ese paso con su miniatura. Adjuntar también un
      archivo al resultado.
- [ ] «Guardar resultado»: el intento aparece en **Intentos** con sus
      adjuntos. «Volver a ejecutar» es simplemente marcar de nuevo y guardar:
      es otro intento, y el último es el final.
- [ ] En un intento fallido, «Crear defecto»: el defecto sale relleno con el
      caso, el paso, lo obtenido, el build y el entorno, y comparte las
      evidencias.
- [ ] Editar después el caso (cambiar el texto de un paso): el run sigue
      mostrando la revisión ejecutada, avisa de que el caso cambió, y el
      resultado guardado no cambia.
- [ ] «Cerrar run» (Completado o Cancelado) y «Reabrir». Con el run de un
      ciclo, el progreso del ciclo refleja cada intento guardado.
- [ ] Ojo con un caso con flujos o filas añadido entero a un ciclo: la celda
      del ciclo muestra el **peor** resultado de lo ya ejecutado (por ejemplo,
      «Falla» aunque falten flujos), mientras que la pantalla del run cuenta
      cada flujo y fila por separado («2/3» hechos). Las dos dicen la verdad;
      miran cosas distintas.
- [ ] Pulsar Ctrl+Enter dos veces seguidas: se guarda un solo intento.
      Cancelar un run con borradores los descarta; al completarlo se puede
      elegir.
- [ ] **Eliminar run** (EJE-07): el diálogo dice cuántos elementos,
      resultados, importaciones y evidencias se ocultan, los borradores que
      se descartan, el ciclo cuyo progreso deja de contarlo y los defectos
      vinculados. Al confirmar, el run desaparece de la lista, del progreso
      del ciclo; en otro equipo, tras sincronizar, también.
      Con el ciclo cerrado no deja eliminarlo. Reimportar el mismo informe en
      un run nuevo funciona sin aviso de duplicado.

**En la web** (EJE-06; navegador con la sesión iniciada):

- [ ] «Nuevo run manual» y «Ejecutar» en un ciclo funcionan; la pantalla del
      run dice «Los adjuntos solo están disponibles en el escritorio. Los borradores de ejecución se
      guardan en este navegador».
- [ ] Ejecutar un caso con el teclado y guardar: el intento aparece también en
      el escritorio tras sincronizar, con sus pasos y lo obtenido. Y al revés:
      un intento guardado en el escritorio se ve en la web.
- [ ] Marcar pasos, cerrar la pestaña y volver: el borrador sigue. En otro
      navegador o equipo no está (es de ese navegador). Al cerrar sesión se
      borra.
- [ ] Con el mismo elemento abierto en dos pestañas, guardar en una: la otra,
      al marcar, avisa de que ese intento ya se guardó y recarga.
- [ ] Pegar una captura (Ctrl+V) avisa «Los adjuntos solo están disponibles en el escritorio»; no
      hay botones de adjuntar. «Crear defecto» desde un intento fallido abre el
      defecto relleno, sin evidencias.
- [ ] «Importar informe» está desactivado y la pestaña «Sin vincular» dice que
      está en la app de escritorio.
- [ ] Cancelar en la web un run que tenía un borrador en el escritorio: al
      sincronizar, el escritorio descarta ese borrador y sus adjuntos.

### 4.4e Resultados en la matriz e informe de estado (EJE-04, EJE-03)

Es el criterio de salida de 0.2.0: un run manual y uno de Playwright aparecen
en la misma matriz.

- [ ] Con un caso vinculado a un requisito: ejecutarlo a mano (falla) e
      importar después un informe de Playwright con su etiqueta (`@<ID del
      caso>`) que lo pasa. En **Trazabilidad → Matriz**, el caso muestra
      «Pasa» con la clave del run importado y la fecha; la clave abre el run.
      Volver a ejecutarlo a mano: ahora manda el run manual (gana el último
      resultado final).
- [ ] Editar después los pasos del caso: el resultado no cambia y aparece
      «Desactualizado» (se ejecutó una revisión anterior). Cambiar solo el
      estado, la prioridad o el título no lo marca.
- [ ] Un test que falló y pasó al reintentar aparece como «Flaky»; un caso
      fallido con su defecto en «Corregido» aparece como «Re-test».
- [ ] Filtrar la matriz por ciclo, configuración, build o entorno: los
      estados cambian a lo de esas ejecuciones y la dirección de la página
      guarda los filtros; «Quitar filtros» vuelve a todo.
- [ ] «Exportar matriz (.xlsx)»: la hoja «Matriz» es la de la plantilla; la
      hoja «Resultados» trae el run, la fecha, la configuración y los defectos
      con su severidad.
- [ ] En **Ejecuciones** (o en un ciclo), «Informe de estado»: elegir
      Proyecto, Ciclo o Plan y un periodo. Revisar que los criterios de salida
      del plan dicen «Cumple» / «No cumple» (sin plan, se usan los tres por
      defecto: ≥ 95 % ejecutado, 0 defectos críticos abiertos, ≥ 90 % de
      cobertura) y que los defectos dicen «a fecha de hoy».
- [ ] Cambiar el resumen y escribir recomendaciones, cerrar y volver a abrir el
      informe: el texto sigue ahí. **Se guarda solo en este equipo** y va en las
      exportaciones. «Exportar .xlsx» y «Exportar PDF» dejan los archivos en la
      carpeta de descargas.
- [ ] En la web: la matriz con resultados, los filtros y el informe funcionan
      igual (el servidor calcula lo mismo que el escritorio).

### 4.5 Sincronización

- [ ] Dos cuentas en el mismo equipo: cada una solo ve y envía lo suyo
      (FIX-07, FIX-08, plantillas FIX-08b).
- [ ] Dos equipos sin conexión creando casos: al sincronizar no hay claves
      repetidas (DAT-01).
- [ ] Editar el mismo caso en dos equipos: aparece el panel de conflictos y
      puedes elegir versión (Fase 8C).
- [ ] Borrar un proyecto en un equipo: en el otro desaparece con sus planes,
      casos, requisitos y tarjetas (FIX-05).
- [ ] Purga (SYNC-06): en Administración → General, pon la retención de
      elementos borrados en el mínimo (1 día) y guarda. Borra un caso ya
      sincronizado y, pasado un día, sincroniza: el caso se purga y no vuelve.
      Después restablece la retención (30 por defecto).

### 4.5b Verificar evidencias (DAT-03b)

- [ ] Administración → **Evidencias** muestra cuánto ocupan los adjuntos, por
      tipo, y la retención de los informes en bruto (90 días por defecto).
- [ ] **Retención por proyecto** (DAT-03c): elige un proyecto, pon las
      trazas a 1 día y pulsa «Guardar»: pide confirmación con los archivos que
      caducarían. Tras actualizar, la evidencia que ya había no caduca hasta
      pasado un plazo completo. Importa un informe con una traza de un test que pasa y
      otra de uno que falla; pasado un día, reinicia: la del que pasó caduca
      («Caducados por retención» sube) y su resultado sigue ahí; la del que
      falló no. Las evidencias de la ejecución manual nunca caducan. El
      ajuste no aparece en otro equipo: es de este equipo.
- [ ] **Verificar evidencias** con algunos adjuntos: «Todo en orden».
- [ ] Con Pharos cerrado, mueve fuera de `evidence` un archivo de una de sus
      subcarpetas (guárdalo) y copia otro `.pev` en esa subcarpeta con un
      nombre nuevo de 64 letras `0-9a-f` que empiece por las mismas dos.
      Abre y verifica: el primero sale en «Faltan», con el adjunto y su
      proyecto; el segundo, en «Archivos sin registro», como «Reciente»: una
      copia cuenta como nueva aunque conserve la fecha del original, y no se
      puede borrar durante 24 horas. «Marcados por la última verificación»
      muestra «1 falta», también tras reiniciar.
- [ ] Pulsa **Cancelar** durante una verificación larga: el informe dice
      cuántos archivos se comprobaron.
- [ ] Vuelve a adjuntar el archivo que falta en el mismo sitio y verifica: ya
      no sale.
- [ ] En la web, la pestaña Evidencias solo dice que está en la app de
      escritorio.

### 4.6 Clave de recuperación (SEC-03)

- [ ] Administración → Seguridad → **Mostrar clave de recuperación**:
      guárdala en papel o en un gestor de contraseñas.
- [ ] Copiar `pharos.db.enc` a otro equipo (o, tras guardar una copia del
      `.enc`, borrar la entrada `db-key` del Administrador de credenciales),
      abrir Pharos y recuperar los datos con la clave.
- [ ] Una errata en la clave se avisa antes de tocar nada; una clave de otro
      equipo se rechaza.

### 4.7 IA (opcional)

- [ ] Con claves reales, "Probar conexión" y "Listar modelos" en cada proveedor
      que vayas a usar (IA-08).
- [ ] Generar casos desde un requisito (✨ en Trazabilidad) y aceptar algunos:
      quedan vinculados en la matriz (IA-05).
- [ ] Sugerir riesgos, estrategia de automatización y precondiciones (IA-10).
- [ ] Sin internet, con Ollama (Fase 7). Anota qué modelos devuelven JSON
      inválido a menudo.

### 4.8 Accesibilidad (UX-05)

Solo con el teclado y con NVDA o el Narrador de Windows:

- [ ] "Saltar al contenido" es la primera parada del tabulador.
- [ ] Recorrer el asistente del plan; el paso actual se anuncia.
- [ ] En el editor de casos, reordenar pasos con Espacio y flechas.
- [ ] Abrir y cerrar un diálogo de IA, el panel de conflictos y la clave de
      recuperación: el foco vuelve al botón que los abrió.

Los puntos abiertos de la auditoría están en
[`accesibilidad/auditoria-wcag-0.1.0.md`](accesibilidad/auditoria-wcag-0.1.0.md).

### 4.9 Diagnóstico

- [ ] Administración → Diagnóstico → **Exportar diagnóstico** guarda
      `pharos-diagnostic-0.2.0-alpha.1-<fecha>.zip` en la carpeta de descarga.
- [ ] Abrir el ZIP: no contiene proyectos, casos, tu perfil, la base de datos,
      claves ni tokens (BASE-08).

### 4.10 Interfaz rediseñada (0.2.0-alpha.1)

- [ ] Estrechar la ventana: por debajo de 1280 px el menú lateral pasa a
      franja de iconos; contraer y expandir el menú se recuerda al reabrir.
- [ ] Inicio: los indicadores llevan a su sitio; «Criterios de salida» y
      «Próximas pruebas» muestran datos del plan y de los casos.
- [ ] Inicio con ejecuciones (RED-W6): tras un run manual y un informe
      importado, la tasa de éxito, «Ejecución por proyecto» y «Ejecuciones
      diarias» cuentan ambos; cambiar el periodo cambia la gráfica y la tasa,
      no el resto; «Criterios de salida» dice Cumple / No cumple y filtra
      «En riesgo» / «Cumplen»; «Próximas pruebas» separa sin ejecutar,
      bloqueadas y re-test. Con el servidor parado (web), «Reintentar».
- [ ] Proyectos: buscar, ordenar y paginar; borrar un proyecto desde sus
      Ajustes pide escribir el prefijo y solo se cierra con «Cancelar».
- [ ] Plan: recorrer los 19 pasos con la lista de pasos; cambiar un campo e
      intentar salir: Pharos pregunta antes de descartar.
- [ ] Casos: filtrar, seleccionar y exportar `.feature`; abrir un caso y
      pasar al siguiente con «›»; «Ir a un caso…» con Ctrl P.
- [ ] Administración: cada pestaña abre; el tema «Según el sistema» sigue al
      de Windows; los parámetros de IA que un modelo no admite salen con
      candado.
- [ ] Tema claro y oscuro en todas las pantallas: nada ilegible ni cortado.

## 5. Cómo informar de un problema

1. Si una vista falla, su pantalla de error tiene **Exportar diagnóstico**;
   si no, ve a Administración → Diagnóstico → **Exportar diagnóstico**.
2. **Si la base local no abre** (pantalla "Falta la clave de la base de datos
   local", "datos de una versión más nueva" u otra que no deja entrar), esa
   pantalla no tiene "Exportar diagnóstico" y Administración no es accesible
   (limitación conocida de la beta). En su lugar:
   - copia el mensaje exacto de la pantalla;
   - haz una captura;
   - adjunta el log de ese día, `pharos.AAAA-MM-DD.log`, de
     `%LOCALAPPDATA%\com.pharos.desktop\logs` (y `pharos.panic.log` si
     existe). Los logs no llevan tus datos: correos, tokens y claves van
     enmascarados.
3. Abre un issue en el repositorio de GitHub (`shift3385/Pharos`) con:
   - la versión (`0.2.0-alpha.1`) y el apartado de esta guía;
   - los pasos para reproducirlo, lo que esperabas y lo que pasó;
   - una captura, si ayuda;
   - el ZIP de diagnóstico (o, si la base no abrió, el log del paso 2).
4. **Nunca adjuntes** `pharos.db.enc`, las copias `.bak-…`, tu clave de
   recuperación, claves de IA ni contraseñas.

Cada corrección se publica como una nueva versión de prueba
(`0.2.0-alpha.2`…). Las validaciones de los apartados 4.1 a 4.9 son las que
faltan para cerrar la `0.1.0`, que se publicaría desde la etiqueta
`v0.1.0-beta.1` ([`VERSIONING.md`](VERSIONING.md) §5).

## 6. Si algo sale mal con los datos

- **Volver a los datos de antes de actualizar:** cierra Pharos, renombra
  `pharos.db.enc`, copia la `.bak-…` que quieras como `pharos.db.enc` y abre la
  versión que escribió esa copia (README → "Local data backups").
  `0.1.0-alpha.1` no detecta datos de una versión más nueva: no abras con ella
  datos ya actualizados sin restaurar antes la copia.
- **"Falta la clave de la base de datos local":** escribe la clave de
  recuperación (README → "Recovery key").
- **"Actualiza la app para sincronizar":** la app y el servidor no tienen
  versiones compatibles; instala la versión que corresponde al servidor. Tus
  cambios se conservan.
