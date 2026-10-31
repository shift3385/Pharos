# Fixture: base de datos de 0.2.0-alpha.1 (VERSIONING §6.2)

`pharos.db.enc` es una base de datos local escrita por el código **real** de
`v0.2.0-alpha.1`. La usa `src-tauri/src/upgrade_tests.rs` para comprobar que
HEAD la abre sin perder nada (la MENOR anterior publicada, `docs/VERSIONING.md`
§6.2).

- **Cifrado:** AES-256-GCM con la clave de pruebas `[0x5A; 32]`. Esa clave solo
  vale para tests, nunca para datos reales.
- **Migraciones aplicadas:** `0001` a `0018` (sin `0014`, retirada).
- **Contenido:**
  - perfil y dos usuarios (`11111111-…`, `22222222-…`), cada uno con su proyecto;
  - planes con una revisión; casos con revisiones, uno borrado;
  - requisitos: uno vivo, uno borrado y uno importado por CSV;
  - tarea y defecto con un adjunto binario; plantilla propia;
  - oplog del usuario 1 sincronizado, su cursor de pull (`cursor:<usuario>`) y
    `sync_base`;
  - un caso recibido de otro equipo y un conflicto de versión abierto;
  - un caso con clave provisional (creado tras el push, sin bloque) y un
    conflicto de clave de un requisito;
  - cambios pendientes de los dos usuarios.
- **No se edita nunca.** Una base de otra versión publicada va en su propia
  carpeta.

## Cómo se generó

El generador está junto a este archivo: `generate_fixture.rs`. No lo compila
este crate.

Se generó sobre el commit `fa82b6f` de `main`, cuyo `src-tauri/` es idéntico al
de la etiqueta (`git diff v0.2.0-alpha.1 fa82b6f -- src-tauri` vacío), antes de
cualquier cambio de E1. Para repetirlo desde la etiqueta:

1. `git worktree add --detach <tmp>/a2 v0.2.0-alpha.1`.
2. En `<tmp>/a2/src-tauri/src` haz visibles (`pub(crate)`) las funciones que usa
   el generador. Es un cambio solo de visibilidad, sin cambio de lógica:
   - `Db::open_with_key`;
   - `insert_project`, `update_project`, `insert_plan`, `update_plan`,
     `insert_case`, `update_case`, `delete_case`;
   - `insert_requirement`, `delete_requirement`, `import_requirements`;
   - `insert_card`, `reorder`, `insert_template`, `upsert_profile`;
   - `sync::build_pending`, `sync::mark_pushed` y `sync::apply_doc`.
3. Copia `generate_fixture.rs` como `src/fixture_gen.rs` y añade a `lib.rs`
   `#[cfg(test)] mod fixture_gen;`.
4. Desde `<tmp>/a2/src-tauri`:
   `PHAROS_FIXTURE_OUT=<dir vacío> cargo test --lib fixture_gen -- --ignored`.
5. Copia `<dir>/pharos.db.enc` aquí y borra el worktree temporal.

Generado el 2026-10-31 con rustc 1.99.1 (MSVC). SHA-256:
`887d859789a883f67e535851ab92a962b862b469a513939f09774f560696468e`.
