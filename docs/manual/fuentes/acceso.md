# Acceso y cuenta (fuente del capítulo 1)

Texto escrito a mano del capítulo. Los pasos (pie y captura) los genera el
tour `e2e/tours/01-acceso.tour.ts`; aquí van la introducción, los atajos, los
problemas habituales, el móvil, los consejos, los enlaces y las notas por paso
(«### Paso <id>»).

## Para qué sirve

Pharos guarda tus datos cifrados en tu equipo y los sincroniza con un servidor
cuando hay conexión. Para eso necesitas una cuenta: con ella entras, queda
registrado quién hizo cada cambio y tus proyectos llegan a tus otros equipos.

Tu cuenta tiene dos nombres:

- El **alias** es como te ve el resto de la aplicación: el menú lateral, el
  menú de usuario, los cambios que haces.
- El **nombre oficial** (nombre y apellidos) firma los documentos que exportas,
  como el plan de pruebas («Elaborado por»).

En este manual, el proyecto que se prueba es **la propia aplicación Pharos**.
Lo recorre **Liomar Rodríguez**, responsable de QA de Pharos, con su cuenta
«Liomar QA». Los proyectos y los datos son solo un ejemplo: en tu caso verás
los tuyos.

## Atajos de teclado

| Tecla | Dónde | Qué hace |
| --- | --- | --- |
| Tab / Mayús+Tab | Formulario de entrada | Pasa de un campo al siguiente o al anterior |
| Intro | Formulario de entrada o de registro | Envía el formulario («Entrar» o «Registrarme») |
| Intro | «Mi perfil» | Guarda el alias y el nombre |
| ↑ ↓ e Intro | Selector de idioma y menú de usuario | Recorren las opciones y eligen una |
| Esc | Selector de idioma y menú de usuario | Cierra el menú y devuelve el foco a su botón |

## Si algo no sale

- **«Correo o contraseña incorrectos.»** Revisa los dos: Pharos no dice cuál
  falla. El ojo del campo de la contraseña te deja ver lo que has escrito.
- **«Demasiados intentos. Espera un momento y vuelve a intentarlo.»** Tras
  10 intentos en un minuto, el servidor deja de aceptar más hasta que pasa
  ese minuto. Espera y vuelve a probar.
- **«Ese correo ya está registrado.»** Ya existe una cuenta con ese correo:
  entra con ella en lugar de crear otra.
- **«Revisa los datos introducidos.»** Falta un campo, el correo no tiene
  formato de correo o la contraseña tiene menos de 8 caracteres.
- **«No se pudo conectar con el servidor.»** Para entrar por primera vez en un
  equipo, Pharos necesita el servidor. Comprueba tu conexión. Si ya habías
  entrado antes en este equipo, Pharos abre tu sesión guardada aunque no haya
  conexión.
- **«Sin conexión»**, en una pastilla de la barra superior. Pharos no llega al
  servidor, pero puedes seguir trabajando: tus cambios se guardan en el equipo
  y se envían solos cuando vuelve la conexión (capítulo 15, «Sincronización»).
- **«Tu sesión ha caducado. Vuelve a iniciar sesión.»** Por seguridad, la
  sesión dura un tiempo limitado, y Pharos la renueva sola mientras la usas. Si
  el servidor ya no la acepta (por ejemplo, tras un mes sin abrir Pharos en ese
  equipo), te devuelve a la pantalla de entrada. Lo que tenías sin guardar en
  una ejecución manual se conserva: lo encontrarás al volver a entrar.

## En el móvil

- En una pantalla estrecha, la foto queda arriba y el formulario sube como una
  hoja; el selector de idioma pasa a la barra de la foto.
- Una vez dentro, el menú de usuario se abre desde tu avatar, en la barra
  superior, como una hoja inferior. Incluye además el cambio de tema y el
  estado de la sincronización.
- «Perfil» tiene su propio botón en la barra inferior, y desde el perfil
  también puedes cerrar la sesión.

## Consejos

- La sesión se recuerda en el equipo: no hace falta entrar cada vez. Cierra la
  sesión si compartes el equipo.
- Escribe bien tu nombre y tus apellidos antes de exportar documentos: son los
  que firman el plan de pruebas.
- El idioma también se puede cambiar después, desde el menú de usuario o desde
  el perfil; el tema, desde el perfil, la barra superior o «Administración ›
  General» (capítulo 15), donde además puedes elegir «Según el sistema».
- La clave de recuperación, que sirve para abrir tus datos en un equipo nuevo,
  ya no está en el perfil: está en «Administración › Seguridad» (capítulo 15).

## Véase también

- [Guía de pruebas de la beta](../guia-beta.md), apartado 2 «Antes de empezar».
- [Glosario](../GLOSARIO.md): «Alias / nombre para mostrar», «Nombre oficial», «Elaborado por / Autor».
- Capítulo 2, «La aplicación de un vistazo»: el menú lateral, la barra
  superior y el menú de usuario.
- Capítulo 19, «Si algo sale mal»: si la base de datos local no abre.

### Paso registro

El correo de una cuenta solo puede registrarse una vez. Si ya existe, Pharos
lo dice («Ese correo ya está registrado»).

### Paso entrar

En la app de escritorio, Pharos guarda la sesión en el almacén de credenciales
del sistema (en Windows, el Administrador de credenciales), nunca en un archivo
de texto. En la versión web la guarda el navegador.
