<!-- Generado por `npm run manual` desde e2e/tours/18-movil.tour.ts y docs/manual/fuentes/movil.md. No lo edites a mano: edita la fuente. -->

# 18. Pantallas estrechas y móvil

## Para qué sirve

Pharos se adapta al **ancho de la ventana**, no al aparato: una ventana de
escritorio estrecha se ve igual que un móvil. Hay tres diseños:

| Ancho | Diseño | Navegación |
| --- | --- | --- |
| Desde 1280 px | Escritorio | Menú lateral completo, que se puede plegar a una tira de iconos |
| De 600 a 1279 px | Pantalla mediana (tableta, ventana a media pantalla) | Siempre la tira de iconos; el buscador se reduce a la lupa (capítulo 2) |
| Menos de 600 px | Móvil | Barra superior compacta y barra inferior |

En el móvil:

- la **barra superior** lleva la flecha para volver y el nombre de la sección
  (en Inicio, el logotipo), la lupa, las notificaciones y tu avatar;
- la **barra inferior** lleva Inicio, Proyectos, Admin (Administración) y
  Perfil;
- **tu avatar** abre una hoja con el apartado «Workspace» (tus workspaces
  con tu rol, «Crear workspace», «Unirse con un código…» y «Miembros y
  roles», como el selector del menú lateral), el estado de la sincronización
  y, debajo, «Mi perfil», «Administración», el tema, el idioma y «Cerrar
  sesión»;
- las **notificaciones** (la campana de la barra superior) se abren como una
  hoja desde abajo, con los mismos días, el filtro «Sin leer» y la acción de
  cada una;
- dentro de un proyecto, sus diez secciones (Plan, Tablero, Requisitos,
  Casos, Biblioteca, Ciclos, Ejecuciones, Defectos, Trazabilidad y Ajustes)
  se recorren con **píldoras** bajo el título;
- las **tablas** pasan a tarjetas y ocultan las columnas menos importantes;
- los **menús y filtros** se abren como hojas desde abajo, con la ✕ para
  cerrarlas.

Es la misma aplicación, con los mismos datos: lo que se hace en el escritorio
se puede hacer en el móvil, salvo lo que depende del equipo (adjuntar
archivos, la clave de recuperación, la papelera, las evidencias, «Listar
modelos» y «Usar esta clave también en la web» de la IA, «Requisitos desde
un proyecto» o el CLI `pharos`), que es de la app de escritorio.

En este manual, Liomar repasa su proyecto Pharos desde el móvil.

## Paso a paso

### 18.1. En el móvil: barra inferior

Por debajo de 600 px de ancho (aquí, 390 px, el de un móvil), Pharos usa una barra superior compacta (la flecha para volver y el nombre de la sección, o el logotipo en Inicio; la lupa, las notificaciones y tu avatar) y una barra inferior con Inicio, Proyectos, Admin y Perfil, al alcance del pulgar. Es la misma aplicación, con los mismos datos: en este ejemplo, Liomar repasa su proyecto Pharos desde el móvil.

<img src="img/movil/01-movil-inicio.png" alt="En el móvil: barra inferior" width="280">

### 18.2. Buscar en el móvil

La lupa convierte la barra superior en un campo de búsqueda; la flecha (o Esc) la cierra. La búsqueda global de casos, requisitos y proyectos llega en una próxima versión, y el campo lo avisa.

<img src="img/movil/02-movil-busqueda.png" alt="Buscar en el móvil" width="280">

### 18.3. Notificaciones en el móvil

En el móvil, la campana de la barra superior abre las notificaciones como una hoja desde abajo, con lo mismo que en el escritorio: los avisos agrupados por día, el filtro «Sin leer», «Marcar todo como leído» y la acción de cada aviso. Sin avisos, la hoja dice qué aparecerá en ella. La ✕ o un toque fuera la cierran.

<img src="img/movil/03-movil-notificaciones.png" alt="Notificaciones en el móvil" width="280">

### 18.4. Tu avatar: workspace y cuenta

En el móvil no hay menú lateral: tu avatar, en la barra superior, abre una hoja con lo que en el escritorio está en el selector de workspace y en el menú de usuario. Arriba, tu correo y el estado de la sincronización, con «Sincronizar ahora». Después, «Workspace» lista tus workspaces con tu rol en cada uno (aquí, «Personal», donde Liomar es Test Manager) y ofrece «Crear workspace», «Unirse con un código…» y «Miembros y roles». Debajo, «Mi perfil», «Administración», el tema y el idioma; al pie, «Conectado a» con el servidor (en las capturas, difuminado: es el servidor de pruebas de este manual) y «Cerrar sesión».

<img src="img/movil/04-movil-avatar.png" alt="Tu avatar: workspace y cuenta" width="280">

### 18.5. Secciones del proyecto en el móvil

Dentro de un proyecto, sus diez secciones (Plan, Tablero, Requisitos, Casos, Biblioteca, Ciclos, Ejecuciones, Defectos, Trazabilidad y Ajustes) se recorren con las píldoras bajo el título, que se desplazan de lado; la flecha de la barra superior vuelve a Proyectos. En este ejemplo, Liomar abre «Trazabilidad»: en el móvil, cada requisito es una tarjeta con sus casos.

<img src="img/movil/05-movil-proyecto.png" alt="Secciones del proyecto en el móvil" width="280">

### 18.6. Filtros en una hoja inferior

En la lista de casos, «Filtros» abre una hoja desde abajo con los mismos filtros que en el escritorio, para que la lista conserve la pantalla.

<img src="img/movil/06-movil-filtros.png" alt="Filtros en una hoja inferior" width="280">

### 18.7. Los pasos del plan en el móvil

En el plan de pruebas, «Ver pasos» abre la lista de los 22 pasos en una hoja inferior.

<img src="img/movil/07-movil-pasos-plan.png" alt="Los pasos del plan en el móvil" width="280">

### 18.8. De vuelta al escritorio

Al ensanchar la ventana, Pharos vuelve al menú lateral completo.

## Atajos de teclado

| Tecla | Dónde | Qué hace |
| --- | --- | --- |
| Esc | Hoja inferior abierta | La cierra |
| Esc | Búsqueda abierta en la barra superior | La cierra |
| Ctrl+K | Cualquier pantalla | Abre la búsqueda, también en ventanas estrechas |

## Si algo no sale

- **No veo el menú lateral.** La ventana es estrecha: usa la barra inferior y
  las píldoras del proyecto, o ensancha la ventana.
- **Una tabla no enseña una columna.** En pantallas estrechas se ocultan las
  menos importantes; ábrela en una ventana más ancha o abre el elemento.
- **No veo el botón de adjuntar.** Los adjuntos son de la app de escritorio;
  en la web del móvil no se adjuntan archivos.
- **No llego a mi avatar en una ventana baja.** Desplaza la tira de iconos
  hacia abajo.

## Consejos

- Para revisar el día (Inicio, resultados, defectos) el móvil basta; para
  escribir un plan o muchos casos, mejor una pantalla ancha.
- En la ejecución manual, el ejecutor ocupa toda la pantalla del móvil y se
  marca con un toque (capítulo 11).

## Véase también

- Capítulo 2, «La aplicación de un vistazo»: la tira de iconos de las
  pantallas medianas.
- El apartado «En el móvil» de cada capítulo.
- [Guía de pruebas de la beta](../guia-beta.md), apartado 4.10 «Interfaz
  rediseñada».

---

← [Asistente de IA](17-ia.md) · [Índice](README.md) · [Si algo sale mal](19-errores.md) →
