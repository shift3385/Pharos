# ADR-0036 · Requisitos propuestos por la IA a partir de un proyecto existente

- **Estado:** Aceptado (pedido y aprobado por el usuario el 2026-11-07; IA-17).
  Implementado; falta validarlo con claves reales y con Ollama. Comparte la vista de propuestas, la deduplicación y la aplicación con la
  pista hermana «Requisitos desde imágenes y diseños» (contrato común, más abajo).
  Precisa [ADR-0023](0023-salida-estructurada-ia.md) y hace una excepción acotada a
  [ADR-0033](0033-probar-clave-ia-antes-de-guardarla.md) sobre el aviso de destino.
- **Contexto:**
  - Un equipo de QA suele llegar a un proyecto que ya está en marcha. La base de
    prueba (ISTQB) existe, pero está repartida entre el README, `docs/`, las
    especificaciones, las rutas, los modelos y los tests. Escribirla a mano en
    Trazabilidad → Requisitos lleva días.
  - Otras herramientas resuelven partes del problema:
    - Repomix y gitingest empaquetan un repositorio para un LLM, respetan
      `.gitignore` y escanean secretos antes de enviar (Secretlint).
    - aider resume el repositorio en un mapa ordenado por relevancia.
    - Kiro escribe `requirements.md` en EARS y una persona lo aprueba.
    - Las skills de Claude Code son instrucciones versionadas que se cargan solo
      cuando hacen falta.
    - Los estudios de 2025 (arXiv 2509.19587 y UCRBench, 2512.13360) muestran que los
      LLM extraen bien los requisitos visibles en el código, pero omiten casos de uso
      y confunden funciones internas con objetivos del usuario.
    - De todo ello sale que la IA propone, cada propuesta lleva su fuente y una persona
      decide.
  - El código actual condiciona el diseño:
    - El único punto de salida es `aiChatWithProvenance`. Las respuestas estructuradas
      se validan enteras con zod (ADR-0023), y la revisión crítica de listas de IA-16
      ya propone añadir, reformular o eliminar con motivo, sin aplicar nada sola.
    - Los requisitos no tienen columna `data`, así que hoy no hay dónde guardar la
      marca IA-01 ni la fuente.
    - En la web, la IA en línea no funciona: `resolveProvider` exige el escritorio e
      IA-12 (ADR-0034) está sin implementar. Allí solo funciona Ollama.
    - Ollama se llama sin `num_ctx`, así que usa una ventana de unos pocos miles de
      tokens y recorta en silencio un prompt largo.
    - El escritorio ya abre un selector de carpeta nativo desde Rust (`rfd`,
      `downloads.rs`) sin dar permisos de sistema de archivos al webview.
- **Decisión:**
  - **Disponible solo en el escritorio y solo con IA configurada.** En la web, el
    botón no aparece hasta que exista IA en línea allí (IA-12). Entonces se leerá con
    `<input webkitdirectory>`, que es Baseline, o con un `.zip` (`jszip` ya es una
    dependencia). Sin IA disponible, el botón se deshabilita y dice por qué, como los
    demás botones de IA.
  - **Rust lee la carpeta; el webview no.** Hay dos comandos nuevos en un módulo
    `project_scan.rs`:
    - `project_scan_pick` abre el selector con `rfd` y recorre la carpeta con el crate
      `ignore` (MIT o Unlicense). El recorrido respeta `.gitignore`, `.ignore` y
      `.git/info/exclude`, además de una lista fija de exclusiones. El comando
      devuelve un **inventario sin contenido**: ruta relativa, tamaño, tokens
      estimados, categoría y motivo de exclusión. Guarda la raíz en el estado de Rust
      con un identificador.
    - `project_scan_read(scanId, paths)` devuelve el texto de las rutas pedidas, con
      las líneas numeradas. Solo acepta rutas relativas a esa raíz, canonizadas, sin
      salir de ella por `..` ni por enlaces simbólicos.
    - Ningún otro código puede leer archivos con estos comandos.
  - **Qué se excluye siempre**, sin opción de incluirlo:
    - Secretos por nombre: `.env*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`,
      `*.keystore` y `credentials*`.
    - Bases de datos y volcados.
    - Binarios, detectados por un byte NUL.
    - Archivos de más de 256 KB.
    - Código minificado, cuando la línea media supera los 300 caracteres.
    - `node_modules`, `vendor`, `target`, `dist`, `build`, `.git`, `coverage` y los
      lockfiles.
  - **Qué se redacta:** dentro de lo incluido, las líneas que parecen un secreto se
    sustituyen por `[secreto omitido]` antes de salir de Rust. Son claves privadas,
    `AKIA…`, `ghp_…`, `sk-…`, `xox…`, `AIza…`, JWT y cadenas de conexión con
    contraseña. La vista previa dice en qué archivos y líneas se ha hecho.
  - **Prioridad de lectura y presupuesto:**
    1. La documentación: README, `docs/`, `*.md`, especificaciones, ADR y
       OpenAPI/GraphQL.
    2. Las rutas y los puntos de entrada.
    3. Los modelos y esquemas.
    4. Los tests, porque sus nombres son requisitos implícitos.
    5. La interfaz.
    6. El resto.

    Se incluye por ese orden hasta un presupuesto de entrada que la persona ve y puede
    bajar. Por defecto son 300 000 tokens; con Ollama, el que permita su contexto.
  - **Cuatro fases**, con la confirmación entre la 1 y la 2:
    1. **Inventario**: es local y gratis.
    2. **Extracción por lotes (map):** los archivos se agrupan por módulo (carpeta) en
       lotes de unos 60 000 tokens; con Ollama, según su contexto. Cada lote devuelve
       requisitos candidatos con su fuente `ruta:línea` y una cita breve como evidencia.
       Van dos lotes a la vez como máximo. Si un lote falla, se reintenta solo ese y
       los demás se conservan.
    3. **Síntesis y deduplicación (reduce):** se fusionan los candidatos repetidos y se
       comparan con los requisitos existentes, que van numerados por su clave. El
       resultado son las propuestas.
    4. **Revisión y aplicación** en la vista común.
  - **Prompt versionado, como una skill.** Los prompts viven en el código
    (`src/modules/ai/api/requirementPrompts.ts`) con un identificador de versión,
    `req-extract@1` y `req-synthesis@1`. La versión se guarda en la procedencia de lo
    aceptado, junto al proveedor y al modelo, para saber con qué instrucciones salió
    cada requisito. Los prompts usan los criterios de ISO/IEC/IEEE 29148: un requisito
    necesario, singular, inequívoco y verificable. Se redactan en EARS cuando encaja y
    con la granularidad de una capacidad del usuario o del sistema, no de una función
    interna. Marcan como `stated` lo que está escrito en la documentación y como
    `inferred` lo que solo se deduce del código o de los tests.
  - **Las fuentes las pone Pharos, no el modelo.** El modelo cita candidatos por su
    número (`C1`, `C2`…) y requisitos existentes por su clave. Pharos descarta lo que
    apunta a algo que no existe, deja una propuesta por requisito existente y quita
    los títulos repetidos. Un filtro puro hace lo mismo que `usableProposals` en IA-16.
    Una cita `ruta:línea` que no está en lo enviado se descarta.
  - **Cuatro tipos de propuesta**, cada uno con su motivo y su fuente:
    - **Nuevo.** Puede avisar de que se parece a un requisito existente.
    - **Mejora de uno existente:** título, descripción o prioridad.
    - **Posible duplicado:** dos o más existentes, con cuál se conserva y su texto
      fusionado.
    - **Eliminar por redundante:** con el requisito que ya lo cubre.
  - **Aplicar.** Solo se aplica lo que la persona marca:
    - Crear usa `requirementApi.create`, con la numeración automática de siempre
      (ADR-0010). La IA nunca elige una clave.
    - Mejorar usa `update`, y se salta si el requisito ha cambiado desde la propuesta.
    - Fusionar y eliminar hacen un borrado lógico; la clave no se reutiliza. Un
      requisito con casos vinculados **no se puede eliminar ni fusionar desde aquí**: la propuesta
      se muestra deshabilitada, dice cuántos casos tiene y pide desvincularlos antes.
  - **Procedencia y fuente guardadas.** La migración 0038 añade a `requirements` una
    columna `data` (JSON) en el escritorio, y el servidor la guarda en el documento.
    Una feature de sincronización nueva, `requirement-data`, hace que el servidor
    conserve `data` cuando sube el requisito un cliente que no la conoce. Guarda:
    - `aiProvenance`, con el `ProvenanceMap` de IA-01 y la versión del prompt.
    - `sources`, con la ruta y las líneas o la imagen de donde salió.

    Lo creado o mejorado lleva «IA · pendiente de revisión» hasta que una persona pulsa
    «Marcar revisado» en el formulario y lo guarda. La marca no muestra ni el proveedor ni el modelo (UX-18).
  - **Aviso antes de enviar** (excepción a ADR-0033): aquí sale un proyecto entero,
    no un campo, así que antes de la fase 2 se muestra una confirmación con:
    - cuántos archivos y tokens se envían;
    - cuántas llamadas se harán;
    - si el contenido **sale del equipo** (proveedor en la nube) o **se queda en él**
      (Ollama);
    - qué se ha excluido y qué se ha redactado.

    El aviso es un componente común, `AiSendNotice`, y **nombra al proveedor, pero no
    el modelo**: aquí se trata de privacidad, no de la marca de UX-18.
    No muestra precios, porque cambian cada pocos meses y una tabla en el código
    quedaría desfasada. Muestra los tokens, que la persona multiplica por la tarifa
    de su proveedor.
- **Contrato común con la pista de imágenes:**
  - Cada pista produce `CandidateRequirement[]` desde su material: el título, la
    descripción, la prioridad opcional y las fuentes, que son de tipo `file`, `image`
    o `design`.
  - Lo común está en `traceability`:
    - `synthesizeRequirementProposals`, con el prompt `req-synthesis@1`;
    - `usableRequirementProposals`;
    - `RequirementProposalsReview`, con una función por pista para pintar su fuente;
    - `applyRequirementProposals`.
  - El detalle está en el borrador de diseño
    (`docs/design/ia-17-requisitos-desde-proyecto.md`).
- **Alternativas:**
  - **Todo en una sola llamada con un modelo de 1M de tokens.** Es más simple, pero
    cuesta más, recuerda peor lo que queda en medio de un contexto largo y no sirve
    con Ollama. Queda como caso particular: si todo cabe en un lote, la fase 2 es una
    sola llamada.
  - **Una skill externa** (`SKILL.md` para Claude Code u otro agente) que recorra el
    repositorio y escriba un CSV para la importación que ya existe. No necesita Rust
    nuevo, pero pierde la deduplicación, los tipos de propuesta, la fuente y la marca
    IA-01, y obliga a tener otra herramienta. Se propone como mejora: exportar los
    mismos prompts como skill y aceptar su JSON en la misma vista.
  - **El plugin `fs` de Tauri con el ámbito ampliado.** Abre el sistema de archivos
    al webview. Se descarta por el mismo motivo que en UX-02.
  - **Embeddings para la deduplicación** (IA-02). Son más precisos con listas grandes,
    pero necesitan un modelo local. Quedan para 0.7.0. Hasta entonces, deduplican el
    LLM y un filtro léxico.
- **Consecuencias:**
  - Hay una dependencia Rust nueva (`ignore`), que pasa por `cargo deny`.
  - Hay una migración nueva en el escritorio (0038) para `requirements.data`. El
    servidor amplía el esquema del documento y suma la feature `requirement-data`,
    sin migración. No se tocan `keys.rs` ni `key_sync.rs`.
  - `ollama.ts` tendrá que enviar `num_ctx` para las peticiones largas. Si no, los
    lotes se recortan en silencio.
  - El coste lo paga la clave de la persona. Con los precios de noviembre de 2026, un
    proyecto mediano, con unos 150 000 tokens de entrada y 15 000 de salida, cuesta
    entre 0,07 y 0,50 USD. Uno grande, con unos 600 000 de entrada, cuesta entre 0,10
    y 1,70 USD. Tarda de 2 a 6 minutos con dos lotes a la vez.
  - El contenido del proyecto puede intentar dar órdenes al modelo (prompt injection).
    Va siempre entre etiquetas `<data>` neutralizadas, la salida se valida con un
    esquema, el modelo no tiene herramientas y nada se aplica sin la persona.
