# Pharos — Hoja de ruta y backlog

> **Replanificación del 2026-10-26.** Basada en el estudio `Pharos QA estado del arte.md`
> (carpeta superior al repo) y en el estado real del código a esta fecha.
> **Estado: aprobada por el usuario el 2026-10-27.** Enmienda las secciones §13 (hoja de
> ruta) y §16 (fases) de `PROMPT_PHAROS_v0.3.md`. Este archivo es la fuente del backlog.
> El seguimiento fino de cada fase sigue en `files/PROGRESO.md`.

## 1. Qué cambia y por qué

1. **Pharos es el plano de control, no un motor de ejecución.** Planifica, dispara, recibe
   y traza resultados de Playwright, Karate, Bruno, Appium, Maestro, k6, axe o ZAP. Nunca
   tendrá un runner ni un grid propios.
2. **Primero se salda la deuda de seguridad.** `db.rs` escribe la BD completa en claro en
   `pharos.db.tmp` al abrir y al guardar, y sobrescribe `pharos.db.enc` sin escritura
   atómica. Va antes que cualquier otra cosa.
3. **Un crate `pharos-core` sin Tauri.** Arregla el `cargo test` roto (deuda de la Fase 3) y
   es la base que comparten escritorio, CLI y agente: dominio, oplog y parsers.
4. **Mínimos de mercado como P0:** requisitos + matriz de trazabilidad, modelo de ejecución
   Run/Result inspirado en CTRF, e importación local de JUnit/Cucumber/CTRF.
5. **IDs estables como tags de Gherkin** (`@TC-001`, `@REQ-014`), nunca el nombre del escenario.
6. **Sync antes que móvil.** La base ya existe (8A/8B: oplog + push/pull + web). Para el
   móvil falta cerrar 8C (conflictos), sincronizar planner/plantillas y llevar adjuntos fuera
   del oplog.
7. **Varias pistas en paralelo**, cada una con su plan aprobado y en su propio worktree (ver §6).

## 2. Estado real (2026-10-26)

| Fase | Código | Commits | Validación del usuario (PROGRESO) |
|---|---|---|---|
| 0–3 Cimientos, backend, BD, plan | ✔ | `369d335`…`ad51fd3`, `d0bcb24` | ✔ |
| 4 Casos de prueba | ✔ | `91e6317`…`b360263` | Sin marcar |
| 5 Planificador | ✔ | `945d767` | ✔ |
| 6 Plantillas y exportación | ✔ | `992e45d`…`9a497cc` | PDF, import y plantillas sin marcar |
| 7 IA (7A/7B/7C) | ✔ | `5ff0eb5`, `b13ee6e`, `79a0185` | Falta probar Ollama offline |
| 8 Sync | 8A + 8B + web ✔ · **8C ✘** · 8B-2 ✘ | `bf96ad6`, `fb70768` | Sin marcar |
| 9 Admin y pulido | 9A ✔ · resto ✘ | `2de8e8e` | — |

Huecos verificados en el código: el `.feature` exportado no lleva tags; no hay marca de
procedencia IA; no hay panel de conflictos; el oplog usa `datetime('now')` sin HLC; no hay
clave de recuperación; no existe la entidad Requisito ni el modelo Run/Result.

## 3. Hitos replanificados

| Versión | Contenido | Criterio de salida |
|---|---|---|
| **v0.0.1 (cierre)** | SEC-01..03, SYNC-01/03 (8C), UX-05/06 (Fase 9) | Ningún texto plano en disco; `cargo test` en verde (logrado con MSVC); conflicto simulado visible; instalador limpio en Windows 11 |
| **v0.0.2** | TRZ-01..03, IA-01, IA-05 | Matriz requisito→caso exportable a XLSX; `.feature` filtrable por `@TC-xxx` |
| **v0.0.3** | EJE-01..04, ING-01..05 | Un run manual y uno de Playwright aparecen en la misma matriz |
| **v0.0.3.x** | CORE-01, SEC-04/05, SYNC-05 | El CLI escribe con la app abierta; paquete `.pharos-bundle` importable |
| **v0.0.4** | MOB-01, SYNC-04 | Un caso ejecutado en el móvil aparece en el escritorio |
| **v0.0.5** | INT-01..04, SYNC-02, SYNC-07 | Un PR en GitHub reporta resultados a Pharos |
| **v0.0.6** | RUN-01..03 | Botón "Ejecutar @TC-001" en local con resultado vinculado |
| **v0.0.7** | IA-02/03/06 | Claude Code lee casos vía MCP local; duplicados detectados offline |
| **v0.1.0** | INT-05..07, IA-04/07, DOC-06 | Ciclo plan → CI → resultado → defecto en Jira |
| **v0.2+** | RUN-04, DOC-01..05, ING-06, EJE-05, SSO, SaaS | Primer cliente regulado o primer equipo de más de 10 personas |

Nota: la IA, que el estudio situaba en v0.0.7, ya está hecha (Fase 7). v0.0.7 queda
para MCP y calidad de IA.

## 4. Backlog

Prioridad: **P0** bloquea el hito · **P1** paridad de mercado · **P2** diferenciador · **P3** escala.

### Seguridad y núcleo
| ID | Ítem | P | Versión | Estado | Depende de | Criterio de aceptación |
|---|---|---|---|---|---|---|
| SEC-01 | Abrir/guardar la BD en memoria (`serialize`/`deserialize`), sin `pharos.db.tmp` | P0 | v0.0.1 | **En curso** | — | Nunca aparece un archivo SQLite en claro en el directorio de datos; la BD existente abre |
| SEC-02 | Escritura atómica: `pharos.db.enc.new` + `sync_all` + `rename` | P0 | v0.0.1 | **En curso** | — | Matar el proceso a mitad del guardado no corrompe `pharos.db.enc` |
| SEC-03 | Clave de recuperación exportable e importable | P0 | v0.0.1 | Pendiente | SEC-01 | En otro PC, con el `.enc` y la clave, se recuperan los datos |
| CORE-01 | Extraer `pharos-core` (db, migraciones, repos, oplog) sin dependencia de Tauri | P1 | v0.0.3.x | Pendiente | SEC-01/02, SYNC-01/03 | El CLI y el escritorio usan el mismo crate; `cargo test -p pharos-core` sin enlazar WebView2. (Ya no bloquea los tests: desde el cambio a MSVC, `cargo test` pasa 28/28.) |
| SEC-04 | Spike de cifrado por página (con MSVC desde 2026-10-27): sqlite3mc frente a SQLCipher con OpenSSL vendored | P1 | v0.0.3.x | Pendiente | — | Informe con una opción que compila y su licencia |
| SEC-05 | SQLite en disco con cifrado por página + WAL | P1 | v0.0.3.x | Pendiente | SEC-04, CORE-01 | Guardar no es O(tamaño de la BD); otro proceso escribe con la app abierta |
| CORE-02 | Test automatizado del keychain (deuda F1) | P2 | v0.0.1 | Pendiente | CORE-01 | Test en verde |

### Sincronización
| ID | Ítem | P | Versión | Estado | Depende de | Criterio de aceptación |
|---|---|---|---|---|---|---|
| SYNC-03 | Panel de conflictos (Fase 8C) | P0 | v0.0.1 | Pendiente | — | Un conflicto simulado aparece y se resuelve a mano |
| SYNC-01 | HLC en el oplog (hora de pared + contador + dispositivo) | P1 | v0.0.1 | Pendiente | — | Test: LWW determinista con relojes desfasados |
| SYNC-02 | LWW por campo (§9) en lugar de por entidad | P1 | v0.0.5 | **Decisión pendiente** | SYNC-01 | El 2026-08-13 se decidió LWW por entidad; la spec y el estudio piden por campo |
| SYNC-04 | Sincronizar planner, plantillas y requisitos (8B-2; hoy el sync solo cubre proyecto/plan/caso); adjuntos por hash en MinIO/S3 | P1 | v0.0.4 | Pendiente | SYNC-03 | Una tarjeta con adjunto creada en escritorio se ve en la web |
| SYNC-05 | Paquetes de oplog firmados `.pharos-bundle` (modo aislado) | P2 | v0.0.3.x | Pendiente | SYNC-01 | Exportar e importar por USB entre dos PCs sin servidor |
| SYNC-06 | Job de purga de soft-deleted coordinado con el oplog (la preferencia ya existe en Admin) | P1 | v0.0.1 | Pendiente | — | Lo purgado no "resucita" tras un pull |
| SYNC-07 | RBAC por workspace + audit log + activar `project_members` | P1 | v0.0.5 | Pendiente | SYNC-02 | Un auditor ve el proyecto y no puede editarlo |

### Trazabilidad (v0.0.2)
| ID | Ítem | P | Estado | Depende de | Criterio de aceptación |
|---|---|---|---|---|---|
| TRZ-01 | Entidad Requisito (`REQ-xxx`) con CRUD e importación CSV | P0 | Pendiente | — | CRUD + import; registrado en GLOSARIO |
| TRZ-02 | Matriz requisito ↔ caso ↔ defecto (planner), exportable con `PHAROS_Matriz_Trazabilidad_*.xlsx` | P0 | Pendiente | TRZ-01 | XLSX fiel a la plantilla de `docs/referencias/` |
| TRZ-03 | Tags estables en el `.feature`: `@TC-xxx` por escenario, `@REQ-xxx` por feature; en un Outline el ID va a nivel de escenario | P0 | Pendiente | TRZ-01 | `cucumber-js --tags @TC-001` y playwright-bdd `--grep` lo filtran |
| TRZ-04 | Riesgo ISTQB por requisito (probabilidad × impacto) → prioridad y cobertura ponderada | P2 | Pendiente | TRZ-01 | Matriz ordenable por riesgo |

### Ejecución e ingesta (v0.0.3)
| ID | Ítem | P | Estado | Depende de | Criterio de aceptación |
|---|---|---|---|---|---|
| ING-01 | Spike de formatos: tags en Cucumber Messages (`pickle.tags`), playwright-bdd → JUnit `<properties>`, CTRF 0.2 | P0 | Pendiente (puede empezar ya) | — | Muestras reales + mapeo campo a campo documentado |
| EJE-01 | Modelo Run / Shard / Result / StepResult / Attachment, append-only | P0 | Pendiente | ING-01 | Esquema + GLOSARIO; los resultados nunca se sobrescriben |
| EJE-02 | Ejecución manual por pasos con evidencias | P0 | Pendiente | EJE-01 | Pasa/falla por paso, adjunto por paso |
| ING-02..04 | Importación local de JUnit XML, Cucumber Messages/JSON y CTRF | P0 | Pendiente | EJE-01 | Importar el informe de Playwright vincula los resultados por `@TC-xxx` |
| ING-05 | Resultados "no vinculados" y enlace posterior | P0 | Pendiente | ING-02 | Un test sin ID queda en la bandeja y se enlaza a mano |
| EJE-04 | Matriz extendida a resultados y defectos | P0 | Pendiente | TRZ-02, EJE-02 | Requisito → caso → último resultado → defecto |
| EJE-03 | Informe de estado (29119-3) generado desde los runs | P1 | Pendiente | EJE-02 | Export XLSX/PDF |
| EJE-05 | Entorno, build y dataset registrados por run | P2 | Pendiente | EJE-01 | — |
| ING-06 | SARIF, k6 summary, axe JSON → Finding/Metric | P2 | v0.2 | EJE-01 | — |

### Integraciones, CLI y runners
| ID | Ítem | P | Versión | Depende de |
|---|---|---|---|---|
| INT-01 | CLI `pharos upload` y `pharos watch -- <cmd>` (mismo crate) | P1 | v0.0.5 | CORE-01, ING-02 |
| INT-02 | API REST `/api/v1` (OpenAPI), tokens de proyecto y PAT con scopes | P1 | v0.0.5 | SYNC-07 |
| INT-03 | Webhooks salientes firmados con HMAC (`run.completed`, `gate.failed`…) | P1 | v0.0.5 | INT-02 |
| INT-04 | Plantillas de GitHub Actions con acciones fijadas por SHA | P1 | v0.0.5 | INT-01 |
| RUN-02 | Gherkin de ida y vuelta con playwright-bdd y Karate | P1 | v0.0.6 | TRZ-03, ING-03 |
| RUN-01 | Runner local (procesos hijo) con "doctor" (Node, Java 17, Android SDK) | P2 | v0.0.6 | CORE-01 |
| RUN-03 | Dogfooding: suite E2E de Pharos con WDIO + tauri-driver, gestionada dentro de Pharos | P1 | v0.0.6 | ING-02 |
| INT-05 | Jira bidireccional (módulo `integrations`) | P1 | v0.1.0 | TRZ-01 |
| INT-06 | Disparo de CI desde un plan (`workflow_dispatch`, GitLab, Jenkins) | P2 | v0.1.0 | INT-02 |
| INT-07 | Importación desde TestRail / CSV | P1 | v0.1.0 | — |
| RUN-04 | `pharos-agent` headless (Mac para iOS) + adaptadores BrowserStack, AWS Device Farm, Firebase Test Lab | P2 | v0.2+ | INT-02 |
| MOB-01 | Móvil Android: cliente de ejecución manual con cámara (sin automatización: el sandbox no lanza procesos) | P0 | v0.0.4 | EJE-02, SYNC-04 |

### IA y MCP
| ID | Ítem | P | Versión | Depende de |
|---|---|---|---|---|
| IA-01 | Procedencia visible "IA · pendiente de revisión" + qué proveedor procesó qué datos | P1 | v0.0.2 | — |
| IA-05 | Gherkin y casos desde un requisito (salida JSON con esquema) | P1 | v0.0.2 | TRZ-01, IA-01 |
| IA-02 | Detección de duplicados con embeddings locales | P1 | v0.0.7 | — |
| IA-03 | *Lint* de oráculo (resultados esperados débiles) | P1 | v0.0.7 | — |
| IA-06 | Servidor MCP local (stdio): `search_cases`, `get_case`, `create_case`, `report_result`… | P1 | v0.0.7 | SEC-05 |
| IA-04 | Triage de fallos (flaky por historial + explicación del LLM) | P1 | v0.1.0 | EJE-01 |
| IA-07 | MCP remoto (HTTP + OAuth) | P1 | v0.1.0 | INT-02 |

### Estrategia y documentación normativa (diferenciadores)
| ID | Ítem | P | Versión |
|---|---|---|---|
| DOC-06 | Dashboards: pass rate, flakiness, cobertura por riesgo, tendencia | P1 | v0.1.0 |
| DOC-02 | Criterios de salida como quality gates + informe go/no-go (los criterios de cierre ya existen en el plan) | P2 | v0.2+ |
| DOC-01 | Informe de cierre de pruebas 29119-3 | P2 | v0.2+ |
| DOC-03 | Paquetes de evidencia EAA/WCAG 2.2/EN 301 549 y ASVS 5.0/MASVS 2.1 | P2 | v0.2+ |
| DOC-04 | Modo aprendizaje ISTQB CTFL 4.0.1 dentro del editor | P2 | v0.2+ |
| DOC-05 | Modo portafolio: exportar el trabajo anonimizado | P2 | v0.2+ |

### UX y deuda existente (de PROGRESO)
| ID | Ítem | P | Versión |
|---|---|---|---|
| UX-05 | Verificación WCAG 2.1 AA (Fase 9) | P0 | v0.0.1 |
| UX-06 | Instalador Windows limpio + documentación final (Fase 9) | P0 | v0.0.1 |
| UX-01 | Validaciones transversales de formularios (números, requeridos, formatos) | P1 | v0.0.1 |
| UX-02 | Carpeta de descarga con selector nativo (plugin dialog bloqueado por crates.io) | P2 | v0.0.2 |
| UX-03 | Undo/redo por paso en el wizard | P3 | — |
| UX-04 | Revisión UI/UX (pendiente de ejemplos del usuario) | P2 | — |
| DEU-01 | Backend compilado con `tsc` para producción; 5 vulnerabilidades npm de tooling | P2 | v0.0.5 |

## 5. Validaciones del usuario pendientes

Bloquean el cierre formal de fases, según la regla 1 de `files/CLAUDE.md`:

- **Fase 4:** edición bidireccional y `.feature` válido en la app nativa.
- **Fase 6:** PDF nativo, importación de plan/casos y plantillas.
- **Fase 7:** asistencia sin internet vía Ollama.
- **Fase 8:** 8B en la app nativa; 8C cuando exista.
- **Fase 9A:** panel de administración.

## 6. Pistas de trabajo inmediatas

| Pista | Ítems | Toca | Choques |
|---|---|---|---|
| A · Seguridad | SEC-01/02 (en curso) → SEC-03 | `src-tauri/src/db.rs`, `Cargo.toml` | — |
| B · Cierre de sync | SYNC-03 + SYNC-01 | `oplog.rs`, `sync.rs`, `sync-offline/`, `server/src/modules/sync` | Ninguno con A |
| C · v0.0.2 | TRZ-01..03 + IA-01 | migración nueva, módulo nuevo `traceability`, `test-cases/ui/gherkin.ts` | Lista `MIGRATIONS` en `db.rs`: choque trivial con A |
| D · Spike de ingesta | ING-01 | Solo `docs/spikes/` + carpeta scratch | Ninguno |
| Después de A y B | CORE-01 (mueve `db.rs`, `oplog.rs` y repos) | todo `src-tauri/src` | Por eso va en serie |

**Enmienda a `files/CLAUDE.md`, regla 1 (aprobada el 2026-10-27):** "una fase a la vez
*por pista*". Cada pista trabaja en su propio worktree, empieza con un plan que aprueba el
usuario y termina con su validación, como hasta ahora.

## 7. Reglas de diseño que se adoptan

- El ID de un caso viaja como tag (`@TC-xxx`), nunca como nombre de escenario.
- Los resultados de ejecución y el audit log son append-only.
- Los resultados ingeridos se normalizan a un único "Pharos Run JSON" (superconjunto de CTRF) en `pharos-core`; el servidor solo valida el esquema.
- Lo que genera la IA lleva procedencia visible hasta que una persona lo revisa. Lo que se escribe por MCP pasa por el oplog como `agent:<id>`.
- Licencias: solo se empaqueta software MIT/Apache/BSD/ISC/OFL. k6 (AGPL) y otras herramientas se invocan como procesos que instala el usuario. PowerSync (FSL) queda descartado.
