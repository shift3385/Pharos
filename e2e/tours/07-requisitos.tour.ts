// Chapter 7 — Requisitos (manual v2, MAN-03; its own section since UX-21):
// the test basis of «Pharos». Empty list, a new requirement with its automatic
// ID, CSV import, the list, editing, the risk, closing without saving, the
// «Importar» menu with its AI entries, deleting and the list on a phone. It
// runs before chapter 8, whose cases link these requirements. The AI flows
// (generate cases, from a project, from designs) are toured in chapter 17.
import { join } from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { DESKTOP, MOBILE, chapter, setViewport, step } from "./tour";
import {
  PROJECT_A,
  acceptConfirm,
  chooseFile,
  clickButton,
  dialog,
  es,
  field,
  fixturesDir,
  menuItem,
  openProject,
  openSection,
  selectOption,
  tf,
  waitForText,
  waitForToast,
} from "./helpers";

const T = es.traceability;
const D = '[role="dialog"]';

chapter("requisitos", () => {
  step("vacio", {
    title: "Requisitos, sin requisitos todavía",
    caption:
      "Los requisitos son la base de prueba: lo que la aplicación debe hacer y, por tanto, lo que hay que comprobar. Por eso «Requisitos» va en el menú lateral justo antes de «Casos de prueba»: primero se sabe qué probar y después cómo. Arriba, «Importar» y «Nuevo requisito»; sin requisitos, la lista dice «Aún no hay requisitos. Crea uno o importa un CSV.».",
    covers: ["section:requirements", "state:requirements-empty"],
    run: async () => {
      await openProject(PROJECT_A.name);
      await openSection("requirements");
      await waitForText(T.requirement.empty);
    },
  });

  step("nuevo-requisito", {
    title: "Nuevo requisito",
    caption:
      "«Nuevo requisito» pide el título (obligatorio), una descripción, la prioridad y, si quieres, su riesgo. Si dejas vacío el «ID de requisito», Pharos lo numera solo (REQ-001, REQ-002…); también puedes escribir uno propio (letras, números y - _ . :). Una vez creado, el ID no cambia: viaja como tag @REQ-001 en los casos y en la automatización. En este ejemplo, el primer requisito de Pharos: «Iniciar sesión con correo y contraseña».",
    covers: ["dialogs:src/modules/traceability/ui/RequirementFormModal.tsx"],
    shot: { element: D },
    run: async () => {
      await clickButton(T.requirement.new);
      await expect(dialog()).toBeDisplayed();
      await (await field(T.requirement.title, D)).setValue("Iniciar sesión con correo y contraseña");
      await (await field(T.requirement.description, D)).setValue(
        "Quien tiene cuenta entra con su correo y su contraseña; con datos incorrectos, Pharos no dice cuál de los dos falla.",
      );
      await selectOption(T.requirement.priority, T.priorityLabel.high, D);
    },
  });

  step("importar-csv", {
    title: "Importar requisitos desde CSV",
    caption:
      "Si tus requisitos ya están en una hoja de cálculo, «Importar › Importar requisitos (.csv)» acepta un CSV separado por comas o por punto y coma (como lo guarda Excel en español). Basta con una columna de título; si hay una de ID, crea o actualiza cada requisito por su ID. La vista previa muestra las columnas que reconoció, las primeras filas y cuántos se crearán o actualizarán, antes de tocar nada. Las líneas sin título o con un ID repetido o no válido se omiten, y la vista previa dice por qué.",
    covers: ["upload:src/modules/traceability/ui/TraceabilityPage.tsx", "dialogs:src/modules/traceability/ui/RequirementImportModal.tsx"],
    shot: { element: D },
    run: async () => {
      await clickButton(T.requirement.save, D);
      await waitForToast(T.requirement.savedToast);
      await chooseFile('input[type="file"][accept=".csv,text/csv"]', join(fixturesDir, "requisitos.csv"));
      await expect(dialog()).toBeDisplayed();
      await expect(dialog()).toHaveText(expect.stringContaining("REQ-007"));
    },
  });

  step("requisitos", {
    title: "La lista de requisitos",
    caption:
      "«Importar 6» los añade. Cada fila muestra el ID, el requisito con su descripción, la prioridad, cuántos casos lo enlazan y si está «Cubierto» o «Sin cubrir» (las filas sin cubrir se tiñen, para verlas enseguida). A la derecha, ✨ genera casos con IA desde ese requisito (capítulo 17) y la papelera lo elimina. Haz clic en el título para editarlo.",
    toast: true,
    run: async () => {
      await clickButton(tf("traceability.import.confirm", { count: 6 }), D);
      await waitForToast(tf("traceability.import.doneToast", { created: 6, updated: 0 }));
      await expect($("button.tz-open*=Imprimir el plan")).toBeDisplayed();
    },
  });

  step("editar-requisito", {
    title: "Editar un requisito",
    caption:
      "Al editar, el ID queda fijo («El ID es estable y no se puede cambiar.») y lo demás se puede corregir. En este ejemplo, Liomar precisa la descripción de REQ-005. «Guardar» lo confirma con el aviso «Requisito guardado».",
    covers: ["action:requirement-edit"],
    shot: { element: D },
    run: async () => {
      await $("button.tz-open*=Exportar la matriz").click();
      await expect(dialog()).toBeDisplayed();
      await (await field(T.requirement.description, D)).addValue(" Una hoja por proyecto, con la fecha de la exportación.");
    },
  });

  step("riesgo-requisito", {
    title: "El riesgo de un requisito",
    caption:
      "En el mismo diálogo, «Riesgo» pide la probabilidad de que falle y su impacto, de 1 a 5 cada uno («Sin evaluar» si aún no lo sabes). Su producto es el nivel de riesgo: hasta 4, bajo; hasta 12, medio; por encima, alto. La matriz de trazabilidad ordena por riesgo (capítulo 13) y «Añadir por filtro» de los ciclos puede elegir los casos de los requisitos más arriesgados (capítulo 9).",
    covers: ["action:requirement-risk"],
    shot: { element: D },
    run: async () => {
      const likelihood = $('[data-testid="requirement-risk-likelihood"]');
      await likelihood.scrollIntoView();
      await likelihood.selectByAttribute("value", "4");
      await $('[data-testid="requirement-risk-impact"]').selectByAttribute("value", "5");
    },
  });

  step("requisito-descartar", {
    title: "Cerrar un requisito sin guardar",
    caption:
      "Si cierras el diálogo con cambios sin guardar («Cancelar», Esc o un clic fuera), Pharos pregunta antes de perderlos: «Descartar cambios» los descarta y «Seguir editando» (o Esc) vuelve al formulario.",
    covers: ["dialogs:src/modules/traceability/ui/RequirementFormModal.tsx"],
    shot: false,
    run: async () => {
      await clickButton(T.requirement.save, D);
      await waitForToast(T.requirement.savedToast);
      await $("button.tz-open*=Exportar la matriz").click();
      await (await field(T.requirement.title, D)).addValue(" (borrador)");
      await clickButton(es.common.cancel, D);
      await acceptConfirm();
      await expect($(D)).not.toBeExisting();
    },
  });

  step("menu-importar", {
    title: "Más formas de traer requisitos: la IA",
    caption:
      "El menú «Importar» reúne las tres formas de traer requisitos: el CSV y dos con IA, que proponen requisitos para que tú decidas cuáles aplicar. «Requisitos desde un proyecto (IA)» lee la documentación y el código de una carpeta (solo en la app de escritorio); «Requisitos desde diseños» parte de capturas, bocetos, PDF o un proyecto de Claude Design. Sin un motor de IA configurado aparecen en gris, como aquí; el capítulo 17 los recorre con IA.",
    covers: ["action:requirements-import-menu"],
    focus: '[role="menu"]',
    run: async () => {
      await clickButton(T.io.import);
      await expect(menuItem(T.io.importCsv)).toBeDisplayed();
      await expect(menuItem(T.io.fromProject)).toBeDisplayed();
    },
    after: async () => {
      await browser.keys("Escape");
    },
  });

  step("eliminar-requisito", {
    title: "Eliminar un requisito",
    caption:
      "La papelera de la fila pide confirmación (en este ejemplo, REQ-007, que queda fuera de la versión). El ID eliminado no se reutiliza: los casos que lo enlazaban lo muestran como «Requisito desconocido» y aparecen en los huecos de la trazabilidad. Esc no cierra este aviso: solo «Cancelar».",
    covers: ["dialogs:src/modules/traceability/ui/TraceabilityPage.tsx"],
    shot: { element: '[role="alertdialog"]' },
    run: async () => {
      await $(`button[aria-label="${tf("traceability.requirement.delete", { key: "REQ-007" })}"]`).click();
      await expect($('[role="alertdialog"]')).toBeDisplayed();
    },
  });

  step("eliminado", {
    title: "Requisito eliminado",
    caption: "Al confirmar aparece el aviso «REQ-007 eliminado» y la lista deja de mostrarlo.",
    shot: false,
    run: async () => {
      await clickButton(T.requirement.deleteConfirm, '[role="alertdialog"]');
      await waitForToast(tf("traceability.requirement.deletedToast", { key: "REQ-007" }));
    },
  });

  step("movil", {
    title: "Los requisitos en el móvil",
    caption:
      "En el móvil, cada requisito es una tarjeta con su ID, su título, su prioridad, «Casos vinculados · N» y si está cubierto. «Nuevo requisito» e «Importar» están en la fila de botones de la sección; el menú «Importar» se abre como una hoja desde abajo.",
    covers: ["platform:mobile-requirements"],
    run: async () => {
      await setViewport(MOBILE);
      await expect($("button.tz-open*=Iniciar sesión")).toBeDisplayed();
    },
    after: async () => {
      await setViewport(DESKTOP);
    },
  });
});
