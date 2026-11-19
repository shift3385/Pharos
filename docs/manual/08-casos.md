<!-- Generado por `npm run manual` desde e2e/tours/08-casos.tour.ts y docs/manual/fuentes/casos.md. No lo edites a mano: edita la fuente. -->

# 8. Casos de prueba

## Para qué sirve

Un **caso de prueba** describe cómo comprobar un comportamiento:
precondiciones, pasos y resultado esperado. En Pharos cada caso es a la vez un
formulario («Editor») y su escenario **Gherkin**, sincronizados: lo que
escribes en uno aparece en el otro, listo para automatizar con playwright-bdd o
Cucumber.

| Tipo | Para qué | En Gherkin |
| --- | --- | --- |
| Básico | Un escenario con sus pasos | Feature · Scenario · Given/When/Then |
| Básico avanzado | El mismo escenario con varios datos | Scenario Outline · Examples |
| Avanzado | Precondiciones comunes y varios flujos (principal y alternos) | Background · Rule · varios Scenario |
| Checklist | Una lista de comprobaciones (humo, accesibilidad) | No tiene Gherkin |

Cada caso tiene:

- un **ID** con el prefijo del proyecto (`PH-001`), que no cambia y viaja como
  tag (`@PH-001`);
- su prioridad, su estado (borrador, en revisión, aprobado u obsoleto), su
  estado de automatización y su versión;
- los **requisitos** que comprueba (capítulo 7), que viajan como tags
  (`@REQ-001`) y alimentan la matriz de trazabilidad (capítulo 13).

En este manual, Liomar escribe los casos de acceso y de proyectos de Pharos:

- «Iniciar sesión con credenciales válidas» (PH-001, básico);
- «Rechazar credenciales no válidas» (PH-002, Outline con dos ejemplos);
- «Crear un proyecto» (PH-003, avanzado, con el flujo alterno «Nombre
  vacío»);
- la checklist «Humo de la versión 0.3.0» (PH-004).

## Paso a paso

### 8.1. La lista de casos, vacía

Los casos de prueba describen qué se comprueba y cómo, paso a paso. Pulsa «Casos de prueba» en el menú lateral, justo debajo de «Requisitos». Arriba están «Importar / Exportar», «Sugerir casos con IA» (necesita un motor de IA y el plan del proyecto, capítulo 17) y «Nuevo caso»; mientras el proyecto no tenga casos, la lista dice «Aún no hay casos. Crea el primero.».

![La lista de casos, vacía](img/casos/01-lista-vacia.png)

### 8.2. Elegir el tipo de escenario

«Nuevo caso» pregunta primero qué tipo de escenario quieres escribir: «Básico», un escenario Given/When/Then; «Básico avanzado», un Scenario Outline que se repite con una tabla de ejemplos; o «Avanzado», con precondiciones comunes (Background) y varios flujos. Empieza por el más simple que te sirva: un caso se puede subir de nivel después. «← Volver» sale sin crear nada.

![Elegir el tipo de escenario](img/casos/02-tipo-escenario.png)

### 8.3. El título es obligatorio

El título es lo único obligatorio (y los campos personalizados que el proyecto marque como obligatorios). Si guardas un caso sin título, arriba aparece «No se puede guardar: revisa 1 campo.» con un enlace al campo, y Pharos no lo guarda hasta que lo escribas.

![El título es obligatorio](img/casos/03-titulo-obligatorio.png)

### 8.4. Un caso básico

Rellena el caso: el título (en este ejemplo, «Iniciar sesión con credenciales válidas»), las precondiciones, los pasos (cada uno con «+ Añadir paso»; la papelera de un paso lo quita, tras confirmarlo si tiene texto) y el resultado esperado, los que muestra la captura. Más arriba se clasifica: prioridad, tipo de caso, automatización, nivel y versión. El estado (borrador, en revisión, aprobado u obsoleto) no se elige aquí: lo mueve la revisión, más adelante en este capítulo. En «Requisitos vinculados», «Vincular un requisito…» lo enlaza con lo que comprueba (en este ejemplo, REQ-001): el caso lleva el tag @REQ-001 en su Gherkin y la matriz lo cuenta como cubierto. Al guardarlo recibe su ID con el prefijo del proyecto (en este ejemplo, PH-001).

![Un caso básico](img/casos/04-caso-basico.png)

### 8.5. Campos personalizados en el caso

Los campos personalizados del proyecto (capítulo 14) aparecen al final del editor, en «Campos personalizados». Sirven para clasificar los casos con lo que tu equipo necesite y luego filtrar por ello (en este ejemplo, «Navegador», una selección, y «Regresión crítica», un sí/no). Si uno es obligatorio, el caso no se guarda sin él. «Guardar» confirma con «Caso de prueba guardado» y la cabecera del proyecto pasa a «1 caso».

![Campos personalizados en el caso](img/casos/05-campos-personalizados.png)

### 8.6. La vista Gherkin

El selector de vista, a la derecha del título, cambia entre «Editor», «Gherkin» y «Vista dividida». «Gherkin» muestra el mismo caso escrito como un escenario .feature. No son dos copias: es el mismo caso visto de dos formas, así que lo que escribes en el formulario aparece en el Gherkin y lo que editas en el Gherkin vuelve al formulario. La barra de palabras clave (Given, When, Then…) las inserta donde está el cursor; Tab sangra la línea, y para salir del editor con el teclado pulsa Esc y después Tab. Los tags de requisitos (@REQ-001) son enlaces.

![La vista Gherkin](img/casos/06-gherkin.png)

### 8.7. Vista dividida y copiar el Gherkin

«Vista dividida» pone el formulario y el Gherkin uno junto a otro, y es la forma más cómoda de ver cómo cada campo se traduce en el escenario mientras escribes; «Sincronizado», sobre el Gherkin, confirma que ambos coinciden. El botón de copiar, arriba a la derecha del Gherkin, lo lleva al portapapeles («Gherkin copiado») para pegarlo en tu proyecto de automatización.

![Vista dividida y copiar el Gherkin](img/casos/07-vista-dividida.png)

### 8.8. Un caso «Básico avanzado» (Outline)

Un caso «Básico avanzado» (Scenario Outline) prueba el mismo escenario con varios datos. En los pasos, los valores que cambian se escriben como marcadores entre ángulos (en este ejemplo, `<correo>` y `<contraseña>`), y Pharos crea solo una columna por marcador en la tabla «Examples»: cada fila es una ejecución del escenario (aquí, una contraseña equivocada y un correo sin cuenta). «+ Columna» y «+ Fila» amplían la tabla; la papelera quita una fila o una columna. Si una columna no tiene su marcador en los pasos, Pharos lo avisa.

![Un caso «Básico avanzado» (Outline)](img/casos/08-outline.png)

### 8.9. Un caso «Avanzado» con flujos alternos

El nivel «Avanzado» añade precondiciones compartidas (Background), que se cumplen antes de cada flujo, y flujos alternativos además del principal, cada uno con su nombre, sus pasos y su resultado (en este ejemplo, el caso «Crear un proyecto» con el flujo alterno «Nombre vacío»). En Gherkin, cada flujo es un Scenario. «+ Añadir flujo alterno» crea otro y la papelera junto al nombre lo quita. Cada flujo puede llevar su propia tabla de ejemplos.

![Un caso «Avanzado» con flujos alternos](img/casos/09-flujos.png)

### 8.10. Un caso de tipo checklist

Con «Tipo de caso: Checklist», los pasos se convierten en una lista de comprobaciones sin Given/When/Then y sin Gherkin. Es útil para revisiones rápidas, como una prueba de humo o una revisión de accesibilidad, donde lo que importa es no olvidar nada (en este ejemplo, «Humo de la versión 0.3.0»). Los pasos y el Gherkin que tuviera se conservan, ocultos, por si vuelves a «Estándar». En «Otras referencias (texto libre)» se puede citar algo sin vincularlo (aquí, REQ-006): el capítulo 13 enseña a convertirlo en un vínculo.

![Un caso de tipo checklist](img/casos/10-checklist.png)

### 8.11. Reordenar con el teclado

Para cambiar el orden de los pasos (o de las comprobaciones de una checklist), arrastra el asa (⠿) que tiene cada uno. Con el teclado: lleva el foco al asa con Tab, pulsa Espacio o Intro para cogerlo, muévelo con ↑ ↓ y suéltalo con Espacio o Intro; Esc cancela. Un lector de pantalla anuncia cada movimiento («Paso 1 movido a la posición 2»).

### 8.12. La lista de casos

Con casos, la tabla muestra ID, título, requisito, prioridad, estado, «Ejecución» y fecha de la última edición. «Ejecución» es el último resultado de cada caso, el mismo que la matriz (capítulo 13): «Pasa», «Falla», «Bloqueado», «Omitido» o «Por confirmar»; «—» si aún no tiene ninguno. Si un caso tiene contenido sugerido por IA que nadie ha revisado, su estado (normalmente «Borrador») lleva un ✨ y un borde discontinuo, y al pasar el puntero lo explica. Busca por ID, título o requisito y filtra por estado (cada uno con su recuento), prioridad, resultado («Ejecución», con «Sin resultados» para los que aún no se han ejecutado), tipo, automatización o un campo personalizado de sí/no, para quedarte, por ejemplo, con los casos aprobados de prioridad alta. Haz clic en la cabecera de una columna para ordenar por ella. En este ejemplo, «credenciales» deja los dos casos de acceso.

![La lista de casos](img/casos/12-lista.png)

### 8.13. Ningún caso coincide

Si la búsqueda o los filtros no dejan ningún caso, la lista lo dice y ofrece «Quitar filtros» para volver a verlos todos.

![Ningún caso coincide](img/casos/13-sin-coincidencias.png)

### 8.14. Editar y recorrer los casos

Con un caso abierto, la barra superior indica su posición en la lista (por ejemplo, «2 de 3») y sus flechas pasan al anterior o al siguiente respetando el filtro activo, para revisar varios casos seguidos sin volver a la lista. El orden del recorrido se fija al abrir el caso, aunque la lista cambie. A la derecha, el estado de guardado avisa si hay cambios sin guardar; si sales con cambios, Pharos pregunta antes de perderlos.

![Editar y recorrer los casos](img/casos/14-recorrer.png)

### 8.15. Ir a un caso (Ctrl+P)

«Ir a un caso…» (o Ctrl+P, ⌘P en Mac, desde el editor) abre un buscador: escribe parte del ID, del título o de un requisito, muévete con ↑ ↓ y pulsa Intro para abrirlo sin pasar por la lista; Esc lo cierra. En este ejemplo, «credenciales» encuentra los dos casos de acceso.

![Ir a un caso (Ctrl+P)](img/casos/15-ir-a-caso.png)

### 8.16. Revisiones y exportación de un caso

El menú «⋯» del caso reúne sus revisiones y la exportación a .xlsx, .pdf o .feature (este último no aparece en una checklist). Al exportar, un aviso dice dónde se guardó el archivo.

![Revisiones y exportación de un caso](img/casos/16-mas-acciones.png)

### 8.17. Las revisiones de un caso

Cada guardado crea una revisión, una copia fechada del caso. «⋯ → Revisiones» las lista con su número, su título y su fecha; la vigente dice «Actual» (en este ejemplo, Liomar añadió «(v2)» al título y guardó, así que hay dos). La clave del caso nunca cambia entre revisiones. En la versión web todavía no se guardan revisiones.

![Las revisiones de un caso](img/casos/17-revisiones.png)

### 8.18. Restaurar una revisión

«Restaurar», junto a una revisión anterior, pregunta antes y carga su contenido en el editor, todavía sin guardar y con la misma clave: revísalo y, si es lo que buscabas, pulsa «Guardar». Se crea una revisión nueva y las anteriores se conservan, así que restaurar nunca borra el historial. Esc o «Cancelar» lo dejan todo como estaba.

### 8.19. Importar un caso desde .xlsx

Para traer un caso escrito en Excel, «Importar / Exportar → Importar .xlsx» lee una plantilla rellenada o un caso exportado antes. El informe enseña qué campos se reconocieron y «Aplicar» abre el editor con esos datos, todavía sin guardar.

![Importar un caso desde .xlsx](img/casos/19-importar.png)

### 8.20. Caso importado

Revisa el caso importado y guárdalo: entra en la lista con el siguiente ID libre del proyecto.

### 8.21. Exportar todos los .feature

«Importar / Exportar › Exportar .feature» genera un ZIP con un archivo .feature por caso, listo para un proyecto de automatización con playwright-bdd o Cucumber; cada escenario lleva el tag de su ID (@PH-001) y de sus requisitos. Las checklists se omiten porque no tienen Gherkin, y el aviso lo dice.

### 8.22. Acciones con varios casos

Marca uno o varios casos con su casilla (en este ejemplo, la copia importada): aparece una barra con el número de casos seleccionados (también los de otras páginas) y lo que puedes hacer con todos a la vez: exportarlos a .feature, eliminarlos o «Quitar selección».

![Acciones con varios casos](img/casos/22-seleccion.png)

### 8.23. Eliminar casos

«Eliminar» pide confirmación antes de quitar los casos del proyecto («¿Eliminar 1 caso?», con sus IDs); «Cancelar» los deja como estaban. Esc no cierra este aviso.

![Eliminar casos](img/casos/23-eliminar.png)

### 8.24. Casos eliminados

Al confirmar, un aviso dice cuántos casos se eliminaron y la lista deja de mostrarlos.

### 8.25. Enviar un caso a revisión

Bajo la cabecera de un caso guardado están las acciones de su revisión. «Enviar a revisión» pide una nota opcional para quien revise y pasa el caso a «En revisión». Si alguien edita el contenido antes de aprobarlo, vuelve a Borrador. Con cambios sin guardar, las acciones esperan a que guardes.

![Enviar un caso a revisión](img/casos/25-enviar-revision.png)

### 8.26. Aprobar un caso

Quien revisa ve quién envió el caso y su nota, y, si había una versión anterior aprobada o enviada, qué cambió desde entonces. «Pedir cambios…» deja un comentario obligatorio y el caso sigue en revisión. «Aprobar versión N» pide confirmación y deja quién aprobó, cuándo y qué versión. Liomar trabaja en su espacio personal, que no pide aprobación independiente, así que aprueba su propio caso y queda como «aprobación propia»; en un espacio compartido con la regla activada, lo aprobaría un Test Manager o un Test Analyst que no sea el autor.

![Aprobar un caso](img/casos/26-aprobar-caso.png)

### 8.27. Pedir cambios en un caso

Si el caso no está listo, «Pedir cambios…» deja un comentario y el caso sigue en revisión: Borrador es solo el principio. El comentario es obligatorio: sin él, el diálogo dice «Escribe qué hay que cambiar.». Quien escribió el caso lo verá en un aviso «Cambios pedidos por…», y en la lista el caso lleva la marca «Cambios pedidos». Cuando guarde los cambios, el aviso pasa a «Cambios guardados tras la petición de…» y el caso se puede aprobar.

![Pedir cambios en un caso](img/casos/27-devolver-caso.png)

### 8.28. Marcar un caso como obsoleto

«Marcar obsoleto» pide confirmación: el caso se conserva en el histórico, pero deja de usarse y, si estaba aprobado, pierde la aprobación.

![Marcar un caso como obsoleto](img/casos/28-obsoleto.png)

### 8.29. Reactivar un caso obsoleto

Un caso obsoleto se puede «Reactivar»: vuelve a Borrador y, para aprobarlo otra vez, hay que enviarlo a revisión.

![Reactivar un caso obsoleto](img/casos/29-reactivar.png)

### 8.30. Congelar una baseline

«Baselines», en la lista de casos, congela un conjunto de casos tal como están: cada uno con su revisión exacta y su estado. «Nueva baseline» pide un nombre y qué casos entran: todos, los del filtro de la lista o los seleccionados («Congelar en baseline» en la barra de selección). «Solo los casos aprobados» viene marcado, y el diálogo dice cuáles se quedan fuera. Una baseline no se edita ni se borra.

![Congelar una baseline](img/casos/30-baseline-nueva.png)

### 8.31. Comparar una baseline

«Comparar» enfrenta una baseline con el «Estado actual» o con otra baseline. Arriba, los recuentos: añadidos, quitados, contenido cambiado, solo estado cambiado y sin cambios. Debajo, un caso por fila; al pulsar su título se ven los cambios campo a campo, con lo quitado tachado y lo añadido resaltado.

![Comparar una baseline](img/casos/31-baseline-comparar.png)

### 8.32. El Gherkin en el móvil

En el móvil, el editor del caso tiene dos vistas, «Editor» y «Gherkin» (no hay vista dividida). El Gherkin se lee sin editar; desliza el código de lado para las líneas largas. «Editar» lo abre a pantalla completa con una barra de teclas sobre el teclado del móvil (Given, When, Then, And, But, Scenario, Examples, |, <>, @tag y sangrar) y «Listo» vuelve. Abajo, «‹ Anterior · N de M · Siguiente ›» recorre los casos.

<img src="img/casos/32-gherkin-movil.png" alt="El Gherkin en el móvil" width="280">

### 8.33. La Biblioteca del proyecto

«Biblioteca», en el menú lateral después de «Casos de prueba», guarda lo que se repite en muchos casos. Tiene dos pestañas: «Pasos compartidos», unos pasos con nombre que se insertan en los casos, y «Datasets», tablas de datos con nombre que se vinculan a la tabla de ejemplos de un caso. Cada pestaña tiene su buscador, su botón «Nuevo…» y «Mostrar obsoletos». Mientras está vacía, la pestaña lo dice.

![La Biblioteca del proyecto](img/casos/33-biblioteca.png)

### 8.34. Un paso compartido con parámetros

«Nuevo paso compartido» pide el nombre (en este ejemplo, «Iniciar sesión»), una descripción opcional y los pasos, cada uno con su resultado esperado opcional; las flechas los reordenan y la papelera quita uno. Lo que cambia de un caso a otro se escribe entre ángulos, como en un Outline: `<usuario>` y `<clave>`. Pharos los lista a la derecha, en «Parámetros», donde se les puede dar un valor que se propone al insertarlos. «Guardar» lo crea como v1.

![Un paso compartido con parámetros](img/casos/34-paso-compartido.png)

### 8.35. Salir con cambios sin guardar

Si vuelves a la lista («← Biblioteca») con cambios sin guardar, Pharos pregunta antes de perderlos: «Descartar» los tira y «Cancelar» te deja seguir editando.

![Salir con cambios sin guardar](img/casos/35-descartar-cambios.png)

### 8.36. Un dataset importado de un CSV

En la pestaña «Datasets», «Nuevo dataset» abre una rejilla: una columna por parámetro y una fila por cada juego de datos. Se escribe en ella, se pega un bloque copiado de una hoja de cálculo (Ctrl+V; en un dataset vacío, la primera fila da los nombres de las columnas) o se importa con «Importar CSV o xlsx…». En este ejemplo, «Usuarios válidos» trae de un CSV las columnas `usuario` y `clave` y tres cuentas de prueba. Un dataset no es un almacén de secretos: usa cuentas de prueba, nunca contraseñas reales.

![Un dataset importado de un CSV](img/casos/36-dataset-importar.png)

### 8.37. Reemplazar los datos al importar

Si la rejilla ya tiene filas, importar otro archivo pregunta antes de reemplazarlas. Las filas conservan su identificador por posición, así que los casos que eligieron filas concretas siguen apuntando a las mismas. «Cancelar» deja la rejilla como estaba.

![Reemplazar los datos al importar](img/casos/37-dataset-reemplazar.png)

### 8.38. Eliminar un elemento de la biblioteca

«Eliminar» quita de la biblioteca un paso compartido o un dataset con todas sus versiones, después de confirmarlo. Solo se puede mientras ningún caso lo use; si alguno lo usa, el botón queda desactivado y la alternativa es «Marcar obsoleto», que lo deja de ofrecer al insertar sin tocar los casos. En este ejemplo, Liomar cancela: va a usar el dataset.

![Eliminar un elemento de la biblioteca](img/casos/38-eliminar-elemento.png)

### 8.39. Insertar un paso compartido en un caso

En un caso básico o «Básico avanzado», «Insertar paso compartido…», bajo los pasos, abre la lista de la biblioteca. Tras «Elegir», el diálogo muestra sus pasos y un campo por parámetro. Un argumento vacío deja el parámetro tal cual, y su valor sale de la tabla de datos del caso; un literal (una cuenta concreta) se escribe en la copia del caso; otro parámetro entre ángulos lo renombra. «Dónde va» elige entre los pasos y las precondiciones. En este ejemplo, el caso «Acceso con usuarios de prueba» deja los dos argumentos vacíos.

![Insertar un paso compartido en un caso](img/casos/39-insertar-paso.png)

### 8.40. Vincular un dataset al caso

En la tabla de ejemplos, «Vincular dataset…» ofrece los datasets activos del proyecto, con sus filas y sus columnas. Al vincular uno, sus filas pasan a ser la tabla de datos del caso: una fila, una ejecución. Las columnas se emparejan con los parámetros por su nombre.

![Vincular un dataset al caso](img/casos/40-vincular-dataset.png)

### 8.41. Elegir las filas del dataset

«Elegir filas…», en la tabla vinculada, deja ejecutar solo algunas filas del dataset (por ejemplo, una sola cuenta para una prueba de humo). En este ejemplo se usan las tres.

![Elegir las filas del dataset](img/casos/41-elegir-filas.png)

### 8.42. El caso con su paso compartido y su dataset

El caso muestra los pasos insertados como un bloque («Paso compartido · Iniciar sesión», con su versión) y la tabla vinculada, de solo lectura, con «Dataset · Usuarios válidos». Un bloque nuevo sigue la última versión: si alguien cambia el paso o el dataset en la biblioteca, el caso se actualiza solo. «Fijar en vN» lo deja en esa versión, «Abrir en la biblioteca» lleva a editarlo y «Desvincular» convierte los pasos o las filas en propios del caso. «Guardar» guarda el caso.

![El caso con su paso compartido y su dataset](img/casos/42-caso-con-biblioteca.png)

### 8.43. Cambiar un paso compartido: el aviso de impacto

Al guardar un cambio de un paso compartido o de un dataset que usan casos, Pharos avisa antes: «Guardar «Iniciar sesión» como v2», cuántos casos se actualizan, por estado, y cuáles. Los casos aprobados vuelven a «En revisión», como al editarlos a mano; los fijados en una versión no cambian. En este ejemplo, Liomar completa el resultado esperado del paso 3 y se actualiza un caso en borrador.

![Cambiar un paso compartido: el aviso de impacto](img/casos/43-aviso-impacto.png)

### 8.44. Dónde se usa y sus versiones

Cada elemento tiene tres pestañas: «Pasos» (o «Datos»), su contenido; «Usado en», los casos que lo usan, separados entre los que siguen la última versión y los fijados; y «Versiones», cada versión guardada, que se puede abrir para ver qué tenía. Cada cambio del contenido sube la versión (v1, v2…).

![Dónde se usa y sus versiones](img/casos/44-usado-en.png)

### 8.45. Un caso con dataset en un run

Al añadir el caso a un run, el selector de casos dice cuántas filas trae y de qué dataset: «3 filas · Usuarios válidos (v1)». Cada fila será una ejecución propia.

![Un caso con dataset en un run](img/casos/45-run-con-dataset.png)

### 8.46. Ejecutar cada fila del dataset

En el ejecutor, cada fila es una ejecución con su propio resultado: «Flujo principal · Fila 1 de 3», «Fila 2 de 3»… con el primer valor de la fila al lado. Los valores de la fila aparecen resaltados en los pasos, y los pasos insertados llevan encima «Paso compartido · Iniciar sesión · v2». En este ejemplo pasan las dos primeras cuentas y la tercera falla al pulsar «Entrar». Cada resultado recuerda el dataset y la versión de cada paso compartido; el progreso del run cuenta el caso una vez.

![Ejecutar cada fila del dataset](img/casos/46-ejecutar-filas.png)

## Revisión y aprobación

El estado de un caso ya no se elige en un menú: lo mueve el flujo de
revisión, con estas acciones bajo la cabecera del caso.

| Estado | Acción | Qué pasa |
| --- | --- | --- |
| Borrador | «Enviar a revisión» | Pide una nota opcional para quien revise. El caso pasa a «En revisión». |
| En revisión | «Aprobar versión N» | Pide confirmación. Queda quién aprobó, cuándo y qué versión. |
| En revisión | «Pedir cambios…» | Pide un comentario obligatorio. El caso sigue en revisión, con el aviso «Cambios pedidos por…». |
| Cualquiera | «Marcar obsoleto» | El caso se conserva, pero deja de usarse y pierde la aprobación. |
| Obsoleto | «Reactivar» | El caso vuelve a «En revisión» (a Borrador si nunca se envió). Hay que aprobarlo de nuevo. |

- Primero se guarda: con cambios sin guardar, las acciones esperan.
- Quien revisa ve «Cambios desde la revisión N», con lo que cambió campo a
  campo desde la última versión aprobada o enviada. Lo quitado aparece
  tachado y lo añadido, resaltado.
- **Borrador es solo el principio**, como en el plan (capítulo 5): un caso
  se revisa las veces que haga falta hasta que se aprueba.
- Si se edita el título o el contenido de un caso aprobado, un aviso lo dice
  antes de guardar. Al guardar, el caso vuelve a «En revisión», pierde la
  aprobación y su versión sube. Un caso en revisión sigue en revisión; si
  alguien había pedido cambios, el aviso pasa a «Cambios guardados tras la
  petición de…». Cambiar la prioridad, la automatización o los campos
  personalizados no cuenta.
- **Quién aprueba** lo decide la regla «Aprobación independiente» del espacio
  de trabajo. Activada (lo normal en un espacio compartido): un Test Manager o
  un Test Analyst que no sea quien escribió el caso. Desactivada (siempre en
  tu espacio personal): cualquiera que pueda editar el caso, también el
  autor, y entonces queda como «aprobación propia» en el caso, en la lista y
  en el historial.
- En la lista, el filtro «Por revisar» reúne los casos en revisión que
  puedes aprobar. La ayuda emergente del estado dice quién lo envió o lo
  aprobó. Con varios casos seleccionados, «Enviar a revisión» envía los
  borradores de una vez.

## Baselines de suite

Una **baseline** congela un conjunto de casos tal como están: cada caso con
su revisión exacta y su estado. Sirve, por ejemplo, para fijar la regresión de
una versión.

- «Baselines», en la lista de casos, muestra las del proyecto. «Nueva
  baseline» pide un nombre y los casos: todos los del proyecto (sin los
  obsoletos), los del filtro de la lista o la selección («Congelar en
  baseline», con casos seleccionados).
- «Solo los casos aprobados» viene marcado. El diálogo dice cuántos casos
  entran y cuáles se quedan fuera.
- Una baseline no se edita ni se borra. Si hace falta otra, se crea otra.
- «Comparar» enfrenta una baseline con el «Estado actual» o con otra
  baseline. Arriba están los recuentos (añadidos, quitados, contenido
  cambiado, solo estado cambiado, sin cambios). Debajo, un caso por fila: al
  pulsar su título se ven los cambios campo a campo.

## Biblioteca: pasos compartidos y datasets

La sección **«Biblioteca»** del proyecto, después de «Casos», guarda lo que se
repite en muchos casos. Tiene dos pestañas:

- **Pasos compartidos:** unos pasos con nombre, por ejemplo «Iniciar sesión».
  Pueden llevar parámetros entre ángulos (`<usuario>`, `<clave>`), como un
  Outline.
- **Datasets:** una tabla de datos con nombre, por ejemplo «Usuarios
  válidos», con una columna por parámetro y una fila por cada juego de datos.
  Se escribe en la rejilla, se pega desde una hoja de cálculo o se importa
  desde CSV o `.xlsx`.

Cada cambio en el contenido sube la **versión** (v1, v2…). «Usado en» dice qué
casos lo usan, y «Versiones» guarda cada versión.

**Usarlos en un caso** (básico o «Básico avanzado»):

1. En los pasos o las precondiciones, pulsa «Insertar paso compartido…»,
   elige el paso y escribe sus argumentos. Un argumento vacío deja el
   parámetro tal cual: su valor sale de la tabla de datos.
2. En la tabla de ejemplos, pulsa «Vincular dataset…» y elige el dataset (y,
   si quieres, solo algunas filas con «Elegir filas…»).

El caso muestra los pasos insertados como un bloque, y la tabla vinculada, de
solo lectura. Para editarlos se abre el elemento en la biblioteca, o se pulsa
«Desvincular», que los convierte en pasos y filas propios del caso.

**Seguir o fijar una versión.** Un bloque nuevo **sigue la última versión**:
cuando alguien cambia el paso o el dataset en la biblioteca, el caso se
actualiza solo. Con «Fijar en vN» se queda en esa versión, y el caso avisa «Hay
una versión nueva» con el botón «Actualizar».

**Los casos aprobados vuelven a revisión.** Actualizar un caso cambia su
contenido, así que, como al editarlo a mano, un caso **Aprobado** pasa a **En
revisión** y sube su versión. Antes de guardar el cambio en la biblioteca, un
aviso dice cuántos casos se actualizan y cuántos aprobados volverán a revisión.
Si un caso no debe moverse, fíjalo en su versión antes.

**Un dataset de 3 filas da 3 resultados.** Al añadir el caso a un run, el
diálogo muestra «3 filas · Usuarios válidos (v1)». En la ejecución, cada fila
es una ejecución propia («Flujo principal · Fila 2 de 3», con el primer valor
de la fila, qa.web@pharos.test), con sus valores resaltados en los pasos, y los
pasos insertados aparecen bajo «Paso compartido · Iniciar sesión · v2». Cada
fila guarda su resultado, que recuerda el dataset y la versión de cada paso
compartido. El progreso cuenta el caso una vez.

**Al exportar**, el `.feature`, el PDF y el `.xlsx` llevan los pasos y las
filas completos, y nombran su origen: «Paso compartido: Iniciar sesión (v2)» y
«Dataset: Usuarios válidos (v1)».

## Atajos de teclado

| Tecla | Dónde | Qué hace |
| --- | --- | --- |
| Ctrl+P (⌘P en Mac) | Editor de un caso abierto desde la lista | Abre «Ir a un caso» |
| ↑ ↓, Intro, Esc | «Ir a un caso» | Se mueven por los resultados, abren el elegido, cierran |
| Espacio o Intro | Asa (⠿) de un paso o una comprobación | Coge el paso; otra vez, lo suelta |
| ↑ ↓ | Paso cogido | Lo sube o lo baja |
| Esc | Paso cogido | Cancela el movimiento |
| Tab | Editor Gherkin | Sangra la línea |
| Esc y después Tab | Editor Gherkin | Sale del editor con el teclado |
| ← → | Selector de vista (Editor · Gherkin · Vista dividida) | Cambia de vista |
| ↑ ↓ e Intro | Menús de prioridad y automatización, y «⋯» | Recorren y eligen una opción |

## Si algo no sale

- **«No se puede guardar: revisa 1 campo.»** Falta el título o un campo
  personalizado obligatorio. El enlace del aviso lleva al campo.
- **«Fila repetida: ya hay otra igual.»** Dos pasos o dos filas de ejemplos
  son iguales. El caso se guarda, pero conviene revisarlo.
- **«Columnas sin placeholder en los pasos».** Una columna de «Examples» no
  aparece como `<nombre>` en ningún paso: escribe el marcador o quita la
  columna.
- **No puedo bajar el «Nivel».** El Gherkin usa algo de un nivel superior
  (por ejemplo, un Outline). El aviso del selector dice cuál es el mínimo.
- **«Este proyecto aún no tiene requisitos (sección Requisitos).»** Crea o
  importa los requisitos antes (capítulo 7) para poder vincularlos.
- **«Requisito desconocido».** El caso enlaza un requisito eliminado. Quítalo
  con la ✕ de su etiqueta o vincula otro.
- **«Clave provisional: recibirá la definitiva al sincronizar.»** El caso se
  creó sin conexión. Su ID definitivo llega con la próxima sincronización, y
  mientras tanto su .feature se exporta sin tag de ID.
- **Ctrl+P no hace nada.** Solo funciona en un caso abierto desde la lista y
  sin otro diálogo abierto.
- **«Sugerir casos con IA» está en gris.** Necesita un motor de IA (capítulo
  15) y un plan de pruebas en el proyecto (capítulo 5).
- **«No se importaron estos valores…».** Al importar un .xlsx, los valores que
  no encajan con un campo personalizado (por ejemplo, una opción que no
  existe) se omiten.
- **«Aprobar versión N» está en gris.** Hay cambios sin guardar, o lo tiene
  que aprobar otra persona: el texto bajo el botón dice cuál de las dos.
- **«El caso cambió mientras tanto.»** Alguien lo editó o lo revisó a la
  vez. Vuelve a abrirlo y repite la acción.
- **«Ningún caso entra en la baseline.»** Ninguno de los elegidos está
  aprobado. Desmarca «Solo los casos aprobados» o elige otros casos.
- **El estado lleva ✨ y un borde discontinuo.** El caso tiene contenido
  sugerido por IA que nadie ha revisado. Ábrelo y pulsa «Marcar revisado» en
  cada marca de IA.

## En el móvil

- La lista muestra cada caso como una tarjeta. Un solo botón «Filtros», con el
  número de filtros activos, abre todos los filtros en una hoja desde abajo.
- El editor tiene dos vistas, «Editor» y «Gherkin»; no hay vista dividida.
- El Gherkin se lee sin editar. «Editar» lo abre a pantalla completa con una
  barra de teclas sobre el teclado del móvil, y «Listo» vuelve.
- Abajo, «‹ Anterior · N de M · Siguiente ›» recorre los casos.

## Consejos

- Vincula cada caso a su requisito al crearlo: es lo que hace útil la matriz
  de trazabilidad.
- Empieza en «Básico»: siempre puedes subir de nivel, pero no bajar por debajo
  de lo que ya usa el Gherkin.
- Usa marcadores entre ángulos (`<correo>`) y la tabla de ejemplos cuando el
  mismo escenario deba probarse con varios datos.
- Envía a revisión los casos que estén listos y apruébalos: los ciclos avisan
  cuando añades casos sin aprobar (capítulo 9).
- Antes de una versión, congela su regresión en una baseline. Después,
  «Comparar» con el estado actual dice qué casos cambiaron desde entonces.
- Exporta los .feature para tu proyecto de automatización: cada escenario
  lleva el tag de su caso, y los resultados importados se vinculan solos por
  ese tag o por la propiedad `test_id` (capítulo 10).

## Véase también

- Capítulo 7, «Requisitos».
- Capítulo 9, «Ciclos de prueba»: añadir casos a un ciclo.
- Capítulo 13, «Trazabilidad».
- Capítulo 17, «Asistente de IA»: sugerir casos y revisar las listas de un
  caso.
- [Guía de pruebas de la beta](../guia-beta.md), apartado 4.3.
- [Glosario](../GLOSARIO.md): «Caso de prueba», «ID de escenario», «Pasos de
  prueba», «Prioridad», «Estado (del caso)», «Baseline de suite».

---

← [Requisitos](07-requisitos.md) · [Índice](README.md) · [Ciclos de prueba](09-ciclos.md) →
