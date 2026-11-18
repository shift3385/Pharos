# ADR-0050 · `pharos-core` y SQLite en disco con cifrado por página

- **Estado:** Aceptado (2026-11-18).
  - El usuario aprobó el plan de la pista N (CORE-01, SEC-04, SEC-05) con
    las cuatro recomendaciones: D1, D2, D3 y D4, más abajo.
  - Ese mismo día aprobó (opción A) refinar D1: el core es toda la
    biblioteca, con Tauri como funcionalidad opcional. El motivo está en
    «Contexto».
  - La biblioteca de cifrado (decisión 2) se fija con el spike SEC-04
    (`docs/spikes/SEC-04-cifrado-por-pagina.md`).
  - Implementado:
    - **decisión 1** (CORE-01a, PR N1);
    - **decisión 7** y la API para el CLI (CORE-01b, PR N2).
  - Pendientes:
    - **decisiones 2 a 6** (SEC-05, PRs N4 y N5).
- **Sustituye en parte a:**
  - la sección «Local data» de `ARCHITECTURE.md`: la BD en memoria y la
    imagen `pharos.db.enc` (cuando llegue SEC-05);
  - la vía de rotación abierta en el
    [ADR-0014](0014-evidencias-cifradas-por-hash.md), que se cierra: se
    conserva la clave maestra;
  - la nota «si SEC-05 cambia de clave» del
    [ADR-0024](0024-clave-de-recuperacion.md), que no aplica.

## Contexto

- **La BD local vive en memoria.** Cada guardado serializa la imagen
  entera, la cifra con AES-256-GCM y la reescribe de forma atómica en
  `pharos.db.enc`. Esto tiene tres consecuencias:
  - guardar es O(tamaño de la BD);
  - la RAM crece con los datos;
  - **ningún otro proceso puede escribir**. Si dos procesos usan la misma
    carpeta, gana el último guardado y el otro pierde sus cambios en
    silencio.
- **0.6.0 trae un CLI** (`pharos upload`, `pharos watch`; INT-01). El CLI
  debe escribir con la app abierta: es el criterio de salida. Después
  necesitan lo mismo IA-06 (MCP local) y RUN-01 (runner).
- **Toda la lógica de datos estaba en el crate de la app Tauri.**
- **No hay un núcleo pequeño que separar.** El plan aprobado proponía sacar
  solo un «kernel» (BD, migraciones, oplog, journal). Al leer el código se
  vio que no se sostiene solo:
  - `journal::record`, la única puerta de escritura, lee el estado con
    `sync::read_payload` y comprueba el rol con `workspaces::check_write`;
  - `oplog` usa el `owner_sql` de runs, ciclos, defectos y blobs;
  - `keys` necesita los prefijos de clave de requisitos, runs, ciclos y
    defectos;
  - las migraciones llaman a pasos en Rust de `revisions`,
    `custom_fields`, `defects`, `evidence` y `blob_sync`.

  La clausura de dependencias del kernel es prácticamente toda la capa de
  dominio, y el CLI la necesita entera para importar resultados.
- **SQLCipher se descartó en la fase 2** porque OpenSSL no compilaba con la
  toolchain GNU. Desde el [ADR-0008](0008-toolchain-msvc.md) se usa MSVC.

## Decisión

1. **Crate `pharos-core` (CORE-01).**
   - **Dos crates, las mismas fuentes.** `src-tauri/` es un workspace de
     Cargo con dos paquetes que comparten `src-tauri/src`:
     - **`pharos-core`** (`src-tauri/core/Cargo.toml`, raíz
       `src-tauri/src/lib.rs`): base de datos, migraciones, repositorios,
       oplog, journal, auditoría, sync, evidencias, IA y servidor. Es toda
       la biblioteca de antes.
     - **`pharos`** (`src-tauri/Cargo.toml`): el *shell* de escritorio. Es
       decir, `src/app.rs` (`run()`, el `setup` y la lista de comandos de
       `generate_handler!`), los tres comandos de la sesión en caché y
       `src/main.rs`.
   - **Tauri es una funcionalidad opcional del core** (`tauri`). Cada
     `#[tauri::command]` y cada `use tauri::…` llevan
     `#[cfg(feature = "tauri")]`; el módulo `diag` (logs y diagnóstico del
     escritorio) es entero de Tauri.
     - El escritorio activa la funcionalidad.
     - El CLI (INT-01) depende de `pharos-core` sin ella y nunca compila
       Tauri. La CI lo comprueba con `cargo check -p pharos-core`.
   - **Sin movimiento de archivos.** Ningún módulo cambia de ruta:
     `src-tauri/src/*.rs`, `src-tauri/migrations` y `src-tauri/tests`
     siguen donde estaban. Las demás pistas, la documentación y los
     comentarios que citan rutas siguen valiendo, y `git log`/`blame` no se
     interrumpen.
   - **Los comandos siguen en sus módulos**, detrás de la funcionalidad. Se
     pueden llevar al *shell* poco a poco cuando convenga; no hace falta
     para 0.6.0.
   - **Módulos públicos.** Son `pub mod` para que el *shell* y el CLI los
     vean. `app.rs` importa `pharos_core::*`, así que la lista de comandos
     se lee como antes y el test de auditoría de comandos la sigue
     leyendo.
   - **Versión.** El core lleva la misma versión que la app: la estampa en
     las copias previas a migrar y en las peticiones de sync.
     `scripts/version.mjs` la mantiene.
2. **SQLite en disco, cifrado por página, en modo WAL (SEC-05).**
   - **Ficheros:** `pharos.db`, `pharos.db-wal` y `pharos.db-shm`.
   - **Biblioteca:** la opción que gane SEC-04. La dirección elegida (D2)
     es sqlite3mc con el esquema compatible con SQLCipher 4; el plan B es
     SQLCipher con OpenSSL empaquetado.
   - **Pragmas:** `journal_mode=WAL`, `synchronous=NORMAL`,
     `temp_store=MEMORY` (nada en claro en temporales), `busy_timeout` y
     `foreign_keys=ON`.
   - **Transacciones de escritura:** siempre `BEGIN IMMEDIATE`. HLC,
     contadores de claves y oplog se leen y se escriben bajo el cerrojo de
     escritura de SQLite, así que dos procesos nunca reparten el mismo HLC
     ni la misma clave.
   - **Guardar** es el *commit*. `persist()` desaparece.
   - **Espacio.** Se reclama con `auto_vacuum=INCREMENTAL` (fijado al
     convertir) y `incremental_vacuum` en reposo; nunca con un `VACUUM`
     completo durante el uso. Lo acordaron las pistas N y S: SYNC-10 solo
     borra filas.
3. **Misma clave maestra.**
   - `db-key` (32 bytes, keychain) sigue siendo la única clave secreta.
   - Clave de página: `page_key = HKDF-SHA256(db_key, "pharos-page-v1")`,
     que se pasa en bruto, sin PBKDF.
   - Siguen valiendo:
     - las claves de recuperación ya exportadas;
     - `evidence_key`;
     - los nombres de `evidence/`.
   - El CLI la lee del mismo keychain: mismo usuario de Windows.
4. **Conversión desde `pharos.db.enc`**, en el primer arranque de la 0.6.
   1. Se comprueba el espacio libre.
   2. Se guarda la copia byte a byte `pharos.db.enc.bak-<ver>-<mig>`
      (SEC-06; sin copia no hay conversión).
   3. Se migra en memoria si hace falta.
   4. Se escribe `pharos.db.convert` y se verifica: integridad, recuentos
      por tabla y `schema_migrations`. Se anota el sha256 del origen.
   5. Se renombra a `pharos.db`.
   6. `pharos.db.enc` se sustituye por una **imagen testigo**. Contiene
      solo `schema_migrations`, con la entrada desconocida
      `disk-format-v2`, para que una app 0.5 o anterior **se niegue a
      abrirla con su mensaje de siempre** en lugar de empezar vacía.

   Cada paso es reanudable. Un `pharos.db.enc` real con otro sha256 al lado
   de un `pharos.db` significa que el usuario volvió a la 0.5 y siguió
   trabajando. En ese caso `pharos.db` se aparta como copia y se convierte
   de nuevo.
5. **Concurrencia.**
   - La app y el CLI abren la misma BD.
   - **Migrar y convertir** exigen exclusividad: cerrojo de fichero más
     `BEGIN EXCLUSIVE`. Quien llega mientras tanto espera o falla con un
     mensaje claro.
   - **Cambios de otro proceso.** La app los detecta con
     `PRAGMA data_version` y emite `db://external-change`; la UI vuelve a
     pedir la vista actual.
6. **Copias.**
   - Nuevas: `pharos.db.bak-<ver>-<etiqueta>`, hechas con la API de backup
     de SQLite. Siguen cifradas, con la misma clave. Se conservan 3.
   - Las `pharos.db.enc.bak-…` no se podan automáticamente.
   - `restored_copy` cuenta aperturas y copias, y la marca pasa a
     `pharos.db.seq`.
7. **Cerrojo provisional (D4).** Hasta que llegue SEC-05b, abrir la BD toma
   un cerrojo exclusivo (`pharos.lock`): con la app abierta, el CLI falla
   con un mensaje claro en lugar de pisar datos.
   - **Cómo es el cerrojo.** `pharos.lock` se abre sin compartir
     lectura ni escritura (en Windows solo `FILE_SHARE_DELETE`, para que la
     carpeta se pueda borrar) y queda abierto mientras vive el `Db`. Al
     salir, también si el proceso cae, Windows lo suelta: nunca queda un
     cerrojo huérfano.
   - **Quién llega segundo** recibe `db-in-use`, sin leer ni escribir nada.
     La app lo explica en la pantalla de error («Otro Pharos está usando tus
     datos»).
   - **Una segunda app sobre la misma carpeta** también queda bloqueada.
     Antes, la última en guardar pisaba en silencio lo que había guardado
     la otra.
8. **API para el CLI (N2).**
   - **`pharos_core::api`** tiene `open`, `import_preview`, `import_report`
     (con el archivo del informe como `Read`) e `import_attach`. Usan el
     mismo código que `run_import_preview`, `run_import` y
     `run_import_attach` (`runs::import`).
   - **`pharos_core::paths::default_data_dir()`** da la carpeta de datos de
     la app sin Tauri. Es la carpeta de datos del sistema más el
     identificador de `tauri.conf.json`; un test comprueba que el
     identificador coincide.

## Alternativas

- **Para CORE-01:**
  - **Un kernel pequeño con *hooks*** que la app registra (lectura del
    estado, permisos, propietarios, prefijos). Se descarta: obliga a
    cambiar la lógica de los archivos más tocados, la revisión deja de ser
    mecánica, y el CLI necesitaría los mismos *hooks* para importar
    resultados.
  - **Partir cada archivo** (lógica al core y comandos a la app). Es más
    limpio, pero reescribe el final de ~36 archivos a la vez que cuatro
    pistas los editan. Queda como limpieza gradual.
  - **`git mv` de todos los módulos a `crates/pharos-core/src`.** Se
    descarta frente a la decisión 1: obliga a reescribir unas 300
    referencias de ruta en código TS, pruebas del servidor y
    documentación, y a rebasar sobre renombrados.
- **Para SEC-05:**
  - **Seguir con la imagen en memoria y guardados incrementales** (diffs
    cifrados). Se descarta: no resuelve el segundo escritor y añade un
    formato propio.
  - **Que el CLI hable con la app por IPC** (la app como único escritor).
    Se descarta como base: el CLI no podría escribir con la app cerrada,
    que es el caso de CI.
  - **SQLite en disco sin cifrar más BitLocker.** Se descarta: rompe la
    promesa de datos cifrados en reposo (especificación §16).
  - **Otra clave para las páginas** (rotar `db-key`). Se descarta:
    invalida las claves de recuperación y obliga a recifrar `evidence/`
    (ADR-0014).

## Consecuencias

- **Para quien desarrolla:**
  - `cargo test`, `clippy` y `fmt` en `src-tauri/` cubren los dos paquetes
    (`default-members`).
  - Un comando nuevo se escribe como siempre en su módulo, con
    `#[cfg(feature = "tauri")]` delante de `#[tauri::command]`, y se
    registra en `src/app.rs`.
  - Un módulo nuevo es `pub mod` en `lib.rs`.
- **Guardar** pasa a ser O(filas cambiadas). Abrir ya no carga la BD entera
  en RAM (SEC-05).
- **La copia completa** son `pharos.db` (con la app cerrada, o la que hace
  la app), `evidence/` y la clave de recuperación. `-wal` y `-shm` nunca se
  adjuntan.
- **Volver a la 0.5 es manual:** restaurar la `.bak`. Se pierden los
  cambios locales sin sincronizar hechos en la 0.6.
- **Dependencia nueva de C** (amalgama de sqlite3mc o SQLCipher). Su
  licencia va en los avisos de terceros, porque cargo-deny no la ve si se
  compila en un build.rs.
- **`%APPDATA%` es Roaming (D3: se queda ahí).** Un perfil itinerante o la
  redirección de carpetas pueden copiar un `-wal` vivo. Se documenta en la
  guía.
- **La recuperación de huérfanos de evidencias** ya no necesita
  `changed_on_disk`: las referencias están en la misma BD que ven todos los
  procesos.
- **El formato en disco es un formato de datos** (VERSIONING §6): cambiar
  la cifra, la KDF o el tamaño de página exige otra conversión con testigo.
