---
section: Corregido
---

- **La app ya no se niega a abrir por una copia de seguridad con el mismo
  nombre.** Desde 0.5.0 en desarrollo, una instalación que ya tenía la
  migración local 0043 podía encontrar, al llegar la 0040, una copia previa
  a migrar con el mismo nombre y otro contenido. Pharos se paraba con el
  mensaje «failed to save the pre-migration backup … already exists».
  - La nueva copia se guarda ahora con el siguiente nombre libre (`…-2`).
  - La anterior se conserva: nunca se sobrescribe.
  - Si ya pasaste por ese error, puedes borrar a mano la copia antigua que
    hubieras apartado.
