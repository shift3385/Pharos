# Fragmentos del CHANGELOG

Cada cambio que nota quien usa la app deja aquí **su propio archivo** en lugar de
editar `CHANGELOG.md` ([ADR-0032](../docs/adr/0032-fragmentos-del-changelog.md)).
Así varios PRs en paralelo no chocan en las mismas líneas.

## Cómo se escribe

Un archivo por cambio, con el ID del backlog en el nombre (`RED-V3.md`,
`FIX-10.md`; si hay varias secciones, `RED-V3-corregido.md`):

```markdown
---
section: Añadido
---

- **Lo que nota quien usa la app**, en una o varias viñetas.
```

`section` es una de estas: `Añadido`, `Cambiado`, `Corregido`, `Seguridad`,
`Cambios incompatibles` (`docs/VERSIONING.md` §7). Un fragmento solo tiene una
sección: si el cambio añade y corrige, son dos archivos.

## Comandos

| Comando                     | Qué hace                                                            |
| --------------------------- | ------------------------------------------------------------------- |
| `npm run check:changelog`   | Valida los fragmentos (forma parte de `verify:static` y de la CI)   |
| `npm run changelog:preview` | Muestra cómo quedará `[Sin publicar]` con los fragmentos            |
| `npm run changelog:collect` | En el commit de release: los pasa a `CHANGELOG.md` y los borra      |
