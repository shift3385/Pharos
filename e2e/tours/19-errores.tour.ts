// Chapter 19 — Si algo sale mal (manual v2, MAN-03): the screens a user sees when something goes
// wrong, produced for real inside the isolated tour profile.
//
// - The database screen: the app is closed and the tour holds the profile's
//   `pharos.lock` open, as another Pharos (or the CLI) does while it
//   updates the data, so the app starts again on «Otro Pharos está
//   actualizando tus datos» once its wait runs out (ADR-0050 §5). Once the
//   tour lets go, «Reintentar» opens the data without a restart. Only the
//   tour profile's own folder is touched (PHAROS_E2E_PROFILE).
// - The «Algo salió mal» screen: a route whose project id is not valid URL
//   encoding makes the view throw, and the error boundary catches it.
import { closeSync, existsSync, openSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { userMenuTrigger } from "../support";
import { DESKTOP, chapter, setViewport, step } from "./tour";
import { byTestId } from "./helpers";

/** Retries a file operation until the closed app has released the file (a
 *  plain loop: there is no WebDriver session between delete and reload). */
async function whenFree(what: string, op: () => void) {
  let last = "";
  for (const deadline = Date.now() + 20_000; Date.now() < deadline; ) {
    try {
      op();
      return;
    } catch (err) {
      last = (err as Error).message;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`could not ${what}: ${last}`);
}

/** A file of the tour profile's data folder (never the user's). */
function profileFile(name: string) {
  const profile = process.env.PHAROS_E2E_PROFILE;
  if (!profile || !profile.startsWith("tours-")) throw new Error("not a tour profile: refusing to touch its data");
  const appData = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
  return join(appData, "com.pharos.desktop", "e2e", profile, name);
}

/** The tour's handle on `pharos.lock` while it plays the other Pharos. */
let heldLock: number | null = null;

chapter("errores", () => {
  step("base-de-datos", {
    title: "Si la base de datos local no abre",
    caption:
      "Si los datos locales no se pueden abrir, Pharos lo dice al arrancar, en lugar de la aplicación, y no modifica ningún archivo. La pantalla cambia según la causa: «Otro Pharos está actualizando tus datos» (otra ventana de Pharos o el CLI los está convirtiendo o actualizando, como en este ejemplo), «Estos datos son de una versión más nueva de Pharos» (instala esa versión o una posterior), «Falta la clave de la base de datos local» (un equipo nuevo o Windows reinstalado), que ofrece escribir la clave de recuperación, o, al actualizar desde la 0.5, «Falta espacio para actualizar tus datos». Cuando la causa puede pasar sola, ofrece «Reintentar»; «Detalles técnicos» despliega el error exacto para el informe.",
    covers: ["state:db-error"],
    run: async () => {
      const db = profileFile("pharos.db");
      if (!existsSync(db)) throw new Error(`no database at ${db}`);
      await browser.deleteSession();
      // The closed app releases the lock; the tour takes it, as a second
      // Pharos would, before the app starts again.
      await whenFree("hold the data folder", () => {
        heldLock = openSync(profileFile("pharos.lock"), "r+");
      });
      await browser.reloadSession();
      // The app waits for the other open (10 s) before it says so.
      await expect(byTestId("db-error")).toBeDisplayed({ wait: 30_000 });
      await expect(byTestId("db-error")).toHaveText(expect.stringContaining("Otro Pharos está actualizando tus datos"));
    },
  });

  step("restaurar", {
    title: "Cuando el otro Pharos termina",
    caption:
      "En cuanto el otro Pharos termina, «Reintentar» abre los datos sin reiniciar y Liomar vuelve a su Inicio, con todo como estaba. Si en cambio el archivo estuviera dañado, la salida es restaurar una copia de pharos.db: por eso conviene guardar la clave de recuperación y hacer copias (capítulo 15).",
    shot: false,
    run: async () => {
      if (heldLock !== null) closeSync(heldLock);
      heldLock = null;
      await $("button=Reintentar").click();
      await setViewport(DESKTOP);
      await expect(userMenuTrigger()).toBeDisplayed();
    },
  });
  step("algo-salio-mal", {
    title: "«Algo salió mal»",
    caption: "Si una vista falla, Pharos no se cierra: muestra «Algo salió mal» con «Reintentar», «Recargar» y «Exportar diagnóstico», y tus datos siguen a salvo. «Detalles técnicos» enseña el error para el informe.",
    covers: ["state:error-boundary"],
    run: async () => {
      // Make date formatting throw, as a broken view would, and open «Inicio»
      // (it formats today's date): the error boundary catches it.
      await browser.execute(() => {
        const w = window as unknown as { __tourDate?: unknown };
        w.__tourDate = Intl.DateTimeFormat;
        (Intl as { DateTimeFormat: unknown }).DateTimeFormat = function broken() {
          throw new Error("Fallo simulado por el tour (MAN-01)");
        };
      });
      await byTestId("nav-projects").click();
      await byTestId("nav-dashboard").click();
      await expect($(".err-boundary")).toBeDisplayed();
    },
  });

  step("reintentar", {
    title: "Reintentar",
    caption:
      "«Reintentar» vuelve a mostrar la vista cuando el fallo ya no se repite. Si se repite, exporta el diagnóstico para informar de él.",
    shot: false,
    run: async () => {
      await browser.execute(() => {
        const w = window as unknown as { __tourDate?: unknown };
        if (w.__tourDate) (Intl as { DateTimeFormat: unknown }).DateTimeFormat = w.__tourDate;
      });
      await $(".err-boundary").$("button").click();
      await expect($(".err-boundary")).not.toBeExisting();
    },
  });

});
