---
section: Añadido
---

- **Ejecutar casos con pasos compartidos y datasets.** En un run, un caso con un dataset muestra «Usuarios válidos v2 · 3 filas», y cada fila es una ejecución («Fila 2 de 3 · usuario = luis»). Los pasos insertados aparecen bajo «Paso compartido · Iniciar sesión · v5», con los valores de la fila resaltados. Cada resultado recuerda el dataset y la versión de cada paso compartido. «Añadir casos» muestra «3 filas · Usuarios válidos (v2)» junto a cada caso con dataset.
- **Los exportes nombran la biblioteca.** El `.feature` lleva `# Paso compartido: Iniciar sesión (v4)` antes de cada bloque y `# Dataset: Usuarios válidos (v2)` antes de `Examples`. El PDF titula cada bloque y la tabla de datos, y el `.xlsx` añade la línea «Dataset: …» en los datos de prueba. Los casos que no usan la biblioteca se exportan igual que antes.
- **Manual:** nueva sección «Biblioteca: pasos compartidos y datasets» en el capítulo de casos.
