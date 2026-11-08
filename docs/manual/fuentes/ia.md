# Asistente de IA (fuente del capítulo 11)

## Para qué sirve

La IA de Pharos es **opcional**: con tu propia clave de un proveedor online
(Gemini, OpenAI, Claude, OpenRouter o un servicio compatible) o sin internet
con Ollama, redacta borradores de campos del plan, sugiere riesgos, revisa las
listas de un caso de prueba, propone casos a partir de un requisito o del plan y,
en la app de escritorio, propone requisitos a partir de la carpeta de un proyecto
(capítulo 5) y a partir de capturas, bocetos y diseños, con un modelo que vea
imágenes. **Nada se
aplica sin que lo aceptes**, y lo aceptado queda marcado como generado por IA.

## Consejos

- Elige un modelo rápido y económico para el día a día; para generar casos de
  un requisito complejo, uno más capaz.
- Revisa siempre las propuestas: la IA no conoce tu producto mejor que tú.
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

- [Guía de pruebas de la beta](../guia-beta.md), apartado 4.7 «IA (opcional)».
