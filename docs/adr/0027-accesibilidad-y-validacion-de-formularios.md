# ADR-0027 · Accesibilidad WCAG 2.1 AA y validación común de formularios

- **Estado:** Aceptado (plan de la pista X1 aprobado por el usuario el
  2026-10-29; UX-05, UX-01)
- **Contexto:** la spec (§12.1 y Fase 9) exige WCAG 2.1 AA como criterio de
  aceptación de 0.1.0 y que todos los pares texto/fondo cumplan contraste AA.
  La revisión del código antes de esta pista encontró:
  - 12 modales sin componente común. Ninguno retenía el foco ni lo devolvía al
    cerrar; solo dos se cerraban con Escape y la mayoría no tenía nombre
    accesible.
  - Sin enlace para saltar al contenido. Listas y tablas del asistente con
    campos sin etiqueta (solo `placeholder`) y botones ✕ sin nombre. Los pasos
    del caso solo se podían reordenar con el ratón.
  - Contraste por debajo de AA en los tokens: el texto atenuado en los dos
    temas; los colores semánticos como texto en el tema claro (éxito 3,4:1,
    error 4,4:1, aviso 3,3:1, información 3,6:1); el contorno de foco ámbar
    (2,1:1 sobre blanco) y el anillo de foco de los campos (1,2:1).
  - Cada formulario validaba a su manera, y el botón Guardar se deshabilitaba
    en silencio cuando faltaba el título.

## Decisión

1. **Un diálogo común, `Dialog` (`src/shared/ui/Dialog.tsx`).** Todos los
   modales lo usan. Al abrirse mueve el foco dentro (al control indicado, al
   que tiene `autoFocus` o al primero) y al cerrarse lo devuelve a quien lo
   abrió. Tab y Mayús+Tab no salen del diálogo. Escape y un clic en el fondo
   llaman a `onClose`, salvo si el diálogo no es `dismissable` (mientras
   guarda, la exportación en curso, o la clave de recuperación visible, que solo
   se cierra con "Ya la he guardado"). Se nombra con su título. Con diálogos
   anidados, solo el más interno atiende el teclado.
2. **Un patrón de error común.**
   - `FormField` enlaza etiqueta, ayuda y mensaje con `htmlFor` y
     `aria-describedby`. Un error pone `aria-invalid`; un aviso no. El mensaje
     dice su gravedad en texto ("Error:", "Aviso:") e icono, no solo con color.
   - Las reglas son funciones puras en `@shared/validation`: `required`,
     `numberInRange`, `dateOrder`, `format` y `duplicateRows`. Cada una
     devuelve un `Issue` con un código i18n, `validation.*` o una clave propia
     del módulo.
   - `ListField`, `PairListField`, `CheckboxGroup` y `SortableSteps` exigen
     una `label` (el compilador la pide), que nombra el grupo y cada fila, y
     avisan de las filas repetidas.
3. **Regla de los borradores: validar nunca bloquea en silencio.**
   - Un `error` bloquea el guardado y se reserva para la integridad de los
     datos: título vacío del plan o del caso, nombre vacío de la plantilla,
     clave de requisito inválida o repetida, dígitos del ID de caso fuera de
     1–8 y días de retención fuera de 1–3650.
   - Todo lo demás es un `aviso`: fechas de sprint al revés o solapadas,
     filas, pasos, columnas o ejemplos repetidos. El trabajo se guarda, el
     aviso sigue visible junto al campo y el mensaje de "guardado" dice
     cuántos avisos quedan.
   - El botón Guardar no se deshabilita por validación. Si algo bloquea,
     `useSaveGuard` muestra un resumen (`ErrorSummary`, `role="alert"`) que
     toma el foco y enlaza cada problema con su campo.
4. **Contraste por tokens, sin tocar los colores de la spec.**
   - Los tonos semánticos de la spec siguen en rellenos, insignias y bordes
     (todos ≥ 3:1 como elemento no textual).
   - Para texto hay variantes `--color-*-text`, tonos más oscuros de la misma
     familia en el tema claro e iguales a la base en el oscuro. Es lo que pide
     la regla de aplicación de §12.1: "texto … en el tono más oscuro/claro de
     la misma familia".
   - Cambian el texto atenuado (`#616973` en claro, `#8491a0` en oscuro) y el
     navy-100 oscuro (`#193651`), que no fija la spec.
   - El foco usa `--color-focus`: navy en claro, ámbar en oscuro y ámbar
     siempre sobre la barra lateral navy.
5. **Cómo se comprueba.**
   - `src/shared/theme/contrast.test.ts` lee `tokens.css` y exige 4,5:1 a cada
     par texto/fondo y 3:1 al foco y a los bordes de estado, en los dos temas.
   - `axe-core` corre en los tests de componentes (`src/test/axe.ts`), en cada
     diálogo, en cada paso del asistente del plan, en el editor de casos y en
     Administración. jsdom no maqueta, así que ahí la regla de contraste de
     axe va apagada y la cubre el test de tokens.
   - Lo que axe no ve (orden y retorno del foco, Escape, foco en el resumen,
     nombres de las filas) se comprueba con aserciones directas.
   - `e2e/specs/a11y.e2e.ts` inyecta axe en el binario real (WebView2), con
     contraste incluido, en las pantallas principales y en los dos temas.
   - Una pasada manual con teclado y lector de pantalla queda en
     [`docs/accesibilidad/auditoria-wcag-0.1.0.md`](../accesibilidad/auditoria-wcag-0.1.0.md),
     con lo que quede pendiente.
   - `axe-core` es MPL-2.0: entra como excepción nominal en
     `scripts/license-exceptions.json` (solo desarrollo, sin modificar, nunca
     en el instalador; ADR-0021).

## Alternativas descartadas

- **`vitest-axe` / `jest-axe`:** solo envuelven `axe-core` con un matcher.
  `vitest-axe` sigue en 0.1.0, sin versión estable, y `jest-axe` está pensado
  para Jest. Un ayudante de 25 líneas sobre `axe-core` da el mismo resultado
  con una dependencia menos.
- **`<dialog>` nativo con `showModal()`:** WebView2 lo soporta, pero jsdom no.
  Los tests no podrían comprobar el foco ni Escape, y el diálogo seguiría
  necesitando código para devolver el foco y para no cerrarse mientras guarda.
- **Una librería de focus trap:** el atrapado de Tab son unas 20 líneas y otra
  dependencia no aporta nada a 12 diálogos sencillos.
- **Cambiar los colores semánticos de la spec:** la spec los fija y forman la
  marca; basta con variantes de texto de la misma familia.
- **Deshabilitar Guardar hasta que el formulario sea válido:** es justo lo que
  había. No explica nada a quien usa teclado o lector de pantalla y bloquea los
  borradores.
- **Una región `aria-live` por campo:** cada pulsación anunciaría el error. Los
  mensajes van enlazados al campo (se leen al llegar a él) y el resumen se
  anuncia una vez, al intentar guardar.

## Consecuencias

- Un modal nuevo se escribe con `Dialog` y un formulario nuevo con
  `FormField` + `@shared/validation`. El test de axe del módulo lo cubre si se
  añade al `a11y.test.tsx` del módulo.
- Un cambio de tokens que rompa AA falla en `npm run verify`.
- Los mensajes de validación son los mismos en todos los formularios
  (`validation.*` en es/en). Un módulo puede usar su propia clave cuando su
  texto es más preciso.
- La validación del servidor no cambia: esta capa es de experiencia de uso;
  las reglas de integridad del backend siguen siendo la autoridad.
