---
section: Añadido
---

- **`pharos upload` sube resultados a tu servidor de Pharos.** Con `--server` (o `PHAROS_URL`) y un token de proyecto o personal, sube cualquier informe que lea el servidor: JUnit, SARIF, k6, axe, CTRF, Playwright y Cucumber. Con varios ficheros, todos van a un mismo run. `pharos login` guarda el token en el Administrador de credenciales de Windows y `pharos doctor` comprueba el servidor y el token. En GitHub Actions, los jobs de una matriz suben a un único run, y la página del job muestra una tabla con lo subido.
