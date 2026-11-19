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
- Dockerfile multietapa. Corrige los dos avisos que Trivy dio sobre `server/Dockerfile` (escaneo de la pista F, 2026-11-18):
  - **DS002** (alto): la imagen corre como root. Pasa a correr como `USER node`.
  - **DS026**: no tiene `HEALTHCHECK`. Se añade uno contra `GET /health` con el `fetch` de node, porque la imagen Alpine no trae curl.
- `migrate.ts` encuentra `migrations/` igual desde `dist/db/`, porque está a la misma profundidad que `src/db/`.
- `tsc` no reescribe el alias `@pharos/formats` (ADR-0053). La imagen compila también el paquete, o el servidor depende de su salida compilada.

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
- **SEC-12** (pista S, ya en `main`): `authenticate` comprueba con `isDisabled` que la cuenta del dueño no esté desactivada. Si lo está, responde 403 `account_disabled`, igual que sus sesiones. Los tokens quedan suspendidos, no revocados: la lista los muestra «Inactivo» con el motivo `owner_disabled`, y vuelven a funcionar al reactivar la cuenta.
- **Pendiente** en otras pistas o PRs:
  - **Avisos (A3):** el aviso de caducidad a 7 días y el aviso a los Test Manager cuando un token queda inactivo llegan con el repartidor de A3.

### A2 · Subida de resultados (2026-11-18)

- **Rutas** (`server/src/modules/api/v1.runs.ts`, contrato 1.1.0 en `docs/formats/openapi-v1.json`):
  - `POST /api/v1/projects/{projectId}/results` sube un informe;
  - `GET` y `POST /projects/{projectId}/runs` listan o crean un run;
  - `GET /runs/{runKey}`, `GET /runs/{runKey}/results` y `POST /runs/{runKey}/close`.
- **`projectId`** es el id o el prefijo de clave de los casos (`PAY`) cuando es único al alcance del token. Si no lo es, responde 409 `ambiguous_project`.
- **El informe** es el cuerpo de la petición, un fichero por petición, en su propio ámbito de Fastify (cuerpo en bruto), sin multipart y sin dependencias nuevas.
  - `?format=` se compara con el formato que detecta `@pharos/formats`. Si no coincide, responde 400 `format_mismatch`; sin `format`, vale el detectado.
  - `allure` y `trx` responden 422 `unsupported_format` hasta que la pista F publique sus parsers. Por eso todavía no hay lectura de zip ni sus límites.
  - Los hallazgos de SARIF y las métricas de k6 y axe se guardan desde A2b (ver abajo).
- **El run de destino:**
  - `runKey`: un run abierto;
  - `externalId`: el run `UUIDv5(NS_API_RUN, [projectId, externalId])`, que crea la primera subida y queda abierto hasta `close`;
  - ninguno: un run nuevo que se cierra como `completed` al importar, como en el escritorio. El mismo fichero otra vez devuelve ese run (200).

  Los runs que crea la API llevan `trigger: "ci"` y el `externalId` en `context`.
- **El persistente** (`importPlan.ts`, `runImport.ts`) es la copia de `import.rs::plan` y `commit` sin el vínculo, que se deriva al leer:
  - ids `UUIDv5` del paquete;
  - recorte de textos, separación de la palabra clave, atributos y límites de tamaño;
  - el mismo documento de shard y de resultado.

  `src-tauri/tests/fixtures/api-import-interop.json` lo comprueba. Lo genera `import/tests.rs::api_import_interop_vectors` a partir de las instantáneas de ING-01 y un documento de casos límite, y lo comprueba también `server/tests/api.import-interop.test.ts`: mismos ids y mismo contenido.
  - El servidor no importa `@pharos/formats` al arrancar. La subida lo carga cuando se ejecuta y pasa sus funciones de ids al planificador. Los imports del propio paquete (`uuid`, `zod`) solo se resuelven donde están instaladas sus dependencias:
    - en el repo, el `node_modules` de la raíz;
    - en la imagen, el enlace `/app/node_modules`;
    - en el job `server` de la CI no están, y un servidor que las cargara al arrancar no llegaría a arrancar (el test de entorno lo vio).
  - `insertRun` sale del cierre de `createRunService` para que la API reutilice la creación de runs de la web (clave `RUN-nnn`, ciclo y configuración).
- **El informe crudo** se guarda como blob por hash en el workspace (SYNC-04b) y como `attachment` (`raw_report`) del shard, igual que en el escritorio.
  - Los adjuntos que trae el propio informe (Playwright, Cucumber Messages) todavía no se guardan aparte. Quedan dentro del informe crudo, un aviso `attachments-in-raw-report` dice cuántos son, y se guardarán como evidencia junto con F2.
- **Auditoría:** un evento `import` de `run_shard` con `summary.via`, que dice el token.
- **Defensas:**
  - **Límite del cuerpo:** `API_UPLOAD_LIMIT_BYTES`, 25 MiB por defecto (413).
  - **Gzip:** se descomprime con tope en `API_UPLOAD_MAX_BYTES`, 100 MiB (413, y así una bomba gzip se corta en el tope). Otro `Content-Encoding` responde 415.
  - **DTD:** lo rechaza el paquete (422 `invalid_report`, `reason: "doctype"`).
  - **Tiempo:** la lectura se hace en un **proceso hijo** que se mata a los `API_PARSE_TIMEOUT_MS`, 30 s por defecto (422 `report_timeout`).
    - No es un worker thread porque, con tsx, un worker no resuelve los imports TypeScript (Node 24). Cuando A5 compile con `tsc`, puede pasar a worker.
  - **Errores:** solo dicen el código del parser, nunca un trozo del fichero, ni en la respuesta ni en el log.
  - **Ritmo:** `API_UPLOAD_RATE_LIMIT_MAX`, 60 subidas por minuto y token.
- **Reintentos:** la subida es idempotente, así que reintentar tras un timeout es seguro. Solo se reintentan errores de red, 429, 502, 503 y 504 (acordado con la pista L).

### A2b · Hallazgos y métricas (2026-11-18)

Con F2 en `main` (ADR-0053: entidades `finding` y `metric`), la subida guarda los hallazgos y las métricas de SARIF, axe y k6 junto con su shard, como el escritorio.

- **El planificador:** `importPlan.ts::planFindings` es la copia de `findings.rs::plan`:
  - mismos ids (`findingId`, `metricId` del paquete);
  - mismas comprobaciones (regla, severidad, mensaje y huella en un hallazgo; nombre y valor finito en una métrica; si no, 422 `invalid_report` antes de escribir nada);
  - mismos recortes (mensaje, `html` de axe, ubicación y atributos);
  - mismo aviso `duplicate-metric`.
- **Los documentos** se añaden en la misma transacción que el shard.
  - Solo los reciben los clientes con la funcionalidad `findings` (VERSIONING §6.5).
  - El evento `import` lleva `findings`, `findingSeverities`, `metrics` y `thresholdsFailed`, como en el escritorio.
- **La respuesta** cuenta `counts.findings` y `counts.metrics`. El contrato pasa a 1.1.1: cambia el texto, no las formas.
- **Vectores:** `api_import_interop_vectors` incluye las muestras de SARIF (trivy, eslint), axe y k6, con sus documentos `finding` y `metric`. El servidor da los mismos ids y el mismo contenido.
- **Sigue fuera:**
  - los adjuntos que trae el propio informe (aviso `attachments-in-raw-report`);
  - `caseKey` en los hallazgos: F2 no lo guarda todavía y el vínculo se deriva de las etiquetas, como dice ADR-0053 §5.

### A3 · Webhooks (2026-11-19)

- **Datos:** migración del servidor 0030, con dos tablas:
  - `webhooks`: secreto cifrado, el anterior mientras dura una rotación, fallos seguidos y desactivación;
  - `webhook_deliveries`: la bandeja de salida.
- **Origen único de los eventos:** `storeDoc` y `storeAppend` (`sync.repository.ts`) llaman a un `DocumentHook` en la misma transacción que la escritura, con el documento de antes y el de después.
  - Por ahí pasan la web, la API y `/sync/push`.
  - El hook solo actúa para `run`, `run_shard`, `test_cycle`, `defect`, `test_case` y `test_plan`; las demás entidades no cuestan nada.
  - `webhooks/events.ts` deriva los eventos (función pura):
    - `run.created` y `run.completed` (al dejar `in_progress`);
    - `run.results_uploaded` (un shard nuevo);
    - `cycle.closed`;
    - `defect.created` y `defect.status_changed`;
    - `review.decided` (un caso o plan aprobado, o devuelto con `changesRequested`).
  - Cada webhook activo del workspace que pide ese evento, y es del proyecto o de todos, recibe su entrega con el sobre de §4.
  - `run.results_uploaded` pone sus recuentos en el primer intento, cuando los resultados del shard ya están guardados aunque lleguen en otro lote.
- **Envío:** `webhooks/dispatcher.ts`.
  - Reclama lo pendiente con `FOR UPDATE SKIP LOCKED` y un plazo de 60 s.
  - Firma con Standard Webhooks (`signing.ts`) y envía con `node:http(s)`, sin dependencias nuevas.
  - Un intervalo (`WEBHOOK_DISPATCH_INTERVAL_MS`, 2 s) lo pone en marcha. Los tests lo llaman a mano.
- **Protección SSRF** (`ssrf.ts`):
  - comprueba la URL al guardarla y al enviar;
  - el `lookup` propio del socket fija la IP comprobada;
  - `BlockList` de rangos privados y reservados, y las IPv4 mapeadas como IPv6 rechazadas aparte (el `BlockList` de Node aplica `::ffff:0:0/96` a todas las IPv4);
  - `http` solo hacia un destino privado que el servidor permite (`WEBHOOK_ALLOW_PRIVATE`, `WEBHOOK_ALLOW_HOSTS`).
- **Desactivación:** tras 50 fallos seguidos el webhook se apaga y avisa a los Test Manager.
  - Es una notificación nueva, `webhook.disabled`, sin actor: la hace el servidor. `EmitInput.actorId` admite `null`.
  - Activarlo de nuevo reenvía lo pendiente.
- **Clave:** `WEBHOOK_SECRETS_KEY`, el mismo esquema que `AI_VAULT_KEY`. El AAD ata el secreto a su webhook. Sin la clave, la lista responde `enabled: false` y crear responde 409 `webhooks_disabled`.
- **Rutas** (solo con sesión): `GET/POST /workspaces/:id/webhooks`, `PATCH/DELETE …/:hook`, `…/rotate-secret`, `…/test`, `…/deliveries` y `…/deliveries/:delivery/redeliver`. Leer: cualquier miembro; cambiar: `token.manage`.
- **Auditoría:** entidad `webhook` (`create`, `update`, `delete`), con la URL enmascarada y nunca el secreto.
- **App:** `WebhooksSection` dentro de `IntegrationsTab`, en la pestaña «Integraciones» del workspace:
  - lista, nuevo y editar;
  - el secreto una sola vez;
  - «Enviar prueba», «Rotar secreto», «Activar» y «Borrar»;
  - «Entregas», con la respuesta del destino y «Reintentar ahora».
- **Pendiente** (como dice A1): el aviso de caducidad de los tokens y el de token inactivo no se han hecho en A3. Quedan para A4.

### A5 · DEU-01, build con `tsc` (2026-11-19)

- **Build:** `cd server && npm run build` (`scripts/build.mjs`) borra `dist/` y lo vuelve a generar en dos pasos:
  1. `@pharos/formats` se compila con su propio `tsconfig.json` (NodeNext), con `.d.ts`, en `dist/node_modules/@pharos/formats`. Desde cualquier fichero de `dist/`, Node encuentra ahí el paquete, y el paquete encuentra `zod` y `uuid` en el `node_modules` del servidor, un nivel más arriba. No hace falta enlace simbólico ni dependencia `file:`, y `npm ci` no lo toca.
  2. El servidor se compila con `tsconfig.build.json` (NodeNext, `rootDir: src`, `outDir: dist`). Ahí el alias `@pharos/formats` apunta al `.d.ts` del paso 1, así que `tsc` no emite fuentes de fuera de `src/`.
- **Imports:** un codemod añadió `.js` (o `/index.js`) a todos los imports relativos de `server/src`. `tsconfig.json` (typecheck, tsx y vitest) sigue con `moduleResolution: bundler`, que acepta los dos.
- **Rutas que dependen de la carpeta:** `migrate.ts` (`../../migrations`) y `sync.version.ts` (`../../../package.json`) están a la misma profundidad en `dist/` que en `src/`, así que no cambian. `sync.contracts.ts` queda fuera del build: son comprobaciones de tipos contra `src/shared/contracts` y nada lo importa.
- **El parser de subidas** sigue en un proceso hijo, no en un worker: funciona igual con tsx y con `dist/` (elige `reportWorker.ts` o `.js`), y no hay motivo para tener dos caminos.
- **Arranque:**
  - en producción, `node dist/server.js` (`npm run start:dist`);
  - `tsx` pasa a `devDependencies`, porque solo lo usan `dev`, `migrate`, `seed:test-user` y los tests.
  - `npm start` sigue con `tsx src/server.ts`. Es como se arranca la API de una copia del repo para la app de escritorio, y `scripts/api-port.mjs` y la E2E reconocen la API de cada copia por esa línea de comandos. Un `node dist/server.js` no dice de qué copia es, y además pediría compilar antes de cada arranque.
- **Imagen** (`server/Dockerfile`), en dos etapas:
  - `build` instala todo y compila;
  - la final instala solo las dependencias de producción y copia `dist/` y `migrations/`.
  - Corre como `USER node` (Trivy DS002). Lo único que escribe, `data/blobs` (`BLOB_DIR`), es del usuario `node`; el código sigue siendo de root.
  - `HEALTHCHECK` con el `fetch` de node contra `http://127.0.0.1:$PORT/health` (Trivy DS026). Con `NODE_ENV=production`, la API atiende http desde loopback sin proxy (SEC-07), así que el health check pasa.
  - Ya no hace falta el enlace `/app/node_modules` de F1.
- **CI:** el job `server` ejecuta `npm run build` y arranca `node dist/server.js` contra una base de datos propia (`pharos_build_smoke`) hasta que `/health` responde.
- **Sin probar:** no se ha construido la imagen con Docker; no hay Docker en la máquina de desarrollo. Se probó la etapa final a mano: una carpeta limpia con solo `npm ci --omit=dev`, `dist/` y `migrations/`, sin el repo por encima, con `NODE_ENV=production`. Arranca, migra, responde `/health`, el comando del health check sale con 0 y una subida JUnit se lee en el proceso hijo.

### A4 · Lecturas y avisos de tokens (2026-11-19)

El usuario aprobó el plan con las tres recomendaciones: el aviso de caducidad de un token personal va a la bandeja sin workspace; `token.inactive` va solo a los Test Manager; los borrados salen en las listas por defecto.

- **Lecturas** (`v1.reads.ts`): `GET …/cases`, `…/cycles`, `…/defects` y `…/requirements`, cada uno con su scope de A1, en lista y como `/{key}` (clave o id, sin distinguir mayúsculas).
  - **Elemento:** `{ id, key, updatedAt, deleted, data }`. `data` es el documento tal como se guarda. Un ciclo añade `progress`, el resumen que calcula la web.
  - **Cursor:** `updatedSince` es el `seq` global de `documents`, el mismo cursor que usa el pull del sync. Las listas van del cambio más antiguo al más reciente y responden `nextCursor` y `hasMore`. Sin cambios, la respuesta trae el mismo cursor.
  - **Borrados:** salen como `deleted: true` y sin `data`, salvo con `includeDeleted=false`. Los que tienen más de `SYNC_TOMBSTONE_DAYS` ya no se listan, porque la compactación vacía su contenido. Un espejo tiene que sincronizar al menos así de a menudo, como un escritorio.
  - **Filtros:** solo `status=`. La búsqueda por texto o por etiqueta queda fuera hasta que un cliente la pida.
  - **Casos:** el OpenAPI explica `sharedRefs[]` y `datasetRefs[]` (ADR-0055 §1–§3) como metadatos que se pueden ignorar, como se acordó con la pista P.
  - **Contrato:** pasa a 1.2.0.
- **Avisos** (`tokenNotices.ts`, migración del servidor **0031**): un barrido cada `TOKEN_NOTICE_INTERVAL_MS`, una hora por defecto.
  - `token.expiring` va al dueño cuando faltan 7 días o menos, una vez. El de un token de proyecto va en su workspace; el de un token personal, sin workspace. Lleva a «Integraciones» o a «Mi perfil».
  - `token.inactive` va a los Test Manager del workspace cuando el dueño de un token de proyecto sale o se le desactiva la cuenta. Se avisa una vez cada vez que pasa: la marca se borra cuando el token vuelve a funcionar.
  - Que el dueño **baje de rol no deja el token inactivo**. Con el modelo de A1, el token sigue funcionando con lo que el nuevo rol permite. Por eso no hay aviso.
  - Cada aviso se reclama con `UPDATE … RETURNING` (`expiry_notified_at`, `inactive_notified_at`), así que dos instancias no lo envían dos veces.
- **Guía:** [`docs/api-v1.md`](../api-v1.md) explica, con ejemplos de `curl`:
  - el token;
  - la subida en una matriz;
  - el cierre del run;
  - la lectura incremental;
  - los errores y los reintentos;
  - la comprobación de la firma de un webhook en Node y en Python.

### A4b · Capítulo «Integraciones» del manual (2026-11-19)

- **Capítulo 20 del manual**, con su tour (`e2e/tours/20-integraciones.tour.ts`) y su texto (`docs/manual/fuentes/integraciones.md`). El coordinador decidió que fuera un solo capítulo, que incluye también «Conectar CI» y la línea de comandos de la pista L (INT-01, INT-04).
- **Pasos:**
  - crear un workspace compartido;
  - llevar a él un proyecto con «Compartir con un workspace…»;
  - tokens de proyecto: nuevo, el secreto una sola vez, rotar y la tabla;
  - «Conectar CI» y los pasos en GitHub;
  - webhooks: nuevo, el secreto, una entrega de prueba que falla a propósito, rotar y borrar;
  - tokens personales con «Usar en el CLI».
- **Datos del tour:** el servidor de los tours lleva una `WEBHOOK_SECRETS_KEY` desechable. El destino del webhook es `https://ci.ejemplo.test/…`, que no resuelve nunca (`.test` está reservado): la entrega falla con `ENOTFOUND` y nada sale del equipo.
- **Fuera del tour:** «Reasignar» y la revocación de todos los tokens de una cuenta por un administrador. Solo aparecen con una segunda persona, y el manual muestra solo a la suya (NC-052). Los cubren los tests.
- **Visto al recorrerlo**, y corregido después (NC-059 y NC-060):
  - en el escritorio, un workspace recién creado no aparecía en el selector hasta la siguiente sincronización (FIX-33);
  - compartir un proyecto todavía sin enviar respondía «No se pudo completar» (FIX-34).
- **Test del SSRF:** la prueba de rebinding ya no consulta DNS real (`localtest.me`). `TargetPolicy.resolve` deja inyectar un resolutor falso que responde 127.0.0.1, y la prueba exige `EPRIVATE`.
