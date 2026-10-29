# ADR-0009 · Versionado SemVer con una sola versión

- **Estado:** Aceptado (decisión del usuario, 2026-10-28)
- **Contexto:** la versión `0.0.1` estaba repetida a mano en 7 manifiestos, sin
  etiquetas ni CHANGELOG. Los hitos `v0.0.N` dejaban sin hueco para parches, y
  `v0.0.3.x` no es una versión válida para el instalador MSI.
- **Decisión:**
  - SemVer `MAYOR.MENOR.PARCHE`, con una única versión para la app, el núcleo
    Rust y el backend.
  - Mientras estemos en `0.x`, cada hito del roadmap es una MENOR.
  - El `package.json` raíz es la fuente; `scripts/version.mjs` sincroniza y
    comprueba el resto.
  - Reglas completas en `docs/VERSIONING.md`.
- **Alternativas:**
  - Mantener `0.0.N`: no admite parches.
  - CalVer: el MSI exige que la MAYOR sea como máximo 255.
- **Consecuencias:**
  - Los hitos se renumeraron (v0.0.1 + v0.0.2 → 0.1.0, v0.0.3 → 0.2.0…).
  - Primera etiqueta: `v0.1.0-alpha.1`.
  - La versión solo cambia en un commit de release.
