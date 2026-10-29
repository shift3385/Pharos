# Registro de decisiones (ADR)

Cada decisión de arquitectura o de producto queda escrita aquí: contexto,
decisión, alternativas descartadas y consecuencias. Un ADR aceptado no se
edita para cambiar la decisión: se escribe uno nuevo que lo sustituye y se
marca el anterior como "Sustituido por ADR-NNNN".

| ADR                                                | Decisión                                                       | Estado   | Fecha      |
| -------------------------------------------------- | -------------------------------------------------------------- | -------- | ---------- |
| [0001](0001-linea-base-tres-compuertas.md)         | Línea base: tres compuertas antes de construir encima del MVP  | Aceptado | 2026-10-28 |
| [0002](0002-conflictos-por-entidad.md)             | Conflictos de sincronización por entidad hasta 0.5.0           | Aceptado | 2026-10-28 |
| [0003](0003-workspaces-compartidos.md)             | Equipo en workspaces compartidos desde 0.3.0                   | Aceptado | 2026-10-28 |
| [0004](0004-web-cliente-del-servidor.md)           | La web es un cliente del servidor                              | Aceptado | 2026-10-28 |
| [0005](0005-alcance-hasta-1-0.md)                  | Recortes de alcance hasta 1.0                                  | Aceptado | 2026-10-28 |
| [0006](0006-claves-ia-y-tls.md)                    | Claves de IA en el keychain; TLS al desplegar                  | Aceptado | 2026-10-28 |
| [0007](0007-varios-proveedores-ia.md)              | Varios proveedores de IA, uno activo                           | Aceptado | 2026-10-28 |
| [0008](0008-toolchain-msvc.md)                     | Toolchain de Rust MSVC                                         | Aceptado | 2026-10-27 |
| [0009](0009-versionado-semver.md)                  | Versionado SemVer con una sola versión                         | Aceptado | 2026-10-28 |
| [0020](0020-sync-por-usuario-cascada-y-version.md) | Sync por usuario, cascada en el servidor y versión del cliente | Aceptado | 2026-10-28 |

Plantilla: copia la estructura de cualquier ADR (Contexto, Decisión,
Alternativas, Consecuencias) con el siguiente número libre.
