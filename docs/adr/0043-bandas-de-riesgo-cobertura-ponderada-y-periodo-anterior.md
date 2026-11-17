# ADR-0043 · Bandas de riesgo por proyecto, cobertura ponderada y comparación con el periodo anterior

- **Estado:** Aceptado. El usuario aprobó el plan, los bocetos y las decisiones
  D1–D5 el 2026-11-12 («Sí, apruebo todo»), dentro de TRZ-04 y RED-W4, hito
  0.4.0 «Estrategia medible».
- **Contexto:**
  - TRZ-04 dejó hechos en 0.2.0 los factores de riesgo ISTQB por requisito
    (probabilidad × impacto, [ADR-0013](0013-campos-del-run.md)), la banda en
    la matriz, el orden por riesgo y la cobertura por banda en el informe.
    Las bandas eran fijas (≤ 4 bajo, ≤ 12 medio, > 12 alto) y repetidas en
    tres sitios: `runs::derive::DEFAULT_RISK_BANDS`, el gemelo del servidor y
    `matrix.ts`. Faltaban las bandas por proyecto y la cobertura ponderada.
  - En Inicio, el periodo (RED-W6) filtraba la tasa de éxito y las
    ejecuciones diarias, pero no había con qué compararlas: «Comparar con el
    periodo anterior» estaba dibujado y desactivado. La petición de Inicio
    (contrato v1) solo tenía ventanas que acaban «ahora».
  - La pizarra de Inicio no puede tener desplazamiento de página (UX-27/28,
    [ADR-0038](0038-pizarra-de-inicio-y-preferencias-de-cuenta.md)).
- **Decisión:**
  - **D1 · Peso = nivel de riesgo.** La cobertura ponderada es
    Σ nivel de los requisitos evaluados cubiertos / Σ nivel de los evaluados;
    la «aprobada» usa los requisitos con todos sus casos vivos ejecutados y en
    Pasa (la misma regla que `passed` por banda). Un requisito sin los dos
    factores queda fuera y se cuenta aparte (`unassessed`). Sin requisitos
    evaluados, las dos son `null` («—»). La derivación compartida la calcula
    (`CoverageSummary.weighted`: `totalWeight`, `coveredWeight`,
    `passedWeight`, `coverageRatio`, `passedRatio`, `unassessed`), así
    Trazabilidad y el informe leen la misma cifra con los mismos filtros.
  - **D2 · Bandas = dos umbrales por proyecto.** `projects.risk_band_low` y
    `risk_band_medium` (migración local 0039, por defecto 4 y 12). Un par es
    válido con `1 ≤ bajo < medio ≤ 24`, para que cada banda tenga al menos un
    nivel; Rust (`RiskBands::checked`), el servidor (`checkedBands` y el
    esquema zod) y el cliente (`@shared/risk/bands`) aplican la misma regla y
    rechazan un par incompleto o inválido. En la web van en el documento del
    proyecto (`riskBandLow`, `riskBandMedium`), sin migración de servidor; un
    documento sin ellos (un Pharos anterior) conserva los valores locales, y
    uno sin bandas válidas se lee con las de por defecto. La derivación las
    recibe en `ProjectData.riskBands` y devuelve las que usó en
    `CoverageSummary.riskBands`, que es de donde las leen la matriz, el
    formulario del requisito y el informe. «Copiar ajustes de…» las copia.
  - **D3 · La comparación, solo donde depende del periodo.** «Comparar con el
    periodo anterior» enfrenta el periodo con otro de la misma duración que
    acaba justo antes (ayer para «Hoy»; para «Este mes», los N días antes del
    día 1). Lleva diferencia la «Tasa de éxito» (en puntos porcentuales, un
    decimal, verde si sube y rojo si baja) y «Ejecuciones diarias» (el total
    en %, en tono neutro, una línea gris de puntos con el total de cada día
    anterior emparejado por posición y una columna «Anterior»). Proyectos,
    pendientes, defectos, ejecución por proyecto y la tendencia de ciclos son
    el estado de ahora o van por ciclo, y no cambian. La diferencia va en la
    fila del número, así ningún gadget crece. Sin valor anterior se dice «sin
    datos antes», nunca «▲ ∞». El interruptor es un `menuitemcheckbox` que no
    cierra el menú y se recuerda en el equipo, como el periodo.
  - **D4 · Ventana con fin opcional.** `HomeWindow.toIndex` (opcional,
    exclusivo): la ventana acaba antes de `dayStarts[toIndex]` en lugar de en
    `now`; más allá del último día acaba en `now` y, si no es mayor que
    `fromIndex`, la ventana se omite. Las entradas (`home_metrics` y
    `GET /api/home/metrics`, que la escribe `id:desde:hasta`) rechazan un
    `toIndex` que no queda en `(fromIndex, len]`. Es aditivo: la versión del
    contrato sigue en 1. El cliente pide el doble de días (hasta 62, el
    límite es 400) y una ventana `prev-<periodo>` por periodo, así cambiar de
    periodo o encender la comparación no vuelve a pedir nada; las ejecuciones
    diarias del periodo anterior salen de los mismos cubos diarios.
  - **D5 · Barras por banda en Trazabilidad.** Bajo los indicadores, una barra
    fina por banda (alto, medio, bajo, sin evaluar) con cubiertos / total, de
    la misma derivación.
- **Alternativas descartadas:**
  - Peso por banda (1-2-3) en lugar del nivel: más grueso, y cambiaría de
    golpe al mover un umbral.
  - Contar los requisitos sin evaluar con peso 1: mezclaría «no sé» con
    «riesgo mínimo» y bajaría la cifra sin motivo.
  - Una lista de bandas libre (más de tres): el resto de Pharos (orden,
    filtros, informe) trabaja con alto / medio / bajo.
  - Calcular la ventana anterior en el cliente con los cubos diarios: la tasa
    de éxito necesita el último final por caso dentro de la ventana, que solo
    sabe la derivación.
  - Diferencias en todas las tarjetas: las que son el estado de ahora no
    tienen un «antes» en el periodo, y una flecha ahí engañaría.
- **Consecuencias:**
  - Las bandas dejan de estar repetidas: hay una regla y tres
    implementaciones gemelas comprobadas por los vectores compartidos
    (`execution-vectors.json`: bandas propias, bandas inválidas y ventana con
    `toIndex`).
  - El informe de estado añade, en su apartado de cobertura por riesgo, la
    línea de bandas del proyecto y la de cobertura ponderada (y dos filas en
    el .xlsx). El informe de cierre (DOC-01) puede leer las mismas cifras de
    `CoverageSummary`.
  - La petición de Inicio pesa el doble de días; la derivación sigue siendo
    una sola lectura.
