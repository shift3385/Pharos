<!-- Generado por `npm run manual` desde e2e/tours/09-defectos.tour.ts y docs/manual/fuentes/defectos.md. No lo edites a mano: edita la fuente. -->

# 9. Defectos

## Para qué sirve

«Defectos» registra los fallos encontrados, con su ciclo de vida (nuevo,
abierto, en curso, corregido, en re-test, cerrado, y también rechazado o
aplazado), severidad, prioridad, pasos para reproducirlos, evidencias y
vínculos con los casos, requisitos y resultados de los que nacen. La matriz de
trazabilidad y «Inicio» los cuentan.

## Paso a paso

### 9.1. Defectos

Pulsa «Defectos» en el menú lateral. Arriba, «Desde un resultado» y «Nuevo defecto»; debajo, los filtros (abiertos, todos, cerrados), la búsqueda, la severidad y el cambio entre lista y tablero.

![Defectos](img/defectos/01-vacio.png)

### 9.2. Nuevo defecto: el título es obligatorio

«Nuevo defecto» abre el editor. Sin título no se guarda: Pharos lo indica en el campo.

![Nuevo defecto: el título es obligatorio](img/defectos/02-titulo-obligatorio.png)

### 9.3. Rellenar el defecto

Detalles (severidad, prioridad, estado, etiquetas), reproducción (pasos, resultado esperado y obtenido), dónde se encontró (build y entorno), vínculos con casos y requisitos, seguimiento externo y los campos personalizados de defectos que definiste en Ajustes (aquí, «Cliente afectado»).

![Rellenar el defecto](img/defectos/03-nuevo.png)

### 9.4. Evidencias

Tras guardar, «Evidencias» admite capturas, vídeos o registros; se guardan cifrados en este equipo.

![Evidencias](img/defectos/04-evidencias.png)

### 9.5. Un defecto desde un resultado fallido

«Desde un resultado» lista los intentos que no pasaron en los runs del proyecto (aquí, el del informe importado en el capítulo 8). Al elegir uno, el editor se rellena con el error y el defecto queda vinculado a ese resultado.

![Un defecto desde un resultado fallido](img/defectos/05-desde-resultado.png)

### 9.6. Prerrellenado desde el resultado

El aviso superior indica de qué resultado nace. Revisa el título y guarda.

![Prerrellenado desde el resultado](img/defectos/06-prerrellenado.png)

### 9.7. La lista de defectos

La lista muestra ID, título, severidad, prioridad, estado, casos vinculados y fecha. Filtra por abiertos, todos o cerrados, por severidad o busca por texto.

![La lista de defectos](img/defectos/07-lista.png)

### 9.8. El tablero de defectos

«Tablero» agrupa los defectos por estado. Arrastra una tarjeta (o usa el teclado sobre su asa) para cambiarlo; Pharos solo permite los pasos válidos del ciclo de vida.

![El tablero de defectos](img/defectos/08-tablero.png)

### 9.9. Cerrar un defecto

Al soltar un defecto en «Cerrado» (o en «Otros»: rechazado, aplazado), Pharos pide la resolución y, si quieres, la build en la que se corrigió.

![Cerrar un defecto](img/defectos/09-cerrar.png)

### 9.10. Eliminar un defecto

En la lista, la papelera de la fila pide confirmación. Su clave no se vuelve a usar.

![Eliminar un defecto](img/defectos/10-eliminar.png)

### 9.11. Defecto eliminado

Al confirmar desaparece de la lista.

## Consejos

- Crea el defecto **desde el resultado** fallido siempre que puedas: hereda
  el error y queda vinculado al intento concreto.
- El tablero solo permite los cambios de estado válidos; al cerrar o rechazar
  pide la resolución.
- La clave de un defecto eliminado (`DEF-001`) no se reutiliza.

## Véase también

- [Guía de pruebas de la beta](../guia-beta.md), apartado 4.4b «Defectos».
- [Glosario](../GLOSARIO.md): «Clave de tarjeta», y la sección «Execution model identifiers».

---

← [Ejecuciones e importación de resultados](08-ejecuciones.md) · [Índice](README.md) · [Administración](10-administracion.md) →
