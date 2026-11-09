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
- [ ] Solo datos de prueba (proyectos «Banca Móvil» y «Portal Clientes», cuenta
      `smoke@pharos.dev`): nada personal ni real.
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
      proyecto (en este ejemplo, «Banca Móvil»)», nunca como si fueran los del
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
- [ ] **Requisitos desde un proyecto (IA-17)** (Trazabilidad → «Importar /
      Exportar»): con una clave real, elegir una carpeta de proyecto; el
      inventario no lista `node_modules`, `.env` ni claves; el aviso dice si
      sale del equipo y a qué proveedor; las propuestas citan `archivo:línea`
      que existen; aplicar deja «IA · pendiente de revisión» y las fuentes en
      el formulario. *Por qué no:* el selector de carpetas es nativo (fuera de
      la WebView) y el análisis necesita una clave real. Lo cubren además
      `ProjectRequirementsModal.test.tsx` y los tests de Rust de
      `project_scan.rs`.
- [ ] **Requisitos desde diseños (IA-18)** (Trazabilidad → «Importar /
      Exportar»): con una clave real y un modelo con visión, pegar una captura,
      añadir un PDF y la carpeta de un proyecto de Claude Design; el resumen
      cuenta imágenes, MB y tokens; el aviso dice a qué proveedor va, sin el
      modelo; cada propuesta muestra su imagen con la zona marcada; con
      `llama3.2:3b` en Ollama, «Analizar» se bloquea con su motivo. *Por qué
      no:* el análisis necesita una clave real y un modelo de visión. Lo cubren
      además `RequirementsFromDesignModal.test.tsx`, los tests de
      `fromDesign/` y los de Rust de `ai.rs`.
- [ ] **Guardar la imagen de la fuente (IA-19)** (Requisitos → «Importar» →
      «Requisitos desde diseños», en la app de escritorio): aplicar con
      «Guardar las imágenes como adjunto de los requisitos» marcada; en
      «Editar requisito › Fuente» se ve la miniatura con la zona y, al pulsarla,
      la imagen a tamaño completo; sin marcarla, dice «La imagen no se guardó
      en Pharos.»; «Evidencias» la cuenta en «Requisitos». *Por qué no:* necesita
      una clave real y un modelo de visión. Lo cubren además
      `RequirementSources.test.tsx` y los tests de Rust de
      `requirement_attachments.rs`.
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
- [ ] Si se ejecutó con IA: las capturas del capítulo 11 muestran respuestas
      razonables del proveedor configurado y el campo de la clave difuminado.
