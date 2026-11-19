---
section: Añadido
---

- **Importar resultados de Allure**: comprime la carpeta `allure-results` en
  un `.zip` y súbela en «Importar informe», por la API (`format=allure`) o
  con el CLI. Los reintentos son intentos (uno que pasa tras fallar queda como
  *flaky*), la etiqueta `tag` o un enlace `tms` vinculan el test a su caso,
  los parámetros distintos de un mismo test son filas y los adjuntos se
  guardan como evidencias.
