//! `pharos` (installed as `bin\pharos.exe`; `pharos-cli` in Cargo): see
//! `lib.rs` and ADR-0054.

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let env = pharos_cli::config::Env::from_process();
    let code = pharos_cli::run(
        &argv,
        &env,
        &mut std::io::stdout().lock(),
        &mut std::io::stderr().lock(),
        #[cfg(feature = "local")]
        &pharos_cli::local::System,
    );
    std::process::exit(code);
}
