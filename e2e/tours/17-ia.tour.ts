// Chapter 17 — Asistente de IA (manual v2, MAN-03). Liomar works with Claude
// (the provider of the tour key). These steps call a real AI provider, so they
// run only with a key: PHAROS_TOURS_AI_KEY in the environment, or
// ANTHROPIC_API_KEY in the `.env` of this checkout or of the main checkout
// (scripts/manual/ai-key.mjs; CI: a repository secret, only in the
// non-required `manual` job). Without one they are skipped and the manual and
// `check:manual` list them as pending; nothing is ever faked.
//
// The material is all Pharos (AI_MATERIAL in data/pharos.ts): the folder is
// an excerpt of Pharos's own sync API and the sketch is of its notifications
// panel. AI output varies from run to run: the captions describe the kind of
// proposal, never its text, and the contexts ask for no people's names (the
// persona check fails a capture that shows one).
//
// The key never goes through the UI, a file or a log: it is handed to the
// app's own keychain command (`ai_key_set`) inside the isolated tour profile,
// the key field is blurred in every capture, and `npm run manual` fails if
// the key's value appears in any generated file (check-manual --secret-scan).
// Cost: the cheapest suitable model per provider (tour.ts → CHEAP_MODELS),
// short prompts and a cap on calls per run (PHAROS_TOURS_AI_MAX_CALLS).
import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { AI, AI_SKIP, CHEAP_MODELS, aiCall, chapter, step } from "./tour";
import {
  PROJECT_A,
  byTestId,
  chooseFile,
  clickButton,
  dialog,
  es,
  menuItem,
  pickFromMenu,
  openAdminTab,
  openProject,
  openSection,
  scrollToTop,
  tf,
  waitForText,
  waitForToast,
} from "./helpers";
import { AI_MATERIAL } from "./data/pharos";
import { pharosFixtures } from "./prepare";

const X = es.ai;
const D = '[role="dialog"]';
const AI_TIMEOUT = 150_000;
/** Reading a folder or a sketch and comparing: a minute or two (MAN-03). */
const DESIGN_TIMEOUT = 420_000;

/** Opens every «Criterios de aceptación», «Supuestos» and «Preguntas
 *  abiertas» of the proposals, so the capture shows them. */
async function openCriteria() {
  await browser.execute(() =>
    document.querySelectorAll('[data-testid="req-proposals"] details').forEach((d) => d.setAttribute("open", "")),
  );
}

async function goToPlanStep(id: keyof typeof es.testPlan.step) {
  await openProject(PROJECT_A.name);
  await openSection("plan");
  await $("nav.tpw-rail").$(`button*=${es.testPlan.step[id]}`).click();
  await expect($("h2.tpw__title")).toHaveText(es.testPlan.step[id]);
}

chapter("ia", () => {
  step("sin-configurar", {
    title: "Sin IA configurada",
    caption:
      "La IA es opcional. Mientras no configures un proveedor (o Ollama), los botones de IA, como «Sugerir casos con IA», aparecen deshabilitados; el resto de Pharos funciona igual.",
    covers: ["ai:disabled-without-key"],
    focus: `button*=${es.testCase.list.suggest}`,
    run: async () => {
      await openProject(PROJECT_A.name);
      await openSection("cases");
      // aria-disabled (it stays focusable) with the reason as its title.
      await expect($(`button*=${es.testCase.list.suggest}`)).toHaveAttribute("aria-disabled", "true");
      await expect($(`button*=${es.testCase.list.suggest}`)).toHaveAttribute("title", es.testCase.suggest.disabled);
    },
  });

  step("configurar", {
    title: "Configurar el proveedor",
    caption:
      "En «Administración → Motor de IA», elige el proveedor, pega tu clave y pulsa «Guardar clave»: queda en el almacén de credenciales de Windows, ese proveedor pasa a ser el activo y el campo muestra «Configurada» (en este manual, difuminado). Después elige un modelo («Listar modelos») y guarda. Para saber qué IA está activa, mira la tarjeta con la marca ✓ (al pasar el cursor dice «En uso»), el estado «Conectado» y el campo «Modelo»: es la que Pharos usará. Guardar la clave de otro proveedor no lo cambia; lo cambia elegir otra tarjeta y guardar. Con «Usar: Automático», Pharos usa el proveedor online si está configurado y, si no, Ollama. En este ejemplo, Liomar trabaja con Claude (Anthropic) en «Solo online», con un modelo de Claude.",
    covers: ["ai:configure"],
    skip: AI_SKIP,
    mask: ["#ai-key"],
    focus: `[data-testid="ai-provider-${AI.provider}"]`,
    run: async () => {
      const provider = AI.provider;
      const model = AI.model || CHEAP_MODELS[provider];
      if (!model) throw new Error(`set PHAROS_TOURS_AI_MODEL for provider ${provider}`);
      // The app's own keychain command, never the UI: the key is not typed,
      // shown or logged (wdio.tours.conf disables the driver's verbose log).
      await browser.execute(
        async (p: string, k: string) => {
          const w = window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string, a: object) => Promise<unknown> } };
          await w.__TAURI_INTERNALS__.invoke("ai_key_set", { provider: p, key: k });
        },
        provider,
        AI.key,
      );
      await browser.execute(
        (p: string, m: string, base: string) => {
          const raw = JSON.parse(localStorage.getItem("pharos.ai.config") ?? "{}");
          raw.mode = "online";
          raw.onlineProvider = p;
          raw.onlineModels = { ...(raw.onlineModels ?? {}), [p]: m };
          if (base) raw.customBaseUrl = base;
          raw.temperature = 0.2;
          localStorage.setItem("pharos.ai.config", JSON.stringify(raw));
        },
        provider,
        model,
        AI.baseUrl,
      );
      await openAdminTab("templates");
      await openAdminTab("ai");
      await expect(byTestId(`ai-provider-${provider}`)).toBeDisplayed();
      // The card carries the «En uso» mark, and the keychain holds the key.
      await expect(byTestId(`ai-provider-${provider}`).$('[data-testid="ai-in-use"]')).toBeDisplayed();
      // From the top: «Usar», the provider cards with «Conectado» and the ✓.
      await browser.execute(() => {
        const content = document.querySelector(".app-shell__content");
        if (content) content.scrollTop = 0;
      });
      const stored = await browser.execute(async (p: string) => {
        const w = window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string, a: object) => Promise<boolean> } };
        return w.__TAURI_INTERNALS__.invoke("ai_key_status", { provider: p });
      }, provider);
      expect(stored).toBe(true);
    },
  });

  step("probar-conexion", {
    title: "Probar la conexión",
    caption:
      "Antes de confiar en la configuración, «Probar conexión» envía una pregunta mínima al proveedor activo y muestra el tiempo de respuesta («Respuesta en N ms»): es la prueba de que esa IA, con ese modelo, contesta. Si falla, dice por qué (clave, modelo o red). Con una clave recién escrita, la prueba sin guardarla: si no funciona, la anterior sigue intacta.",
    covers: ["ai:test-connection"],
    skip: AI_SKIP,
    mask: ["#ai-key"],
    focus: ".ai-test__ok",
    run: async () => {
      aiCall();
      await clickButton(X.test);
      const success = new RegExp(`^${X.responseIn.replace("{{ms}}", "\\d+")}$`);
      await browser.waitUntil(async () => success.test((await $(".ai-test__ok").getText()).trim()), {
        timeout: AI_TIMEOUT,
        timeoutMsg: "the connection test did not answer «Respuesta en N ms»",
      });
      await browser.execute(() => {
        const content = document.querySelector(".app-shell__content");
        if (content) content.scrollTop = 0;
      });
      // The answer just above the save bar; the window itself never scrolls
      // (the top bar stays whole).
      await browser.execute(() => {
        const content = document.querySelector<HTMLElement>(".app-shell__content");
        const ok = document.querySelector(".ai-test__ok");
        if (content && ok) content.scrollTop += Math.max(0, ok.getBoundingClientRect().bottom - (window.innerHeight - 110));
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        const shell = document.querySelector<HTMLElement>(".app-shell");
        if (shell) shell.scrollTop = 0;
      });
    },
  });

  // ---- The three ways to bring requirements, with AI (MAN-03) -------------
  // In «API de sincronización», with its requirements already imported
  // (prerequisite «requisitos-api»): an excerpt of Pharos's own sync API as
  // the project folder and a sketch of a Pharos screen
  // (e2e/tours/fixtures/pharos, AI_MATERIAL in data/pharos.ts).

  step("importar-menu-ia", {
    title: "Las tres formas de traer requisitos",
    caption:
      "Con un motor de IA configurado, el menú «Importar» de «Requisitos» tiene sus tres opciones activas: «Importar requisitos (.csv)» crea o actualiza requisitos por su ID; «Requisitos desde un proyecto (IA)» propone requisitos a partir de la documentación y el código de una carpeta (solo en la app de escritorio); y «Requisitos desde diseños» los propone a partir de capturas, bocetos, PDF, un dibujo de Excalidraw o un proyecto de Claude Design. Con las de IA, nada se crea hasta que revisas y aplicas las propuestas.",
    covers: ["action:requirements-import-menu-ai"],
    skip: AI_SKIP,
    focus: '[role="menu"]',
    run: async () => {
      await openProject(AI_MATERIAL.folderProject);
      await openSection("requirements");
      await clickButton(es.traceability.io.import);
      for (const item of [es.traceability.io.importCsv, es.traceability.io.fromProject, es.traceability.fromDesign.open]) {
        await expect(menuItem(item)).toBeDisplayed();
        await expect(menuItem(item)).not.toHaveAttribute("aria-disabled", "true");
      }
    },
    after: async () => {
      await browser.keys("Escape");
    },
  });

  step("desde-proyecto", {
    title: "Requisitos desde un proyecto: la carpeta",
    caption:
      "«Requisitos desde un proyecto (IA)» abre su diálogo; «Elegir carpeta…» abre el selector de carpetas de Windows. Elige la carpeta de un proyecto en marcha o de su documentación: aquí, un extracto del propio Pharos, su API de sincronización, con su README, dos documentos, el código que combina los cambios y sus pruebas. Pharos lista lo que leería, agrupado por tipo, sin enviar nada todavía. Desmarca lo que no quieras enviar; las dependencias, los builds, los archivos ocultos, los binarios y los archivos con secretos nunca se envían. Abajo ves cuántos archivos, cuántos tokens (aproximados) y cuántas llamadas a la IA supone, y puedes ajustar el presupuesto y añadir un contexto que ayude a la IA (en este ejemplo, que es la API de sincronización de Pharos).",
    covers: ["dialogs:src/modules/traceability/ui/ProjectRequirementsModal.tsx"],
    skip: AI_SKIP,
    shot: { element: D },
    run: async () => {
      await pickFromMenu(es.traceability.io.import, es.traceability.io.fromProject);
      await expect(dialog()).toBeDisplayed();
      // The debug build picks the fixture folder (PHAROS_E2E_PICK_FOLDER).
      await clickButton(es.traceability.fromProject.pick, D);
      await waitForText(es.traceability.fromProject.continue, 30_000);
      await expect(dialog()).toHaveText(expect.stringContaining("README.md"));
      await $(`${D} .tz-scan__field--wide textarea`).setValue(AI_MATERIAL.folderContext);
    },
  });

  step("desde-proyecto-enviar", {
    title: "Antes de enviar",
    caption:
      "«Continuar» resume lo que saldrá del equipo: cuántos archivos, unos cuántos tokens y en cuántas llamadas, y a qué proveedor van. Las líneas con aspecto de secreto (claves, tokens) se sustituyen por «[secreto omitido]» antes de enviar. «Volver» te deja cambiar la selección; «Enviar y analizar» empieza.",
    skip: AI_SKIP,
    shot: { element: D },
    run: async () => {
      await clickButton(es.traceability.fromProject.continue, D);
      await waitForText(es.traceability.fromProject.send);
    },
  });

  step("desde-proyecto-propuestas", {
    title: "Las propuestas desde el proyecto",
    caption:
      "La IA lee los archivos por lotes («Analizando: lote 1 de N…»; «Detener» lo para) y compara lo que encuentra con los requisitos que ya tiene el proyecto. Propone requisitos nuevos, mejoras de los que ya existen, posibles duplicados y requisitos que sobran, cada uno con su motivo, su fuente (el archivo y las líneas) y sus criterios de aceptación. «Escrito en la fuente» es lo que el material dice; «Inferido», una deducción con sus supuestos y sus preguntas abiertas, para que la confirmes. Marca lo que quieras y pulsa «Aplicar N cambios»: lo aplicado queda «IA · pendiente de revisión».",
    covers: ["dialogs:src/modules/traceability/ui/RequirementProposalsReview.tsx"],
    skip: AI_SKIP,
    shot: { element: D },
    run: async () => {
      aiCall();
      aiCall();
      await clickButton(es.traceability.fromProject.send, D);
      await $('[data-testid="req-proposals-apply"]').waitForExist({ timeout: DESIGN_TIMEOUT });
      await openCriteria();
    },
  });

  step("desde-disenos", {
    title: "Requisitos desde diseños: el material",
    caption:
      "Tras aplicar, «Importar › Requisitos desde diseños» parte de lo que se ve: capturas, bocetos, PDF, un dibujo de Excalidraw o la carpeta o el ZIP de un proyecto de Claude Design (desde Figma o Canva, exporta los frames como PNG o PDF). Arrástralos, pega una captura con Ctrl+V o usa «Elegir archivos» o «Elegir carpeta». Aquí, un boceto del panel de notificaciones de Pharos, que aún no tiene requisitos. Cada imagen muestra su tamaño y una estimación de tokens; añádele una nota (aquí, «campana y panel de notificaciones») y escribe el contexto del producto: la IA acierta más. Se envían como mucho 8 imágenes o PDF por análisis, y el aviso dice a qué proveedor van.",
    covers: [
      "dialogs:src/modules/traceability/ui/RequirementsFromDesignModal.tsx",
      "upload:src/modules/traceability/ui/RequirementsFromDesignModal.tsx",
    ],
    skip: AI_SKIP,
    shot: { element: D },
    run: async () => {
      aiCall();
      aiCall();
      await $('[data-testid="req-proposals-apply"]').click();
      await dialog().waitForExist({ reverse: true, timeout: 60_000 });
      await pickFromMenu(es.traceability.io.import, es.traceability.fromDesign.open);
      await expect(dialog()).toBeDisplayed();
      await chooseFile(`${D} input.tr-design__file[accept]`, join(pharosFixtures, AI_MATERIAL.sketch));
      await $(`${D} .tr-design__item`).waitForExist({ timeout: 30_000 });
      await $(`${D} .tr-design__note`).setValue("campana y panel de notificaciones");
      await $(`${D} .tr-design__context textarea`).setValue(AI_MATERIAL.sketchContext);
    },
  });

  step("desde-disenos-analizando", {
    title: "Analizar: dos pasos",
    caption:
      "«Analizar» envía el material. El análisis tiene dos pasos: primero la IA lee las imágenes («Paso 1 de 2 · Leyendo el material con IA…») y después compara lo que encontró con los requisitos del proyecto («Paso 2 de 2»). Al lado ves los segundos que lleva: suele tardar uno o dos minutos, no se ha quedado colgado. «Cancelar» lo deja.",
    skip: AI_SKIP,
    shot: { element: D },
    run: async () => {
      await $(`${D} button.cd__confirm`).click();
      await waitForText(tf("traceability.fromDesign.step", { n: 1, total: 2 }), 15_000);
      await browser.waitUntil(async () => /\(([3-9]|\d\d+) s\)/.test(await $('[data-testid="design-elapsed"]').getText()), {
        timeout: 30_000,
      });
    },
  });

  step("desde-disenos-propuestas", {
    title: "Las propuestas desde el boceto",
    caption:
      "Las propuestas se revisan igual que las de un proyecto. La fuente de cada una es la imagen, con un recuadro en la zona de la que sale el requisito. Los criterios de aceptación van uno por bloque (los que la IA escribe en Gherkin se muestran con una palabra clave por línea, en negrita). Abajo, «Guardar las imágenes como adjunto de los requisitos» viene desmarcada (Pharos no guarda las imágenes salvo que lo pidas); Liomar la marca para guardarlas cifradas junto a cada requisito y verlas después.",
    skip: AI_SKIP,
    shot: { element: D },
    run: async () => {
      await $('[data-testid="req-proposals-apply"]').waitForExist({ timeout: DESIGN_TIMEOUT });
      await openCriteria();
      const keep = $(`//label[contains(., "${es.traceability.fromDesign.keepImages}")]//input`);
      await keep.click();
      await expect(keep).toBeSelected();
    },
  });

  step("fuente-imagen", {
    title: "La imagen de la que sale un requisito",
    caption:
      "La imagen a tamaño completo, con la zona de la que sale el requisito marcada. Se llega así: con la casilla marcada, abre un requisito («Editar requisito»), despliega «Fuente» y pulsa la miniatura; «Cerrar» o Esc vuelven. Si no se guardó, «Fuente» lo dice («La imagen no se guardó en Pharos.»). Las imágenes guardadas cuentan en «Administración › Evidencias» como «Requisitos» y solo se ven en la app de escritorio.",
    covers: ["dialogs:src/modules/traceability/ui/RequirementSources.tsx"],
    skip: AI_SKIP,
    shot: { element: ".tr-design__viewer" },
    run: async () => {
      await $('[data-testid="req-proposals-apply"]').click();
      await dialog().waitForExist({ reverse: true, timeout: 60_000 });
      // A requirement the sketch proposed and that kept its image: the
      // newest ones are last; an improvement of an older one may have none.
      const rows = await $$("button.tz-open");
      let found = false;
      for (let i = rows.length - 1; i >= Math.max(0, rows.length - 8) && !found; i--) {
        await (await $$("button.tz-open"))[i].click();
        await expect(dialog()).toBeDisplayed();
        const sources = $('[data-testid="requirement-sources"]');
        if (await sources.isExisting()) {
          await sources.$("summary").click();
          found = await sources
            .$("button.tr-design__open")
            .waitForDisplayed({ timeout: 3_000 })
            .then(() => true, () => false);
        }
        if (!found) {
          await browser.keys("Escape");
          await dialog().waitForExist({ reverse: true });
        }
      }
      if (!found) throw new Error("no requirement kept the sketch as its source image");
      await $('[data-testid="requirement-sources"]').$("button.tr-design__open").click();
      await $(".tr-design__viewer").waitForDisplayed({ timeout: 10_000 });
    },
    after: async () => {
      await browser.keys("Escape");
      await browser.keys("Escape");
    },
  });

  step("asistir", {
    title: "«Asistir con IA» en un campo",
    caption: "En los campos de texto del plan, el botón de IA (✨, «Asistir con IA») propone un borrador breve a partir del resto del plan, con lo que pide el syllabus ISTQB para esa sección. En «Conclusión», valora el plan frente a sus objetivos y criterios de salida, y no inventa resultados. Revisa el «Borrador de la IA» y pulsa «Usar» o «Descartar»: nada se aplica solo, y lo aceptado queda marcado como generado por IA.",
    covers: ["ai:assist-field"],
    skip: AI_SKIP,
    focus: ".assist__preview",
    run: async () => {
      await goToPlanStep("purpose");
      aiCall();
      await $(".assist__btn").click();
      await waitForText(X.assist.previewTitle, AI_TIMEOUT);
      // From the top, so «Estado del plan» starts below the top bar.
      await browser.execute(() => {
        const content = document.querySelector(".app-shell__content");
        if (content) content.scrollTop = 0;
      });
      if (!(await $(".assist__preview").isDisplayed({ withinViewport: true }))) await $(".assist__preview").scrollIntoView({ block: "end" });
    },
  });

  step("borrador-usado", {
    title: "Lo que escribió la IA queda marcado",
    caption:
      "«Usar» pasa el borrador al campo, donde puedes corregirlo como cualquier texto; se guarda con el plan («Guardar»). Junto al campo queda la marca «IA · pendiente de revisión» hasta que alguien lo lea y pulse «Marcar revisado». La marca también guarda qué proveedor y qué modelo lo generaron (en este ejemplo, Claude y su modelo), que se leen al pasar el cursor por ella: así se sabe, también después, qué IA escribió cada cosa.",
    // Uses the draft «asistir» asked for: without a key both are skipped.
    skip: AI_SKIP,
    focus: ".ai-prov",
    run: async () => {
      await clickButton(X.assist.use);
      await expect($(".ai-prov")).toBeDisplayed();
      await expect($(".ai-prov__label")).toHaveAttribute("title", expect.stringContaining(es.ai.provenance.provider[AI.provider]));
      await $(".ai-prov").scrollIntoView({ block: "center" });
    },
    // The plan keeps the accepted draft: saved, so leaving does not ask.
    after: async () => {
      await clickButton(es.testPlan.save);
      await waitForToast(es.testPlan.savedToast);
    },
  });

  step("riesgos", {
    title: "Sugerir riesgos",
    caption:
      "En «Riesgos y mitigación», «Sugerir riesgos con IA» propone riesgos con su mitigación, un buen punto de partida que conviene revisar: marca los que te sirvan y pulsa «Añadir».",
    covers: ["ai:suggest-risks"],
    skip: AI_SKIP,
    focus: [`button*=${es.testPlan.suggestRisks}`, ".assist__preview"],
    run: async () => {
      await goToPlanStep("risks");
      aiCall();
      await clickButton(es.testPlan.suggestRisks);
      await waitForText(X.structured.proposals, AI_TIMEOUT);
      // The button and the proposals under it, below the top bar.
      await scrollToTop(`button*=${es.testPlan.suggestRisks}`);
    },
  });

  step("generar-casos", {
    title: "Generar casos desde un requisito",
    caption: "En «Requisitos», el botón de IA de un requisito propone escenarios Gherkin y casos para él. Revisa cada propuesta («Ver Gherkin»), marca las buenas y pulsa «Crear N casos»: quedan vinculados al requisito.",
    covers: ["dialogs:src/modules/traceability/ui/GenerateCasesModal.tsx"],
    skip: AI_SKIP,
    shot: { element: D },
    run: async () => {
      await clickButton(X.assist.discard);
      await openSection("requirements");
      await $(`button[aria-label="${tf("traceability.generate.button", { key: "REQ-004" })}"]`).click();
      await expect(dialog()).toBeDisplayed();
      aiCall();
      await clickButton(es.traceability.generate.run, D);
      await $(D).$("details").waitForExist({ timeout: AI_TIMEOUT });
    },
  });

  step("sugerir-casos", {
    title: "Sugerir casos a partir del plan",
    caption:
      "En «Casos de prueba», «Sugerir casos con IA» propone casos según los tipos y niveles del plan (capítulo 5); elige los que quieras crear y revísalos como cualquier otro caso.",
    covers: ["dialogs:src/modules/test-cases/ui/SuggestTestsModal.tsx"],
    skip: AI_SKIP,
    shot: { element: D },
    run: async () => {
      await browser.keys("Escape");
      await openSection("cases");
      aiCall();
      await clickButton(es.testCase.list.suggest);
      await expect(dialog()).toBeDisplayed();
      await browser.waitUntil(async () => !(await $(D).getText()).includes(es.testCase.suggest.loading), { timeout: AI_TIMEOUT });
      // Real proposals, ready to create, and no error.
      await expect($(D).$('[role="alert"]')).not.toBeExisting();
      await browser.waitUntil(async () => (await $(D).$$('input[type="checkbox"]')).length > 0, {
        timeoutMsg: "the AI proposed no test cases",
      });
      await expect($(D).$("button.cd__confirm")).toBeEnabled();
    },
  });

  step("precondiciones", {
    title: "Sugerir y revisar el caso con IA",
    caption:
      "En el editor de un caso, cada lista tiene su botón de IA (✨) junto a su título; su nombre aparece al pasar el cursor. «Sugerir precondiciones» las propone a partir del resto del caso (en este ejemplo, PH-002, «Rechazar credenciales no válidas», que aún no tiene ninguna), y con la lista ya escrita pasa a «Revisar precondiciones». Igual en pasos, postcondiciones y criterios, en cada flujo de un caso avanzado y en las comprobaciones de una checklist. La revisión propone añadir, reformular o eliminar, y cada propuesta dice por qué; si la lista ya está bien, lo dice y no aplica nada. Reformular y eliminar empiezan sin marcar: solo se aplican si los marcas. Datos de prueba y Notas no llevan IA.",
    covers: ["ai:suggest-preconditions"],
    skip: AI_SKIP,
    focus: ".assist__preview",
    run: async () => {
      await browser.keys("Escape");
      // PH-002 has no preconditions yet: the AI has something to propose.
      await $("a.cl-title*=Rechazar credenciales").click();
      aiCall();
      // «Sugerir» on an empty list, «Revisar» once the case has preconditions.
      const pre = es.testCase.aiReview.preconditions;
      await $(`button[title="${pre.suggest}"], button[title="${pre.review}"]`).click();
      // The proposals, or the AI's failure notice (said in the error).
      await browser.waitUntil(async () => (await $(".assist__preview").isExisting()) || (await $(".assist__failure").isExisting()), {
        timeout: AI_TIMEOUT,
        timeoutMsg: "the AI review of the preconditions never answered",
      });
      if (await $(".assist__failure").isExisting()) throw new Error(`the AI review failed: ${await $(".assist__failure").getProperty("textContent")}`);
      await $(".assist__preview").scrollIntoView({ block: "center" });
    },
  });

  step("borrar-clave", {
    title: "Borrar la clave",
    caption:
      "«Borrar clave» la quita del almacén de credenciales, por ejemplo, si cambias de cuenta o vas a dejar el equipo; la IA vuelve a quedar sin configurar.",
    skip: AI_SKIP,
    shot: false,
    run: async () => {
      await browser.execute(async (p: string) => {
        const w = window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string, a: object) => Promise<unknown> } };
        await w.__TAURI_INTERNALS__.invoke("ai_key_clear", { provider: p });
      }, AI.provider);
    },
  });
});
