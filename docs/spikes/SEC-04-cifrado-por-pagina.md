# SEC-04 — Cifrado por página de la base local: sqlite3mc frente a SQLCipher

Spike del 2026-11-18 (pista N, hito 0.6.0). Alcance: solo investigación; no se tocó `src-tauri/`. Desbloquea SEC-05 (SQLite en disco, cifrada por página, en modo WAL).
Banco de pruebas reproducible (no versionado): `spikes/sec04/` en el worktree de la pista N, con un crate desechable por candidato y un driver común (`common/spike.rs`).

## 1. Conclusión

1. **Se confirma la decisión D2: sqlite3mc con su esquema compatible con SQLCipher 4.** Compila con MSVC dentro de rusqlite 0.41.1 sin tocar libsqlite3-sys, pasa todas las pruebas funcionales y sus archivos (también con `-wal` sin checkpoint) se abren y escriben con SQLCipher 4.19.0 Community con la misma clave raw, en los dos sentidos.
2. **Enlace recomendado: crate propio `-sys` mínimo + `rusqlite/in_gecko`.** El crate compila la amalgamación de [`sqlite3mc-src`](https://crates.io/crates/sqlite3mc-src) (copia byte a byte de la release firmada de upstream) con `cc` y la enlaza estática; la feature `in_gecko` hace que libsqlite3-sys use sus bindings incluidas y no emita ninguna orden de enlace. No hay parche de libsqlite3-sys ni variables de entorno; subir rusqlite solo exige que la SQLite de sqlite3mc no sea más vieja que la de las bindings (§6).
3. **El fallback (SQLCipher con `bundled-sqlcipher-vendored-openssl`) no compila en esta máquina**: `openssl-src` necesita un Perl nativo de Windows (Strawberry Perl); el Perl de Git for Windows falla en `Configure` (`Can't locate Locale/Maketext/Simple.pm`). Con un OpenSSL 3 ya instalado (`bundled-sqlcipher` + `OPENSSL_LIB_DIR`) sí compila y funciona igual que sqlite3mc, pero añade una dependencia de build (Perl) o una DLL de OpenSSL que distribuir.
4. **La conversión desde la imagen en memoria no puede usar la API de backup** en ninguno de los dos (ambos rechazan copiar entre una BD en claro y una cifrada). Con sqlite3mc funcionan `VACUUM INTO` con la clave en la URI y `ATTACH … KEY` + réplica del esquema; sqlite3mc **no tiene `sqlcipher_export()`** (SQLCipher sí).
5. **El `-wal` y el `-shm` van cifrados / sin contenido**: ni el marcador ni la cabecera `SQLite format 3` aparecen en ningún archivo de la carpeta, ni con la conexión abierta ni tras cerrarla; con `temp_store=MEMORY` no se crea ningún `etilqs_*` en `%TEMP%`.
6. **Guardar deja de ser O(tamaño de la BD)**: con una BD de 267 MB, un commit pequeño escribe 4–8 KiB (1–2 frames de WAL) en ~0,6 ms; hoy un guardado serializa y escribe la imagen entera (210 MB, 310–360 ms).

## 2. Contexto

- La app usa `rusqlite 0.41.1` con `bundled`, `serialize` y `blob` (libsqlite3-sys 0.39.1, que incluye SQLite 3.54.1). La BD vive en memoria y se persiste como imagen.
- SEC-05 deriva `page_key = HKDF-SHA256(db_key, "pharos-page-v1")` de la clave maestra `db-key` del llavero y la pasa como **clave raw, sin PBKDF**.
- libsqlite3-sys 0.39.1 solo trae features para SQLCipher (`bundled-sqlcipher`, `bundled-sqlcipher-vendored-openssl`); en Windows SQLCipher necesita OpenSSL (`SQLCIPHER_CRYPTO_CC` es CommonCrypto, solo Apple).
- `deny.toml` solo admite licencias permisivas; el C compilado en un build script es invisible para cargo-deny.

## 3. Candidatos

| Id | Candidato | Cómo enlaza | Resultado |
| --- | --- | --- | --- |
| A1 | sqlite3mc 2.6.1 (SQLite 3.54.0) vía shim propio | `rusqlite` con `modern_sqlite` (sin `bundled`); libsqlite3-sys cae en su rama «enlazada» y emite `rustc-link-lib=dylib=sqlite3`; el shim compila `sqlite3.lib` y solo emite el `link-search` | Funciona. Frágil: depende del sondeo de vcpkg/pkg-config (hay que poner `VCPKGRS_DISABLE=1`) y, fuera de Windows, `-lsqlite3` podría resolver a una librería del sistema |
| **A2** | **sqlite3mc 2.6.1 vía shim propio + `in_gecko`** | `rusqlite` con `in_gecko` (implica `modern_sqlite`): libsqlite3-sys copia las bindings incluidas y no emite enlace; el shim compila `sqlite3mc.lib` y emite `rustc-link-lib=static=sqlite3mc` | **Funciona. Recomendado** |
| — | (b) `[patch.crates-io]` de libsqlite3-sys con otra fuente | Fork vendorizado de libsqlite3-sys | Descartado sin construir: hay que rehacer el parche en cada subida de rusqlite; A2 consigue lo mismo sin fork |
| — | (c) override `links = "sqlite3"` en `.cargo/config.toml` | Cargo no ejecuta el build.rs de libsqlite3-sys | Descartado: ese build.rs es el que genera `OUT_DIR/bindgen.rs`, que `src/lib.rs` incluye; sin él no compila |
| — | (d) crate mantenido que ya lo haga | — | No existe para rusqlite: en crates.io solo hay `sqlite3mc-src` (fuente, sin compilar; lo usa `sqlite-wasm-rs`) y `walletkit-sqlite` (wrapper propio, no rusqlite) |
| B | SQLCipher 4.19.0 Community, `bundled-sqlcipher-vendored-openssl` | libsqlite3-sys + openssl-src (OpenSSL 3.6.3 estático) | **No compila aquí**: falta Perl nativo (ver §1.3) |
| B' | SQLCipher 4.19.0, `bundled-sqlcipher` + OpenSSL 3.5.9 externo | `OPENSSL_LIB_DIR`/`OPENSSL_INCLUDE_DIR` al OpenSSL de PostgreSQL 18; `libcrypto-3-x64.dll` en el PATH | Funciona; usado como referencia y como «herramienta SQLCipher 4 de serie» para la prueba de compatibilidad |

## 4. Resultados

Máquina: Windows 11, MSVC (VS 2022), Rust 1.99.1, perfil release (`opt-level=3`). Clave raw fija de 32 bytes; marcador `PHAROS-MARKER-7f3a9c` escrito 4000 veces (texto indexado y BLOB).

| Verificación | sqlite3mc (A1/A2) | SQLCipher (B') |
| --- | --- | --- |
| 1. Compila con MSVC en rusqlite 0.41.1; `serialize` y `blob` | Sí; `blob_open` y `serialize` OK | Sí (B no: Perl) |
| 2. Crear/abrir con clave raw | OK (`PRAGMA cipher='sqlcipher'; PRAGMA legacy=4; PRAGMA key="x'<64 hex>'"`) | OK (`PRAGMA key="x'<64 hex>'"`) |
| 2. Clave raw sin KDF (tiempo de apertura) | 0,9–1,3 ms raw frente a 200–275 ms con frase (PBKDF2 256 000 it.) | 1,1 ms raw frente a 450 ms |
| 2. Clave errónea | `SQLITE_NOTADB` (26, «file is not a database») en la primera lectura | Igual (y SQLCipher escribe 3 líneas `ERROR CORE … hmac check failed` en stderr) |
| 2. Sin clave | `SQLITE_NOTADB` | `SQLITE_NOTADB` |
| 3. `journal_mode=WAL` | OK | OK |
| 3. Texto en claro en disco (marcador / cabecera) con la conexión abierta y WAL sin checkpoint | 0 / 0 en `.db`, `-wal` (243 KB) y `-shm` | 0 / 0 |
| 3. Tras cerrar | 0 / 0 | 0 / 0 |
| 3. Temporales con `temp_store=MEMORY` (ORDER BY random(), tabla e índice TEMP) | 0 archivos `etilqs_*` | 0 |
| 4. Backup API: memoria en claro → archivo cifrado | **No**: «backup is not supported with incompatible source and target databases» (también con el destino ya inicializado) | **No**: «backup is not supported with encrypted databases» |
| 4. `ATTACH … KEY` + `sqlcipher_export()` | `sqlcipher_export` **no existe** | **OK** |
| 4. `ATTACH … KEY` + réplica manual del esquema e `INSERT … SELECT` | **OK** (0 texto en claro) | (no hace falta) |
| 4. `VACUUM INTO 'file:///…?cipher=sqlcipher&legacy=4&key=x%27<hex>%27'` | **OK** (0 texto en claro; se abre luego con la clave raw) | No probado (SQLCipher no lee la clave de la URI) |
| Extra: backup cifrado → cifrado (misma clave y esquema) | OK | OK |
| Extra: backup archivo cifrado → `:memory:` en claro | No (misma regla) | No |
| Extra: `PRAGMA rekey` en modo WAL | OK (y también en `DELETE`) | OK |
| 5. Otro hilo y otro proceso escriben con la 1.ª conexión abierta | OK, `BEGIN IMMEDIATE` + `busy_timeout=5 s`: con la 1.ª conexión reteniendo el lock 400 ms, hilo y proceso esperan ~440 ms y escriben; la 1.ª conexión ve las 4 filas | OK, igual |
| 7. Archivo de sqlite3mc abierto por SQLCipher 4.19.0 de serie (misma clave raw) | **Sí**, lectura y escritura; también una BD en WAL con el `-wal` sin checkpoint. Y al revés (SQLCipher → sqlite3mc) también | — |

### 4.1 Números (punto 6)

| Medida | sqlite3mc | SQLCipher (B') | SQLite sin cifrar (`bundled`) |
| --- | --- | --- | --- |
| Compilación limpia de la parte C (release) | 20–51 s con la máquina tranquila; 135–349 s con otras compilaciones en paralelo | 15 s **sin** OpenSSL (con `vendored`, OpenSSL se compila aparte: no medible aquí) | 16–20 s |
| Tamaño del ejecutable de prueba | 2 616 832 B (**+480 KB**) | 2 227 712 B (+90 KB) **más** `libcrypto-3-x64.dll` (dinámica; con `vendored` iría estática, no medido) | 2 137 088 B |
| BD de prueba (204 800 filas de 1000 B) | 267,4 MB | 267,4 MB | 200,5 MB |
| Abrir + clave + WAL + primera consulta | 1,4–1,7 ms | 5,5–6,8 ms | 1,2 ms |
| Commit pequeño (`INSERT` + `UPDATE` de una fila) | 0,5–0,7 ms (1.º: 3–5 ms); **4 120–8 272 B escritos** (= crecimiento del `-wal`) | igual | 0,4–0,5 ms; mismos bytes |
| `wal_checkpoint(TRUNCATE)` tras 5 commits | 0,7–1,4 ms; 4–24 KiB | igual | igual |
| Recorrido completo (`count(*)` de 267 MB) | 1,4–3,0 s | 2,7–3,7 s | 0,15–0,19 s |
| Guardado actual (serializar + escribir la imagen) | — | — | 310–360 ms, **210 MB** escritos |

Bytes escritos medidos con `GetProcessIoCounters` del propio proceso. El 33 % de tamaño extra de la BD cifrada es un caso extremo del banco (filas de 1000 B: caben 3 por página en vez de 4 por los 80 bytes reservados); con filas normales el coste es ~2 % (80/4096).

El tiempo de compilación depende mucho de la carga: la misma compilación de sqlite3mc tardó 20,5 s, 21 s, 24,7 s y 50,7 s en unas pasadas y 135 s y 349 s en otras con otras sesiones compilando a la vez en la máquina. Es un único `cl.exe` sobre un archivo de 13 MB, no se paraleliza.

### 4.2 Esquema por defecto fijado al compilar

Compilando con `-DCODEC_TYPE=CODEC_TYPE_SQLCIPHER -DSQLITE3MC_USE_SQLCIPHER_LEGACY`, basta `PRAGMA key = "x'<hex>'"`: `PRAGMA cipher/legacy/kdf_iter/hmac_algorithm/legacy_page_size` devuelven `sqlcipher/4/256000/2/4096` sin haberlos fijado, todas las pruebas de §4 dan el mismo resultado y SQLCipher 4.19.0 abre los archivos (y viceversa). Así un segundo proceso (CLI, MCP) que olvide los PRAGMA no crea por error un archivo ChaCha20 (el esquema por defecto de sqlite3mc).

## 5. Opción elegida: sqlite3mc (esquema SQLCipher 4) con shim propio + `in_gecko`

### 5.1 Cargo

`src-tauri/Cargo.toml`:

```toml
# Sin `bundled`: `in_gecko` (implica `modern_sqlite`) hace que libsqlite3-sys
# use sus bindings incluidas y no emita ninguna orden de enlace; la librería
# SQLite (sqlite3mc) la compila y enlaza `pharos-sqlite3mc-sys`.
rusqlite = { version = "0.41.1", features = ["in_gecko", "serialize", "blob", "backup"] }
pharos-sqlite3mc-sys = { path = "sqlite3mc-sys" }
```

En el crate de la app hay que **cargar** el shim (si no se referencia, rustc no lo enlaza): `extern crate pharos_sqlite3mc_sys;` o `use pharos_sqlite3mc_sys as _;` en `lib.rs`.

`src-tauri/sqlite3mc-sys/Cargo.toml`:

```toml
[package]
name = "pharos-sqlite3mc-sys"
version = "0.0.0"
edition = "2021"
publish = false
license = "MIT"          # el del propio shim; el C trae sus licencias (§7)
links = "sqlite3mc"
build = "build.rs"

[build-dependencies]
cc = "1"
sqlite3mc-src = "=206.1.0"   # SQLite3MC 2.6.1 + SQLite 3.54.0, byte a byte de la release firmada
```

`src-tauri/sqlite3mc-sys/build.rs` (el probado en el spike, `spikes/sec04/mc-gecko/shim/build.rs`):

```rust
fn main() {
    let dir = sqlite3mc_src::source_dir();
    let src = dir.join(sqlite3mc_src::SOURCE_FILE);
    println!("cargo:rerun-if-changed={}", src.display());
    let mut cfg = cc::Build::new();
    cfg.file(&src)
        .include(dir)
        // Mismos flags que libsqlite3-sys 0.39.1 usa con `bundled`.
        .define("SQLITE_CORE", None)
        .define("SQLITE_DEFAULT_FOREIGN_KEYS", "1")
        .define("SQLITE_ENABLE_API_ARMOR", None)
        .define("SQLITE_ENABLE_COLUMN_METADATA", None)
        .define("SQLITE_ENABLE_DBSTAT_VTAB", None)
        .define("SQLITE_ENABLE_FTS3", None)
        .define("SQLITE_ENABLE_FTS3_PARENTHESIS", None)
        .define("SQLITE_ENABLE_FTS5", None)
        .define("SQLITE_ENABLE_JSON1", None)
        .define("SQLITE_ENABLE_LOAD_EXTENSION", "1")
        .define("SQLITE_ENABLE_MEMORY_MANAGEMENT", None)
        .define("SQLITE_ENABLE_RTREE", None)
        .define("SQLITE_ENABLE_STAT4", None)
        .define("SQLITE_SOUNDEX", None)
        .define("SQLITE_THREADSAFE", "1")
        .define("SQLITE_USE_URI", None)
        .define("HAVE_USLEEP", "1")
        .define("HAVE_ISNAN", None)
        // Temporales en memoria por defecto.
        .define("SQLITE_TEMP_STORE", "2")
        // Esquema por defecto = SQLCipher 4 (§5.2).
        .define("CODEC_TYPE", "CODEC_TYPE_SQLCIPHER")
        .define("SQLITE3MC_USE_SQLCIPHER_LEGACY", None)
        .warnings(false);
    if std::env::var("CARGO_CFG_TARGET_FEATURE")
        .is_ok_and(|v| v.split(',').any(|f| f == "crt-static"))
    {
        cfg.static_crt(true);
    }
    cfg.compile("sqlite3mc"); // emite rustc-link-lib=static=sqlite3mc + link-search
}
```

No hace falta `.cargo/config.toml` ni variables de entorno. Solo MSVC: ni Perl ni NASM.

### 5.2 Clave raw (sintaxis que SEC-05 debe usar)

Por conexión, **antes de cualquier otro acceso**:

```sql
PRAGMA cipher = 'sqlcipher';   -- solo si el build no fija CODEC_TYPE_SQLCIPHER
PRAGMA legacy = 4;             -- solo si el build no define SQLITE3MC_USE_SQLCIPHER_LEGACY
PRAGMA key = "x'<64 hex>'";    -- 32 bytes de page_key
SELECT count(*) FROM sqlite_schema;  -- la clave errónea solo se detecta aquí (SQLITE_NOTADB)
```

- Ajustes efectivos (`PRAGMA cipher/legacy/kdf_iter/hmac_algorithm/legacy_page_size`): `sqlcipher`, `4`, `256000`, `2` (HMAC-SHA512), `4096`. Con clave raw el `kdf_iter` no se usa (apertura en ~1 ms).
- **La longitud tiene que ser exacta**: `x'` + 64 hex + `'`. Cualquier otra longitud **no da error**: sqlite3mc la toma como frase y aplica PBKDF2 (`sqlite3mcExtractRawKey`). SEC-05 debe construir la cadena desde los 32 bytes y no aceptar otra cosa.
- Alternativa propia de sqlite3mc: `sqlite3_key_v2(db, "main", b"raw:" + 32 bytes binarios, 36)` evita el hex en texto SQL, pero no es sintaxis de SQLCipher y rusqlite no expone `sqlite3_key_v2`.
- El mensaje de error de la clave errónea es el mismo que el de un archivo dañado; la UI no puede distinguirlos.

### 5.3 Conversión desde la imagen en memoria

La API de backup no sirve (plano → cifrado está prohibido por sqlite3mc y por SQLCipher). Probadas y válidas:

1. **`VACUUM INTO` con la clave en la URI** (recomendada por sencilla y atómica respecto al origen):
   ```sql
   VACUUM INTO 'file:///D:/…/pharos.db.tmp?cipher=sqlcipher&legacy=4&key=x%27<64 hex>%27'
   ```
   La ruta va en URI (`SQLITE_USE_URI`), con espacios como `%20`; el archivo destino no puede existir («output file already exists»): escribir a `.tmp`, cerrar y renombrar. **Riesgo**: si falla, el mensaje de error de SQLite incluye la URI **con la clave** (visto en el spike: «unable to open database: file:///…&key=x%27…%27»); SEC-05 tiene que sanear ese error antes de registrarlo o mostrarlo.
2. **`ATTACH DATABASE ?1 AS enc KEY ?2`** (con `PRAGMA cipher/legacy` previos en la conexión en memoria, o los defaults de compilación) + recrear el esquema de `sqlite_schema` en `enc` + `INSERT INTO enc.t SELECT * FROM main.t` + `user_version`. Es lo que hace `sqlcipher_export()`; unas 25 líneas (`manual_export` en el driver del spike).

Tras convertir, la primera apertura pone `journal_mode=WAL` (persistente en el archivo).

## 6. Riesgos

- **Mantenimiento al subir rusqlite.** libsqlite3-sys trae bindings de su SQLite (0.39.1: **3.54.1**) y sqlite3mc 2.6.1 trae **3.54.0**. Funciona porque una versión de parche no añade funciones; regla para cada subida: la SQLite de `sqlite3mc-src` debe ser **≥ menor** que la de las bindings (si no, error de enlace explícito al usar una función nueva). Revisar también que `in_gecko` siga existiendo (lleva años; solo afecta al build.rs de libsqlite3-sys).
- **`in_gecko` es una feature pensada para Firefox.** Si desapareciera, la variante A1 (`modern_sqlite` + `link-search`, también probada) es el plan B sin fork.
- **Tiempo de build**: la amalgamación (13 MB) tarda 20–50 s en release, hasta 350 s con la máquina cargada; en debug compila sin optimizar (más rápido) pero las pruebas irán más lentas con cifrado. Se compila una vez por target dir.
- **Lectura masiva**: un recorrido completo de 267 MB pasa de 0,2 s a 1,4–3 s por descifrado. Para la app (consultas indexadas) no se nota; sí en exportaciones completas o `VACUUM`.
- **`serialize` de una conexión cifrada devuelve la imagen en claro** (en memoria). Correcto para exportar, pero cualquier ruta que hoy escriba la imagen a disco la escribiría sin cifrar: SEC-05 debe quitar esas rutas.
- **Backup cifrado → `:memory:` en claro también está prohibido**; si algo necesita una copia en memoria, usar `serialize`/`deserialize`.
- **Fallback SQLCipher** necesitaría Strawberry Perl en cada máquina de build y en CI Windows, o distribuir una DLL de OpenSSL; además su crate fuente declara `blessing` y `WTFPL`, que `deny.toml` tampoco admite.

## 7. Licencias

| Parte | Licencia | Acción |
| --- | --- | --- |
| `sqlite3mc-src` 206.1.0 (crate) | `MIT AND CC0-1.0 AND Unlicense AND (CC0-1.0 OR Apache-2.0)` | **cargo-deny lo rechaza** (comprobado) por `Unlicense`. Añadir a `deny.toml`: `{ allow = ["Unlicense"], crate = "sqlite3mc-src" }` (la Unlicense es una dedicación al dominio público, aprobada por OSI y FSF) |
| SQLite3 Multiple Ciphers 2.6.1 (C, Ulrich Telle) | MIT | Aviso MIT en notas de terceros |
| SQLite 3.54.0 | Dominio público | Mención |
| Dentro de la amalgamación | SHA-2 de Olivier Gay: **BSD-3-Clause**; miniz (Rich Geldreich, RAD Game Tools y Valve, Martin Raiber): **MIT**; detección de CPU de AEGIS (Frank Denis): **MIT**; Argon2/BLAKE2b: **CC0-1.0 o Apache-2.0**; código de Thomas Pornin: **CC0-1.0**; un bloque bajo **Unlicense**; Rijndael, Ascon y MD5 de Peslyak: dominio público | Todo esto lo compila un build script y cargo-deny no lo ve: **copiar los textos MIT y BSD-3 (con sus copyright) a las notas de terceros** de la app; no hay hoy un archivo de avisos de terceros en el repo, SEC-05 debe crearlo |
| `cc` | MIT OR Apache-2.0 | Ya permitido |
| SQLCipher Community 4.19.0 (fallback) | BSD-3-Clause; crate `sqlcipher-src`: `MIT AND BSD-3-Clause AND blessing AND WTFPL` | cargo-deny lo rechaza (comprobado): necesitaría excepciones para `blessing` y `WTFPL` |
| OpenSSL 3 (fallback) | Apache-2.0; crates `openssl-src` MIT/Apache-2.0, `openssl-sys` MIT | Build en Windows: Strawberry Perl + nmake (NASM opcional: `openssl-src` pasa `no-asm`) |

Verificación de origen: el `sqlite3mc_amalgamation.c` de `sqlite3mc-src` tiene el mismo SHA-256 (`9b129d1c…c707b0`) que el del zip `sqlite3mc-2.6.1-sqlite-3.54.0-amalgamation.zip` de la release de GitHub, cuyo hash coincide con el `SHA256SUMS` publicado.

## 8. Puntos abiertos para SEC-05

1. **Página y bytes reservados**: el esquema SQLCipher 4 usa página de 4096 y reserva 80 bytes por página (IV 16 + HMAC-SHA512 64). Mantener 4096 para la compatibilidad con SQLCipher; cambiarlo exige `legacy_page_size`/`cipher_page_size` igual en los dos lados.
2. **Método de conversión**: elegir entre `VACUUM INTO` (con saneado del error que contiene la clave) y `ATTACH … KEY` + réplica. Ambos probados.
3. **Rotación de clave**: `PRAGMA rekey = "x'<hex>'"` funciona en WAL; definir cuándo se rota `db-key`.
4. **Herramienta externa**: la compatibilidad con SQLCipher 4 permite usar `sqlcipher` (CLI) o DB Browser con la clave raw para soporte; documentarlo sin exponer la clave.
5. **Defaults de compilación** (`CODEC_TYPE_SQLCIPHER` + `SQLITE3MC_USE_SQLCIPHER_LEGACY`): funcionan (§4.2); aun así conviene emitir `PRAGMA cipher/legacy` explícitos en el código para no depender de cómo se compiló.
6. **CI**: el job de Windows compila la amalgamación (+20–50 s); cachear el target dir.
7. **Android** (ADR-0008): A2 debería compilar con el NDK (cc + amalgamación), no probado.
