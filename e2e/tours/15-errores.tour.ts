// Chapter 15 — Si algo sale mal: the screens a user sees when something goes
// wrong, produced for real inside the isolated tour profile.
//
// - The database screen: the app is closed, the profile's encrypted database
//   is replaced by garbage (the original is kept aside), and the app starts
//   again. Afterwards the original is put back and the app restarts normally.
//   Only the tour profile's own file is touched (PHAROS_E2E_PROFILE).
// - The «Algo salió mal» screen: a route whose project id is not valid URL
//   encoding makes the view throw, and the error boundary catches it.
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
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

function profileDb() {
  const profile = process.env.PHAROS_E2E_PROFILE;
  if (!profile || !profile.startsWith("tours-")) throw new Error("not a tour profile: refusing to touch its database");
  const appData = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
  return join(appData, "com.pharos.desktop", "e2e", profile, "pharos.db.enc");
}

chapter("errores", () => {
  step("base-de-datos", {
    title: "Si la base de datos local no abre",
    caption: "Si los datos locales no se pueden abrir (un archivo dañado, una versión más nueva o la clave que falta en un equipo nuevo), Pharos lo explica, no modifica ningún archivo y, cuando falta la clave, ofrece abrirlos con la clave de recuperación.",
    covers: ["state:db-error"],
    run: async () => {
      const db = profileDb();
      if (!existsSync(db)) throw new Error(`no database at ${db}`);
      await browser.deleteSession();
      await whenFree("back up the database", () => copyFileSync(db, `${db}.tour-backup`));
      await whenFree("replace the database", () => writeFileSync(db, Buffer.from("this is not a Pharos database")));
      await browser.reloadSession();
      await expect(byTestId("db-error")).toBeDisplayed();
    },
  });

  step("restaurar", {
    title: "Restaurar la copia",
    caption:
      "Con el archivo original de vuelta (o una copia de pharos.db.enc), Pharos abre como siempre: por eso conviene guardar la clave de recuperación (capítulo 10).",
    shot: false,
    run: async () => {
      const db = profileDb();
      await browser.deleteSession();
      await whenFree("restore the database", () => copyFileSync(`${db}.tour-backup`, db));
      await browser.reloadSession();
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
