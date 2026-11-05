# Módulo `traceability` — «Trazabilidad»

Requisitos de un proyecto (TRZ-01) y la matriz requisito ↔ caso ↔ último
resultado ↔ defecto (TRZ-02, ampliada por EJE-04 en el paso 10).

## Pantallas

| Vista | Componente | Qué hace |
| --- | --- | --- |
| «Requisitos» | `RequirementsPanel` | Lista con prioridad y casos que cubren cada requisito; nuevo, editar (con su riesgo), eliminar, generar casos con IA |
| «Matriz» | `MatrixView` | Los cuatro indicadores, la matriz de 9 columnas del SPEC (§8), «Mostrar solo huecos», tarjetas en móvil y los huecos de la cadena |
| Diálogos | `RequirementFormModal`, `RequirementImportModal`, `GenerateCasesModal`, `MigrateTraceabilityModal` | Requisito (con riesgo), importar CSV, IA, migrar referencias escritas a mano |

`TraceabilityPage` carga una vez requisitos, casos y defectos para las dos
vistas, y desde EJE-04 también el resumen de ejecución (`executionApi.summary`
de `@modules/runs`) con los filtros de la dirección de la página
(`?cycle=&configuration=&build=&environment=&sort=key`), más los ciclos y
configuraciones de `@modules/cycles` para los filtros.

## Modelo

- `buildMatrix(requirements, cases, defects, execution?, sort = "risk")`
  (`model/matrix.ts`) es la única fuente de la vista, del `.xlsx` y de
  `projectCoverage`. Sin `execution`, cada caso es «No ejecutado» (como antes de
  0.2.0). Con él, cada fila trae el estado del caso (`passed`, `failed`,
  `retest`, `blocked`, `skipped`, `other` o `not_run`), su último resultado
  (`last`: run, fecha, origen, flaky, desactualizado), el riesgo del requisito
  (`riskLevel`, `riskBand`) y las notas `retest`, `flaky` y `stale`. Las reglas
  del último resultado son las de la derivación (ADR-0013, «Implementación,
  paso 10»).
- **Orden:** por riesgo (banda alta primero, luego nivel, sin evaluar al final)
  o por ID. Bandas por defecto: hasta 4 bajo, hasta 12 medio, más alto.
- **Cobertura:** un requisito está cubierto si tiene al menos un caso vivo no
  obsoleto (sin cambios desde TRZ-02); es la cobertura del criterio de salida.
- Los defectos de una fila: los que alcanzan el caso (directamente o por un
  resultado), abiertos primero, con su severidad.

## Exportación

`export/matrixXlsx.ts` rellena la plantilla real
(`docs/referencias/PHAROS_Matriz_Trazabilidad_*.xlsx`): la hoja «Matriz» usa
las palabras de sus desplegables (re-test → Falla; omitido y otro → No
ejecutado, con el estado real en Comentarios). La hoja nueva «Resultados»
trae, por cada caso, el riesgo, el estado real, el run, la fecha, la
configuración, el origen, flaky, desactualizado y los defectos con severidad,
con los filtros activos arriba.

## Riesgo del requisito (TRZ-04, parcial)

El formulario pide Probabilidad e Impacto (1–5, o «Sin evaluar»). En el
escritorio se guardan con `requirement_risk_set` después de crear o editar; en
la web van como claves opcionales (`riskLikelihood`, `riskImpact`: si faltan
se conservan, `null` las borra). Las bandas por proyecto y la cobertura
ponderada siguen en TRZ-04.

## `data-testid` estables (recorridos de MAN-01)

| testid | Dónde |
| --- | --- |
| `trace-filter-cycle`, `trace-filter-configuration`, `trace-filter-build`, `trace-filter-environment` | Filtros de resultados de la matriz |
| `trace-sort`, `trace-filters-clear` | Orden de la matriz y «Quitar filtros» |
| `trace-result-<ID del caso>`, `trace-run-link` | Celda «Estado de prueba» y enlace al run |
| `requirement-risk-likelihood`, `requirement-risk-impact` | Riesgo en el formulario del requisito |

Sin diseño en `docs/rediseno/` para los filtros, el último resultado y el
riesgo: selects nativos y las pastillas compartidas (`StatusPill`).
