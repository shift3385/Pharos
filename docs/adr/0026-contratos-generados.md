# ADR-0026 · Contratos TS ↔ Rust ↔ servidor generados con `ts-rs`

- **Estado:** Aceptado (plan de la pista W1 aprobado por el usuario el 2026-10-29;
  BASE-05)
- **Contexto:** los tipos que cruzan la frontera Tauri (`project_list`,
  `test_case_create`…) y el cable de sync (`Delta`, `RemoteDoc`, conflictos) se
  escribían tres veces: en Rust, en los `model/types.ts` del cliente y en los
  esquemas zod del servidor. Nada avisaba si uno cambiaba: un campo renombrado
  en Rust solo se notaba al usarlo. Con la web como cliente del servidor
  (ADR-0004, BASE-10) el servidor también escribe documentos que el escritorio
  lee, así que la forma de esos documentos es un contrato más. BASE-05 pide
  que la CI falle si un tipo generado difiere del commiteado.
- **Decisión:**
  - **`ts-rs` 12 (MIT)** genera un `.ts` por tipo Rust exportado en
    `src/shared/contracts/generated/`.
    - Las derivaciones son **solo de test**: `#[cfg_attr(test, derive(TS),
      ts(export))]` y `ts-rs` como `dev-dependency`. El binario no lleva
      `ts-rs`, y `cargo test` escribe los archivos.
    - La configuración vive en `src-tauri/.cargo/config.toml`: la carpeta de
      salida y `TS_RS_LARGE_INT = "number"` (un `i64` es `number`, no
      `bigint`: todo entero que manda la app cabe en 2^53).
    - Las entradas (`*Input`, `RemoteDoc`…) usan `optional_fields`: un
      `Option<T>` es `campo?: T`, como lo manda el cliente.
    - Los campos `serde_json::Value` (`data`, `payload`) se exportan como
      `unknown`: su forma es del modelo TS (`TestCaseData`…).
    - Los dos `RevisionSummary` se exportan como `TestCaseRevisionSummary` y
      `TestPlanRevisionSummary`.
  - **El TS a mano se comprueba contra el generado, no se sustituye.** Los
    modelos TS son más estrechos que Rust (uniones como `CardStatus` donde Rust
    tiene `String`, `data` tipado). `src/shared/contracts/` define
    `Covers<Productor, Consumidor>`: cada campo obligatorio del consumidor
    existe en el productor y sus tipos son compatibles (uno cabe en el otro).
    Cada `model/types.ts` lo afirma en tiempo de compilación: Rust cubre lo que
    lee la UI, y la UI cubre lo que lee Rust. El servidor afirma lo mismo para
    `Delta`, `RemoteDoc` y las entradas de su API de dominio. `tsc` (en
    `npm run verify` y en el `typecheck` del servidor) falla si dejan de casar.
  - **Fixtures de sync compartidas** en
    `src/shared/contracts/fixtures/sync/`:
    - `hlc.json`: codificación, cadenas inválidas, orden, `tick` y `recv`. Los
      tests de `hlc.rs`, `sync.hlc.ts` (servidor) y `hlc.ts` (cliente) dan las
      mismas respuestas.
    - `documents.json`: un documento por entidad sincronizada, tal como lo
      empuja el escritorio. El escritorio lo guarda y lo vuelve a leer igual
      (`sync.rs`); la API de dominio del servidor escribe payloads con los
      mismos campos y tipos.
  - **Comprobación de deriva en el job `rust`** (obligatorio), sin check
    nuevo: `node scripts/contracts.mjs clean` antes de `cargo test` y
    `node scripts/contracts.mjs check` después. Falla si hay un archivo nuevo,
    distinto o que ya no corresponde a ningún tipo. En local:
    `npm run contracts` regenera y `npm run check:contracts` comprueba.
- **Alternativas:**
  - **`specta` + `tauri-specta`:** también genera los comandos tipados, pero
    las dos siguen en versiones candidatas (`2.0.0-rc`) y `tauri-specta` ata
    la versión de `tauri`. Se descarta por ahora; los tipos de `ts-rs` le
    servirían de base.
  - **Sustituir los modelos TS por los generados:** perderíamos las uniones y
    el `data` tipado, o habría que llenar Rust de enums solo para TS.
  - **Generar zod desde Rust para el servidor:** otra herramienta y otro
    formato; los esquemas a mano más la comprobación de tipos bastan.
- **Consecuencias:**
  - Cambiar un tipo Rust exportado exige `npm run contracts` y commitear
    `src/shared/contracts/generated/`; si no, la CI falla en el job `rust`.
  - Un campo que Rust deja de enviar y la UI lee, o que la UI deja de enviar y
    Rust necesita, rompe `tsc`.
  - `ts-rs` y sus dependencias pasan por `cargo deny` (licencias MIT/Apache).
  - Las uniones estrechas del TS no se comprueban contra Rust (Rust tiene
    `String`); si hace falta, el siguiente paso es un enum Rust.
