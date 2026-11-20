# Revisión de cada regeneración del manual

Lista para la persona (o el agente) que revisa un PR que regenera
`docs/manual/` con `npm run manual` (MAN-01). El diff de imágenes **es** la
revisión de lo que cambió a la vista: cada imagen nueva o cambiada tiene que
tener una explicación.

## Antes de mirar el diff

- [ ] `npm run manual` terminó sin fallos (todas las pruebas guiadas en verde) y
      `npm run check:manual` pasa; anota en el PR la cobertura que imprime
      (`N/M elementos, X %`) y los pendientes.
- [ ] Si se ejecutaron los tours de IA (`PHAROS_TOURS_AI_KEY` definida), el
      escaneo de secretos pasó (`check-manual.mjs --secret-scan`, lo lanza el
      propio `npm run manual`).

## Capturas

- [ ] Cada imagen cambiada corresponde a un cambio real de la aplicación (o a
      un paso nuevo); no hay cambios de ruido (hora, cursor, aviso flotante).
- [ ] Tema claro, ventana de 1440 px (390 px en el capítulo de móvil).
- [ ] Ningún diálogo cortado, ningún aviso (toast) tapando lo que el paso
      explica, ningún menú abierto que no toque.
- [ ] Solo datos de prueba, todos sobre probar Pharos 0.6.0 (proyectos
      «Pharos» y «API de sincronización»; valores en
      `e2e/tours/data/pharos.ts`): nada personal ni real.
- [ ] Solo aparecen las tres cuentas del manual (NC-052, enmendada): Liomar
      Rodríguez (`liomar.qa@pharos.test`), su compañero Jorge L. Meneses Yero
      (`jorge.meneses@pharos.test`, solo en las funciones de equipo) y
      «Administrador» (`admin@pharos.test`, solo en la administración del
      servidor). Ningún otro nombre (`scripts/manual/persona.mjs`).
- [ ] **Ninguna clave visible**: en «Motor de IA» la clave aparece como guardada
      y enmascarada, nunca en claro.
- [ ] **La captura demuestra el pie** (MAN-02): lo que el texto explica se ve
      en la imagen. Cada paso tiene su propia captura, centrada en su control;
      no reutiliza la pantalla de otro paso con un error u otro menú abierto.
- [ ] **Antes y después** cuando el paso es un cambio de estado (mostrar la
      contraseña, mover una tarjeta): dos pasos con el mismo `group`, que el PDF
      imprime uno junto a otro.
- [ ] **Énfasis** (MAN-02): un paso sobre un control pequeño en una pantalla
      grande lleva `focus`; el contorno ámbar rodea ese control y el recuadro
      «Detalle» del PDF lo amplía. Ningún paso de la ejecución avisa de
      «focus not displayed» (lo lista `build-manual`). En GitHub el Markdown
      muestra solo el contorno: el «Detalle» es del PDF (se recorta por CSS de
      la misma imagen, sin archivos de más).
- [ ] Ningún paso repite la captura de otro (p. ej. iniciar sesión y la
      primera pantalla de entrada).

## Textos

- [ ] Cada pie de paso describe lo que muestra su captura, en español, en
      segunda persona y con los nombres de la interfaz entre «comillas».
- [ ] **El pie explica para qué**, no solo qué botón pulsar: el propósito del
      paso, qué cambia al hacerlo y cuándo conviene (MAN-02). Un pie que solo
      enumera clics se amplía (o se completa con una nota «### Paso <id>» en
      `fuentes/`).
- [ ] **Los datos de prueba se presentan como ejemplo**: «el nombre de tu
      proyecto (en este ejemplo, «Pharos»)», nunca como si fueran los del
      lector.
- [ ] **Cada pie está al día** con la interfaz: los textos coinciden con
      `src/shared/i18n/locales/es.json` y los iconos con los de la pantalla
      (papelera «Quitar: …» para quitar una fila; × en etiquetas; ✕ para
      cerrar). Nada que ya no exista (p. ej. una sección retirada del perfil).
- [ ] Cada capítulo nuevo tiene su fuente en `docs/manual/fuentes/<id>.md` con
      «Para qué sirve», «Consejos» y «Véase también».
- [ ] Los enlaces a [guia-beta.md](../guia-beta.md) y al
      [GLOSARIO](../GLOSARIO.md) siguen llevando a su sitio.

## PDF

- [ ] `docs/manual/Pharos-manual-de-usuario.pdf` (local, no se versiona; en CI,
      artefacto `manual` de `main`) abre con portada, índice con números de
      página, capítulos numerados, números de página al pie y marcadores.
- [ ] Ninguna página en blanco de sobra ni imágenes partidas entre páginas.
- [ ] **Índice navegable** (MAN-02): cada capítulo y cada paso del índice es
      un enlace a su página y lleva su número de página; los marcadores del
      PDF siguen ahí.
- [ ] **Nada huérfano ni partido**: el título, el texto y la captura de un
      paso van juntos; «Consejos» y «Véase también» no empiezan al pie de una
      página para seguir en la siguiente; ningún pie ni conclusión queda
      cortado.
- [ ] **Ninguna página casi vacía**, salvo el bloque de «Consejos» y «Véase
      también» al final de un capítulo: una página no lleva solo una imagen y una
      frase. Si pasa, se agrupan pasos cortos o se amplía la explicación.
      Recorre todas las páginas, no una muestra.
- [ ] El índice no explica cómo se genera el manual (eso va en
      [README.md](README.md) y en esta lista).

## Fuera de los tours (revisión manual)

Lo único que las pruebas guiadas no pueden recorrer en su entorno aislado
(`skip` en `e2e/tours/manifest.ts`). Compruébalo a mano en cada versión que
se publica:

- [ ] **Usuarios del servidor (SEC-11, SEC-09)** (Administración → Usuarios):
      con una segunda cuenta en el mismo servidor, «Restablecer contraseña…»
      explica qué pasa y muestra el enlace una sola vez (o lo envía por correo
      con SMTP, y entonces el administrador no lo ve); el enlace abre
      «Elige una contraseña nueva» con «Enlace generado por …»; la otra cuenta
      recibe el aviso. «Hacer administrador» y «Quitar administrador» piden
      confirmación, y el último administrador no se puede quitar. Pendiente de
      los pasos del capítulo 15 con «Administrador» y la cuenta de Jorge
      (NC-052, enmendada); fuera del tour quedan siempre el envío por correo
      (SMTP) y la página del enlace. Lo cubren además `server/tests/admin.test.ts` y `UsersTab.test.tsx`.
- [ ] **Fusión por campo (SYNC-02)**: con dos equipos (o el escritorio y la
      web) sobre la misma cuenta, cambiar campos distintos de un caso sin
      sincronizar entre medias se combina sin preguntar y avisa «Se combinaron
      cambios…»; cambiar el mismo campo abre el panel solo con ese campo; en la
      web, guardar sobre una versión más nueva combina, o abre «Alguien cambió
      los mismos campos…». *Por qué no en el tour:* necesita dos clientes a la
      vez. Lo cubren `sync.rs` (tests de fusión), `merge.test.ts`,
      `FieldMerge.test.tsx` y `serverApi.test.ts`.
- [ ] **Desactivar una cuenta (SEC-12)** (Administración → Usuarios): con una
      segunda cuenta que sea el único Test Manager de un workspace
      compartido, «Desactivar cuenta…» pide el sucesor y el correo; la otra
      cuenta deja de sincronizar al momento y, al entrar, ve «Esta cuenta está
      desactivada…»; en «Miembros» aparece «Desactivada»; «Reactivar cuenta»
      la devuelve. Pendiente de los pasos del capítulo 15
      con la cuenta de Jorge (NC-052, enmendada); fuera del tour queda siempre
      lo que ve Jorge al entrar («Esta cuenta está desactivada…»). Lo cubren `server/tests/account-disable.test.ts` y
      `UsersTab.test.tsx`.
- [ ] **Ollama** (Administración → Motor de IA): con Ollama instalado y en
      marcha, la tarjeta pasa a «Conectado», «Descargar «modelo»» descarga el
      modelo y «Solo local» responde sin internet. *Por qué no en el tour:*
      necesita Ollama y un modelo de varios GB. Los tours sí recorren el
      estado «No detectado».
- [ ] **Carpeta de descarga** (Administración → General): «Elegir carpeta…»
      abre el selector de Windows y las exportaciones van a la carpeta
      elegida; «Usar Descargas» vuelve a Descargas. *Por qué no:* el selector
      es nativo (fuera de la WebView) y «Usar Descargas» escribiría en tu
      carpeta real, que los tours nunca tocan. Lo cubren además los tests de
      Rust de `downloads.rs`.
- [ ] **Requisitos desde un proyecto (IA-17)** (Requisitos → «Importar»): con
      una clave real, elegir una carpeta de proyecto **con el selector de
      Windows** (el capítulo 17 lo recorre con la carpeta de ejemplo, que el
      build de pruebas elige solo, MAN-03); el inventario no lista `node_modules`, `.env` ni claves; el aviso dice si
      sale del equipo y a qué proveedor; las propuestas citan `archivo:línea`
      que existen; aplicar deja «IA · pendiente de revisión» y las fuentes en
      el formulario. *Por qué no:* el selector de carpetas es nativo (fuera de
      la WebView). Lo cubren además
      `ProjectRequirementsModal.test.tsx` y los tests de Rust de
      `project_scan.rs`.
- [ ] **Requisitos desde diseños (IA-18)** (Requisitos → «Importar»): con una
      clave real y un modelo con visión, pegar una captura, añadir un PDF y la
      carpeta de un proyecto de Claude Design (el capítulo 17 recorre una
      imagen; el resto queda aquí); el resumen
      cuenta imágenes, MB y tokens; el aviso dice a qué proveedor va, sin el
      modelo; cada propuesta muestra su imagen con la zona marcada; con
      `llama3.2:3b` en Ollama, «Analizar» se bloquea con su motivo. *Por qué
      no:* los tours no pegan del portapapeles ni prueban Ollama. Lo cubren
      además `RequirementsFromDesignModal.test.tsx`, los tests de
      `fromDesign/` y los de Rust de `ai.rs`.
- [ ] **IA en la web con la clave del escritorio (IA-12)**: el capítulo 15
      recorre en el escritorio el interruptor, el consentimiento, el cambio de
      modelo, desactivar y quitar la clave, con una clave de ejemplo. Queda la
      parte web, con una clave real y la API con `AI_VAULT_KEY`: «Motor de
      IA» dice «IA disponible»; «Asistir con IA» responde y su aviso dice «a
      través de tu servidor Pharos»; «Dejar de usarla en la web» borra la
      copia. *Por qué no en el tour:* los tours recorren la app de escritorio y
      no llaman a un proveedor real. Lo cubren además
      `WebAccessPanel.test.tsx`, `webAccess.test.ts` y
      `server/tests/ai.vault.test.ts`.
- [ ] **Versión web** (`npm run dev`, navegador): el aviso de cambios
      antiguos sin enviar («Descargar» / «Descartar»), la ejecución sin archivos
      («Los adjuntos solo están disponibles en el escritorio», borrador en el navegador) y los
      avisos «solo en la app de escritorio» de importar informe, adjuntos,
      plantillas propias, clave de recuperación y carpeta de descarga. *Por
      qué no:* los tours recorren la app de escritorio. Lo cubren además las
      pruebas unitarias (Vitest) con `isTauri() = false`.
- [ ] **Inicio sin ejecuciones cargadas** (RED-W6): con el servidor parado
      en la versión web (o la lectura de métricas fallando), las tarjetas de
      ejecución dicen «No se pudieron cargar las ejecuciones» con
      «Reintentar», y proyectos, planes y criterios siguen visibles; al
      volver el servidor, «Reintentar» las carga. *Por qué no en el tour:*
      habría que hacer fallar solo esa lectura con el resto en pie. Lo cubren
      `DashboardPage.test.tsx` y `loadHomeMetrics.test.ts`.

## Pendientes

- [ ] Los capítulos y elementos pendientes (`pending`/`skip` en
      `e2e/tours/manifest.ts`) siguen teniendo motivo; uno que ya se puede
      recorrer pasa a `active` con su tour.
- [ ] Si se ejecutó con IA: las capturas del capítulo 17 muestran respuestas
      razonables del proveedor configurado y el campo de la clave difuminado.
