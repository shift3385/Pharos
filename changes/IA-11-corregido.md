---
section: Corregido
---

- **Configurar un proveedor de IA con «Guardar clave».** La clave se guardaba, pero el proveedor elegido no, así que la IA seguía «sin configurar» y «Probar conexión» quedaba deshabilitado en ese proveedor. Ahora «Guardar clave» también lo deja activo y lo avisa.
- **La marca «En uso»** va en la tarjeta del proveedor que la app usa de verdad, no en la que estás editando sin guardar, y sustituye a la línea «En uso: …».
- **Sin «Se enviará a…».** Los botones de IA ya no muestran ese aviso; la marca en Motor de IA dice qué proveedor se usa y cada resultado sigue indicando quién lo escribió.
- **Ayuda de cada proveedor** en un icono «?» de su tarjeta, y el campo de modelo muestra la lista completa con buscador.
- **«Probar conexión»** muestra en pantalla por qué no se puede probar, no solo en un tooltip.
- **Los errores de la prueba dicen la causa.** Si el proveedor rechaza la clave, lo dice con su mensaje («El proveedor rechazó la clave: …»); si no hay ninguna clave, dice que falta, en lugar de «No hay IA disponible».
- **En la web ya no parece que la clave se guarde.** Allí «Guardar clave» decía «Clave guardada en el keychain» sin guardar nada. Ahora se deshabilita y la pantalla explica que solo está disponible en la app de escritorio.
- **Tarjetas de proveedor.** Cada una tiene su ayuda en un icono «?» (qué es y dónde conseguir la clave), en lugar de un texto fijo debajo, y los nombres ya no se cortan.
- **Un proveedor sin clave ya no se puede activar.** Si eliges uno que no la tiene, «Guardar» se deshabilita y la barra pide la clave, porque la IA dejaría de funcionar.
- **La barra de guardar de Motor de IA dice qué falta.** En lugar de «Cambios sin guardar», nombra lo que cambió («Por guardar: proveedor (Claude) y clave. Pulsa «Guardar» para aplicar los cambios.») o indica «Sin cambios».
- **«Listar modelos» muestra todos los modelos.** La lista nativa solo enseñaba los que coincidían con lo ya escrito. Ahora se abre con todos, se busca escribiendo y tiene el aspecto del resto de la app; también puedes escribir un modelo que no aparezca.
