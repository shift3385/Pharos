# Encargo para Claude Code

Copia la carpeta `design_handoff_pharos_rediseno/` dentro del repo de la app (por ejemplo en `docs/rediseno/`) y pega este texto:

---

Vamos a aplicar el rediseño de Pharos descrito en `docs/rediseno/`.

1. Lee primero `docs/rediseno/README.md` y después `docs/rediseno/SPEC.md`. **La SPEC es obligatoria**; si algo no está claro, pregúntame antes de inventar.
2. Usa `docs/rediseno/prototipos/*.dc.html` solo como **referencia visual** (ábrelos en el navegador). **No copies** su HTML, sus estilos en línea ni sus datos de ejemplo.
3. Reimplementa con los componentes de pharos-ds, los tokens `var(--…)` y el i18n del proyecto. Los textos nuevos van a los archivos de idioma (es y en).
4. Las props `rangeOpen`, `notifOpen`, `sortOpen`, `prioOpen`, `estOpen`, `confirmOpen`, `searchOpen`, `userMenu`, `collapsed`, `toolsOpen`, `provider`, `tab`, `step`, `view` y `mobileSection` existen solo para enseñar estados en el lienzo: en la app son estado interno o vienen de datos reales.
5. Cumple exactamente:
   - SPEC §2 puntos de corte (< 600, 600–1279, ≥ 1280) y layout a alto completo;
   - SPEC §3 tipografía, mínimos y ajuste de texto (`lang="es"`, `hyphens:auto`, `overflow-wrap`, y nada de partir correos, rutas ni IDs);
   - SPEC §5 tamaños táctiles;
   - SPEC §6 desplegables (cierre fuera/scroll/Esc, recolocación hacia arriba, hojas en móvil, confirmaciones solo con «Cancelar»);
   - SPEC §7 navegación (grupo del proyecto solo dentro de un proyecto; Plantillas y Motor de IA dentro de Administración; un único botón Importar / Exportar).
6. Sustituye el logo por `docs/rediseno/logo/Logo.jsx` en todos los sitios y elimina el anterior.
7. Trabaja **una pantalla cada vez**, en este orden: navegación y layout → Login → Inicio → Proyectos → Plan de pruebas → Casos (lista y editor) → Planificador → Trazabilidad → Ajustes del proyecto → Administración → Perfil.
8. Al terminar cada pantalla:
   - compárala con su prototipo;
   - compruébala a 320, 390, 820, 1180 y 1440 px de ancho, en tema claro y oscuro;
   - confirma que no hay desbordes, textos cortados ni menús que se salgan;
   - **para y espera mi revisión** antes de seguir con la siguiente.
