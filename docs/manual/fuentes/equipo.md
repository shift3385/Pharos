# Trabajo en equipo (fuente del capítulo 21)

Texto escrito a mano del capítulo. Los pasos (pie y captura) los genera el
tour `e2e/tours/21-equipo.tour.ts`. Liomar trabaja con su compañero de QA,
Jorge L. Meneses Yero, que actúa desde su propio equipo: se une al workspace,
revisa y aprueba. Es la única persona del manual además de Liomar
(NC-052, enmendada). Todas las capturas son del Pharos de Liomar.

## Para qué sirve

Hasta aquí, Liomar ha trabajado solo, en su workspace «Personal». Este
capítulo enseña a trabajar con otras personas en un **workspace compartido**,
que vive en el servidor:

- crear el workspace y llevar a él un proyecto con todo lo que tiene;
- invitar a un compañero con un código de un solo uso y darle un rol;
- ver quién es miembro, cambiar su rol o quitarlo;
- pedirle que **revise y apruebe** tu trabajo: con la «Aprobación
  independiente», nadie aprueba lo que escribió;
- repartir el trabajo (un defecto se asigna a un miembro, que recibe el
  aviso) y enterarte de lo que hace el equipo: las notificaciones y la
  auditoría.

En este ejemplo, Liomar crea «Equipo QA», lleva allí el proyecto «Pharos» e
invita a Jorge como Test Analyst. Jorge revisa la checklist de humo de la
versión desde su equipo y, cuando Liomar lo hace Test Manager, aprueba
también el plan. Las capturas son siempre de Liomar: lo que hace Jorge se ve
con su nombre en los avisos, en la revisión y en la auditoría.

Un workspace compartido necesita conexión con el servidor para crearlo,
invitar, cambiar roles o mover proyectos. El trabajo de cada día (escribir,
ejecutar, revisar) sigue funcionando sin conexión y se envía al sincronizar.

## Qué puede hacer cada rol

Cada miembro tiene un rol en cada workspace (en «Personal» eres siempre Test
Manager). «¿Qué puede hacer cada rol?», en «Miembros y roles», lo resume:

| Rol | Qué puede hacer |
| --- | --- |
| Test Manager | Todo lo de un Test Analyst y, además, gestiona miembros, invitaciones y reglas, lleva proyectos al workspace, aprueba planes, crea los tokens de CI y los webhooks, y ve la auditoría del workspace. |
| Test Analyst | Escribe requisitos, casos y ciclos, edita el plan, ejecuta, importa resultados, gestiona defectos y aprueba casos (no planes). |
| Automation Engineer | Escribe casos y configuraciones, ejecuta, importa resultados y gestiona defectos. |
| Product Owner | Escribe requisitos, crea defectos (no los edita) y añade adjuntos; ve todo lo demás. |
| Viewer (solo lectura) | Ve y exporta todo, pero no cambia nada. |

Con la **«Aprobación independiente»** activada (lo está al crear un
workspace compartido), un caso lo aprueba un Test Manager o un Test Analyst
que no sea su autor, y un plan, un Test Manager que no sea su autor. Las
aprobaciones de antes no cambian.

Un workspace siempre tiene al menos un Test Manager: Pharos no deja quitar ni
bajar de rol al último. Con dos, el equipo no se queda sin quien gestione el
workspace, apruebe planes o reasigne los tokens de CI si alguien se va.

## Atajos de teclado

| Tecla | Dónde | Qué hace |
| --- | --- | --- |
| Esc | «Crear workspace», «Compartir…» e «Invitar» | Cierra el diálogo sin cambiar nada |
| Esc | «Invitación creada» | Cierra el diálogo: el código ya no se vuelve a ver |

## Si algo no sale

- **El compañero no aparece en «Miembros y roles».** Comprueba que usó el
  código antes de que caducara y vuelve a abrir la página. Una invitación
  usada desaparece de «Invitaciones pendientes»; si la suya sigue ahí, aún no
  la ha usado, y si dice «Caducada», revócala y crea otra.
- **«Este código ya se usó o caducó».** Cada código sirve una vez. Revoca la
  invitación y crea otra.
- **No veo «Compartir con un workspace…».** Aparece en «Proyectos» con tu
  workspace «Personal» elegido, y solo si eres Test Manager de algún workspace
  compartido.
- **«… todavía no está en el servidor».** Acabas de crear el proyecto y aún no
  se había enviado: Pharos lo envía en ese momento. Vuelve a pulsar «Mover y
  compartir» en unos segundos.
- **«Aprobar versión N» está en gris.** El aviso de al lado dice por qué: eres
  su autor y el workspace pide aprobación independiente, o tu rol no aprueba
  eso (un Test Analyst aprueba casos, no planes). Pide la revisión a otra
  persona.
- **«Rechazado por permisos».** Tu rol no permite ese cambio y el servidor no
  lo guardó. «Descartar» vuelve a la versión del servidor.
- **Veo un aviso de solo lectura.** Tu rol en ese workspace es Viewer: puedes
  ver y exportar, pero no cambiar nada.
- **«Ya no eres miembro de…».** Un Test Manager te quitó del workspace. La
  copia de sus proyectos en tu equipo se borra cuando lo confirmas; lo que no
  habías sincronizado no llega al servidor.

## Consejos

- Invita a cada persona con el rol más bajo que le baste: un Test Analyst ya
  puede escribir, revisar y aprobar casos.
- Ten al menos dos Test Manager en cada workspace compartido.
- Manda el código de invitación por un canal privado y con caducidad corta;
  si no sabes si llegó, revócalo y crea otro.
- Al enviar algo a revisión, deja una nota que diga qué mirar: quien revisa
  la ve junto a los cambios desde la última versión revisada.
- Sincroniza antes de revisar: verás los cambios y las peticiones de los
  demás.

## Véase también

- Capítulo 8, «Casos de prueba», y capítulo 5, «Plan de pruebas»: la revisión
  y la aprobación paso a paso.
- Capítulo 20, «Integraciones»: los tokens de CI y los webhooks del
  workspace.
- Capítulo 15, «Administración»: la auditoría y las cuentas del servidor.
