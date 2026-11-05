---
section: Añadido
---

- **Manual de usuario** en `docs/manual/`: quince capítulos en español (acceso, proyectos, plan, casos, trazabilidad, planificador, ciclos, ejecuciones, defectos, administración, IA, móvil, ejecución manual, evidencias y qué hacer si algo sale mal), paso a paso y con capturas de la aplicación real, también en PDF con portada, índice y números de página, que acompaña al instalador de cada versión. Se regenera con `npm run manual` cada vez que la aplicación cambia, y el CI de `main` avisa si el manual guardado quedó desfasado.
- **Pruebas guiadas de cada pantalla**: cada paso del manual es también una prueba automática del binario de escritorio, con su propio servidor y su propia base de datos, sin tocar los datos de quien prueba.
