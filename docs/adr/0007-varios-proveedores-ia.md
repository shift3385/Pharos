# ADR-0007 · Varios proveedores de IA, uno activo

- **Estado:** Aceptado (pedido por el usuario el 2026-10-28; IA-08)
- **Contexto:** la v0.0.1 solo admitía Gemini online, con la clave en la URL y
  sin timeout. El estudio del arte recomienda que el usuario traiga su propio
  modelo y su propia clave, en vez de créditos medidos como Qase o Xray.
- **Decisión:**
  - **Un proveedor online activo**, elegido por el usuario, entre:
    - Gemini;
    - OpenAI;
    - Claude (Anthropic);
    - OpenRouter;
    - un endpoint compatible con OpenAI (Groq, DeepSeek, Mistral, Together, LM
      Studio, vLLM…).
  - **Llamadas y claves.** Cada proveedor tiene su clave en el keychain y su
    modelo. Las llamadas se hacen desde Rust con tres formatos:
    - Gemini `generateContent`;
    - chat completions de OpenAI;
    - Anthropic Messages, con `anthropic-version: 2026-10-21`.
  - **Modelos.** "Listar modelos" consulta los modelos que ofrece la clave.
  - **Ollama** sigue como proveedor offline.
- **Alternativas:** un proveedor y modelo por tarea. Es más potente, pero
  necesita más interfaz; queda como IA-09 (0.7.0).
- **Consecuencias:**
  - La API de Claude rechaza `temperature`, así que no se envía y el control se
    deshabilita con aviso. Si un modelo de OpenAI la rechaza, se reintenta sin
    ella.
  - Con los modelos que lo admiten se activa el fallback de servidor de
    Anthropic (`fallbacks: "default"`): si un modelo rechaza la petición, otro
    la reintenta.
  - La configuración anterior se migra sola.
  - La procedencia registra el proveedor real.
