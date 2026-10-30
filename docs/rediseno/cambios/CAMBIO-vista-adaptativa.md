# Cambio: vista adaptativa por ancho real (para Claude Code)

## Problema
Al estrechar la ventana en escritorio, el Sidebar seguía abierto y la gráfica "Ejecuciones diarias" (y otras tarjetas) se rompían. La vista (desktop/tablet/mobile) dependía solo de la prop `device`, no del ancho disponible.

## Regla
La vista se decide por el ancho del contenedor de la app (no del `window`, para que funcione embebida):

| Ancho del contenedor | Vista |
|---|---|
| < 640 px | mobile (sin Sidebar, header móvil, barra inferior, secciones por pestañas) |
| 640–1023 px | tablet (Sidebar colapsado a iconos) |
| ≥ 1024 px | desktop |

`device` forzado a `mobile` o `tablet` nunca sube a una vista más ancha; solo puede bajar.

## Implementación de referencia (en cada pantalla)
```js
// observar el contenedor raíz
const ro = new ResizeObserver(([e]) => {
  const w = e.contentRect.width;
  setBp(w < 640 ? 'm' : w < 1024 ? 't' : 'd'); // re-render solo al cambiar de tramo
});
ro.observe(rootRef.current);   // disconnect() al desmontar

function effectiveDevice(forced, bp) {
  if (forced === 'mobile' || bp === 'm') return 'mobile';
  if (forced === 'tablet' || bp === 't') return 'tablet';
  return 'desktop';
}
```
En la app real basta con un hook `useBreakpoint(rootRef)` en el layout raíz que provea `device` por contexto a todas las pantallas. Alternativa solo-CSS: `container-type:inline-size` en el raíz + `@container (max-width:639px)` para ocultar el Sidebar, pero el cambio de estructura (pestañas, barra inferior) necesita el valor en JS.

## Pantallas actualizadas en el diseño
Dashboard, Login, Proyectos, Ajustes de proyecto, Plan (19 pasos), Casos (lista y editor), Trazabilidad, Planificador, Administración, Perfil.

## Comprobación
Estrechar la ventana de escritorio por debajo de 1024 px → Sidebar a iconos; por debajo de 640 px → vista móvil completa, la gráfica ocupa el ancho y no se corta.
