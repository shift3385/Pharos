---
section: Añadido
---

- **Requisitos desde un proyecto con IA.** Está en Trazabilidad → «Importar / Exportar» → «Requisitos desde un proyecto (IA)». Solo funciona en la app de escritorio y con un modelo de IA configurado.
  - **Elegir la carpeta.** Puede ser un proyecto en marcha o su documentación. Antes de enviar nada verás qué archivos se leen, ordenados de más a menos útiles: documentación, rutas, modelos, tests, interfaz y el resto. También verás cuántos tokens y llamadas costará, y podrás quitar archivos o bajar el presupuesto.
  - **Nunca se envían** las dependencias, los builds, los archivos ocultos, los binarios ni los archivos con secretos, como `.env`, claves o certificados. Las líneas que parecen un secreto se sustituyen antes de salir.
  - **Aviso antes de enviar.** Dice si el contenido sale del equipo hacia el proveedor de IA o lo procesa Ollama en tu equipo.
  - **Qué propone la IA.** Compara lo que encuentra con tus requisitos actuales y propone requisitos nuevos, mejoras de los que ya tienes, posibles duplicados y requisitos redundantes que eliminar. Cada propuesta dice por qué, de qué archivo y líneas sale, y si estaba escrito en la documentación o se deduce del código.
  - **Antes de aplicar.** Eliges qué aplicar y puedes editar el texto. Un requisito con casos vinculados no se puede eliminar desde aquí.
  - **Después de aplicar.** Lo creado o cambiado queda marcado «IA · pendiente de revisión» hasta que lo revises en su formulario, que también muestra sus fuentes.
