# ADR-0023 · Salida estructurada de la IA: prompt estricto y validación zod en el cliente

- **Estado:** Aceptado (2026-10-29; IA-05, IA-10; plan aprobado por el usuario)
- **Contexto:**
  - IA-05 genera escenarios Gherkin y casos de prueba desde un requisito. IA-10
    sugiere riesgos y precondiciones. Las dos necesitan datos estructurados, no
    prosa.
  - El roadmap pide salida JSON con esquema, validada antes de usarla. Una
    respuesta inválida se informa y nunca se aplica a medias.
  - Hay seis caminos de IA ([ADR-0007](0007-varios-proveedores-ia.md)): Gemini,
    OpenAI, Claude, OpenRouter, un endpoint compatible con OpenAI y Ollama. Cada
    uno tiene su propio modo JSON o de salida estructurada, y algunos endpoints
    compatibles no tienen ninguno.
- **Decisión:**
  - **El mismo camino de chat para todos.** Las peticiones estructuradas usan
    `aiChatWithProvenance` con un prompt estricto: un solo objeto JSON, la forma
    exacta con un ejemplo, el idioma de la app para los textos y las claves en
    inglés. El texto del usuario va entre etiquetas `<data>` y el prompt dice
    que es material, no instrucciones. `ai.rs` no cambia.
  - **Validación en el cliente con zod** (`src/modules/ai/model/schemas.ts`):
    1. Se extrae el objeto JSON de la respuesta, aunque venga entre vallas de
       código o con prosa alrededor.
    2. Se parsea.
    3. Se valida contra el esquema.
  - **Todo o nada.** Si una sola parte no cumple, se rechaza la respuesta
    entera. Las claves desconocidas se descartan; tipos, enumerados y longitudes
    deben cumplirse.
  - **Normalización mínima.**
    - Cada paso queda en una línea y se quita una palabra clave Gherkin
      inicial ("Given", "Dado que", "Y", "Pero"…), porque el editor ya la
      añade.
    - La prioridad es un enumerado en inglés aunque los textos vayan en
      español. El prompt lo pide así, y además se ignoran mayúsculas y tildes y
      se traducen los nombres en español ("Alta" → `high`). Un valor
      desconocido sigue rechazando la respuesta.
  - **El texto del usuario no puede cerrar el bloque `<data>`.** Una etiqueta
    `<data>` o `</data>` dentro del texto se neutraliza (su `<` pasa a `‹`), y
    la descripción y el contexto se recortan a 4000 y 6000 caracteres.
  - **Errores tipados** (`AiOutputError`):
    - `empty`: respuesta vacía;
    - `refusal`: prosa sin JSON, o una lista vacía con `reason`, que es la vía
      que el prompt da para declinar;
    - `invalid-json`;
    - `invalid-schema`, con los primeros campos que fallaron.

    El timeout y los errores del proveedor se distinguen aparte. La UI los
    muestra con "No se aplicó nada" y un botón para reintentar.
  - **Ajustes del camino estructurado:**
    - la temperatura se limita a 0,3;
    - Ollama recibe `format: "json"`, su modo JSON nativo, que es local y no
      toca Rust; sin él, los modelos pequeños se salen del esquema;
    - Ollama aborta a los 120 s con el mismo mensaje de timeout que Rust.
  - **El Gherkin no lo escribe la IA.** La IA devuelve `given` / `when` /
    `then`, que se guardan como precondiciones, pasos y resultado esperado. El
    Gherkin lo genera `toGherkin`, el mismo que usa el editor. Así siempre es
    válido y la edición bidireccional sigue funcionando.
  - **El usuario revisa antes de aplicar.** Solo se crea lo que el usuario
    acepta. Los casos generados son borradores enlazados al requisito
    (`requirementKeys`) y llevan procedencia IA (IA-01) con el proveedor y el
    modelo reales.
- **Alternativas:**
  - **Modos de salida estructurada de cada proveedor** (`response_format` de
    OpenAI, `responseSchema` de Gemini, herramientas de Anthropic). Dan más
    garantías por proveedor, pero son cinco formatos en Rust, y los endpoints
    compatibles no los ofrecen o los ofrecen a medias. La validación en el
    cliente hace falta igualmente. Se puede añadir más adelante, por proveedor,
    sin cambiar esquemas ni UI (encaja con IA-09).
  - **Pedir Gherkin en texto y parsearlo.** El parser oficial solo está en
    desarrollo, y el texto libre falla más que un JSON pequeño.
  - **Validación a mano, sin dependencia.** Sería más código, con mensajes
    peores y sin tipos inferidos. zod (MIT) ya lo usa el servidor.
  - **Reintento automático al fallar la validación.** Esconde fallos y gasta
    tokens. El usuario decide reintentar.
- **Consecuencias:**
  - El cliente gana la dependencia `zod` 4 (`^4.6.7`, unos 15 KB gzip). Es la
    versión con el arreglo de GHSA-mrhx-c7xc-m3w5. El servidor también usa
    zod 4 desde BASE-18, así que los dos lados comparten versión.
  - Un modelo pequeño o poco obediente puede devolver respuestas inválidas a
    menudo. Se ve como error y nunca se aplica en silencio.
  - Si falla el guardado de un caso concreto (un error del store, no de la IA),
    los demás se crean igual. La ventana sigue abierta con solo los que
    fallaron seleccionados, para reintentarlos sin duplicar los ya creados, y
    el aviso de éxito sale solo si se creó alguno.
  - Los esquemas son el contrato de cualquier ayuda estructurada nueva: un
    esquema, un prompt con la forma exacta y `aiJson`.

