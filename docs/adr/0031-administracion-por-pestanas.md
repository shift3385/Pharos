# ADR-0031 · Administración por pestañas, tabla de capacidades de IA y logos inline

- **Estado:** Aceptado (plan de la pista V4 aprobado el 2026-10-30; RED-V4)
- **Contexto:** hasta RED-V4, Administración, Plantillas y Motor de IA eran tres
  páginas (`/admin`, `/templates`, `/ai`). F1 las unía con un `AdminSectionNav`
  temporal. El rediseño (SPEC §7–§8, `ScrAdministracion.dc.html`) pide una sola
  pantalla:
  - pestañas agrupadas: Recursos (Motor de IA, Plantillas) · Aplicación (General) ·
    Cuenta y datos (Sincronización, Seguridad) · Soporte (Diagnóstico);
  - Motor de IA abierta por defecto;
  - parámetros de IA según el modelo: los que el modelo no admite, bloqueados
    con un candado; la temperatura, opcional en «Compatible»;
  - logos de los proveedores en el selector.

  Hasta ahora, qué parámetros admite cada proveedor se decidía en dos sitios:
  `supportsTemperature` en `ai/model/types.ts` y una regla para Claude en Rust
  (`ai.rs`).

## Decisión

### Rutas

- Una sola ruta: **`/admin?tab=ai|templates|general|sync|security|diagnostics`**.
  - Sin `tab`, o con uno desconocido, abre `ai`.
  - Cambiar de pestaña sustituye la entrada del historial (`replace`), así que
    «Atrás» sale de Administración en vez de recorrer las pestañas.
  - `adminTabFrom()`, `adminPath()` y `ADMIN_TABS` son la API pública de
    `@modules/admin`. Las migas muestran «Administración › <pestaña>».
- `/templates` y `/ai` redirigen (`<Navigate replace>`) a su pestaña. Los
  enlaces viejos siguen funcionando.
- Las pestañas son un único `tablist` con foco itinerante: ←/→ pasan de grupo,
  Inicio/Fin van a los extremos y cada pestaña se describe con su grupo.
  `AdminSectionNav` desaparece.
- `AiPage` y `TemplatesPage` pasan a ser `AiEngineTab` y `TemplatesTab`, sin
  `h1` propio. Siguen en sus módulos.
- Motor de IA y General tienen una sola barra de guardado por pestaña, fija
  al pie del área que se desplaza, con «Guardar» como acción ámbar. Solo se
  activa con cambios.
- Salir de una pestaña con cambios sin guardar pide confirmación al cambiar de
  pestaña o al cerrar la ventana (`beforeunload`). Salir de `/admin` por la
  navegación del shell todavía no avisa: `HashRouter` no admite `useBlocker`;
  lo cubrirá el `useUnsavedChangesGuard` común.

### Tabla de capacidades

- `src/modules/ai/model/capabilities.ts` es **el único sitio** que dice qué
  parámetros admite cada proveedor y modelo:
  - filas `{ provider, model?: RegExp, caps }`; gana la primera que encaja;
  - `capabilitiesFor(provider, model)` lo leen la pestaña y el router;
  - `sendsTemperature(config)` decide si una llamada online envía la
    temperatura.
- La temperatura de cada fila es `supported`, `unsupported` u `optional`:
  - `unsupported`: Claude, y los modelos de razonamiento de OpenAI (`o*`, `gpt-5*`
    salvo `gpt-5-chat*`);
  - `optional`: «Compatible», con el interruptor «Enviar» (`customSendTemperature`).
    Una configuración guardada antes de existir el interruptor no tiene el campo:
    se toma como `true`, porque antes la temperatura siempre se enviaba. Solo
    una configuración nueva empieza en `false`.
- Rust deja de decidir por proveedor: `ai_chat_online` recibe
  `temperature: Option<f32>`, y `None` no la envía. Sigue ignorándola para
  Anthropic como red de seguridad, y sigue reintentando sin temperatura si un
  modelo la rechaza.
- **Razonamiento** (nivel en Gemini 2.5+, esfuerzo en OpenAI, OpenRouter y
  Claude): está en la tabla con `sent: false`. Ninguna llamada lo envía todavía,
  así que el control queda bloqueado con «Próximamente» y nunca sale como ✓.
  Enviarlo es un ítem aparte del ROADMAP.
- El rango de temperatura se mantiene en 0–1 (paso 0,1) para no cambiar el
  comportamiento. El prototipo dice 0–2; cambiarlo es tocar una constante.

### Logos

- Gemini, OpenAI, Claude y Ollama usan sus marcas de **Simple Icons 15.22.0**
  (CC0-1.0), con los paths copiados en `ai/ui/ProviderLogo.tsx`.
  - OpenRouter usa el icono Lucide `route`; Compatible, `plug`.
  - Se dibujan en `currentColor`, sin colores de marca: siguen los tokens y el
    tema.
  - Siempre van junto al nombre del proveedor en texto.
- Las marcas son de sus dueños. Se usan solo para identificar al proveedor (uso
  nominativo), sin modificarlas ni sugerir respaldo, como pide Simple Icons.
- La versión queda fijada: Simple Icons 16.0.0 retiró el icono de OpenAI.

## Alternativas

- **`/admin/:tab`** como segmento de ruta. Es igual de enlazable, pero añade una
  ruta por pestaña y obliga a tocar `isCurrent`/`navConfig`. Con `?tab` basta
  una ruta. Descartado.
- **Mantener `/templates` y `/ai` como páginas propias.** Contradice la SPEC (una
  pantalla con pestañas) y mantiene el `AdminSectionNav`. Descartado.
- **La dependencia `simple-icons`:** unos 3 000 iconos (varios MB) para usar 4.
  Además, sus versiones retiran marcas (OpenAI en 16.0.0). Descartado.
- **Enviar ya el razonamiento** (Gemini `thinkingConfig`, OpenAI
  `reasoning_effort`, Claude `thinking`, OpenRouter `reasoning`): más
  superficie en Rust y en las pruebas de cada proveedor. Se deja para más
  adelante (ROADMAP).

## Consecuencias

- Los enlaces a Administración se construyen con `adminPath(tab)`, nunca a mano.
- Un parámetro nuevo, o un modelo con otras reglas, es una fila en
  `capabilities.ts`. Ningún componente decide qué se envía.
- Las llamadas online a Claude y a los modelos de razonamiento de OpenAI ya no
  envían una temperatura que el proveedor ignora o rechaza.
- Proveedor, modelo, parámetros, Ollama y una clave escrita son un borrador
  hasta pulsar «Guardar». «Guardar» lleva la clave al llavero y el resto a la
  configuración; «Guardar clave» guarda solo la clave. Cambiar de proveedor con
  una clave escrita pide confirmación. La clave nunca vuelve al frontend, así
  que no se muestran sus últimos caracteres como en el prototipo.
- La Papelera (RED-W3) aparece en General como «Próximamente», sin datos
  inventados. Cuando llegue, «Vaciar papelera» confirmará con
  `ConfirmDialog variant="destructive"`.
