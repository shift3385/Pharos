# server-picker

Picks the Pharos server the desktop app signs in to (SEC-10,
[ADR-0046](../../../docs/adr/0046-despliegue-tls-y-servidor-configurable.md)).

- `ServerLine`: «Servidor: pharos.example.com 🔒 Cambiar» on the sign-in and
  sign-up forms. Desktop only; the web's server is the one that serves it.
- `ServerPanel`: the address field and «Usados en este equipo». «Conectar»
  checks the server (`/health`, version) before saving anything, and warns
  about changes not yet sent to the previous server.
- `useServerInfo`: the chosen server, read from the Rust core.

The address, the requests and the rules (https except to this computer, no
redirects, routes only) live in `src-tauri/src/server.rs`; the frontend side is
`@shared/platform/serverUrl` (`serverFetch` and the `server_*` commands).
