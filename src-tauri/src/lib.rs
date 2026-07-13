//! Pharos desktop shell (Tauri 2). Kept in a library crate so the future mobile
//! target (v0.0.4) can reuse the same entrypoint.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Pharos");
}
