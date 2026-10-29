# Fixture: base de datos de 0.1.0-alpha.1 (BASE-04)

`pharos.db.enc` es una base de datos local escrita por el código **real** de la
etiqueta `v0.1.0-alpha.1`. La usa `src-tauri/src/upgrade_tests.rs` para
comprobar que HEAD la abre sin perder nada (`docs/VERSIONING.md` §6).

- **Cifrado:** AES-256-GCM con la clave de pruebas `[0x5A; 32]`. Esa clave solo
  vale para tests, nunca para datos reales.
- **Contenido:**
  - dos usuarios (`11111111-…`, `22222222-…`), cada uno con su proyecto;
  - plan con una revisión y casos con revisiones, uno de ellos borrado;
  - requisitos, uno borrado;
  - tarea y defecto `DEF-001` con un adjunto binario;
  - plantilla propia y perfil;
  - oplog sincronizado, cursor de pull y `sync_base`;
  - un caso recibido de otro equipo y un conflicto abierto.
- **Fallos que conserva a propósito:** los `created_by`/`updated_by` erróneos de
  FIX-06, que repara la migración 0015.
- **No se edita nunca.** Una base de otra versión publicada va en su propia
  carpeta.

## Cómo se generó

El generador está junto a este archivo: `generate_fixture.rs`. No lo compila
este crate.

1. Crea un worktree temporal en la etiqueta:
   `git worktree add --detach <tmp>/alpha1 v0.1.0-alpha.1`.
2. En `<tmp>/alpha1/src-tauri/src` haz visibles (`pub(crate)`) las funciones que
   usa el generador. Es un cambio solo de visibilidad, sin cambio de lógica:
   - `Db::open_with_key`;
   - `insert_*` y `update_*` de proyecto, plan, caso y tarjeta;
   - `insert_requirement` y `delete_requirement`;
   - `upsert_profile` y `planner::reorder`;
   - `sync::build_pending`, `sync::mark_pushed` y `sync::apply_doc`.
3. Copia `generate_fixture.rs` como `src/fixture_gen.rs` y añade a `lib.rs` la
   línea `#[cfg(test)] mod fixture_gen;`.
4. Desde `<tmp>/alpha1/src-tauri`, ejecuta:
   `PHAROS_FIXTURE_OUT=<dir vacío> cargo test --lib fixture_gen -- --ignored`.
5. Copia `<dir>/pharos.db.enc` aquí y borra el worktree temporal.

Generado el 2026-10-28 con rustc 1.99.1 (MSVC). SHA-256:
`7fb50456da9789a9d7569c862c033f12004cccd009ec1916c809d85232dd656d`.
