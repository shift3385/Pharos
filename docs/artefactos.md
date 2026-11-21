# Artefactos de Pharos

Este índice recoge las páginas que se usan para seguir el proyecto y para aprobar diseños: la línea base, la lista de validaciones, las capturas del rediseño y los bocetos de cada pista.

> **Dos versiones de cada página.**
>
> - **El enlace** abre el artefacto original en claude.ai. Es privado de la cuenta del usuario: solo él puede abrirlo.
> - **La copia** está en [`docs/bocetos/`](bocetos/). Es pública, igual que el repositorio, y estática: es la página tal como estaba en la fecha indicada.
>
> **Lo que las copias no traen:**
>
> - Los datos guardados en la base de datos del artefacto. Por ejemplo, las marcas de la lista de validaciones solo están en el original.
> - Las imágenes de las capturas del rediseño (228 JPEG, unos 19 MB). Para verlas, usa el enlace.
>
> **Cambios respecto al original:**
>
> - En las copias, los correos de ejemplo usan dominios `.test`, como el resto de la documentación.
> - En el boceto de la API (0.6.0), el token de ejemplo completo se acortó (`phr_prj_Ab3k…`), como los demás del boceto.
> - El boceto de auditoría ya no nombra el directorio de compilación local.

## Seguimiento

| Nombre | Enlace | Para qué sirve | Fecha | Ítems y ADR | Copia |
| --- | --- | --- | --- | --- | --- |
| Línea base y rumbo | [artefacto](https://claude.ai/artifact/QmVMLpTA4RcXXWW5GqywVf) | Estado del proyecto que se publica con cada avance: PR, CI, decisiones, pistas y lo que falta para cada versión | 2026-11-21 | [ADR-0039](adr/0039-rumbo-hacia-la-ejecucion-autonoma.md), ROADMAP §2 y §7 | [linea-base-y-rumbo.html](bocetos/linea-base-y-rumbo.html) |
| Validaciones de Pharos | [artefacto](https://claude.ai/artifact/CXPbM9rzgzzra5Un4YgpfY) | Lista en la que el usuario marca las validaciones nativas de 0.3.0 y 0.4.0. Un fallo se convierte en NC | 2026-11-17 | ROADMAP §6, [NC-log](manual/NC-log.md) | [validaciones.html](bocetos/validaciones.html), sin las marcas |
| Capturas del rediseño | [artefacto](https://claude.ai/artifact/KsmYigvo8zuZH77ucFG5Tp) | Cada pantalla del rediseño a nueve anchos (de 320 a 1440 px), en tema claro y oscuro | 2026-11-12 | RED-F1, RED-V1 y RED-V3 | [capturas-rediseno.html](bocetos/capturas-rediseno.html), solo la página; las imágenes están en el artefacto |

## Bocetos de 0.4.0 «Estrategia medible»

| Nombre | Enlace | Para qué sirve | Fecha | Ítems y ADR | Copia |
| --- | --- | --- | --- | --- | --- |
| Plan ISO completo | [artefacto](https://claude.ai/artifact/PMFGE85JfnhjA9LTtmvtiW) | Plan de pruebas según 29119-3, con apartado de métricas y aprobación con autor y fecha | 2026-11-12 | PLN-06, PLN-07, PLN-03 y PLN-04; [ADR-0040](adr/0040-metricas-del-plan-y-aprobacion.md) | [0.4.0-plan-iso.html](bocetos/0.4.0-plan-iso.html) |
| Quality gate y tendencia | [artefacto](https://claude.ai/artifact/FwAL4zCEd9nKSyizVhgdn8) | «Cerrar ciclo» con justificación, informe go/no-go y gadget de tendencia en Inicio | 2026-11-12 | DOC-02 y DOC-06; [ADR-0041](adr/0041-quality-gate-y-tendencia-entre-ciclos.md) | [0.4.0-quality-gate.html](bocetos/0.4.0-quality-gate.html) |
| Riesgo y comparación | [artefacto](https://claude.ai/artifact/9DEXVTVTK8Hk99iizrEXwv) | Bandas de riesgo por proyecto, cobertura ponderada y «Comparar con el periodo anterior» | 2026-11-12 | TRZ-04 y RED-W4; [ADR-0043](adr/0043-bandas-de-riesgo-cobertura-ponderada-y-periodo-anterior.md) | [0.4.0-riesgo-y-comparacion.html](bocetos/0.4.0-riesgo-y-comparacion.html) |
| Informe de cierre | [artefacto](https://claude.ai/artifact/Lehhj4EdmhYxfJE3BrBjEX) | Informe de cierre 29119-3 de un ciclo cerrado | 2026-11-12 | DOC-01; [ADR-0044](adr/0044-informe-de-cierre-29119-3.md) | [0.4.0-informe-de-cierre.html](bocetos/0.4.0-informe-de-cierre.html) |
| Auditoría | [artefacto](https://claude.ai/artifact/HRMSDibkf7TVhpfWvk6SxW) | Administración › Auditoría: filtros, antes y después, exportación e integridad de la cadena | 2026-11-12 | AUD-01; [ADR-0015](adr/0015-registro-de-auditoria.md) | [0.4.0-auditoria.html](bocetos/0.4.0-auditoria.html) |

## Bocetos de 0.5.0 «Equipo»

| Nombre | Enlace | Para qué sirve | Fecha | Ítems y ADR | Copia |
| --- | --- | --- | --- | --- | --- |
| Workspaces | [artefacto](https://claude.ai/artifact/TS5jumu2R926tx9xWYCr2D) | Plan y bocetos de la pista W: workspaces con roles, miembros e invitaciones, «Compartir proyecto» | 2026-11-17 | TEN-01, SYNC-07 y SYNC-04b; [ADR-0042](adr/0042-revision-workspaces-sync-v2.md) | [0.5.0-workspaces.html](bocetos/0.5.0-workspaces.html) |
| Cuenta | [artefacto](https://claude.ai/artifact/MfDKDKH7Jp3WBzh222bYE8) | Cambiar la contraseña, códigos de recuperación y restablecimiento por correo | 2026-11-17 | SEC-08 y SEC-09; [ADR-0045](adr/0045-recuperacion-de-la-cuenta.md) | [0.5.0-cuenta.html](bocetos/0.5.0-cuenta.html) |
| Servidor configurable | [artefacto](https://claude.ai/artifact/VxRomFzd5kgm2xNqo2RYFQ) | Servidor elegido al iniciar sesión, sus estados de conexión y TLS detrás de Caddy | 2026-11-17 | SEC-10 y SEC-07; [ADR-0046](adr/0046-despliegue-tls-y-servidor-configurable.md) | [0.5.0-servidor-configurable.html](bocetos/0.5.0-servidor-configurable.html) |
| Experiencia | [artefacto](https://claude.ai/artifact/PPjMkcqSFBwPGTEnbqdY3i) | Notificaciones, papelera y preferencias sincronizadas | 2026-11-17 | RED-W2, RED-W3, SYNC-09 y AUD-01c; [ADR-0048](adr/0048-notificaciones.md) | [0.5.0-experiencia.html](bocetos/0.5.0-experiencia.html) |
| Revisión de casos | [artefacto](https://claude.ai/artifact/FGhqBN21D6LXVNNkKQxXbW) | Flujo borrador → revisión → aprobado, y baselines de suite | 2026-11-17 | CAS-02; [ADR-0047](adr/0047-revision-de-casos-y-baselines.md) | [0.5.0-revision-de-casos.html](bocetos/0.5.0-revision-de-casos.html) |
| IA en la web | [artefacto](https://claude.ai/artifact/8Lea9J6eQNRWaw4K1KR7mk) | Usar en la web la clave de IA del escritorio, guardada en una bóveda cifrada | 2026-11-17 | IA-12; [ADR-0034](adr/0034-boveda-de-claves-ia-para-la-web.md) | [0.5.0-ia-en-la-web.html](bocetos/0.5.0-ia-en-la-web.html) |
| Flujo del plan y aprobación independiente | [artefacto](https://claude.ai/artifact/5NVbxjauhc7S56uVjLwGGj) | Estado del plan con acciones y política «Aprobación independiente» por workspace, que también siguen los casos | 2026-11-18 | PLN-08 | [0.5.0-flujo-del-plan.html](bocetos/0.5.0-flujo-del-plan.html) |
| Administrador del servidor | [artefacto](https://claude.ai/artifact/G3o3QCHMQNNGnuz5fPzYBf) | Administración › Usuarios, nombrar administradores y restablecer una contraseña con un enlace de un solo uso | 2026-11-18 | SEC-11 y SEC-09; [ADR-0045](adr/0045-recuperacion-de-la-cuenta.md) | [0.5.0-administrador-del-servidor.html](bocetos/0.5.0-administrador-del-servidor.html) |

## Bocetos de 0.6.0 «Núcleo y automatización conectada»

| Nombre | Enlace | Para qué sirve | Fecha | Ítems y ADR | Copia |
| --- | --- | --- | --- | --- | --- |
| Núcleo: conversión de datos | Sin artefacto: la pista lo hizo como fichero | Pasar la base local a SQLite en disco cifrado por página, con copia previa y su verificación | 2026-11-18 | CORE-01, SEC-04 y SEC-05; [ADR-0050](adr/0050-pharos-core-y-sqlite-en-disco-cifrado.md) | [0.6.0-nucleo.html](bocetos/0.6.0-nucleo.html) |
| Sync y cuentas | [artefacto](https://claude.ai/artifact/JFFkop4gPEK16QsisJURkJ) | Fusión por campo, compactación del oplog, lápidas de revisiones y desactivar cuentas | 2026-11-18 | SYNC-02, SYNC-10, SYNC-11 y SEC-12; [ADR-0051](adr/0051-fusion-por-campo-oplog-y-lapidas-de-revisiones.md) | [0.6.0-sync-y-cuentas.html](bocetos/0.6.0-sync-y-cuentas.html) |
| API: tokens y webhooks | [artefacto](https://claude.ai/artifact/T2kY2vPmJdc8YvRGRAnmis) | API v1 con tokens por proyecto y personales, y webhooks firmados | 2026-11-18 | INT-02 e INT-03; [ADR-0052](adr/0052-api-v1-tokens-y-webhooks.md) | [0.6.0-api.html](bocetos/0.6.0-api.html) |
| Hallazgos, métricas y formatos | [artefacto](https://claude.ai/artifact/UdgokqmtDyT7iUWCP3sHWC) | Hallazgos y métricas importados (SARIF, axe y k6), su triaje y el paquete de formatos | 2026-11-18 | ING-06 e ING-07; [ADR-0053](adr/0053-hallazgos-metricas-y-paquete-de-formatos.md); copia de la pista: [f-formatos-bocetos.html](design/f-formatos-bocetos.html) | [0.6.0-formatos.html](bocetos/0.6.0-formatos.html) |
| CLI y GitHub Actions | [artefacto](https://claude.ai/artifact/VfgNzL4nDDH9oUGVieuAef) | El CLI `pharos` (local y remoto), plantillas de GitHub Actions y «Conectar CI» | 2026-11-19 | INT-01 e INT-04; [ADR-0054](adr/0054-cli-y-plantillas-de-github-actions.md); copia de la pista: [l-int01-bocetos.html](design/l-int01-bocetos.html) | [0.6.0-cli-y-github-actions.html](bocetos/0.6.0-cli-y-github-actions.html) |
| Pasos compartidos y datasets | [artefacto](https://claude.ai/artifact/4r43GgYrREyp8cuGuB63sT) | Biblioteca de pasos compartidos, parámetros y datasets | 2026-11-19 | CAS-01; [ADR-0055](adr/0055-pasos-compartidos-parametros-y-datasets.md); copia de la pista: [p-cas01-bocetos.html](design/p-cas01-bocetos.html) | [0.6.0-pasos-compartidos.html](bocetos/0.6.0-pasos-compartidos.html) |

## Anteriores

| Nombre | Enlace | Para qué sirve | Fecha | Ítems y ADR | Copia |
| --- | --- | --- | --- | --- | --- |
| Pharos Design System | [artefacto](https://claude.ai/artifact/5wDkFELbM3YbRJqygzKSj5) | Sistema de diseño del rediseño: tokens, componentes y prototipos | 2026-11-13 | [ADR-0028](adr/0028-rediseno-de-la-interfaz.md) | Sin copia, por dos motivos: es un artefacto de tipo «Design System», cuya app es código del propio tipo y no de Pharos, e incluye capturas subidas. Su contenido de Pharos (tokens, componentes y prototipos) ya está en [`docs/rediseno/`](rediseno/) |
| Línea base (7 nov) | [artefacto](https://claude.ai/artifact/3b637XfK3CNMC1JTxgxdm7) | Auditoría inicial del 28 de octubre y avance al 7 de noviembre, con 0.2.0 publicada | 2026-11-07 | ROADMAP §2 (anterior) | [linea-base-2026-11-07.html](bocetos/linea-base-2026-11-07.html) |
| Riesgos legibles | [artefacto](https://claude.ai/artifact/W1i3fuuxm6ympuJPJ2w1xi) | Paso 15 del plan, riesgos y mitigación: que cada texto se lea entero | 2026-11-07 | Plan de pruebas, paso 15 | [riesgos-legibles/](bocetos/riesgos-legibles/index.html), con su imagen |
| Inventario de interfaz | [artefacto](https://claude.ai/artifact/KcQ3hxkUvPsEtKovstd88k) | Lo que Pharos tenía en pantalla, pieza por pieza, con términos para buscar referencias de diseño | 2026-10-29 | Rediseño ([ADR-0028](adr/0028-rediseno-de-la-interfaz.md)) | [inventario-de-interfaz.html](bocetos/inventario-de-interfaz.html) |

## Mantenimiento

- **Artefacto nuevo:** se añade a este índice y se copia en `docs/bocetos/` en el mismo PR que lo usa.
- **Copia:** se lee con `Artifact` `read` y `path: "index.html"`. Si el artefacto tiene ficheros propios (CSS, JS o imágenes), van en una subcarpeta con su `index.html`.
- **Revisión antes de añadirla:** no puede contener secretos, claves, tokens ni correos reales. Solo se admiten la cuenta de prueba `liomar.qa@pharos.test` y los dominios `.test`.
- **Responsable:** la sesión de línea base mantiene el índice al día.
