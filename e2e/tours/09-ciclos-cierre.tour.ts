// Chapter 9 — Ciclos de prueba, second part: closing the cycle «Regresión
// 0.6.0» once it has run. It runs after chapters 10 to 13 (the report imported
// into the cycle, the manual run, the defects) and its steps print at the end
// of chapter 9, numbered after the first part's (manifest `partOf`). Nobody
// closes a cycle before executing it: the status report, the quality gate and
// the closure report read real results here.
import { $, browser, expect } from "@wdio/globals";
import { chapter, step } from "./tour";
import { PROJECT_A, es, openProject, openSection, waitForText, waitForToast } from "./helpers";
import { CYCLE } from "./data/pharos";
import { closeCycleGate } from "./prepare";

const D = '[role="dialog"]';

chapter("ciclos-cierre", () => {
  step("ciclo-ejecutado", {
    title: "El ciclo, ejecutado",
    caption:
      "Cuando la ronda termina, el ciclo reúne lo que se registró en sus runs: aquí, los resultados de Chrome y de Edge, ejecutados como en el capítulo 11, y el informe de la automatización importado en el ciclo en el capítulo 10. La pestaña «Elementos» muestra el resultado de cada caso en cada configuración y el resumen de arriba los cuenta: PH-001 falla en las dos configuraciones (su defecto crítico se registró en el capítulo 12) y PH-002 pasa. Con estos resultados, Liomar prepara el cierre.",
    run: async () => {
      await openProject(PROJECT_A.name);
      await openSection("cycles");
      await $("button.cy-key").waitForDisplayed();
      await $(`button.cy-key=${await keyOf(CYCLE.title)}`).click();
      await expect($("#cy-detail-title")).toBeDisplayed();
      await expect($('[data-testid="cycle-close"]')).toBeDisplayed();
    },
  });

  step("informe-ciclo", {
    title: "Informe de estado de un ciclo",
    caption:
      "«Informe de estado» en la cabecera del ciclo abre el informe con el alcance ya puesto en ese ciclo: el progreso cuenta cada caso en cada configuración, como la pestaña «Elementos». Aquí, las 4 celdas del ciclo están ejecutadas (100 %) con una tasa de éxito del 50 %, y «Ejecuciones incluidas» nombra los dos runs del ciclo y el importado. Más abajo siguen los defectos, la cobertura, los criterios de salida y el resumen: es lo que Liomar envía antes de decidir el cierre. El informe completo, con sus exportaciones a Excel y PDF, se explica en el capítulo 11.",
    covers: ["action:cycle-report"],
    shot: { element: D },
    run: async () => {
      await $('[data-testid="cycle-report"]').click();
      await expect($('[data-testid="status-report"]')).toBeDisplayed();
      await waitForText(es.statusReport.section.identification);
    },
  });

  step("cerrar-ciclo", {
    title: "Cerrar el ciclo: el quality gate",
    caption:
      "Un ciclo se cierra con «Cerrar ciclo…», nunca desde «Editar». Pharos evalúa los criterios de salida del plan sobre los resultados del ciclo. Cada criterio obligatorio que no se cumple, o que no tiene datos, pide una justificación de al menos 20 caracteres: por qué se acepta el riesgo o por qué no, quién lo asume y cuándo se resuelve. Los criterios que Pharos no mide solo (aquí, «Casos críticos ejecutados» y «Satisfacción del producto en la demo») se marcan a mano con «Cumple» o «No cumple», y los orientativos solo informan. En este ejemplo se ejecutó todo, pero hay un defecto crítico abierto y la cobertura de requisitos no llega al objetivo: Liomar justifica cada uno y elige «No-go», porque con el acceso roto la versión no puede salir; «Go con riesgos» la dejaría salir con los riesgos justificados. Al pie se ve quién firma y cuándo: queda en Auditoría. Cerrar un ciclo también avisa en las notificaciones del equipo y a los webhooks del proyecto (capítulo 20).",
    covers: ["dialogs:src/modules/runs/gate/CloseCycleDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await browser.keys("Escape");
      await $(".cd-overlay").waitForExist({ reverse: true });
      await closeCycleGate();
      const verdict = $(`[data-testid="gate-verdict-${CYCLE.gate.verdict}"]`);
      const radio = (await verdict.$("input").isExisting()) ? verdict.$("input") : verdict;
      await expect(radio).toBeSelected();
    },
  });

  step("cierre-sin-guardar", {
    title: "Salir del cierre sin cerrar",
    caption:
      "Si sales con Esc o «Cancelar» después de escribir una justificación o marcar un criterio, Pharos pregunta antes de descartarlo: «Seguir editando» vuelve al cierre tal como estaba.",
    covers: ["dialogs:src/modules/runs/gate/CloseCycleDialog.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await browser.keys("Escape");
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
    after: async () => {
      await $('[role="alertdialog"]').$(`button=${es.dialog.unsaved.keep}`).click();
      await expect($('[role="alertdialog"]')).not.toBeExisting();
      await expect($('[data-testid="gate-banner"]')).toBeDisplayed();
    },
  });

  step("ciclo-cerrado", {
    title: "El veredicto del ciclo",
    caption:
      "«Cerrar ciclo» guarda la decisión con las cifras de ese momento, congeladas: el ciclo queda «Cerrado», con su veredicto al lado («No-go»), y ya no admite casos ni ejecuciones hasta que lo reabras desde «Editar». Su informe de estado empieza ahora por «Decisión de salida», con cada criterio, su justificación y las métricas frente al ciclo anterior, también en Excel y PDF. Inicio lo suma a «Tendencia de ciclos» (capítulo 3). Para repetir la regresión con la build corregida, «Clonar» prepara un ciclo nuevo con los mismos casos.",
    covers: ["action:cycle-verdict"],
    run: async () => {
      await $('[data-testid="gate-close"]').click();
      await waitForToast(es.gate.closedToast.split("{{")[0].trim());
      await expect($('[data-testid="cycle-verdict"]')).toBeDisplayed();
    },
  });

  step("informe-cierre", {
    title: "El informe de cierre",
    caption:
      "En un ciclo cerrado, «Cerrar ciclo…» deja paso a «Informe de cierre»: el informe final de la ronda según ISO/IEC/IEEE 29119-3, con su ID (TCR-…). Pharos rellena lo que sabe del cierre: las desviaciones respecto al plan (fecha de fin, casos sin ejecutar, criterios que no se cumplen), la «Decisión de salida» con sus justificaciones, lo que bloqueó el avance, las métricas frente al ciclo anterior y al objetivo del plan, los riesgos residuales (paso siguiente), los entregables y los activos reutilizables. Tú escribes el resumen, las lecciones aprendidas y los comentarios de cada apartado, marcas los entregables del plan y pulsas «Guardar»: queda en el ciclo, se sincroniza y sale en Excel y PDF.",
    covers: ["dialogs:src/modules/runs/report/completion/CompletionReportDialog.tsx"],
    shot: { element: D },
    run: async () => {
      await $('[data-testid="cycle-completion-report"]').click();
      await expect($('[data-testid="completion-report"]')).toBeDisplayed();
      await waitForText(es.completionReport.section.deviations);
      await $('[data-testid="completion-lessons"]').setValue(CYCLE.gate.lessons);
      await $('[data-testid="completion-save"]').click();
      await waitForToast(es.completionReport.savedToast);
      // The capture starts at the report's title and ID.
      await $(`${D} .cd__title`).scrollIntoView({ block: "start" });
    },
  });

  step("riesgos-residuales", {
    title: "Los riesgos residuales",
    caption:
      "Más abajo, «Riesgos residuales» dice lo que queda pendiente al cerrar: los defectos del ciclo que siguen abiertos (aquí, el crítico del acceso, registrado desde PH-001 en el capítulo 12) y los requisitos sin cubrir o sin pasar, del riesgo más alto al más bajo: REQ-005, de riesgo alto, sin cubrir, y REQ-001, que falla. Si los runs del ciclo trajeran hallazgos abiertos o umbrales de rendimiento incumplidos (capítulo 10), también saldrían aquí. Es la lista con la que se planifica la siguiente ronda.",
    covers: ["dialogs:src/modules/runs/report/completion/CompletionReportDialog.tsx"],
    shot: { element: D },
    run: async () => {
      const heading = $('[data-testid="completion-report"]').$(`h4*=${es.completionReport.section.risks}`);
      await heading.scrollIntoView({ block: "start" });
    },
  });

  step("aprobar-informe-cierre", {
    title: "Aprobar el informe de cierre",
    caption:
      "Con todo guardado, «Aprobar informe» pide confirmación y deja tu nombre y la fecha en el apartado «Aprobación», en la cabecera del PDF y en el Excel. Si después cambias un texto, el informe pierde la aprobación al guardar. Si reabres el ciclo y lo vuelves a cerrar, el informe sigue al cierre nuevo: conserva los textos, pero hay que aprobarlo otra vez.",
    covers: ["dialogs:src/modules/runs/report/completion/CompletionReportDialog.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await $('[data-testid="completion-approve"]').click();
      await expect($('[data-testid="completion-approve-confirm"]')).toBeDisplayed();
    },
    after: async () => {
      await $('[data-testid="completion-approve-confirm"]').click();
      await waitForToast(es.completionReport.approvedToast);
      await browser.keys("Escape");
      await $(".cd-overlay").waitForExist({ reverse: true });
    },
  });
});

/** The key of a cycle in the list, by its title. */
async function keyOf(title: string): Promise<string> {
  const row = $(`//tr[.//*[contains(normalize-space(.), "${title}")]]//button[contains(@class,"cy-key")]`);
  await row.waitForDisplayed();
  return row.getText();
}
