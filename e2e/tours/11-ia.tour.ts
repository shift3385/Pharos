// Chapter 11 — Asistente de IA. These steps call a real AI provider, so they
// run only when the user has set PHAROS_TOURS_AI_KEY in their own environment
// (CI: a repository secret, only in the non-required `manual` job). Without
// it they are skipped and the manual and `check:manual` list them as pending;
// nothing is ever faked.
//
// The key never goes through the UI, a file or a log: it is handed to the
// app's own keychain command (`ai_key_set`) inside the isolated tour profile,
// the key field is blurred in every capture, and `npm run manual` fails if
// the key's value appears in any generated file (check-manual --secret-scan).
// Cost: the cheapest suitable model per provider (tour.ts → CHEAP_MODELS),
// short prompts and a cap on calls per run (PHAROS_TOURS_AI_MAX_CALLS).
import { $, browser, expect } from "@wdio/globals";
import { AI, AI_SKIP, CHEAP_MODELS, aiCall, chapter, step } from "./tour";
import {
  PROJECT_A,
  byTestId,
  clickButton,
  dialog,
  es,
  openAdminTab,
  openProject,
  openSection,
  tf,
  waitForText,
} from "./helpers";

const X = es.ai;
const D = '[role="dialog"]';
const AI_TIMEOUT = 90_000;

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
      "La IA es opcional. Mientras no configures un proveedor (o Ollama), los botones de IA aparecen deshabilitados y explican por qué; el resto de Pharos funciona igual.",
    covers: ["ai:disabled-without-key"],
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
      "En «Administración → Motor de IA», elige el proveedor, pega tu clave y pulsa «Guardar clave»: queda en el almacén de credenciales de Windows, ese proveedor pasa a ser el activo y el campo muestra «Configurada» (en este manual, difuminado). Después elige un modelo («Listar modelos») y guarda.",
    covers: ["ai:configure"],
    skip: AI_SKIP,
    mask: ["#ai-key"],
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
      "Antes de confiar en la configuración, «Probar conexión» envía una pregunta mínima y muestra el tiempo de respuesta. Si falla, dice por qué (clave, modelo o red). Con una clave recién escrita, la prueba sin guardarla: si no funciona, la anterior sigue intacta.",
    covers: ["ai:test-connection"],
    skip: AI_SKIP,
    mask: ["#ai-key"],
    run: async () => {
      aiCall();
      await clickButton(X.test);
      const success = new RegExp(`^${X.responseIn.replace("{{ms}}", "\\d+")}$`);
      await browser.waitUntil(async () => success.test((await $(".ai-test__ok").getText()).trim()), {
        timeout: AI_TIMEOUT,
        timeoutMsg: "the connection test did not answer «Respuesta en N ms»",
      });
    },
  });

  step("asistir", {
    title: "«Asistir con IA» en un campo",
    caption: "En los campos de texto del plan, el botón de IA (✨, «Asistir con IA») propone un borrador breve a partir del resto del plan, con lo que pide el syllabus ISTQB para esa sección. En «Conclusión», valora el plan frente a sus objetivos y criterios de salida, y no inventa resultados. Revisa el «Borrador de la IA» y pulsa «Usar» o «Descartar»: nada se aplica solo, y lo aceptado queda marcado como generado por IA.",
    covers: ["ai:assist-field"],
    skip: AI_SKIP,
    run: async () => {
      await goToPlanStep("purpose");
      aiCall();
      await $(".assist__btn").click();
      await waitForText(X.assist.previewTitle, AI_TIMEOUT);
    },
  });

  step("riesgos", {
    title: "Sugerir riesgos",
    caption:
      "En «Riesgos y mitigación», «Sugerir riesgos con IA» propone riesgos con su mitigación, un buen punto de partida que conviene revisar: marca los que te sirvan y pulsa «Añadir».",
    covers: ["ai:suggest-risks"],
    skip: AI_SKIP,
    run: async () => {
      await clickButton(X.assist.discard);
      await goToPlanStep("risks");
      aiCall();
      await clickButton(es.testPlan.suggestRisks);
      await waitForText(X.structured.proposals, AI_TIMEOUT);
    },
  });

  step("generar-casos", {
    title: "Generar casos desde un requisito",
    caption: "En «Trazabilidad», el botón de IA de un requisito propone escenarios Gherkin y casos para él. Revisa cada propuesta («Ver Gherkin»), marca las buenas y pulsa «Crear N casos»: quedan vinculados al requisito.",
    covers: ["dialogs:src/modules/traceability/ui/GenerateCasesModal.tsx"],
    skip: AI_SKIP,
    shot: { element: D },
    run: async () => {
      await clickButton(X.assist.discard);
      await openSection("traceability");
      await $(`button.chips__chip*=${es.traceability.view.requirements}`).click();
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
      "En «Casos de prueba», «Sugerir casos con IA» propone casos según los tipos y niveles del plan (capítulo 3); elige los que quieras crear y revísalos como cualquier otro caso.",
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
      "En el editor de un caso, cada lista tiene su botón de IA (✨) junto a «+ Añadir»; su nombre aparece al pasar el cursor. «Sugerir precondiciones» las propone a partir del resto del caso, y con la lista ya escrita pasa a «Revisar precondiciones». Igual en pasos, postcondiciones y criterios, en cada flujo de un caso avanzado y en las comprobaciones de una checklist. La revisión propone añadir, reformular o eliminar, y cada propuesta dice por qué. Reformular y eliminar empiezan sin marcar: solo se aplican si los marcas. Datos de prueba y Notas no llevan IA.",
    covers: ["ai:suggest-preconditions"],
    skip: AI_SKIP,
    run: async () => {
      await browser.keys("Escape");
      await $("a.cl-title*=Transferencia").click();
      aiCall();
      await $(`button[title="${es.testCase.aiReview.preconditions.suggest}"]`).click();
      await waitForText(X.structured.proposals, AI_TIMEOUT);
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
