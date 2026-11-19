---
section: Añadido
---

- **`pharos watch` ejecuta tus pruebas y sube sus informes.** Por ejemplo, `pharos watch -p PAG --report "test-results/*.xml" -- npm test`:
  - antes de empezar, comprueba el proyecto y el token (o la sesión), así que un problema sale en segundos y no después de las pruebas;
  - después sube solo los informes que las pruebas escribieron, nunca uno viejo que ya estaba;
  - sale con el código de las pruebas, así que tu CI sigue fallando cuando fallan.
