import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import i18n from "i18next";
import "@shared/i18n";
import { parsePlanXlsx } from "../import/planImport";
import { frequenciesFor, frequencyOf, methodologyText } from "./methodology";

describe("ceremony frequency (PLN-01, spec §5.1 step 8)", () => {
  it("defaults to the industry values and ignores unknown keys", () => {
    expect(frequencyOf("daily")).toBe("daily");
    expect(frequencyOf("retrospective")).toBe("perSprint");
    expect(frequencyOf("review", { review: "monthly" })).toBe("monthly");
    expect(frequencyOf("review", { review: "hourly" })).toBe("perSprint");
    expect(
      frequenciesFor(["daily", "review"], {
        review: "weekly",
        planning: "monthly",
      }),
    ).toEqual({
      daily: "daily",
      review: "weekly",
    });
  });

  it("prints each ceremony with its frequency in the methodology line", async () => {
    await i18n.changeLanguage("en");
    const text = methodologyText(
      {
        methodologyType: "agile",
        sprintWeeks: 2,
        ceremonies: ["daily", "review", "Demo day"],
        ceremonyFrequency: { review: "biweekly" },
      },
      i18n.t.bind(i18n),
    );
    expect(text).toBe(
      "Agile · Sprint length (weeks): 2 · Agile events: Daily (every day), " +
        "Review (every two weeks), Demo day (once per sprint)",
    );
    expect(
      methodologyText(
        { methodologyType: "traditional", phases: ["Design", " ", "Test"] },
        i18n.t.bind(i18n),
      ),
    ).toBe("Traditional / V-model · Phases: Design, Test");
  });

  it("round-trips through an exported plan in both languages", async () => {
    for (const lang of ["es", "en"]) {
      await i18n.changeLanguage(lang);
      const line = methodologyText(
        {
          methodologyType: "agile",
          sprintWeeks: 3,
          ceremonies: ["daily", "retrospective", "planning"],
          ceremonyFrequency: {
            daily: "twiceWeekly",
            retrospective: "monthly",
            planning: "perSprint",
          },
        },
        i18n.t.bind(i18n),
      );
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Plan");
      ws.getCell("B1").value = "PHAROS";
      ws.getCell("B22").value = i18n.t("testPlan.methodology");
      ws.getCell("B23").value = line;
      const { input } = await parsePlanXlsx(
        (await wb.xlsx.writeBuffer()) as ArrayBuffer,
        "p.xlsx",
        "Author",
      );
      expect(input.data.sprintWeeks).toBe(3);
      expect(input.data.ceremonies).toEqual([
        "daily",
        "retrospective",
        "planning",
      ]);
      expect(input.data.ceremonyFrequency).toEqual({
        daily: "twiceWeekly",
        retrospective: "monthly",
        planning: "perSprint",
      });
    }
  });
});
