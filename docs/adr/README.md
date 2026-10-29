# Registro de decisiones (ADR)

Cada decisión de arquitectura o de producto queda escrita aquí: contexto,
decisión, alternativas descartadas y consecuencias. Un ADR aceptado no se
edita para cambiar la decisión: se escribe uno nuevo que lo sustituye y se
marca el anterior como "Sustituido por ADR-NNNN".

| ADR                                                | Decisión                                                                             | Estado   | Fecha      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ | -------- | ---------- |
| [0001](0001-linea-base-tres-compuertas.md)         | Línea base: tres compuertas antes de construir encima del MVP                        | Aceptado | 2026-10-28 |
| [0002](0002-conflictos-por-entidad.md)             | Conflictos de sincronización por entidad hasta 0.5.0                                 | Aceptado | 2026-10-28 |
| [0003](0003-workspaces-compartidos.md)             | Equipo en workspaces compartidos desde 0.3.0                                         | Aceptado | 2026-10-28 |
| [0004](0004-web-cliente-del-servidor.md)           | La web es un cliente del servidor                                                    | Aceptado | 2026-10-28 |
| [0005](0005-alcance-hasta-1-0.md)                  | Recortes de alcance hasta 1.0                                                        | Aceptado | 2026-10-28 |
| [0006](0006-claves-ia-y-tls.md)                    | Claves de IA en el keychain; TLS al desplegar                                        | Aceptado | 2026-10-28 |
| [0007](0007-varios-proveedores-ia.md)              | Varios proveedores de IA, uno activo                                                 | Aceptado | 2026-10-28 |
| [0008](0008-toolchain-msvc.md)                     | Toolchain de Rust MSVC                                                               | Aceptado | 2026-10-27 |
| [0009](0009-versionado-semver.md)                  | Versionado SemVer con una sola versión                                               | Aceptado | 2026-10-28 |
| [0010](0010-claves-entre-equipos.md)               | Claves de caso, requisito y defecto únicas entre equipos                             | Aceptado | 2026-10-28 |
| [0011](0011-revision-del-caso-y-pasos-estables.md) | El resultado apunta a la revisión del caso y a pasos con ID estable (DAT-02)         | Aceptado | 2026-10-28 |
| [0012](0012-tipos-de-resultado-genericos.md)       | Tipos de resultado genéricos: Result, Finding, Metric y sesión exploratoria (KND-01) | Aceptado | 2026-10-28 |
| [0013](0013-campos-del-run.md)                     | El Run nace con su contexto e identidad CTRF (RUN-00)                                | Aceptado | 2026-10-28 |
| [0014](0014-evidencias-cifradas-por-hash.md)       | Evidencias cifradas fuera de la BD, direccionadas por hash (DAT-03)                  | Aceptado | 2026-10-28 |
| [0015](0015-registro-de-auditoria.md)              | Registro de auditoría append-only desde 0.2.0 (AUD-01)                               | Aceptado | 2026-10-28 |
| [0016](0016-defecto-como-entidad.md)               | El defecto como entidad propia (DEF-01)                                              | Aceptado | 2026-10-28 |
| [0017](0017-ciclos-y-configuraciones.md)           | Ciclo de pruebas y matriz de configuraciones (CYC-01)                                | Aceptado | 2026-10-28 |
| [0018](0018-campos-personalizados.md)              | Campos personalizados tipados por proyecto y tipo de caso (FLD-01)                   | Aceptado | 2026-10-28 |
| [0019](0019-diseno-workspaces-compartidos.md)      | Diseño técnico de los workspaces compartidos con roles (TEN-01)                      | Aceptado | 2026-10-28 |
| [0020](0020-sync-por-usuario-cascada-y-version.md) | Sync por usuario, cascada en el servidor y versión del cliente                       | Aceptado | 2026-10-28 |

Los 0021 y 0022 (pistas B1 y B2) se añaden al fusionar sus ramas. Los ADR 0011 a 0019 son la compuerta C
([ADR-0001](0001-linea-base-tres-compuertas.md)); cómo encajan entre sí está en
[`docs/design/0.2.0-modelo-ejecucion.md`](../design/0.2.0-modelo-ejecucion.md).
Se aceptaron el 2026-10-28 con la opción y las respuestas recomendadas y se
revisaron ese mismo día tras la revisión independiente. El usuario confirmó
los tres cambios que introdujo la revisión (`docs/design/0.2.0-modelo-ejecucion.md`
§7). Un ADR "Propuesto" todavía no obliga a nada: pasa a
"Aceptado" cuando el usuario decide, con la opción elegida.

Plantilla: copia la estructura de cualquier ADR (Contexto, Decisión,
Alternativas, Consecuencias) con el siguiente número libre.
