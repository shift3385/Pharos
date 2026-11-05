<!-- Generado por `npm run manual` desde e2e/tours/04-casos.tour.ts y docs/manual/fuentes/casos.md. No lo edites a mano: edita la fuente. -->

# 4. Casos de prueba

## Para qué sirve

Un **caso de prueba** describe cómo comprobar un comportamiento: precondiciones,
pasos y resultado esperado. En Pharos cada caso tiene a la vez un formulario
(«Editor») y su escenario Gherkin, sincronizados: lo que escribes en uno
aparece en el otro, listo para la automatización con playwright-bdd o
Cucumber. Hay tres niveles de escenario (básico, Outline con ejemplos y
avanzado con flujos alternos) y un tipo checklist para revisiones rápidas.

## Paso a paso

### 4.1. La lista de casos, vacía

Pulsa «Casos de prueba» en el menú lateral. Arriba quedan «Importar / Exportar», «Sugerir casos con IA» y «Nuevo caso»; mientras no haya casos, la lista lo dice.

![La lista de casos, vacía](img/casos/01-lista-vacia.png)

### 4.2. Elegir el tipo de escenario

«Nuevo caso» pregunta el tipo: «Básico» (Given/When/Then), «Básico avanzado» (Scenario Outline con tabla de ejemplos) o «Avanzado» (Background y varios flujos). Se puede subir de nivel después.

![Elegir el tipo de escenario](img/casos/02-tipo-escenario.png)

### 4.3. El título es obligatorio

Si guardas un caso sin título, Pharos lo marca y no lo guarda.

![El título es obligatorio](img/casos/03-titulo-obligatorio.png)

### 4.4. Un caso básico

Título, precondiciones, pasos (cada uno con «+ Añadir paso»), resultado esperado y, arriba, nivel, tipo, prioridad, estado y automatización. «Guardar» le da su ID (BM-001).

![Un caso básico](img/casos/04-caso-basico.png)

### 4.5. Campos personalizados en el caso

Los campos del proyecto aparecen en «Campos personalizados», al final del editor: aquí, «Navegador» (selección) y «Regresión crítica» (sí/no).

![Campos personalizados en el caso](img/casos/05-campos-personalizados.png)

### 4.6. La vista Gherkin

«Gherkin» muestra el mismo caso como un escenario .feature, sincronizado con el editor: lo que cambias en uno se ve en el otro. La barra inserta palabras clave en el cursor.

![La vista Gherkin](img/casos/06-gherkin.png)

### 4.7. Vista dividida y copiar el Gherkin

«Vista dividida» pone editor y Gherkin uno junto a otro. El botón de copiar lleva el Gherkin al portapapeles («Gherkin copiado»).

![Vista dividida y copiar el Gherkin](img/casos/07-vista-dividida.png)

### 4.8. Un caso «Básico avanzado» (Outline)

Los pasos usan marcadores entre ángulos (<importe>) y la tabla «Examples» da un valor por fila: un mismo escenario se ejecuta con varios datos. «+ Columna» y «+ Fila» la amplían.

![Un caso «Básico avanzado» (Outline)](img/casos/08-outline.png)

### 4.9. Un caso «Avanzado» con flujos alternos

El nivel avanzado añade precondiciones compartidas (Background) y flujos alternos, cada uno con su nombre, pasos y resultado: en Gherkin, un Scenario por flujo.

![Un caso «Avanzado» con flujos alternos](img/casos/09-flujos.png)

### 4.10. Un caso de tipo checklist

«Tipo de caso: Checklist» cambia los pasos por una lista de comprobaciones, sin Gherkin. Útil para revisiones rápidas, como una prueba de humo.

![Un caso de tipo checklist](img/casos/10-checklist.png)

### 4.11. Reordenar con el teclado

Cada paso tiene un asa: con el foco en ella, Espacio la coge, las flechas la mueven e Intro o Espacio la sueltan (también se puede arrastrar con el ratón).

### 4.12. La lista de casos

Con casos, la tabla muestra ID, título, requisito, prioridad, estado y edición. Busca por ID, título o requisito y filtra por estado (con su recuento), prioridad, nivel, tipo, automatización o un campo sí/no.

![La lista de casos](img/casos/12-lista.png)

### 4.13. Ningún caso coincide

Si la búsqueda o los filtros no dejan ningún caso, la lista lo dice y ofrece «Quitar filtros».

![Ningún caso coincide](img/casos/13-sin-coincidencias.png)

### 4.14. Editar y recorrer los casos

Al abrir un caso, la barra superior permite pasar al anterior o al siguiente de la lista (respetando el filtro) y muestra si hay cambios sin guardar.

![Editar y recorrer los casos](img/casos/14-recorrer.png)

### 4.15. Ir a un caso (Ctrl+P)

«Ir a un caso…» o Ctrl+P abre un buscador: escribe parte del ID o del título, elige con las flechas y pulsa Intro.

![Ir a un caso (Ctrl+P)](img/casos/15-ir-a-caso.png)

### 4.16. Revisiones y exportación de un caso

El menú «⋯» del caso muestra sus revisiones (cada guardado) y lo exporta a .xlsx, .pdf o .feature; el aviso dice dónde se guardó.

![Revisiones y exportación de un caso](img/casos/16-mas-acciones.png)

### 4.17. Importar un caso desde .xlsx

En la lista, «Importar / Exportar → Importar .xlsx» lee un caso de una plantilla o de un .xlsx exportado; el informe enseña qué se reconoció y «Aplicar» abre el editor con los datos.

![Importar un caso desde .xlsx](img/casos/17-importar.png)

### 4.18. Caso importado

Revisa el caso importado y guárdalo: entra en la lista con el siguiente ID.

### 4.19. Exportar todos los .feature

«Importar / Exportar → Exportar .feature» genera un archivo .feature por caso (las checklists no tienen Gherkin), listo para playwright-bdd o Cucumber.

### 4.20. Acciones con varios casos

Marca varios casos con su casilla: aparece una barra para exportarlos a .feature o eliminarlos.

![Acciones con varios casos](img/casos/20-seleccion.png)

### 4.21. Eliminar casos

«Eliminar» pide confirmación («¿Eliminar 1 caso?») antes de quitarlos del proyecto.

![Eliminar casos](img/casos/21-eliminar.png)

### 4.22. Casos eliminados

Al confirmar, un aviso dice cuántos se eliminaron.

## Consejos

- Empieza en «Básico»: siempre puedes subir de nivel, pero no bajar por
  debajo de lo que ya usa el Gherkin.
- Usa marcadores entre ángulos (`<importe>`) y la tabla de ejemplos cuando el
  mismo escenario deba probarse con varios datos.
- Ctrl+P salta a cualquier caso sin volver a la lista; la barra superior dice
  si hay cambios sin guardar.
- Al importar un .xlsx, los valores que no encajan con un campo personalizado
  se omiten y Pharos lo avisa.

## Véase también

- [Guía de pruebas de la beta](../guia-beta.md), apartado 4.3.
- [Glosario](../GLOSARIO.md): «Caso de prueba», «ID de escenario», «Pasos de prueba», «Prioridad», «Estado (del caso)».

---

← [Plan de pruebas](03-plan.md) · [Índice](README.md) · [Trazabilidad y requisitos](05-trazabilidad.md) →
