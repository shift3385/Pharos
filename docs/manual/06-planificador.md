<!-- Generado por `npm run manual` desde e2e/tours/06-planificador.tour.ts y docs/manual/fuentes/planificador.md. No lo edites a mano: edita la fuente. -->

# 6. Planificador

## Para qué sirve

El **planificador** es un tablero kanban por proyecto para el trabajo del
equipo de QA que no es un caso ni un defecto: preparar datos de prueba,
revisar casos, automatizar una regresión. Cada tarjeta avanza de Backlog a
Hecho y puede llevar adjuntos.

## Paso a paso

### 6.1. El tablero del planificador

Pulsa «Planificador» en el menú lateral: cuatro columnas (Backlog, En progreso, En revisión, Hecho), cada una con su «+» para crear una tarjeta directamente en ella, y arriba los filtros por tipo y prioridad.

![El tablero del planificador](img/planificador/01-tablero.png)

### 6.2. Nueva tarjeta

Una tarjeta es una tarea o un conjunto de datos de prueba, con prioridad, descripción y etiquetas. «Guardar» la deja en Backlog; después admite adjuntos.

![Nueva tarjeta](img/planificador/02-nueva-tarjeta.png)

### 6.3. Adjuntar archivos a una tarjeta

Tras guardar, «Adjuntos» acepta archivos (hasta el límite indicado); se guardan cifrados en este equipo y se abren desde la propia tarjeta.

![Adjuntar archivos a una tarjeta](img/planificador/03-adjunto.png)

### 6.4. Archivos demasiado grandes

Un archivo de más de 200 MB no se adjunta: Pharos avisa con su nombre y el límite.

### 6.5. Tarjetas en el tablero

Cada tarjeta muestra su tipo, prioridad y etiquetas. Ábrela con un clic en el título; la papelera la elimina.

![Tarjetas en el tablero](img/planificador/05-tarjetas.png)

### 6.6. Mover una tarjeta (también con el teclado)

Arrastra una tarjeta por su asa a otra columna. Con el teclado: foco en el asa, Espacio para cogerla, flechas para moverla y Espacio para soltarla.

![Mover una tarjeta (también con el teclado)](img/planificador/06-mover.png)

### 6.7. Filtrar y buscar tarjetas

Arriba, filtra por tipo (tareas o datos de prueba) y prioridad, o busca por texto.

![Filtrar y buscar tarjetas](img/planificador/07-filtrar.png)

### 6.8. Eliminar una tarjeta

La papelera de la tarjeta pide confirmación («¿Eliminar la tarjeta?»).

![Eliminar una tarjeta](img/planificador/08-eliminar.png)

### 6.9. Tarjeta eliminada

Al confirmar, desaparece del tablero.

## Consejos

- Los defectos tienen su propio módulo (capítulo 9); el planificador es para
  tareas y datos de prueba.
- Los adjuntos se guardan cifrados en el equipo, junto con los datos de
  Pharos; inclúyelos en tus copias.

## Véase también

- [Glosario](../GLOSARIO.md): «Planificador», «Tarjeta del planificador», «Columna del kanban», «Adjunto».

---

← [Trazabilidad y requisitos](05-trazabilidad.md) · [Índice](README.md) · [Ciclos y configuraciones](07-ciclos.md) →
