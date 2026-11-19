---
section: Añadido
---

- **Tus PR de GitHub reportan sus pruebas a Pharos.** La acción `pharos-report` y las plantillas de `docs/integraciones/github-actions/` suben en cada PR los informes JUnit, SARIF, k6 y axe (y CTRF, Playwright y Cucumber) a un mismo run de tu proyecto. Con una matriz, todos los jobs van a ese run. La página del job enseña una tabla con lo subido, y un PR desde un fork, que no tiene el token, no falla por ello.
