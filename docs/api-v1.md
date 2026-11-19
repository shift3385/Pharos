# API pública v1: guía rápida

La API `/api/v1` de un servidor Pharos sirve para que un CI o un script suban resultados y lean datos sin abrir la app ([ADR-0052](adr/0052-api-v1-tokens-y-webhooks.md)). El contrato completo está en [`formats/openapi-v1.json`](formats/openapi-v1.json) y el servidor lo publica en `/api/v1/openapi.json`.

En los ejemplos, `PHAROS` es la URL del servidor (`https://pharos.miempresa.com`) y `PHAROS_TOKEN` un token.

## 1. Un token

- **Token de proyecto**, para un CI: lo crea un Test Manager en el workspace, en la pestaña «Integraciones» › «Tokens».
- **Token personal**, para tu CLI: en «Mi perfil» › «Tokens personales».

El token se ve **una sola vez**, al crearlo. Guárdalo como secreto del CI (`PHAROS_TOKEN`), nunca en el repositorio.

- Un token actúa como su dueño y nunca puede más que el rol actual del dueño.
- Caduca en 30, 90, 180 o 365 días. Pharos avisa a su dueño 7 días antes.
- Si el dueño sale del workspace o se desactiva su cuenta, el token deja de funcionar y se avisa a los Test Manager para que lo reasignen.

Comprueba que funciona:

```bash
curl -H "Authorization: Bearer $PHAROS_TOKEN" "$PHAROS/api/v1/me"
```

El token va **siempre** en la cabecera `Authorization`. En la URL se rechaza con 400 `token_in_url`.

## 2. Subir resultados

El fichero del informe va tal cual en el cuerpo: JUnit, CTRF, Playwright JSON, Cucumber Messages, SARIF, axe, k6 o Pharos Run JSON. `PAY` es el prefijo de casos del proyecto (vale también su id).

```bash
curl -H "Authorization: Bearer $PHAROS_TOKEN" -H "Content-Type: application/xml" \
     --data-binary @junit.xml \
     "$PHAROS/api/v1/projects/PAY/results?externalId=gh-$GITHUB_RUN_ID&fileName=junit.xml"
```

- Con `externalId`, los jobs de una matriz suben al **mismo run** sin coordinarse.
- Subir el mismo fichero dos veces responde 200 y no escribe nada, así que reintentar es seguro.
- Los resultados se vinculan a los casos por su etiqueta (`@PAY-001`), igual que al importar en el escritorio.

Al terminar todos los jobs, cierra el run:

```bash
curl -X POST -H "Authorization: Bearer $PHAROS_TOKEN" \
     "$PHAROS/api/v1/projects/PAY/runs/RUN-012/close"
```

Sin `externalId` ni `runKey`, cada subida crea su run y lo cierra sola.

## 3. Leer casos, ciclos, defectos y requisitos

Rutas: `…/cases`, `…/cycles`, `…/defects` y `…/requirements`, de solo lectura. Cada una con su scope: `cases:read`, `cycles:read`, `defects:read` y `requirements:read`.

Un elemento suelto, por su clave o su id. Un ciclo trae además su progreso:

```bash
curl -H "Authorization: Bearer $PHAROS_TOKEN" "$PHAROS/api/v1/projects/PAY/cases/PAY-001"
```

**Listas incrementales.** Cada lista responde `{ items, nextCursor, hasMore }`, del cambio más antiguo al más reciente:

- **Primera vez:** sin cursor, desde el principio. Mientras `hasMore` sea `true`, pide la página siguiente con `updatedSince=<nextCursor>`.
- **Después:** guarda el último `nextCursor`. La próxima vez, `updatedSince=<ese cursor>` devuelve solo lo cambiado desde entonces.
- **Borrados:** salen como `deleted: true` y sin `data`, para que una copia los borre también. `includeDeleted=false` los quita.
- **Sincroniza al menos una vez dentro del plazo de borrados del servidor** (`SYNC_TOMBSTONE_DAYS`), como un escritorio. Los borrados más antiguos ya no se listan.
- **Otros parámetros:** `limit` (100 por defecto, 500 como máximo) y `status=` (filtra por el estado del elemento).

```bash
cursor=$(cat .pharos-cursor 2>/dev/null)
while :; do
  page=$(curl -s -H "Authorization: Bearer $PHAROS_TOKEN" \
    "$PHAROS/api/v1/projects/PAY/cases?limit=500${cursor:+&updatedSince=$cursor}")
  echo "$page" | jq -c '.items[]'          # aquí, tu copia
  cursor=$(echo "$page" | jq -r '.nextCursor')
  [ "$(echo "$page" | jq -r '.hasMore')" = "true" ] || break
done
echo "$cursor" > .pharos-cursor
```

`data` es el documento tal como lo guarda Pharos. Ignora los campos que no conozcas: v1 solo añade campos, nunca quita.

En un caso, `sharedRefs[]` y `datasetRefs[]` son referencias a pasos compartidos y datasets ([ADR-0055](adr/0055-pasos-compartidos-parametros-y-datasets.md)). Se pueden ignorar, porque los pasos y las filas del caso ya son una copia completa.

## 4. Errores y reintentos

- **Formato:** cada error responde `{ code, message }`, más los campos propios de ese error.
- **Reintentos:** solo tras un error de red y en 429, 502, 503 y 504. En 429, respeta `Retry-After`.
- **401:** el token no vale (`token_invalid`, `token_revoked`, `token_expired` o `token_inactive`).
- **403:** al token le falta el scope (`insufficient_scope`) o el rol de su dueño no lo permite (`forbidden`).
- **404:** el proyecto o el elemento no existe o queda fuera del alcance del token. Un token sin el scope no llega a saber si el proyecto existe.

## 5. Webhooks: comprobar la firma

Un Test Manager crea el webhook en «Integraciones» › «Webhooks» y ve su secreto `whsec_…` una sola vez. Cada envío lleva tres cabeceras ([Standard Webhooks](https://www.standardwebhooks.com/)):

- `webhook-id`: único por entrega; sirve para descartar repeticiones;
- `webhook-timestamp`: segundos Unix; rechaza los que tengan más de 5 minutos;
- `webhook-signature`: `v1,<base64>`, el HMAC-SHA256 de `id.timestamp.cuerpo` con la clave del secreto (los bytes en base64 que siguen a `whsec_`). Durante una rotación llegan dos firmas separadas por un espacio, y basta con que una coincida.

Usa el **cuerpo tal cual llega**, antes de parsearlo como JSON.

Node:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

export function verify(secret, headers, body) {
  const id = headers["webhook-id"], ts = Number(headers["webhook-timestamp"]);
  if (!id || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const want = Buffer.from(`v1,${createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")}`);
  return (headers["webhook-signature"] ?? "").split(" ").some((s) => {
    const got = Buffer.from(s);
    return got.length === want.length && timingSafeEqual(got, want);
  });
}
```

Python:

```python
import base64, hashlib, hmac, time

def verify(secret: str, headers: dict, body: bytes) -> bool:
    msg_id, ts = headers.get("webhook-id"), headers.get("webhook-timestamp", "0")
    if not msg_id or abs(time.time() - int(ts)) > 300:
        return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
    mac = hmac.new(key, f"{msg_id}.{ts}.".encode() + body, hashlib.sha256).digest()
    want = "v1," + base64.b64encode(mac).decode()
    return any(hmac.compare_digest(want, s) for s in headers.get("webhook-signature", "").split(" "))
```

Las librerías oficiales de Standard Webhooks (`standardwebhooks` en npm y en PyPI) hacen lo mismo.
