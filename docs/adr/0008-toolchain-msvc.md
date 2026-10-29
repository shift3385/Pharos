# ADR-0008 · Toolchain de Rust MSVC

- **Estado:** Aceptado (autorizado por el usuario el 2026-10-27). Sustituye a la
  elección de la Fase 0 (GNU + MinGW).
- **Contexto:** en la Fase 0 se eligió el toolchain GNU para no instalar los
  ~3 GB de Visual Studio C++. Eso trajo varios problemas:
  - `windres` no tolera espacios en la ruta;
  - el linker BFD de MinGW no enlaza la `cdylib` que necesita el móvil;
  - el binario de tests no arrancaba (`0xc0000139`).

  En el equipo nuevo, Visual Studio 2022 con C++ ya estaba instalado.

- **Decisión:** `src-tauri/rust-toolchain.toml` fija
  `stable-x86_64-pc-windows-msvc`.
- **Alternativas:** reinstalar GNU + MinGW. Se descartó por los tres problemas
  anteriores.
- **Consecuencias:**
  - `cargo test` vuelve a funcionar y ya no hace falta MinGW.
  - El enlazado del móvil deja de estar bloqueado.
  - CORE-01 ya no es necesario para poder testear.
  - Se requiere Visual Studio 2022 con "Desktop development with C++".
