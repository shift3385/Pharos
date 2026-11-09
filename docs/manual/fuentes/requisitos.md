# Requisitos (fuente del capítulo 7)

Texto escrito a mano del capítulo. Los pasos (pie y captura) los genera el
tour `e2e/tours/07-requisitos.tour.ts`, que se ejecuta antes del capítulo 8:
los casos enlazan estos requisitos. Los flujos con IA (generar casos, traer
requisitos desde un proyecto o desde diseños) se recorren, con capturas, en el
capítulo 17, porque necesitan una clave real. Aquí se explica cómo se usan.

## Para qué sirve

Los **requisitos** son la base de prueba: lo que la aplicación debe hacer y,
por tanto, lo que hay que comprobar. Cada requisito tiene:

- un **ID estable** (`REQ-001`), que no cambia ni se reutiliza;
- un título, una descripción y una prioridad;
- un **riesgo** opcional: probabilidad × impacto, de 1 a 5 cada uno.

Los casos de prueba enlazan los requisitos (capítulo 8) y el ID viaja como tag
(`@REQ-001`) en el Gherkin y en la automatización. Con esos vínculos, la
matriz de trazabilidad (capítulo 13) responde a «¿está probado este
requisito?».

Hay cuatro formas de tener requisitos en Pharos:

1. **A mano:** «Nuevo requisito».
2. **Desde una hoja de cálculo:** «Importar › Importar requisitos (.csv)».
3. **Desde la documentación y el código de un proyecto, con IA:** «Importar ›
   Requisitos desde un proyecto (IA)», solo en la app de escritorio.
4. **Desde capturas, bocetos y diseños, con IA:** «Importar › Requisitos desde
   diseños».

En las formas con IA, la IA solo **propone**. Tú revisas cada propuesta y
decides qué se aplica.

En este manual, Liomar escribe a mano el primer requisito de Pharos («Iniciar
sesión con correo y contraseña») e importa los demás de un CSV: crear un
proyecto, el historial del plan, importar JUnit, exportar la matriz, trabajar
sin conexión e imprimir el plan, este último descartado después.

## Atajos de teclado

| Tecla | Dónde | Qué hace |
| --- | --- | --- |
| Tab | Lista | Recorre, en cada fila, el título (abre el requisito), ✨ y la papelera |
| Intro | Diálogo del requisito | Guarda (si el título no está vacío) |
| Esc | Diálogo del requisito | Lo cierra; con cambios sin guardar, pregunta antes |
| ↑ ↓ e Intro | Menú «Importar» | Recorren y eligen una opción |
| Ctrl+V | Zona «Material para analizar» de «Requisitos desde diseños» | Pega una captura del portapapeles |
| Esc | Confirmación de eliminar | No la cierra: usa «Cancelar» |

## Requisitos con IA

Estos flujos necesitan un motor de IA configurado (capítulo 15). Sin él, sus
entradas del menú y el botón ✨ aparecen en gris. El capítulo 17 los muestra
paso a paso.

- **✨ Generar casos desde un requisito** (en cada fila, y en la matriz):
  - La IA propone escenarios con su Gherkin.
  - Marcas los que quieres y «Crear N casos» los crea como borradores
    enlazados a ese requisito, con la marca «IA · pendiente de revisión».
- **Requisitos desde un proyecto (IA)**, solo en la app de escritorio:
  1. «Elegir carpeta…» lee la documentación y el código de una carpeta.
     Antes de enviar nada ves qué archivos se leen, agrupados por tipo, y cuánto
     cuestan (en tokens). Los secretos, las dependencias, los binarios y los
     archivos ocultos no se envían nunca, y las líneas con aspecto de secreto se
     sustituyen por «[secreto omitido]».
  2. Ajusta el presupuesto (300 000 tokens por defecto) y añade un contexto de
     hasta 300 caracteres.
  3. «Enviar y analizar» trabaja por lotes. Si alguno falla, puedes
     reintentarlo o seguir sin él.
- **Requisitos desde diseños**, en la app de escritorio y en la web:
  1. Añade capturas, bocetos, PDF, un `.excalidraw` o la carpeta o el ZIP de
     un proyecto de Claude Design. Puedes arrastrarlos, usar «Elegir
     archivos» o «Elegir carpeta», o pegar una captura con Ctrl+V. Desde
     Figma o Canva, exporta los frames como PNG o PDF.
  2. Añade una nota a cada imagen («alta, paso 2») y el contexto del producto:
     la IA acierta más.
  3. «Analizar». Se envían como mucho 8 imágenes o PDF por análisis. Pharos no
     guarda las imágenes: solo el nombre y la huella de cada archivo.
- **La revisión de las propuestas**, común a las dos formas anteriores:
  - Las propuestas se agrupan en «Nuevos», «Mejoras», «Posibles duplicados» y
    «Eliminar por redundante». Los nuevos y las mejoras empiezan marcados.
  - Cada propuesta lleva su motivo y su fuente: el archivo y las líneas, o la
    imagen con la zona marcada.
  - «Escrito en la fuente» significa que el texto está ahí. «Inferido» es una
    deducción, que llega con sus supuestos y sus preguntas abiertas, para que
    la confirmes. Lo deducido solo del código puede ser un defecto: confírmalo
    con quien conoce el producto.
  - Puedes «Editar» una propuesta antes de aplicarla. Un requisito con casos
    vinculados no se puede eliminar desde aquí.
  - «Aplicar N cambios» pide confirmación si alguno elimina requisitos.

## Si algo no sale

- **«No se encontró una columna de título (Título, Requisito, Descripción…).»**
  El CSV necesita una columna con el título. Pharos reconoce cabeceras en
  español o en inglés («Título», «Title», «Clave», «ID»…).
- **«Línea N: sin título, se omite.»** o **«… el ID «v» no es válido…».**
  Esas filas no se importan; corrige el CSV y vuelve a importarlo: los que ya
  existen se actualizan por su ID.
- **«No importados (son de requisitos borrados y no se reutilizan)».** El CSV
  trae el ID de un requisito eliminado. Usa otro ID o déjalo vacío.
- **«Solo letras, números y - _ . : (sin espacios).»** o **«Ya existe un
  requisito con este ID.»** Corrige el ID o déjalo vacío para que Pharos lo
  numere.
- **«No se pudo guardar el requisito».** Vuelve a pulsar «Guardar»; en la web,
  comprueba la conexión.
- **«No se pudo cargar la trazabilidad.»** Pulsa «Reintentar».
- **Las entradas de IA y ✨ están en gris.** Configura un motor de IA en
  Administración (capítulo 15). «Requisitos desde un proyecto» no aparece en la
  versión web.
- **«El modelo de IA configurado no ve imágenes…».** Para «Requisitos desde
  diseños» hace falta un modelo con visión (por ejemplo, Claude o Gemini).
  Elige otro en «Motor de IA».
- **«Como mucho 8 imágenes o PDF por análisis».** Desmarca algunas y haz
  varios análisis.

## En el móvil

- Cada requisito es una tarjeta con su ID, su título, su prioridad, «Casos
  vinculados · N» y si está cubierto.
- «Nuevo requisito» e «Importar» están en la fila de botones de la sección. El
  menú «Importar» se abre como una hoja desde abajo.

## Consejos

- Escribe o importa los requisitos **antes** que los casos: así cada caso
  nace enlazado a lo que comprueba.
- Evalúa el riesgo de los requisitos importantes. Sin probabilidad ni impacto,
  un requisito queda «Sin evaluar» al final de la matriz.
- Importa los requisitos de tu herramienta de gestión con un CSV; si vuelves a
  importarlo, los existentes se actualizan por su ID.
- Un ID eliminado no se reutiliza nunca, para que ningún caso antiguo apunte a
  otro requisito por error.

## Véase también

- Capítulo 8, «Casos de prueba»: vincular un requisito a un caso.
- Capítulo 13, «Trazabilidad»: la matriz.
- Capítulo 17, «Asistente de IA»: los flujos con IA paso a paso.
- [Glosario](../GLOSARIO.md): «Requisito», «Clave de requisito», «Banda de
  riesgo», «Propuesta de requisito».
