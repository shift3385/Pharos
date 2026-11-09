# Asistente de IA (fuente del capítulo 17)

Texto escrito a mano del capítulo. Los pasos (pie y captura) los genera el
tour `e2e/tours/17-ia.tour.ts`, con una IA real: si no hay clave, sus pasos se
marcan como pendientes, nunca se simulan. La pantalla del motor de IA se
describe en el capítulo 15.

## Para qué sirve

La IA de Pharos es **opcional**. Con tu propia clave de un proveedor online
(Gemini, OpenAI, Claude, OpenRouter o un servicio compatible), o sin internet
con Ollama, puede:

- redactar borradores de los campos del plan y sugerir sus riesgos
  (capítulo 5);
- proponer casos a partir de un requisito (capítulo 7) o del plan
  (capítulo 8);
- sugerir y revisar las listas de un caso: precondiciones, pasos,
  postcondiciones y criterios (capítulo 8);
- proponer requisitos a partir de la carpeta de un proyecto o de capturas,
  bocetos y diseños (capítulo 7).

**Nada se aplica sin que lo aceptes**, y lo aceptado queda marcado como
generado por IA hasta que alguien lo revisa.

En este manual, Liomar trabaja con **Claude** (Anthropic).

## ¿Qué IA está activa?

- En «Administración › Motor de IA», la tarjeta del proveedor con la marca
  **✓** (al pasar el cursor dice «En uso») es la que Pharos usará, con el modelo que dice el campo
  **«Modelo»**.
- Tener guardada la clave de otro proveedor (por ejemplo, de Gemini) no lo
  activa. Se activa al elegir su tarjeta y guardar, o al guardar su clave con
  «Guardar clave».
- Con **«Usar: Automático»**, Pharos usa el proveedor online si está
  configurado y, si no, Ollama. «Solo online» y «Solo local» fijan uno de los
  dos.
- **«Probar conexión»** pregunta al proveedor activo y responde «Respuesta en N
  ms»: si contesta, esa es la IA que trabaja.
- Cada texto que pone la IA lleva la marca **«IA · pendiente de revisión»**.
  Al pasar el cursor por ella se ve qué proveedor y qué modelo lo generaron
  (por ejemplo, «Claude · …»), también semanas después.

## Atajos de teclado

| Tecla | Dónde | Qué hace |
| --- | --- | --- |
| Tab, Intro | Botón ✨ de un campo o de una lista | Lo alcanza y pide la propuesta |
| Espacio | Casilla de una propuesta | La marca o la desmarca |
| Esc | Diálogos de propuestas («Generar casos», «Sugerir casos») | Los cierran sin crear nada |

## Si algo no sale

- **Los botones de IA están en gris.** No hay IA configurada: el aviso del
  botón lo dice. Configúrala en el capítulo 15.
- **«No hay IA disponible…».** Ni un proveedor online con clave y modelo, ni
  Ollama en marcha.
- **«Falló la conexión con la IA…» o «El proveedor rechazó la clave…».**
  Revisa la clave, el modelo y la red con «Probar conexión».
- **«El proveedor respondió vacío».** Prueba otro modelo o vuelve a pedirlo.
- **La propuesta no sirve.** Descártala: no se ha aplicado nada. Puedes
  pedirla otra vez.
- **«Requisitos desde diseños» no lee las imágenes.** El modelo no ve
  imágenes: elige uno con visión.

## En el móvil

- «Requisitos desde un proyecto» y «Listar modelos» son de la app de
  escritorio; el resto de la IA funciona también en la web.

## Consejos

- Elige un modelo rápido y económico para el día a día; para generar casos de
  un requisito complejo, uno más capaz.
- Revisa siempre las propuestas: la IA no conoce tu producto mejor que tú. Lo
  aceptado queda marcado hasta que alguien lo revisa.
- Los textos que envías a un proveedor online salen de tu equipo; para datos
  sensibles, usa Ollama («Solo local»).
- Antes de analizar un proyecto, Pharos dice si el contenido sale del equipo y
  hacia qué proveedor, y cuántos tokens y llamadas costará. Baja el presupuesto
  o quita archivos si el proyecto es grande. Con Ollama, los lotes son más
  pequeños y el análisis tarda más.
- Para «Requisitos desde diseños», el modelo tiene que ver imágenes:
  - Claude, Gemini y GPT-4o o posteriores las ven y leen PDF.
  - En Ollama, elige un modelo de visión como `gemma3`, `qwen2.5vl` o
    `llama3.2-vision`. El modelo por defecto, `llama3.2:3b`, no ve imágenes, y
    Ollama no lee PDF.
  - Como mucho se envían 8 imágenes o PDF por análisis. Pharos las reduce antes
    de enviarlas y no las guarda.

## Véase también

- Capítulo 15, «Administración»: el motor de IA.
- [Guía de pruebas de la beta](../guia-beta.md), apartado 4.7 «IA (opcional)».
