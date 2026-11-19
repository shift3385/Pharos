//! Compiles the sqlite3mc amalgamation (SEC-04 spike, ADR-0050) with the same
//! options libsqlite3-sys uses for `bundled`, plus:
//! - `SQLITE_TEMP_STORE=2`: temporary tables and indices in memory, so no
//!   plaintext spills to %TEMP%;
//! - the SQLCipher 4 scheme as the only default, so `PRAGMA key` alone always
//!   writes SQLCipher-4-compatible files (a second process can never create a
//!   file in another scheme by mistake).

fn main() {
    let dir = sqlite3mc_src::source_dir();
    let src = dir.join(sqlite3mc_src::SOURCE_FILE);
    println!("cargo:rerun-if-changed={}", src.display());
    let mut cfg = cc::Build::new();
    cfg.file(&src)
        .include(dir)
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
        .define("SQLITE_TEMP_STORE", "2")
        .define("CODEC_TYPE", "CODEC_TYPE_SQLCIPHER")
        .define("SQLITE3MC_USE_SQLCIPHER_LEGACY", None)
        .warnings(false);
    if std::env::var("CARGO_CFG_TARGET_FEATURE")
        .is_ok_and(|v| v.split(',').any(|f| f == "crt-static"))
    {
        cfg.static_crt(true);
    }
    // Emits rustc-link-lib=static=sqlite3mc and its search path.
    cfg.compile("sqlite3mc");
}
