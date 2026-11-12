---
section: Seguridad
---

- **SQLite actualizado a 3.54.** La base de datos que lleva la app de escritorio corrige el fallo CVE-2026-119375 (RUSTSEC-2026-0459): abrir un archivo de base de datos junto con un `-wal` manipulado podía devolver memoria sin inicializar. Pharos no estaba expuesto, porque abre su base de datos solo en memoria, pero se actualiza antes de que llegue la base de datos en disco. Tus datos no cambian.
