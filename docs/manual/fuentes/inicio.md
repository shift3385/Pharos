# Inicio (fuente del capítulo 3)

Texto escrito a mano del capítulo. Los pasos (pie y captura) los genera el
tour `e2e/tours/03-inicio.tour.ts`, que se ejecuta al final, cuando los demás
capítulos ya han dejado planes, casos, ejecuciones y defectos. El Inicio vacío
de una cuenta nueva se ve en el capítulo 1.

## Para qué sirve

**Inicio** responde, al abrir Pharos, a tres preguntas de cualquier
responsable de QA:

- **¿Cómo vamos?** Lo dicen las cuatro cifras clave y la ejecución por proyecto.
- **¿Podemos cerrar?** Lo dicen los criterios de salida del plan de cada
  proyecto.
- **¿Qué hago ahora?** Lo dicen las próximas pruebas, por prioridad.

Suma todos tus proyectos abiertos. Para ver uno solo, entra en él: sus cifras
están en cada sección.

## Tu pizarra: colócala a tu gusto

En el escritorio, el Inicio es una **pizarra** de 24 columnas por 24 filas que
ocupa justo el alto de la ventana: desde 1280 × 800 lo ves todo sin
desplazarte. Cada tarjeta es un **gadget** (las cuatro cifras clave, la
ejecución por proyecto, los criterios de salida, las ejecuciones diarias y las
próximas pruebas) con su sitio y su tamaño en la cuadrícula.

- **Personalizar.** El engranaje pequeño junto a «Nuevo proyecto»
  («Personalizar Inicio») activa el modo configurar. Se ven la cuadrícula, el
  asa de cada gadget para moverlo, su esquina para cambiar el tamaño y una
  etiqueta con su tamaño y su mínimo, por ejemplo «10×10 · mín 8×6».
- **Nada se solapa.** Al mover o agrandar un gadget, los vecinos se apartan y
  todo sube a llenar los huecos. Ningún gadget baja de su tamaño mínimo, el
  que necesita para que su contenido se lea; lo que no cabe se desplaza dentro
  del gadget.
- **Ocultar y mostrar.** El ojo tachado oculta un gadget. «Gadgets ocultos»
  lista los ocultos; al elegir uno, vuelve al primer hueco donde quepa.
- **Restablecer** vuelve a la distribución de siempre, con todo visible.
  Pregunta antes.
- **Listo** guarda. La distribución es de tu cuenta: la verás igual en tus
  otros equipos, y otra persona en el mismo equipo tiene la suya. Esc sale
  sin guardar.
- Si la pizarra pasa de 24 filas (por ejemplo, al agrandar mucho un gadget),
  el Inicio vuelve a tener desplazamiento; la línea de ayuda lo avisa.

Al iniciar sesión, Pharos abre siempre el Inicio, aunque la última vez
salieras desde otra pantalla.

## Atajos de teclado

| Tecla | Dónde | Qué hace |
| --- | --- | --- |
| Tab | Inicio | Recorre las tarjetas (son enlaces) y los paneles en orden |
| Intro | Una tarjeta o una fila de «Próximas pruebas» | La abre |
| ↑ ↓ e Intro | Selector de periodo y selector de proyecto de «Criterios de salida» | Recorren y eligen una opción |
| ← → | Pestañas de «Próximas pruebas» (y las del Inicio en el móvil) | Cambian de pestaña |
| Esc | Un selector abierto | Lo cierra |
| Tab | Modo configurar | Pasa de un gadget a otro |
| ← → ↑ ↓ | Un gadget, en el modo configurar | Lo mueve; dos gadgets iguales y contiguos se intercambian |
| Mayús + ← → ↑ ↓ | Un gadget, en el modo configurar | Cambia su tamaño, nunca por debajo del mínimo |
| Esc | Modo configurar | Sale sin guardar (pregunta si cambiaste algo) |

## Si algo no sale

- **«Aún no tienes proyectos. Crea el primero para empezar.»** Es una cuenta
  nueva o sin proyectos abiertos. Usa «Nuevo proyecto» (capítulo 4).
- **La tasa de éxito dice «—» y «Sin ejecuciones».** En el periodo elegido no
  hay resultados. Amplía el periodo («Últimos 30 días») o ejecuta casos
  (capítulos 10 y 11).
- **Bajo la tasa de éxito pone «Además, N tests sin vincular».** Son tests
  importados que aún esperan en la bandeja «Sin vincular» (capítulo 10). La
  tasa, como el progreso de cada proyecto, cuenta casos, así que no los
  incluye. Vincúlalos a su caso desde «Ejecuciones» y entrarán en la tasa.
- **«Ejecuciones diarias» suma más que la tasa.** La gráfica cuenta intentos:
  cada vez que se ejecutó algo, también los reintentos y los tests sin
  vincular. La tasa cuenta casos, una vez cada uno, con su último resultado.
- **«No se pudieron cargar las ejecuciones.»** Las cifras de ejecución no se
  pudieron leer, aunque el resto del Inicio sí. Pulsa «Reintentar»; las
  tarjetas afectadas muestran «No disponible» mientras tanto.
- **«No se pudieron cargar tus proyectos.»** No se pudo leer nada. Pulsa
  «Reintentar» y, si sigue, revisa la conexión (en la web) o exporta un
  diagnóstico (capítulo 15).
- **«Datos de las HH:MM: no se pudieron actualizar.»** Ves los últimos datos
  que sí se cargaron; Pharos lo vuelve a intentar con la próxima sincronización.
- **«Este proyecto aún no tiene plan de pruebas» o «El plan de este proyecto no
  define criterios de salida».** Pharos aplica los criterios por defecto (95 %
  ejecutado, ningún defecto crítico abierto, 90 % de cobertura de requisitos).
  Con «Abrir el plan» puedes definir los tuyos en el paso 17.
- **Un criterio dice «Sin datos».** Pharos no sabe medirlo solo (por ejemplo,
  uno escrito a mano que no reconoce). Compruébalo tú.
- **«Ciclo actual», «Rango personalizado…» o «Comparar con el periodo anterior»
  no se pueden elegir.** Llegan en una próxima versión.
- **Falta una tarjeta del Inicio.** La ocultaste al personalizarlo. Pulsa el
  engranaje, abre «Gadgets ocultos» y elígela, o usa «Restablecer».
- **El Inicio tiene desplazamiento en el escritorio.** O la ventana mide menos
  de 800 px de alto, o tu distribución pasa de 24 filas. Reduce algún gadget o
  pulsa «Restablecer».
- **No veo el engranaje.** Solo está en el escritorio, con la ventana a 1280 px
  de ancho o más. En la tableta los gadgets se apilan y en el móvil van en
  pestañas, en el orden de tu distribución y sin los ocultos.
- **Cambié la distribución en otro equipo y aquí no se ve.** Llega con la
  siguiente sincronización o al volver a abrir el Inicio. Sin conexión, el
  cambio se guarda en este equipo y se envía después; si en otro equipo hiciste
  uno más reciente, gana el más reciente.

## En el móvil

- El Inicio se divide en tres pestañas:
  - **Resumen:** las cifras clave y los criterios de salida.
  - **Ejecución:** la ejecución por proyecto y las ejecuciones diarias, con su
    propio selector de periodo.
  - **Pruebas:** las próximas pruebas.
- Las burbujas de las pestañas avisan sin tener que abrirlas. La roja de
  «Resumen» cuenta los defectos críticos y los proyectos en riesgo; la de
  «Pruebas», las pruebas pendientes.
- Los selectores (periodo, proyecto) se abren como hojas desde abajo.
- Las pestañas siguen el orden de tu distribución y no muestran los gadgets
  ocultos. La distribución se cambia en el escritorio.

## Consejos

- Pon arriba a la izquierda lo que miras primero: en el Inicio se lee de
  izquierda a derecha y de arriba abajo, y en ese orden se apilan en la tableta.

- Empieza el día por «Próximas pruebas»: ordena por prioridad lo que falta,
  lo bloqueado y lo que espera re-test.
- Antes de una reunión de seguimiento, revisa «Criterios de salida» con el
  filtro «En riesgo»: son los proyectos de los que hay que hablar.
- Para un informe formal del estado, usa el «Informe de estado» de Ejecuciones
  (capítulo 11), que sigue la norma ISO/IEC/IEEE 29119-3 y se exporta a PDF.

## Véase también

- Capítulo 5, «Plan de pruebas»: paso 17, «Criterios de cierre».
- Capítulo 11, «Ejecución manual»: el informe de estado.
- Capítulo 13, «Trazabilidad»: la cobertura de requisitos.
- [Glosario](../GLOSARIO.md): «Criterios de salida», «Tasa de éxito».
