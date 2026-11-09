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
    trabajar sin internet.
  - **Plantillas:** las de plan y de caso, las incluidas con Pharos y las
    tuyas.
- **Aplicación**
  - **General:** tema, idioma, fondo, sombra de las tarjetas, carpeta de
    descarga y retención de lo borrado.
- **Cuenta y datos**
  - **Sincronización:** estado, cuenta, conflictos, «Sincronizar ahora» y la
    sincronización automática.
  - **Seguridad:** la clave de recuperación de tus datos.
  - **Evidencias:** retención y espacio de las evidencias (capítulo 16).
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
a mano por si algo falla.

## Atajos de teclado

| Tecla | Dónde | Qué hace |
| --- | --- | --- |
| ← → | Pestañas de Administración | Pasan a la pestaña anterior o siguiente |
| Inicio, Fin | Pestañas de Administración | Van a la primera o a la última |
| Esc | Diálogos de plantilla y de conflictos | Los cierran; con cambios, preguntan antes |
| Esc | Clave de recuperación mostrada | No la cierra: marca «Ya la he guardado» |

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

## En el móvil

- Las pestañas se desplazan de lado; desliza para ver las demás.
- La clave de recuperación y «Listar modelos» son de la app de escritorio.

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

## Véase también

- Capítulo 16, «Evidencias»: la pestaña «Evidencias».
- Capítulo 17, «Asistente de IA»: cómo saber qué modelo está activo y qué
  hace la IA en cada pantalla.
- [Glosario](../GLOSARIO.md): «Pestaña de Administración», «Plantilla»,
  «Papelera».
