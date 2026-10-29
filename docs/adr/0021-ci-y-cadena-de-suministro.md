# ADR-0021 · CI y cadena de suministro

- **Estado:** Aceptado (plan de la pista B1 aprobado por el usuario el
  2026-10-28: decisiones D1–D6). Complementa ADR-0008 y ADR-0009.
- **Contexto:** hasta 0.1.0-alpha.1 no había CI. Al montarla (BASE-01/03),
  la auditoría encontró deuda que no se veía:
  - npm: 30 avisos, 13 altos y 4 críticos, entre raíz y servidor. Afectaban
    tanto al tooling (vitest, vite) como al servidor en producción (fastify,
    zod).
  - Cargo: 6 vulnerabilidades (rustls, rustls-webpki, h2), 5 crates sin
    mantenimiento y 5 crates MPL-2.0, todo traído por Tauri.
  - `cargo fmt` y `clippy -D warnings` fallaban en archivos que otras pistas
    estaban cambiando.

  Además, el compromiso de `trivy-action` en 2026 mostró que una acción
  referenciada por etiqueta puede cambiar bajo los pies.

- **Decisión:**
  - **Acciones fijadas por SHA** de commit completo, con la versión en un
    comentario. Solo se fijan releases con al menos 14 días; Dependabot las
    actualiza con un enfriamiento de 7 días (14 para una MAYOR).
  - **Lint de los workflows** con `zizmor` en CI y `actionlint` en local.
  - **Toolchain de Rust exacto:** `1.99.1` con `rustfmt` y `clippy` en
    `rust-toolchain.toml`. Una versión nueva de clippy no puede poner la CI
    en rojo por sí sola; se sube a propósito. Se mantiene MSVC (ADR-0008),
    pero rustup ya no admite el triple en el canal, así que va en `targets`.
  - **Excepciones exactas y con salida.** Ninguna puerta se relaja de forma
    global:
    - `scripts/rust-gates.allowlist.json` tolera pares exactos (archivo para
      fmt; archivo + lint para clippy) mientras su pista los cambia.
    - `scripts/audit-allowlist.json` tolera un aviso npm alto o crítico con
      motivo, ítem del backlog y **fecha de caducidad**; al vencer, la puerta
      vuelve a fallar.
    - Ambas avisan de las entradas que ya sobran.
  - **Licencias de Cargo con `cargo deny`:** lista cerrada de licencias
    permisivas; todo lo demás (GPL, AGPL, LGPL, SSPL…) falla. MPL-2.0 (copyleft
    débil por archivo) se acepta **solo** como excepción nominal para cinco
    dependencias de Tauri sin modificar: `cssparser`, `cssparser-macros`,
    `dtoa-short`, `option-ext` y `selectors`. Los `unic-*` sin mantenimiento se
    ignoran con motivo hasta que Tauri los sustituya.
  - **La misma regla en npm:** el gate de licencias rechaza el copyleft débil
    salvo los paquetes nombrados en `scripts/license-exceptions.json` (hoy
    `lightningcss`, MPL-2.0, que vite 7 instala en `server/` a través de
    vitest 4; no se distribuye). Una excepción con `coversPlatformBinaries`
    cubre también los binarios por plataforma del paquete (sus
    `optionalDependencies`, con la misma licencia), porque npm instala solo el
    del sistema actual: en la CI de Linux son otros que en Windows.
  - **Actualizaciones mayores del tooling hechas ya:** vitest 2 → 4, vite 5 → 7
    y plugin-react 4 → 5; Node ≥ 22.12 (Node 20 está fuera de soporte). zod 4
    se aplazó a BASE-18, porque tocaba el esquema de sync de la pista A1, y
    quedó tolerado hasta el 2026-12-15. *Actualización (pista Q1, BASE-18):*
    el servidor ya usa zod 4 y `scripts/audit-allowlist.json` está vacía.
  - **Imagen de Postgres de CI** fijada por etiqueta (`postgres:18`), no por
    digest: solo sirve para los tests y Dependabot no la actualizaría.
  - *Actualización (pista Q1, BASE-14):* job `e2e` en `windows-latest` con el
    smoke del binario real, en verde desde el 2026-10-29 (unos 7 min con la
    caché caliente). Usa el PostgreSQL que trae
    la imagen del runner (los contenedores de servicio solo existen en Linux) y
    la API en `localhost:3000`, el único puerto que admite la CSP del
    escritorio. `tauri-driver` se fija a una versión exacta (`2.1.0`) y vive
    en la caché de Rust, que se guarda aunque el smoke falle. Para que
    msedgedriver conecte en el runner, que corre elevado, la app abre ella
    misma el puerto de DevTools con un perfil E2E (ADR-0022). **No es un
    check obligatorio:** lo será, con decisión del usuario, cuando lleve un
    tiempo en verde; no está en `.github/branch-protection.json`.
  - *Actualización (pista Q1):* **el driver del E2E se verifica.**
    `npm run e2e:driver` solo descarga `msedgedriver` de
    `msedgedriver.microsoft.com` (sin el CDN `azureedge.net` de respaldo,
    cuyo nombre podría retirarse y registrarlo otro). Antes de ejecutarlo,
    también si ya estaba descargado, exige una firma Authenticode válida de
    "Microsoft Corporation"; si no la tiene, se borra.
- **Alternativas:**
  - Etiquetas de versión (`@v4`) en las acciones: se descartó por el riesgo
    de suministro.
  - `-A clippy::lint` o `npm audit --omit=dev` globales: ocultarían problemas
    nuevos en cualquier archivo.
  - `audit-ci` o `better-npm-audit`: una dependencia más para 80 líneas de
    script.
  - `stable` sin fijar: CI no reproducible.
  - Prohibir MPL-2.0: obligaría a abandonar Tauri.
- **Consecuencias:**
  - Las pistas A1 y A2 deben dejar `cargo fmt` y clippy limpios en sus archivos
    y quitar sus entradas de la allowlist al fusionar.
  - Subir de toolchain o de licencia permitida es un cambio revisado.
  - Cada lunes llegan PRs de Dependabot agrupados.
  - `@vitest/coverage-v8` (BASE-13) debe ir en la misma MAYOR que vitest.
