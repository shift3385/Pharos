# Pharos

Desktop QA test-management suite (offline-first). Guides each testing project
safely to port, following ISO/IEC/IEEE 29119, ISO/IEC 25010 and the ISTQB CTFL
Syllabus v4.0.1.

> v0.0.1 — planning and design only (test plans, test cases, templates, local
> planner, AI assist, offline sync, exports). No test execution yet.

## Prerequisites

- **Node.js** ≥ 20 and npm.
- To build/run the **native Tauri desktop app** on Windows:
  - **Rust** via rustup with the **GNU** toolchain: `rustup toolchain install
    stable-x86_64-pc-windows-gnu` (pinned in `src-tauri/rust-toolchain.toml`).
  - **MinGW-w64** for the `windres` resource compiler: `choco install mingw`.
  - **WebView2** runtime (preinstalled on Windows 11).
  - GNU tooling can't handle spaces in the build path. If the project lives under
    a path with spaces, redirect the Cargo `target-dir` to a space-free folder in
    a local (git-ignored) `.cargo/config.toml`.
- The web frontend runs without any of the above via `npm run dev`.

## Setup

```bash
npm install
```

## Scripts

| Command                  | Purpose                                             |
| ------------------------ | --------------------------------------------------- |
| `npm run dev`            | Vite dev server (web preview) at localhost:1420     |
| `npm run tauri dev`      | Run the native desktop app (needs Rust)             |
| `npm run build`          | Type-check + build the frontend                     |
| `npm run tauri build`    | Build the Windows installer (needs Rust)            |
| `npm test`               | Run the Vitest suite                                |
| `npm run typecheck`      | TypeScript, no emit                                 |
| `npm run lint`           | ESLint (0 warnings allowed)                         |
| `npm run check:licenses` | Fail on GPL/AGPL/SSPL dependencies                  |
| `npm run verify`         | typecheck + lint + licenses + tests                 |

## Project layout

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Domain modules live in
`src/modules/*`, the shell in `src/app/*`, the design system and i18n in
`src/shared/*`. The ubiquitous language is in [`docs/GLOSARIO.md`](docs/GLOSARIO.md).

## Status

Phase 0 (Foundations) — **complete**. Frontend verified (tests green, runs in
Vite dev); native Tauri window builds and runs on Windows 11 with the GNU
toolchain. Progress tracked in `PROGRESO.md` (kept outside this repo, in the
planning workspace).
