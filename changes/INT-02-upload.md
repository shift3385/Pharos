---
section: Añadido
---

- **CI puede subir sus informes a Pharos** con un token de proyecto, sin abrir la app.
  - Formatos: JUnit, CTRF, Playwright, Cucumber Messages, SARIF, axe, k6 y Pharos Run JSON. Allure y TRX llegarán más adelante.
  - Cada fichero crea su run, o se suma a uno abierto.
  - Los jobs de una misma ejecución de CI se juntan en un único run, que se cierra al terminar.
  - Los resultados se vinculan a los casos por su etiqueta, igual que al importar desde el escritorio, y el informe original se guarda como evidencia.
  - Subir el mismo fichero dos veces no duplica nada.
