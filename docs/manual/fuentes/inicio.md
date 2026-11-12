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

**¿Vamos mejor o peor?** «Comparar con el periodo anterior», al final del menú
del periodo, enfrenta el periodo con otro de la misma duración justo antes
(los 7 días con los 7 anteriores, «Hoy» con ayer, «Este mes» con los mismos
días antes del día 1). Solo comparan las cifras que dependen del periodo: la
tasa de éxito, en puntos (pp), y las ejecuciones diarias, en %. Las demás son
el estado de ahora.

## Tu pizarra: colócala a tu gusto

En el escritorio, el Inicio es una **pizarra** de 24 columnas por 24 filas que
ocupa justo el alto de la ventana: en una ventana de 1280 × 820 lo ves todo
sin desplazarte, y ningún panel se desplaza por dentro. Cada tarjeta es un **gadget** (las cuatro cifras clave, la
ejecución por proyecto, los criterios de salida, las ejecuciones diarias, las
próximas pruebas y la tendencia de ciclos) con su sitio y su tamaño en la
cuadrícula.

- **Personalizar.** El engranaje pequeño junto a «Nuevo proyecto»
  («Personalizar Inicio») activa el modo configurar. Se ven la cuadrícula, el
  asa de cada gadget para moverlo, su esquina para cambiar el tamaño y una
  etiqueta con su tamaño y su mínimo, por ejemplo «9×10 · mín 8×7».
- **Nada se solapa.** Al mover o agrandar un gadget, los vecinos se apartan y
  todo sube a llenar los huecos. Ningún gadget baja de su tamaño mínimo, el
  que necesita para que su contenido esencial se vea entero.
- **Sin desplazamiento dentro de los paneles.** Una lista (proyectos,
  próximas pruebas, criterios) muestra las filas que caben y termina en
  «+N más», que lleva a la lista completa. «Ver los datos» de las ejecuciones
  diarias se abre en una ventana.
- **Con poco alto, compacto.** En una ventana baja los paneles se compactan:
  menos márgenes, leyendas solo con puntos de color (pasa el ratón para ver
  su nombre) y sin el texto bajo el gráfico diario. Por debajo de unos 700 px
  de alto, la pizarra deja de encogerse y aparece un único desplazamiento de
  página.
- **Ayuda «?».** Junto al título de cada panel, «?» explica qué muestra. Se
  abre al pasar el ratón, con un clic o con el teclado, y se cierra con Esc.
- **Lo que suman las cifras.** Pasa el ratón por el periodo («Últimos 14
  días») para ver que las cifras suman todos tus proyectos abiertos.
- **Ocultar y mostrar.** El ojo tachado oculta un gadget. «Gadgets ocultos»
  lista los ocultos; al elegir uno, vuelve al primer hueco donde quepa.
- **Restablecer** vuelve a la distribución de siempre, con todo visible.
  Pregunta antes.
- **Listo** guarda. La distribución es de tu cuenta: la verás igual en tus
  otros equipos, y otra persona en el mismo equipo tiene la suya. Esc sale
  sin guardar.
- Si la pizarra pasa de 24 filas (por ejemplo, al agrandar mucho un gadget),
  el Inicio vuelve a tener desplazamiento; la línea de ayuda lo avisa.
- **Un gadget nuevo** llega a tu pizarra guardada solo si cabe sin desplazar
  la página. Si no cabe, queda en «Gadgets ocultos» y un aviso lo dice:
  «Personalizar Inicio» para hacerle sitio, o «Entendido» para dejarlo oculto.

## Tendencia de ciclos

«Tendencia de ciclos» responde a «¿vamos mejor o peor?». Elige un proyecto y
una métrica: **tasa de éxito**, **densidad de defectos** (defectos encontrados
por cada 100 casos ejecutados), **escapes** (defectos encontrados fuera de las
pruebas, capítulo 12), **tiempo de corrección** (mediana de días hasta
«Corregido»), **reapertura** o **flaky**.

- Cada punto es un ciclo cerrado, con las cifras congeladas al cerrarlo
  (capítulo 9), salvo los escapes, que siguen llegando después. El ciclo
  activo va al final, en vivo y con la línea punteada.
- La línea verde es el **objetivo** del plan para esa métrica (capítulo 5).
- El punto bajo cada ciclo es su **veredicto**: verde «Go», ámbar «Go con
  riesgos», rojo «No-go» y hueco si aún no se ha cerrado.
- A la derecha, el último ciclo cerrado y su cambio frente al anterior. Si la
  métrica **empeora dos ciclos seguidos** o se sale del objetivo, el gadget lo
  avisa.
- Con sitio suficiente, la fila de abajo muestra las seis métricas a la vez;
  al pulsar una, pasa a ser la principal.

Al iniciar sesión, Pharos abre siempre el Inicio, aunque la última vez
salieras desde otra pantalla.

## Atajos de teclado

| Tecla | Dónde | Qué hace |
| --- | --- | --- |
| Tab | Inicio | Recorre las tarjetas (son enlaces) y los paneles en orden |
| Intro | Una tarjeta o una fila de «Próximas pruebas» | La abre |
| ↑ ↓ e Intro | Selector de periodo y selector de proyecto de «Criterios de salida» | Recorren y eligen una opción |
| ← → | Pestañas del Inicio en el móvil | Cambian de pestaña |
| ↑ ↓ e Intro | Selector de «Próximas pruebas» | Eligen la lista |
| ← → , Inicio, Fin | La gráfica de «Ejecuciones diarias» (con Tab) | Recorren los días y muestran sus valores |
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
- **La gráfica de «Ejecuciones diarias» no rotula todos los días.** A propósito:
  con muchos días las fechas se pisarían. Muestra el primero, uno por semana y
  el último (con el mes cuando cambia). Pasa el ratón, toca la gráfica o
  recórrela con las flechas para ver cada día.
- **Falta una línea en la gráfica.** La ocultaste desde la leyenda: pulsa su
  nombre para mostrarla. Siempre queda al menos una.
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
  Con «Abrir el plan» puedes definir los tuyos en el paso 20.
- **Un criterio dice «Sin datos».** Pharos no sabe medirlo solo (por ejemplo,
  uno escrito a mano que no reconoce). Compruébalo tú.
- **«Ciclo actual» o «Rango personalizado…» no se pueden elegir.** Llegan en
  una próxima versión.
- **Con la comparación encendida, la tasa de éxito dice «sin datos antes».**
  En el periodo anterior no se ejecutó ningún caso: no hay con qué comparar.
- **Falta una tarjeta del Inicio.** La ocultaste al personalizarlo. Pulsa el
  engranaje, abre «Gadgets ocultos» y elígela, o usa «Restablecer».
- **El Inicio tiene desplazamiento en el escritorio.** O la ventana mide menos
  de unos 700 px de alto, o tu distribución pasa de 24 filas. Reduce algún gadget o
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

## «Ejecuciones diarias» y «Próximas pruebas»

- **Ejecuciones diarias** dibuja una línea por estado: «Pasa», «Falla» y
  «Otras» (esta, discontinua). Un punto marca cada día con algún intento. La
  escala llega al valor más alto de lo que se ve, como poco 5. La leyenda
  filtra: pulsa un estado para ocultar o mostrar su línea. Si el panel es muy
  estrecho, muestra solo el total grande con una línea de tendencia.
- **Próximas pruebas** elige su lista con un selector bajo el título: «No
  ejecutadas», «Bloqueadas» o «Por confirmar», cada una con su número. En
  «Por confirmar», cada fila dice cuándo falló («· falló el 8 nov»). La flecha a la
  derecha del título es «Ver todas».

## Consejos

- Pon arriba a la izquierda lo que miras primero: en el Inicio se lee de
  izquierda a derecha y de arriba abajo, y en ese orden se apilan en la tableta.

- Empieza el día por «Próximas pruebas»: ordena por prioridad lo que falta,
  lo bloqueado y lo que espera confirmación tras un arreglo.
- Antes de una reunión de seguimiento, revisa «Criterios de salida» con el
  filtro «En riesgo»: son los proyectos de los que hay que hablar.
- Para un informe formal del estado, usa el «Informe de estado» de Ejecuciones
  (capítulo 11), que sigue la norma ISO/IEC/IEEE 29119-3 y se exporta a PDF.

## Véase también

- Capítulo 5, «Plan de pruebas»: paso 19, «Métricas y objetivos medibles», y paso 20, «Criterios de cierre».
- Capítulo 11, «Ejecución manual»: el informe de estado.
- Capítulo 13, «Trazabilidad»: la cobertura de requisitos.
- [Glosario](../GLOSARIO.md): «Criterios de salida», «Tasa de éxito».
