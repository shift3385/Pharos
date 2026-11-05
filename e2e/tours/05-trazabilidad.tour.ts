// Chapter 5 — Trazabilidad y requisitos: requirements (new, edit, CSV import,
// delete), linking them to cases, the matrix, its gaps, migrating free-text
// references to links and exporting the matrix.
import { join } from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { chapter, step } from "./tour";
import {
  PROJECT_A,
  acceptNativeDialog,
  chooseFile,
  clickButton,
  dialog,
  es,
  field,
  fixturesDir,
  menuItem,
  openProject,
  openSection,
  pickFromMenu,
  selectOption,
  tf,
  waitForText,
} from "./helpers";

const T = es.traceability;
const C = es.testCase;

async function openCase(titleStart: string) {
  await openSection("cases");
  await $(`a.cl-title*=${titleStart}`).click();
  await expect($("#tc-title")).toBeDisplayed();
}

async function linkRequirement(key: string) {
  const select = $(`select[aria-label="${C.requirements.add}"]`);
  await select.scrollIntoView();
  await select.selectByAttribute("value", key);
  await expect($(`[aria-label="${tf("testCase.requirements.remove", { key })}"]`)).toBeDisplayed();
}

async function saveCase() {
  await clickButton(C.save, ".tc-nav");
  await waitForText(C.savedToast);
}

chapter("trazabilidad", () => {
  step("vacio", {
    title: "Trazabilidad, sin requisitos",
    caption: "Pulsa «Trazabilidad» en el menú lateral y elige la vista «Requisitos». Arriba, «Importar / Exportar» y «Nuevo requisito»; sin requisitos, la lista lo indica.",
    covers: ["section:traceability", "state:requirements-empty"],
    run: async () => {
      await openProject(PROJECT_A.name);
      await openSection("traceability");
      await $(`button.chips__chip*=${T.view.requirements}`).click();
      await waitForText(T.requirement.empty);
    },
  });

  step("nuevo-requisito", {
    title: "Nuevo requisito",
    caption: "«Nuevo requisito» pide título, descripción y prioridad. Si dejas vacío el ID, Pharos lo numera solo (REQ-001…); una vez creado, no cambia.",
    covers: ["dialogs:src/modules/traceability/ui/RequirementFormModal.tsx"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      await clickButton(T.requirement.new);
      await expect(dialog()).toBeDisplayed();
      await (await field(T.requirement.title, '[role="dialog"]')).setValue("Transferencias a terceros");
      await (await field(T.requirement.description, '[role="dialog"]')).setValue(
        "El cliente transfiere a un beneficiario guardado con confirmación por SMS.",
      );
      await selectOption(T.requirement.priority, T.priorityLabel.high, '[role="dialog"]');
    },
  });

  step("importar-csv", {
    title: "Importar requisitos desde CSV",
    caption: "«Importar / Exportar → Importar requisitos (.csv)» acepta un CSV con coma o punto y coma (como lo guarda Excel en español). La vista previa muestra las columnas detectadas y qué se creará o actualizará.",
    covers: ["upload:src/modules/traceability/ui/TraceabilityPage.tsx", "dialogs:src/modules/traceability/ui/RequirementImportModal.tsx"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      await clickButton(T.requirement.save, '[role="dialog"]');
      await waitForText(T.requirement.savedToast);
      await clickButton(T.io.label);
      await expect(menuItem(T.io.importCsv)).toBeDisplayed();
      await browser.keys("Escape");
      await chooseFile('input[type="file"][accept=".csv,text/csv"]', join(fixturesDir, "requisitos.csv"));
      await expect(dialog()).toBeDisplayed();
      await expect(dialog()).toHaveText(expect.stringContaining("REQ-005"));
    },
  });

  step("requisitos", {
    title: "La lista de requisitos",
    caption: "«Importar 4» los añade: cada requisito con su ID, prioridad y cuántos casos lo cubren. Desde cada fila, editarlo, generar casos con IA o eliminarlo.",
    toast: true,
    run: async () => {
      await clickButton(tf("traceability.import.confirm", { count: 4 }), '[role="dialog"]');
      await waitForText(tf("traceability.import.doneToast", { created: 4, updated: 0 }));
    },
  });

  step("editar-requisito", {
    title: "Editar un requisito",
    caption: "Haz clic en el título para editarlo; el ID queda fijo. «Guardar» confirma con «Requisito guardado».",
    covers: ["action:requirement-edit"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      await $(`button.tz-open*=Extracto mensual`).click();
      await expect(dialog()).toBeDisplayed();
      await (await field(T.requirement.description, '[role="dialog"]')).addValue(" Disponible desde el día 1.");
    },
  });

  step("riesgo-requisito", {
    title: "El riesgo de un requisito",
    caption: "En el mismo diálogo, «Riesgo» pide la probabilidad y el impacto, de 1 a 5 cada uno. Su producto es el nivel de riesgo, que ordena la matriz: hasta 4 es bajo, hasta 12 medio y por encima alto.",
    covers: ["action:requirement-risk"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      const likelihood = $('[data-testid="requirement-risk-likelihood"]');
      await likelihood.scrollIntoView();
      await likelihood.selectByAttribute("value", "4");
      await $('[data-testid="requirement-risk-impact"]').selectByAttribute("value", "5");
    },
  });

  step("requisito-descartar", {
    title: "Cerrar un requisito sin guardar",
    caption: "Cerrar el diálogo con cambios sin guardar pide confirmación; «Aceptar» los descarta.",
    covers: ["dialogs:src/modules/traceability/ui/RequirementFormModal.tsx"],
    shot: false,
    run: async () => {
      await clickButton(T.requirement.save, '[role="dialog"]');
      await waitForText(T.requirement.savedToast);
      await $(`button.tz-open*=Extracto mensual`).click();
      await (await field(T.requirement.title, '[role="dialog"]')).addValue(" (borrador)");
      await clickButton(es.common.cancel, '[role="dialog"]');
      await acceptNativeDialog();
      await expect($('[role="dialog"]')).not.toBeExisting();
    },
  });

  step("vincular", {
    title: "Vincular casos a requisitos",
    caption: "En el editor del caso, «Vincular un requisito…» añade el requisito; el caso lleva su tag (@REQ-001) en el Gherkin y la matriz lo cuenta como cubierto.",
    covers: ["action:case-requirement-link"],
    run: async () => {
      await openCase("Pago con QR de");
      await linkRequirement("REQ-002");
      await saveCase();
      await openCase("Transferencia");
      await linkRequirement("REQ-001");
      // A reference written by hand, which «Migrar trazabilidad» turns into a link.
      await (await field(C.otherReferences)).setValue("Relacionado con REQ-003");
      await saveCase();
    },
  });

  step("matriz", {
    title: "La matriz de trazabilidad",
    caption: "«Matriz» muestra cada requisito con los casos que lo verifican, su estado de prueba y sus defectos, con la cobertura arriba (requisitos cubiertos y sin cubrir).",
    covers: ["screen:matrix"],
    run: async () => {
      await openSection("traceability");
      await $(`button.chips__chip*=${T.view.matrix}`).click();
      await waitForText(T.matrix.title);
    },
  });

  step("orden-filtros", {
    title: "Orden por riesgo y filtros de resultados",
    caption: "Sobre la matriz, los filtros de resultados (ciclo, configuración, build y entorno) y el orden. Por defecto, los requisitos de más riesgo van primero; «ID de requisito» vuelve al orden por clave. El estado de prueba es el último resultado final de las ejecuciones que cumplen los filtros (capítulo 13).",
    covers: ["action:matrix-sort"],
    run: async () => {
      const sort = $('[data-testid="trace-sort"]');
      await sort.scrollIntoView();
      await sort.selectByAttribute("value", "key");
      await sort.selectByAttribute("value", "risk");
      await expect($('[data-testid^="trace-result-"]')).toBeExisting();
    },
  });

  step("huecos", {
    title: "Solo los huecos",
    caption: "«Mostrar solo huecos» deja los requisitos sin ningún caso. Debajo, «Huecos de trazabilidad» lista casos sin requisito, vínculos a requisitos inexistentes y defectos sin caso.",
    covers: ["action:matrix-gaps"],
    run: async () => {
      await $(`label*=${T.matrix.onlyGaps}`).click();
      await expect($(`button[role="switch"][aria-checked="true"]`)).toBeExisting();
    },
  });

  step("migrar", {
    title: "Migrar referencias escritas a mano",
    caption: "Si un caso menciona un ID de requisito en su texto libre («Relacionado con REQ-003»), «Migrar trazabilidad» propone convertirlo en un vínculo real. Marca los que quieras y pulsa «Aplicar».",
    covers: ["dialogs:src/modules/traceability/ui/MigrateTraceabilityModal.tsx"],
    shot: { element: '[role="dialog"]' },
    run: async () => {
      await $(`label*=${T.matrix.onlyGaps}`).click();
      const migrate = $(`button*=${T.migrate.button.split(" (")[0]}`);
      await migrate.scrollIntoView();
      await migrate.click();
      await expect(dialog()).toBeDisplayed();
      await expect(dialog()).toHaveText(expect.stringContaining("REQ-003"));
    },
  });

  step("exportar-matriz", {
    title: "Exportar la matriz",
    caption: "«Importar / Exportar → Exportar matriz (.xlsx)» guarda requisitos, casos, estados y defectos en un libro de Excel.",
    covers: ["action:matrix-export"],
    shot: false,
    run: async () => {
      await clickButton(T.migrate.apply, '[role="dialog"]');
      await waitForText(T.migrate.doneToast.split(":")[0]);
      await $(".cd-overlay").waitForExist({ reverse: true });
      await pickFromMenu(T.io.label, T.io.exportXlsx);
      await waitForText(tf("traceability.matrix.exportedToast", { name: "" }).trim(), 30_000);
    },
  });

  step("eliminar-requisito", {
    title: "Eliminar un requisito",
    caption: "La papelera de la fila pide confirmación. El ID eliminado no se reutiliza: los casos que lo enlazaban lo muestran como vínculo a un requisito inexistente.",
    covers: ["dialogs:src/modules/traceability/ui/TraceabilityPage.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await $(`button.chips__chip*=${T.view.requirements}`).click();
      await $(`button[aria-label="${tf("traceability.requirement.delete", { key: "REQ-005" })}"]`).click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
  });

  step("eliminado", {
    title: "Requisito eliminado",
    caption: "Al confirmar aparece «REQ-005 eliminado».",
    shot: false,
    run: async () => {
      await clickButton(T.requirement.deleteConfirm, '[role="alertdialog"]');
      await waitForText(tf("traceability.requirement.deletedToast", { key: "REQ-005" }));
    },
  });
});
