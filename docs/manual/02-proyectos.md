<!-- Generado por `npm run manual` desde e2e/tours/02-proyectos.tour.ts y docs/manual/fuentes/proyectos.md. No lo edites a mano: edita la fuente. -->

# 2. Inicio, proyectos y ajustes

## Para qué sirve

Un **proyecto** es la carpeta de un producto o una versión que pruebas: tiene
un plan de pruebas, sus casos, requisitos, ciclos, ejecuciones, defectos y un
planificador. «Inicio» resume todos tus proyectos de un vistazo, y en los
**ajustes** de cada proyecto se decide cómo se numeran sus casos, qué campos
propios tienen y en qué configuraciones (navegadores, dispositivos) se
ejecutan.

## Paso a paso

### 2.1. Inicio

«Inicio» resume tus proyectos: proyectos abiertos, pruebas pendientes, tasa de éxito y defectos abiertos, la ejecución por proyecto, los criterios de salida, las ejecuciones diarias y las próximas pruebas. Con una cuenta nueva aparece vacío.

![Inicio](img/proyectos/01-inicio.png)

### 2.2. El periodo de los datos

El selector de periodo («Últimos 14 días») elige los días de «Ejecuciones diarias» y de la tasa de éxito: hoy, 7, 14 o 30 días o el mes en curso. El resto del Inicio es el estado actual de cada proyecto. Se recuerda en este equipo.

![El periodo de los datos](img/proyectos/02-periodo.png)

### 2.3. Buscar (Ctrl+K)

La barra de búsqueda de arriba (o Ctrl+K desde cualquier pantalla) es el punto de entrada de la búsqueda global de casos, requisitos y proyectos. En esta versión todavía no busca: el panel avisa de que llega en una próxima versión. Mientras tanto, cada lista tiene su propio buscador y, dentro de los casos, Ctrl+P salta a uno (capítulo 4). La campana, a su lado, abre las notificaciones.

![Buscar (Ctrl+K)](img/proyectos/03-busqueda.png)

### 2.4. Contraer el menú lateral

El botón junto al logotipo contrae el menú lateral a una tira de iconos, para dar más espacio a tablas y editores, y lo vuelve a expandir. Pharos recuerda tu elección en este equipo.

![Contraer el menú lateral](img/proyectos/04-menu-lateral.png)

### 2.5. La lista de proyectos, vacía

Todo en Pharos vive dentro de un proyecto: el plan, los casos, los ciclos, los defectos. «Proyectos», en el menú lateral, lista los tuyos; sin ninguno, la lista invita a crear el primero.

![La lista de proyectos, vacía](img/proyectos/05-proyectos-vacio.png)

### 2.6. El nombre es obligatorio

«Nuevo proyecto» abre una fila para escribir el nombre. Si pulsas «Crear» sin escribirlo, Pharos lo indica bajo el campo y no crea nada.

![El nombre es obligatorio](img/proyectos/06-nombre-obligatorio.png)

### 2.7. Crear un proyecto

Escribe el nombre de tu proyecto (en este ejemplo, «Banca Móvil») y pulsa «Crear». Pharos abre el proyecto directamente en su plan de pruebas, todavía vacío: es el primer paso natural (capítulo 3).

![Crear un proyecto](img/proyectos/07-crear-proyecto.png)

### 2.8. Ajustes del proyecto: prefijo de los casos

«Ajustes del proyecto», en el menú lateral, permite cambiar el nombre y cómo se numeran sus casos: el prefijo (en este ejemplo, «BM-») y el número de dígitos. La vista previa muestra cómo quedará el ID del siguiente caso (BM-001). Elige el prefijo pronto: es el que verás en informes, defectos y exportaciones. «Guardar» lo confirma con «Ajustes actualizados».

![Ajustes del proyecto: prefijo de los casos](img/proyectos/08-ajustes.png)

### 2.9. Nuevo campo personalizado

Los campos personalizados añaden a los casos lo que tu equipo necesite clasificar y que Pharos no trae de serie. En «Campos personalizados», «Nuevo campo» abre el diálogo: nombre, clave, tipo (texto, número, fecha, sí/no, selección…), opciones y si es obligatorio. El botón [?] junto a «Clave» explica su formato (minúsculas, números y guion bajo) al pasar el ratón, con el tabulador o al tocarlo; debajo se recuerda que no se puede cambiar después. En este ejemplo, una selección «Navegador» con tres opciones.

![Nuevo campo personalizado](img/proyectos/09-campo-nuevo.png)

### 2.10. El campo, en la lista

«Crear campo» lo guarda y aparece en la lista; desde ese momento, los casos del proyecto pueden usarlo (capítulo 4). Se reordena arrastrando o con el menú de cada campo: ese es el orden en que se ve en el editor.

![El campo, en la lista](img/proyectos/10-campo-creado.png)

### 2.11. Archivar un campo

Un campo no se borra, para no perder lo que ya se escribió en él: se archiva desde su menú («Archivar») y sus valores se conservan. «Mostrar archivados» lo enseña y «Desarchivar» lo recupera.

![Archivar un campo](img/proyectos/11-campo-archivar.png)

### 2.12. Cerrar sin guardar

Si cierras el diálogo de un campo con cambios sin guardar, Pharos pregunta antes de descartarlos, para que no los pierdas por un clic.

### 2.13. Campos de los defectos

El selector «Casos / Defectos» de la tarjeta elige de qué entidad son los campos. Con «Defectos», «Nuevo campo» crea un campo que aparece en el editor de cada defecto (en este ejemplo, «Cliente afectado»). Los campos de casos y de defectos son independientes, y «Copiar de otro proyecto» copia los de la entidad elegida.

![Campos de los defectos](img/proyectos/13-campo-defecto.png)

### 2.14. Nueva configuración

Una configuración describe dónde se ejecuta una prueba, para saber en qué entorno pasó o falló. En «Configuraciones», «Nueva configuración» pide navegador, sistema, dispositivo e idioma (en este ejemplo, «Chrome · Windows 11»). Las etiquetas de importación (Intro o coma para añadir cada una) son los nombres con los que un informe importado reconoce la configuración.

![Nueva configuración](img/proyectos/14-configuracion-nueva.png)

### 2.15. Configuraciones del proyecto

«Guardar» la añade a la lista. En este ejemplo hay dos activas (Chrome y Edge); una tercera se archivó desde su menú y solo se ve con «Mostrar archivadas»: así deja de ofrecerse en ciclos nuevos sin perder su historia.

![Configuraciones del proyecto](img/proyectos/15-configuracion-creada.png)

### 2.16. Crear con Intro y copiar campos

Un segundo proyecto (en este ejemplo, «Portal Clientes», creado pulsando Intro tras el nombre) no tiene que definir sus campos desde cero: «Copiar de otro proyecto» trae los campos personalizados de otro.

![Crear con Intro y copiar campos](img/proyectos/16-segundo-proyecto.png)

### 2.17. Todos los proyectos

Con proyectos, la lista muestra arriba los recientes y debajo la tabla de todos, con el estado del plan, los casos, la ejecución, la cobertura y el último acceso. Busca por nombre o prefijo (en este ejemplo, «BM» deja solo «Banca Móvil») y ordena con «Ordenar por».

![Todos los proyectos](img/proyectos/17-lista-proyectos.png)

### 2.18. Acciones de un proyecto

El menú «⋯» de cada fila reúne las acciones del proyecto: abrirlo, ir a sus ajustes o exportarlo en un ZIP con su plan, sus casos y sus documentos, útil como copia o para entregarlo a alguien que no usa Pharos.

![Acciones de un proyecto](img/proyectos/18-menu-fila.png)

### 2.19. Exportar un proyecto

«Exportar proyecto (ZIP)» genera los documentos mostrando una barra de progreso y guarda el ZIP en tu carpeta de descarga (Administración › General); al terminar, un aviso indica cuántos archivos se exportaron y dónde. «Exportar todo» hace lo mismo con todos tus proyectos.

### 2.20. Cambiar de proyecto

Dentro de un proyecto, el selector de la parte superior del menú lateral (con su prefijo y su nombre) salta a otro proyecto sin volver a la lista; con muchos proyectos, escribe para filtrarlos.

![Cambiar de proyecto](img/proyectos/20-cambiar-proyecto.png)

### 2.21. Eliminar un proyecto

«Eliminar proyecto», al pie de los ajustes, borra el proyecto con todo lo que contiene. Por eso el diálogo cuenta lo que se perderá y, para evitar un borrado por error, pide escribir el prefijo (o el nombre) antes de habilitar «Sí, eliminar todo». Si solo quieres conservar una copia, exporta antes el ZIP.

![Eliminar un proyecto](img/proyectos/21-eliminar-proyecto.png)

### 2.22. Proyecto eliminado

Al confirmar, Pharos vuelve a la lista de proyectos, que ya no lo muestra.

## Consejos

- Elige el **prefijo** de los casos al principio (por ejemplo `BM-`): el ID de
  un caso no cambia una vez asignado, porque viaja como tag (`@BM-001`) en la
  automatización.
- Los **campos personalizados** nunca se borran, se archivan: así los valores
  que ya tienen los casos no se pierden.
- Las **etiquetas de importación** de una configuración deben coincidir con
  los nombres que usa tu herramienta (por ejemplo, el nombre del proyecto de
  Playwright, `chromium`). Así un informe importado sabe en qué configuración
  se ejecutó.
- Eliminar un proyecto borra todo su contenido: exporta antes un ZIP si
  quieres conservarlo.

## Véase también

- [Guía de pruebas de la beta](../guia-beta.md), apartado 4.3 «Plan, casos y exportaciones».
- [Glosario](../GLOSARIO.md): «Proyecto», «Prefijo de ID de caso», «Recientes».

---

← [Acceso y cuenta](01-acceso.md) · [Índice](README.md) · [Plan de pruebas](03-plan.md) →
