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

## Textos

- [ ] Cada pie de paso describe lo que muestra su captura, en español, en
      segunda persona y con los nombres de la interfaz entre «comillas».
- [ ] Cada capítulo nuevo tiene su fuente en `docs/manual/fuentes/<id>.md` con
      «Para qué sirve», «Consejos» y «Véase también».
- [ ] Los enlaces a [guia-beta.md](../guia-beta.md) y al
      [GLOSARIO](../GLOSARIO.md) siguen llevando a su sitio.

## PDF

- [ ] `docs/manual/Pharos-manual-de-usuario.pdf` (local, no se versiona; en CI,
      artefacto `manual` de `main`) abre con portada, índice con números de
      página, capítulos numerados, números de página al pie y marcadores.
- [ ] Ninguna página en blanco de sobra ni imágenes partidas entre páginas.

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
- [ ] **Versión web** (`npm run dev`, navegador): el aviso de cambios
      antiguos sin enviar («Descargar» / «Descartar»), la ejecución sin archivos
      («Los adjuntos solo están disponibles en el escritorio», borrador en el navegador) y los
      avisos «solo en la app de escritorio» de importar informe, adjuntos,
      plantillas propias, clave de recuperación y carpeta de descarga. *Por
      qué no:* los tours recorren la app de escritorio. Lo cubren además las
      pruebas unitarias (Vitest) con `isTauri() = false`.

## Pendientes

- [ ] Los capítulos y elementos pendientes (`pending`/`skip` en
      `e2e/tours/manifest.ts`) siguen teniendo motivo; uno que ya se puede
      recorrer pasa a `active` con su tour.
- [ ] Si se ejecutó con IA: las capturas del capítulo 11 muestran respuestas
      razonables del proveedor configurado y el campo de la clave difuminado.
