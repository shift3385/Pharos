---
section: Añadido
---

- **Revisión de casos: borrador → en revisión → aprobado.** El estado del
  caso ya no se elige en un desplegable. Bajo la cabecera del caso están las
  acciones del flujo: «Enviar a revisión», con una nota opcional; «Aprobar
  versión N», con confirmación; «Devolver…», con un comentario obligatorio; y
  «Marcar obsoleto» y «Reactivar». Queda constancia de quién envió, devolvió
  o aprobó, y cuándo. Mientras el caso está en revisión, quien lo revisa ve
  qué cambió desde la última versión aprobada o enviada, campo a campo. Por
  ahora cada espacio de trabajo tiene una sola persona, así que el autor
  puede aprobar, y queda como «autoaprobación». Con los roles de la 0.5.0
  aprobará otra persona.
- **«Por revisar» y «Devuelto» en la lista de casos.** El filtro «Por
  revisar» muestra los casos en revisión que puedes aprobar. Un borrador
  devuelto lleva la marca «Devuelto», y su ayuda emergente dice quién lo
  devolvió y por qué. La ayuda del estado dice quién envió o aprobó el caso.
  La selección se puede enviar a revisión de una vez.
- **Baselines de suite.** «Baselines», en la lista de casos, congela un
  conjunto de casos en su revisión exacta: todos, los del filtro o la
  selección («Congelar en baseline»). «Solo los casos aprobados» viene
  marcado. Una baseline no se edita ni se borra. «Comparar» la enfrenta con
  el estado actual o con otra baseline y muestra los casos añadidos,
  quitados, con contenido cambiado o con solo el estado cambiado, con el
  detalle de cada caso.
