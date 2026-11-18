# Administración (fuente del capítulo 15)

Texto escrito a mano del capítulo. Los pasos (pie y captura) los genera el
tour `e2e/tours/15-administracion.tour.ts`. La pestaña «Evidencias» tiene su
propio capítulo (16) y el uso de la IA en el trabajo diario, el 17.

## Para qué sirve

«Administración» reúne lo que no pertenece a un proyecto, en pestañas
agrupadas:

- **Recursos**
  - **Motor de IA:** cómo se usa la IA (automático, solo online o solo
    local), el proveedor online (Gemini, OpenAI, Claude, OpenRouter o uno
    compatible), su clave y su modelo, o un modelo local con Ollama para
    trabajar sin internet. En el escritorio, «Usar esta clave también en la
    web» sube una copia cifrada de la clave a tu servidor para usar la IA en
    la web (capítulo 17).
  - **Plantillas:** las de plan y de caso, las incluidas con Pharos y las
    tuyas.
- **Aplicación**
  - **General:** tema, idioma, fondo, sombra de las tarjetas, carpeta de
    descarga, retención de lo borrado y la papelera.
- **Cuenta y datos**
  - **Sincronización:** estado, cuenta, conflictos, «Sincronizar ahora» y la
    sincronización automática.
  - **Seguridad:** la clave de recuperación de tus datos.
  - **Evidencias:** retención y espacio de las evidencias (capítulo 16).
  - **Auditoría:** cada cambio de tu cuenta, con quién lo hizo (tú, un agente
    en tu nombre o el sistema), el antes y el después, la comprobación de que
    el registro está íntegro y la exportación a Excel o CSV.
- **Soporte**
  - **Diagnóstico:** un ZIP para informar de un fallo.

Se abre desde el menú de tu avatar o desde «Administración», en el menú
lateral, bajo «Configuración». La pestaña abierta queda en la dirección de la página.

La IA es opcional: sin ella, los botones de asistencia se desactivan con un
aviso, y nada de lo que propone se aplica sin que lo aceptes. Las claves de IA
se guardan cifradas en el almacén de credenciales de Windows, nunca en un
archivo, y no se incluyen en exportaciones ni diagnósticos.

En este manual, Liomar deja preparado su Pharos: una plantilla de plan
propia, la sincronización, su clave de recuperación guardada y el diagnóstico
a mano por si algo falla. Al final repasa en «Auditoría» lo que ha cambiado
hoy.

## La papelera

- Está al final de «General», solo en la app de escritorio: la web no guarda
  lo borrado.
- Muestra cuántos elementos hay, su desglose por tipo y, en cada fila, cuándo
  se borró y en cuántos días se eliminará para siempre según la retención.
- **Restaurar** devuelve lo marcado a su sitio, con su clave y su historial, y
  lo sincroniza como cualquier cambio. Un proyecto vuelve con lo que se borró
  con él; lo de un proyecto que está en la papelera espera a su proyecto. Un
  defecto vuelve sin sus adjuntos.
- **Eliminar para siempre** y **Vaciar papelera** piden confirmación. Lo que
  tiene cambios sin sincronizar o un conflicto se conserva hasta que se envíe
  («Pendiente de sincronizar»). Las claves eliminadas no se reutilizan.

## Workspaces y miembros

Con un servidor que tiene workspaces compartidos (desde 0.5.0), el
**selector de workspace** aparece arriba del menú lateral. Muestra el
workspace en el que trabajas y, debajo, tu rol en él. La lista
«Proyectos» solo enseña los proyectos de ese workspace.

- **Personal.** Es tu workspace. Todos tus proyectos empiezan aquí, y en la
  primera sincronización con un servidor que tiene workspaces, los proyectos
  de este equipo pasan a él. Antes, Pharos guarda una copia de seguridad de
  tus datos (`pharos.db.enc.bak-…-workspaces`).
- **Crear workspace.** Abre el selector y elige «Crear workspace». Tú serás
  su Test Manager.
- **Invitar.** En «Miembros y roles», «Invitar» crea un código de un solo
  uso con el rol de la persona: Test Manager, Test Analyst, Automation
  Engineer, Product Owner o Viewer (solo lectura). Copia el texto de la
  invitación, que lleva también la dirección del servidor, y envíaselo por
  el canal que uséis. El código solo se muestra una vez y caduca en 1, 7
  o 30 días.
- **Unirse.** Quien recibe la invitación elige «Unirse con un código…»,
  pega el código, comprueba a qué workspace entra y con qué rol, y pulsa
  «Unirme». Los proyectos llegan con la siguiente sincronización.
- **Compartir un proyecto.** En «Proyectos», el menú «⋯» de un proyecto de
  tu workspace Personal tiene «Compartir con un workspace…». Lo mueve
  entero, con su plan, casos, requisitos, ciclos, ejecuciones, defectos,
  adjuntos y auditoría, a un workspace compartido del que eres Test Manager.
- **Roles.** Solo el Test Manager cambia roles, quita a personas, gestiona
  invitaciones y ve la auditoría. El workspace nunca se queda sin Test
  Manager. Un Viewer ve y exporta todo, pero no cambia nada: Pharos se lo
  recuerda con un aviso de solo lectura, y el servidor rechaza cualquier
  cambio suyo. «¿Qué puede hacer cada rol?», al pie de «Miembros y roles»,
  resume los permisos.
- **Rechazado por permisos.** Si cambias algo que tu rol ya no permite (por
  ejemplo, te cambiaron el rol mientras no tenías conexión), el servidor no
  lo guarda. El cambio espera en el panel de conflictos hasta que lo
  descartas, y entonces vuelve la versión del servidor.
- **Si te quitan de un workspace,** un aviso lo dice y ofrece eliminar su
  copia de este equipo. No se borra nada hasta que lo confirmas.

## Lo que viaja con tu cuenta

- El idioma, el tema, la sombra de las tarjetas, la opacidad del fondo y el
  fondo predeterminado o ninguno se aplican en todos tus equipos: en Perfil
  lo indica «Se aplica en todos tus equipos». Gana el cambio más reciente.
- Una imagen de fondo propia, la retención, la sincronización automática y la
  carpeta de descarga dependen del equipo y se quedan en él.

## Atajos de teclado

| Tecla | Dónde | Qué hace |
| --- | --- | --- |
| ← → | Pestañas de Administración | Pasan a la pestaña anterior o siguiente |
| Inicio, Fin | Pestañas de Administración | Van a la primera o a la última |
| Esc | Diálogos de plantilla y de conflictos | Los cierran; con cambios, preguntan antes |
| Esc | Clave de recuperación mostrada | No la cierra: marca «Ya la he guardado» |
| Esc | Detalle de un evento de auditoría | Lo cierra |

## Si algo no sale

- **«No detectado (¿está en ejecución?)» en Ollama.** Ollama no está
  instalado o no está abierto en este equipo. Ábrelo y pulsa «Reintentar», o
  usa un proveedor online.
- **«Falta la clave de…» o «Escribe un modelo para probar la clave».**
  «Probar conexión» necesita la clave y el modelo. Para listar los modelos,
  guarda antes la clave.
- **«El proveedor rechazó la clave…».** La clave no es válida o no tiene
  saldo. Revísala en la web del proveedor.
- **«No hay IA disponible…».** No hay ningún proveedor online configurado ni
  Ollama en marcha: configura uno de los dos.
- **«“Listar modelos” solo está disponible en la app de escritorio.»** En la
  web, escribe el nombre del modelo.
- **Al cambiar de pestaña pregunta «¿Descartar los cambios?».** Hay ajustes
  sin guardar en la pestaña actual: guárdalos o descártalos.
- **«Conflictos (N)» en el menú lateral.** El mismo dato cambió en dos
  equipos. «Revisar conflictos» te deja elegir qué versión conservar.
- **«No se pudo leer la clave de recuperación.»** Pasa si el almacén de
  credenciales de Windows no está disponible. Vuelve a intentarlo; en la web
  no existe esta opción.
- **«La cadena de … está rota en el evento n.º N».** Alguien modificó o
  borró el registro de auditoría fuera de Pharos (editando la base de datos),
  o se restauró a mano una copia `.bak` en este equipo. Pharos no repara el
  registro: «Ver evento» lleva a ese cambio; exporta la auditoría y el
  diagnóstico si necesitas investigarlo.
- **«Auditoría» no muestra cambios de otra persona.** Hasta que lleguen los
  roles del equipo, cada cuenta ve solo sus propios cambios.
- **«Ningún evento coincide con los filtros».** El periodo por defecto son
  los últimos 30 días: elige «Todo» o quita algún filtro.

## En el móvil

- Las pestañas se desplazan de lado; desliza para ver las demás.
- La clave de recuperación y «Listar modelos» son de la app de escritorio.
- En «Auditoría», la lista se ve como tarjetas y el detalle de un cambio se
  abre desde abajo.

## Consejos

- Guarda la **clave de recuperación** el primer día: si cambias de equipo o
  reinstalas Windows, solo ella y una copia de `pharos.db.enc` devuelven tus
  datos. Pharos no puede recuperarla por ti.
- Pulsa **«Probar conexión»** antes de guardar una clave nueva: si responde, se
  guarda sin preguntar y sabes que funciona.
- Activa la **sincronización automática** si trabajas en varios equipos; en
  uno solo, «Sincronizar ahora» al terminar basta.
- Si algo falla, adjunta el ZIP de **«Exportar diagnóstico»** al informe: lleva
  la versión, el sistema y los registros recientes, y nunca tus proyectos,
  tus casos ni tus claves.
- Para revisar qué hizo un **agente de IA** en tu nombre, filtra «Auditoría»
  por «Quién» y elige el agente; copia la dirección de la página para volver
  a esa vista.

## Véase también

- Capítulo 16, «Evidencias»: la pestaña «Evidencias».
- Capítulo 17, «Asistente de IA»: cómo saber qué modelo está activo y qué
  hace la IA en cada pantalla.
- [Glosario](../GLOSARIO.md): «Pestaña de Administración», «Plantilla»,
  «Papelera», «Registro de auditoría».
