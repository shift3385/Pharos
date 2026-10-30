# ADR-0032 · Fragmentos del CHANGELOG

- **Estado:** Aceptado (pedido por el usuario el 2026-10-30, al cerrar la ola 4)
- **Contexto:** la ley de documentación (`CONTRIBUTING.md`) obliga a que cada
  cambio que nota quien usa la app añada su entrada en `[Sin publicar]` de
  `CHANGELOG.md` en el mismo PR. En la ola 4 (rediseño) cinco pistas trabajaron
  en paralelo y casi todos sus PRs chocaron en las mismas líneas del CHANGELOG,
  aunque su código no chocara. Como `main` exige que cada PR esté al día, cada
  conflicto costaba una ronda más de fusión y de CI.
- **Decisión:**
  - Cada cambio escribe sus entradas en un archivo propio en `changes/`
    (`changes/<ID>.md`), con una cabecera `section:` que dice en qué sección de
    Keep a Changelog va. Los detalles están en `changes/README.md`.
  - `scripts/changelog.mjs` valida los fragmentos (`npm run check:changelog`,
    dentro de `verify:static`), enseña cómo quedará `[Sin publicar]`
    (`changelog:preview`) y, en el commit de release, los pasa a `CHANGELOG.md`
    en el orden de las secciones y por nombre de archivo, y los borra
    (`changelog:collect`).
  - Lo ya escrito en `[Sin publicar]` se queda; los fragmentos se añaden detrás.
- **Consecuencias:**
  - Dos PRs ya no chocan por el CHANGELOG: cada uno crea su archivo.
  - Hasta la release, el texto de un cambio vive en `changes/` y no en
    `CHANGELOG.md`; `changelog:preview` da la vista completa.
  - La release tiene un paso más (`docs/VERSIONING.md` §5).
  - README, ARCHITECTURE y ROADMAP pueden seguir chocando; son menos frecuentes
    y suelen resolverse conservando las dos partes.
- **Alternativas descartadas:** herramientas externas de fragmentos (towncrier,
  changesets): añaden una dependencia para algo que cabe en un script de 100
  líneas, y changesets además mezcla las versiones de npm.
