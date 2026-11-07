# ADR-0033 · Probar una clave de IA antes de guardarla

- **Estado:** Aceptado (pedido por el usuario el 2026-11-06; IA-11). Enmienda la
  consecuencia de [ADR-0031](0031-administracion-por-pestanas.md) sobre «Guardar
  clave» y precisa [ADR-0006](0006-claves-ia-y-tls.md).
- **Contexto:** al configurar Claude con la pestaña Motor de IA, la clave quedó en
  el keychain, pero la IA seguía «sin configurar» y «Probar conexión» solo se podía
  pulsar con Gemini. Había dos causas:
  - «Guardar clave» guardaba solo la clave. El proveedor elegido seguía siendo un
    borrador, así que la app usaba el proveedor anterior, mientras «En uso» y el
    estado de la tarjeta describían el borrador.
  - La prueba solo sabía usar la clave guardada, y guardar reemplaza la anterior sin
    copia. Comprobar una clave nueva costaba perder la que funcionaba si la nueva
    fallaba.
- **Decisión:**
  - **«Guardar clave» activa su proveedor** (y, en «Compatible», guarda su URL, sin
    la que no puede estar activo). El resto del borrador, como el modelo y los
    parámetros, sigue esperando a «Guardar». El aviso dice si el proveedor activo
    ha cambiado.
  - **Un proveedor sin clave no puede ser el activo.** «Guardar» se deshabilita y la
    barra dice que falta su clave; con una clave escrita, se guardan ambos. Las claves
    de los demás proveedores no cambian. «Compatible» no entra aquí: su clave es
    opcional y lo que exige es la URL.
  - **Una marca «En uso» señala lo que está guardado**, no lo que hay en pantalla: va
    en la tarjeta del proveedor activo, o en Ollama si es el que se usa. Sin IA
    disponible, no aparece ninguna. Sustituye a la línea «En uso: proveedor · modelo».
  - **«Probar conexión» prueba la clave escrita sin guardarla**, con el proveedor,
    el modelo y la URL que hay en el formulario, mediante el comando `ai_key_test`.
    Sin clave escrita, prueba la configuración guardada, como hasta ahora. El motivo
    por el que no se puede probar se muestra en pantalla, no solo en un tooltip.
  - **En la web también se prueba de verdad.** Allí no hay núcleo Rust, así que la
    llamada va directa del navegador al proveedor (`providers/onlineBrowser.ts`), sin
    pasar por el servidor de Pharos. La web **no guarda la clave**, porque el keychain
    solo existe en escritorio: «Guardar clave» se deshabilita y la pantalla lo explica.
  - **El mensaje dice la causa:** si el proveedor rechaza la clave, lo dice con su
    propio texto; si el fallo es otro (modelo, red), no culpa a la clave; y si no hay
    ninguna clave, dice que falta.
  - **Reemplazar una clave guardada pide confirmación**, salvo si esa misma clave
    acaba de responder en la prueba.
  - **Sin aviso de destino antes de enviar.** Se elimina «Se enviará a proveedor ·
    modelo» de los botones de IA, por decisión del usuario: la marca en Motor de IA
    ya dice qué se usa. Tampoco se muestran en el texto de los resultados (UX-18):
    proveedor y modelo quedan en los datos del contenido generado y en el tooltip de
    la marca «IA · pendiente de revisión» (IA-01).
- **Alternativas:**
  - Guardar la clave anterior para poder deshacer: se descartó porque añade otra
    copia de un secreto para resolver lo que la prueba previa ya evita.
  - Validar la clave al guardarla y rechazarla si falla: se descartó porque un
    fallo de red o un modelo retirado impediría guardar una clave correcta.
  - Un parámetro `key` opcional en `ai_chat_online`: se descartó para que el comando
    que usa toda la app siga sin poder recibir una clave.
- **Consecuencias:**
  - Una clave escrita se usa para una sola llamada: a través de Rust en escritorio y
    desde el navegador en la web. No se guarda en el keychain, en la configuración,
    en archivos ni en registros, y en el frontend solo vive en el campo. Sigue cierto
    lo esencial de ADR-0006: **una clave guardada** nunca vuelve a la interfaz.
  - La llamada desde el navegador es la única excepción a «las llamadas online van por
    Rust» y solo la usa la prueba. Un endpoint propio que no admita navegadores (CORS)
    responde «no se pudo conectar», porque el navegador oculta el motivo.
  - Las demás funciones de IA online siguen sin estar disponibles en la web. Guardar
    claves allí sería una decisión de producto aparte, porque ADR-0006 las limita al
    keychain.
  - Guardar una clave para otro proveedor cambia el proveedor activo. Si ese
    proveedor no tiene modelo, la IA online queda sin uso hasta elegir uno, y ninguna
    tarjeta muestra la marca.
  - «Listar modelos» sigue necesitando una clave guardada.
  - Quien va a enviar datos a la IA ya no ve el destino junto al botón: tiene que
    consultarlo en Motor de IA.
  - El uso de la clave de escritorio en la web se decide en
    [ADR-0034](0034-boveda-de-claves-ia-para-la-web.md).
