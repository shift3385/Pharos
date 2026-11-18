# ADR-0052 · API pública v1, tokens con scopes y webhooks firmados (INT-02, INT-03, DEU-01)

- **Estado:** Aceptado (2026-11-18).
  - El usuario aprobó el plan de la pista A con todas las recomendaciones («Sí, apruebo», transmitido por el coordinador):
    1. solo el Test Manager crea tokens de proyecto y webhooks;
    2. un token de proyecto es de quien lo crea, nunca puede más que el rol actual de esa persona, y otro Test Manager puede reasignarlo;
    3. la UI va en la página del workspace › «Integraciones» y en «Mi perfil › Tokens personales»; el administrador revoca desde «Administración › Usuarios»;
    4. la caducidad es obligatoria: como máximo un año, 90 días por defecto;
    5. los webhooks a la red privada están bloqueados salvo que una variable de entorno los permita;
    6. DEU-01 va al final de la ola;
    7. el quality gate en el servidor se aplaza a 0.7.0.
  - Ampliación acordada con la pista F y comunicada al coordinador: la subida también acepta los informes en su formato original (JUnit, SARIF, k6, axe, Allure…), que el servidor convierte con `@pharos/formats`.
- **Relacionados:** ADR-0012 y ADR-0013 (Pharos Run JSON, ids deterministas), ADR-0015 (auditoría), ADR-0019/0042 (workspaces y roles), ADR-0034 (bóveda cifrada), ADR-0045 (administrador del servidor, SEC-11), ADR-0048 (notificaciones), ADR-0049 (aprobación independiente).

## Contexto

El criterio de salida de 0.6.0 es que **un PR de GitHub reporte a Pharos JUnit, SARIF, k6 y axe**. Para eso, CI necesita:

- una forma de escribir en el servidor sin la sesión de una persona;
- avisos hacia fuera cuando algo cambia.

Hoy el servidor solo conoce sesiones JWT de corta vida, y `/api/*` es la API interna de la web.

Además, el único código que convierte un Pharos Run JSON en documentos es Rust (`import.rs`), y el servidor es TypeScript.

## Decisión

### 1. API pública `/api/v1`

- Prefijo propio y autenticación propia: `Authorization: Bearer phr_…`. Las rutas de la web y del sync no aceptan estos tokens, y `/api/v1` no acepta un JWT.
- El contrato es OpenAPI 3.1, **generado desde los esquemas zod** que validan cada ruta (`z.toJSONSchema`). Se sirve en `/api/v1/openapi.json` y se versiona en `docs/formats/openapi-v1.json`. Un test falla si se separan.
- v1 solo crece con cambios aditivos (VERSIONING §6.6). Un cambio incompatible es v2.
- Escribe lo mínimo para el criterio:
  - subir resultados;
  - crear y cerrar un run.

  El resto es lectura. Aprobar, borrar, miembros y administración quedan fuera.
- Sin CORS y sin cookies.

### 2. Subida de resultados

- `POST /api/v1/projects/{projectId}/results?format=<fmt>` acepta un informe por petición, con el fichero como cuerpo y gzip si se quiere. Sin multipart y sin dependencias nuevas.
  - Formatos: **Pharos Run JSON 1.x**, el formato por defecto, o el original del informe: `junit`, `ctrf`, `playwright_json`, `cucumber_messages`, `sarif`, `k6`, `axe`, `trx`, o `allure` (un zip).
  - El servidor convierte el informe con los parsers compartidos de la pista F (`@pharos/formats`), sin copiarlos, y lo guarda como un Pharos Run JSON.
  - Varios ficheros van en varias peticiones al mismo run.
- **Defensas de la subida** (revisión de seguridad, pedidas por el coordinador el 2026-11-18). Se documentan también en el OpenAPI de la ruta (A2):
  - **Tamaño por formato:** el cuerpo tiene un límite comprimido (`API_UPLOAD_LIMIT_BYTES`, 25 MiB por defecto) y otro descomprimido (100 MiB). Cada formato puede tener uno menor.
  - **Allure (zip):** se lee en memoria y nunca se escribe en disco. Tiene límites de tamaño total descomprimido, de número de entradas, de razón de compresión y de anidamiento: un zip dentro del zip no se abre. Se rechaza cualquier entrada con `..`, ruta absoluta o enlace.
  - **XML (JUnit, TRX):** se lee con `@xmldom/xmldom` sin DTD ni entidades externas (XXE), ni expansión de entidades.
  - **Tiempo:** la conversión de un informe tiene un tiempo máximo; si lo supera, responde 422 `report_timeout` y no guarda nada.
  - **Errores:** un informe que no se puede leer responde 422 `invalid_report` con el formato y la causa genérica. Nunca devuelve trozos del fichero ni rutas del servidor, y el log tampoco.
- El servidor tiene un persistente TypeScript **equivalente a `import.rs`**:
  - enlace por `@<prefijo><n>`;
  - ids `UUIDv5`;
  - límites y truncado.

  Lo garantizan unos vectores que genera Rust y comprueba TS, el mismo patrón que EJE-06 (`web-run-interop.json`).
- `run.externalId` hace que el run sea `UUIDv5(proyecto ‖ externalId)`. Los jobs de una matriz convergen en un run sin coordinarse. El shard sigue siendo `UUIDv5(run ‖ sha256)`, así que repetir un job es un no-op (200 en vez de 201).
- El informe crudo se guarda como blob por hash (SYNC-04b) y `attachment` del shard, como hace el escritorio.

### 3. Tokens

- **Tipos:**
  - **de proyecto** (CI), que crea un Test Manager con la capacidad nueva `token.manage`;
  - **personal** (PAT), de cada persona.
- **Formato:** `phr_prj_` / `phr_pat_`, 32 caracteres base62 y un CRC32.
- **Almacenamiento:** solo su SHA-256, en `api_tokens` (migración 0029 del servidor). Se muestra una vez.
- **Scopes `recurso:acción`:** `projects:read`, `runs:read`, `runs:write`, `cases:read`, `cycles:read`, `defects:read`, `requirements:read`.
- **Permiso efectivo** = scopes ∩ capacidades **actuales** del rol del dueño en el workspace. Se comprueba en cada petición contra la BD, sin caché. Un token nunca puede más que su dueño hoy:
  - si el dueño sale o baja de rol, el token queda inactivo;
  - otro TM puede reasignarlo.
- **Caducidad obligatoria:** como máximo 1 año, 90 días por defecto. Hay rotación con solapamiento de hasta 24 h.
- **Revocación inmediata.** Pueden revocar:
  - el dueño;
  - cualquier TM (tokens de proyecto);
  - el administrador del servidor (todos). Este último no puede crearlos.

### 4. Webhooks

- **Configuración:** por workspace (opcionalmente por proyecto), en `webhooks` y `webhook_deliveries` (migración 0030). La gestiona `token.manage`.
- **Eventos v1:** `run.created`, `run.results_uploaded`, `run.completed`, `cycle.closed`, `defect.created`, `defect.status_changed`, `review.decided`, `ping`.
- **Origen:**
  - se derivan **en el servidor**, en el almacén de documentos que comparten la web, la API y `/sync/push`, comparando el documento anterior con el nuevo;
  - la fila de la bandeja de salida se escribe en la misma transacción (*outbox*).

  Un cambio hecho en el escritorio avisa cuando sincroniza.
- **Firma** según *Standard Webhooks*: `webhook-id`, `webhook-timestamp`, `webhook-signature: v1,<base64 HMAC-SHA256>` sobre `id.timestamp.cuerpo`.
  - El secreto `whsec_…` se guarda cifrado con AES-256-GCM, con la KEK `WEBHOOK_SECRETS_KEY` fuera de la BD (como ADR-0034).
  - Al rotarlo, se firma con los dos secretos durante 24 h.
- **Entrega:**
  - repartidor en proceso con `SKIP LOCKED`;
  - 10 s de timeout y sin redirecciones;
  - 7 reintentos en unas 22 h;
  - se desactiva solo tras 50 fallos seguidos, con aviso a los TM.
- **SSRF:**
  - solo `https`;
  - IP resuelta y fijada;
  - rangos privados, loopback, link-local y metadata rechazados, salvo `WEBHOOK_ALLOW_PRIVATE` / `WEBHOOK_ALLOW_HOSTS`.

### 5. Auditoría

- Crear, rotar, reasignar, revocar y la suspensión automática de tokens y webhooks son eventos de la cadena web (entidades `api_token` y `webhook`). Nunca guardan el secreto.
- Lo que se escribe con un token se audita como siempre, a nombre del dueño, con `summary.via = { kind: "token", id, name, prefix }`.
- Las lecturas no se auditan: quedan en `last_used_at`.

### 6. DEU-01: build con `tsc`

- `tsconfig.build.json` emite `dist/` con `module: NodeNext`. Los imports relativos llevan `.js` (codemod único).
- Producción arranca con `node dist/server.js`. `tsx` queda solo para `dev` y tests, en `devDependencies`.
- Dockerfile multietapa con usuario no root.
- `migrate.ts` encuentra `migrations/` igual desde `dist/db/`, porque está a la misma profundidad que `src/db/`.

## Alternativas descartadas

- **El servidor guarda el Run JSON y un escritorio lo materializa al sincronizar.** Sin un escritorio en línea, el PR no ve nada, y el resultado dependería de qué dispositivo llegue primero.
- **Llamar a Rust desde el servidor** (napi o un binario de `pharos-core`). Mete una toolchain Rust en la imagen del servidor, que hoy se construye solo desde `server/`. La copia en TS con vectores ya funciona en EJE-06.
- **JWT de larga duración como token.** No se puede revocar sin una lista negra, no tiene scopes ligados a un proyecto y aparece entero si se filtra.
- **Hash lento (Argon2) para los tokens.** Con 190 bits de azar no aporta nada y cuesta CPU en cada petición de CI.
- **Firma propia (`X-Pharos-Signature`).** Standard Webhooks ya tiene librerías de verificación en todos los lenguajes.
- **Eventos solo de lo que hace la web o la API.** Dejaría fuera lo que pasa en el escritorio, que es la mayor parte del uso.
- **Cuenta de servicio del workspace** como dueña de los tokens de proyecto. Es la decisión 2 del plan; se descarta si el usuario confirma la recomendación.

## Consecuencias

- Dos persistentes de Run JSON (Rust y TS) que deben avanzar juntos. Los vectores compartidos lo hacen obligatorio. ING-06/07 (pista F) añaden sus entidades a los dos.
- La derivación de eventos en el almacén de documentos es un punto nuevo del push del sync, con coste por documento escrito: comparar `payload` anterior y nuevo, solo para las entidades con eventos.
- Un servidor sin `WEBHOOK_SECRETS_KEY` no ofrece webhooks: hay una variable más en `despliegue.md`.
- El escritorio no guarda tokens ni webhooks: los gestiona contra el servidor, como los miembros, y sin servidor no hay integraciones.
- Abre el camino de INT-06 (disparo de CI, 0.7.0), RUN-04 (`pharos-agent`) e IA-07 (MCP remoto), que usarán los mismos tokens.

## Implementación

Por PR: A1 tokens, A2 subida, A3 webhooks, A4 lecturas, A5 DEU-01.

### A1 · Tokens (2026-11-18)

- **Servidor** (`server/src/modules/api/`):
  - `tokenFormat.ts`: genera y comprueba `phr_prj_`/`phr_pat_` (32 base62 + CRC-32 en base62) y su SHA-256.
  - `apiTokens.ts`: crear, listar, rotar (con solapamiento de 0 o 24 h), reasignar y revocar; `authenticate` y `authorize` (scope ∩ capacidad actual del dueño).
  - `apiTokens.routes.ts`: las rutas de gestión, solo con sesión (§2.2 del plan). Las del administrador son `GET /admin/users/:id/tokens`, `POST /admin/users/:id/tokens/revoke` y `DELETE /admin/tokens/:token`.
  - `v1.ts`: `GET /api/v1/me`, `/projects`, `/projects/{projectId}` y `/openapi.json`.
  - `openapi.ts`: el contrato, generado de `v1.schemas.ts` y versionado en `docs/formats/openapi-v1.json` (contrato 1.0.0). Un test falla si se separan.
- **Datos:** migración del servidor 0029 (`api_tokens`). Capacidad nueva `token.manage` (Test Manager) en `workspace-roles.json` y `roles.ts`.
- **Límites:** `API_RATE_LIMIT_MAX`/`_WINDOW` (300 por minuto), por token o, sin un token bien formado, por IP. Como máximo 50 tokens de proyecto vivos por workspace y 20 personales por persona. `last_used_at` se escribe como mucho una vez por minuto.
- **CORS:** cerrado en `/api/v1` salvo `openapi.json` (`delegator` de `@fastify/cors`).
- **Logs:** un token en la URL se rechaza con `token_in_url`. Como Fastify registra la petición antes de esa respuesta, el serializador de peticiones del log (`logRequest` en `app.ts`) borra `token=` y `access_token=` de la URL.
- **Auditoría:** entidad `api_token` (`create`, `update` al reasignar, `delete` al revocar) en la cadena web del actor, en el workspace del token o, si es personal sin workspace, en el personal de su dueño. Lleva el prefijo visible, nunca el token.
- **App** (`src/modules/integrations`):
  - `ProjectTokensSection` en la pestaña nueva «Integraciones» de la página del workspace (`?tab=integrations`);
  - `PersonalTokensSection` en «Mi perfil»;
  - `AdminRevokeTokensButton` («Revocar sus tokens…») en «Administración › Usuarios».
- **Diferencias con los bocetos:**
  - la caducidad se elige entre 30, 90, 180 y 365 días, sin fecha libre;
  - «Usuarios» no muestra una columna con el número de tokens: el botón dice cuántos hay al confirmar;
  - el ejemplo de CI del diálogo usa `curl` hasta que lleguen el CLI y la acción de GitHub (INT-01, INT-04).
- **Pendiente** en otras pistas o PRs:
  - **SEC-12 (pista S):** comprobar en `authenticate` que la cuenta del dueño no está desactivada, con la función común que exponga S. Desactivar suspende los tokens; reactivar los devuelve.
  - **Avisos (A3):** el aviso de caducidad a 7 días y el aviso a los Test Manager cuando un token queda inactivo llegan con el repartidor de A3.
