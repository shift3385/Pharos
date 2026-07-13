# Pharos

Desktop QA test-management suite (offline-first). Guides each testing project
safely to port, following ISO/IEC/IEEE 29119, ISO/IEC 25010 and the ISTQB CTFL
Syllabus v4.0.1.

> v0.0.1 — planning and design only (test plans, test cases, templates, local
> planner, AI assist, offline sync, exports). No test execution yet.

## Prerequisites

- **Node.js** ≥ 20 and npm.
- **Rust toolchain** (rustup) + **MSVC Build Tools** + **WebView2** — required to
  build/run the native Tauri desktop app on Windows. The web frontend runs
  without them via Vite.

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

Phase 0 (Foundations) — frontend scaffold verified (tests green, runs in Vite
dev). Native Tauri build pending the Rust toolchain. Progress tracked in
`PROGRESO.md` (kept outside this repo, in the planning workspace).
