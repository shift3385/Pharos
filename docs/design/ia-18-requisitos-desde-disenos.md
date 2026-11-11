# IA-18 · Requisitos desde capturas, bocetos y diseños

Diseño aprobado por el usuario el 2026-11-07. La decisión está en
[ADR-0037](../adr/0037-requisitos-desde-disenos.md). La revisión de las propuestas, la
deduplicación y la forma de aplicarlas son comunes con IA-17 («Requisitos desde un
proyecto»), que es su dueña. Esta pista solo produce `CandidateRequirement[]` y
`sourceLabel`.

## 1. Flujo (Trazabilidad → Requisitos)

1. «Requisitos desde diseños», dentro del menú «Importar / Exportar». Se desactiva,
   con su motivo, si no hay IA.
2. **Material** (`RequirementsFromDesignModal`):
   - Una zona donde arrastrar archivos o pegar con Ctrl+V; es enfocable, para pegar
     con el teclado.
   - «Elegir archivos» y «Elegir carpeta».
   - La ayuda por fuente: desde Figma o Canva se exportan los frames como PNG o PDF.
   - Cada elemento lleva una casilla para incluirlo, una miniatura o el tipo, su
     tamaño, los tokens estimados, la pantalla de Claude Design si la hay, una nota
     opcional y «Quitar».
   - Debajo: el contexto del producto (opcional), el resumen («3 de 8 imágenes o PDF ·
     2,1 MB · ≈ 9 000 tokens»), el aviso de privacidad y «Analizar».
3. **Estados:**
   - Preparando el material.
   - Leyendo el material con IA.
   - Fallo (`AiFailureNotice`, «Reintentar»).
   - El botón queda bloqueado si se supera un límite, si no hay IA, si el modelo no ve
     imágenes o si no lee PDF; siempre con su motivo. Con un modelo desconocido se
     avisa y se deja enviar.
4. **Propuestas:**
   - La vista común de IA-17 tras su síntesis con `partialMaterial: true`.
   - Cada propuesta muestra su motivo, la marca «Visto en el diseño» o «Inferido», los
     criterios de aceptación, los supuestos, las preguntas abiertas y su fuente
     (`sourceLabel`): la miniatura con el recuadro de la región, o la pantalla y el
     archivo de diseño.
   - Lo aceptado queda «IA · pendiente de revisión».

## 2. Fuentes

| Fuente | Cómo entra | Qué recibe el modelo |
| --- | --- | --- |
| Captura, boceto (PNG, JPG, WebP, GIF, SVG) | Arrastrar, elegir o pegar | Imagen con 1568 px de lado largo, en WebP y sin metadatos |
| PDF (exportación de Figma, Canva o Claude Design) | Elegir o arrastrar | El PDF tal cual (Claude, Gemini, OpenAI); con Ollama, se pide exportar imágenes |
| Excalidraw (`.excalidraw`) | Elegir o arrastrar | Sus textos, por frame y de arriba abajo; para el dibujo, añadir el PNG exportado |
| Claude Design (carpeta o ZIP) | «Elegir carpeta» o el ZIP | Los `.md` (README, SPEC, notas de traspaso), un esquema textual de cada `*.dc.html` y el `.thumbnail`; las imágenes de `assets/` empiezan desmarcadas |
| Figma, Canva | Exportar los frames a PNG o PDF | Como imagen o PDF |

Probado con la carpeta real `Pharos Design System/templates/rediseno-app`: salen 17
textos y la miniatura, con unos 59 000 caracteres y unos 16 700 tokens. El README y
`ScrPlan` se recortan a 8 000 caracteres.

## 3. Pendiente

- Montado en Trazabilidad → «Importar / Exportar» sobre la revisión común de IA-17, con
  `DesignSourceLabel` (miniatura y región) y el aviso común `AiSendNotice`. El aviso
  nombra al proveedor, pero no al modelo: lo decidió el usuario el 2026-11-07.
- Falta validarlo con claves reales: ROADMAP, guía de la beta y `docs/manual/REVIEW.md`.
- Mejoras posteriores:
  - IA-18b: Figma por enlace y token, con los textos de las capas.
  - Tapar zonas sensibles antes de enviar.
  - Casos de prueba desde las mismas imágenes (IA-05).
  - Capturar las pantallas de Claude Design renderizándolas sin ejecutar sus scripts.

## 4. Fuentes consultadas

- [Claude: visión](https://platform.claude.com/en/docs/build-with-claude/vision)
- [Gemini: comprensión de imágenes](https://ai.google.dev/gemini-api/docs/image-understanding)
- [OpenAI: imágenes y visión](https://developers.openai.com/docs/guides/images-vision)
- [Figma: límites de la API REST](https://developers.figma.com/docs/rest-api/rate-limits)
- Exportaciones de Claude Design: guías de terceros, sin documentación oficial; el
  formato se comprobó con una carpeta real del usuario.
