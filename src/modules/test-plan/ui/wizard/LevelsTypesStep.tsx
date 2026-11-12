import { useTranslation } from "react-i18next";
import esLocale from "@shared/i18n/locales/es.json";
import enLocale from "@shared/i18n/locales/en.json";
import { Gauge, Layers, ListChecks, RefreshCcw, type LucideIcon } from "lucide-react";
import { norm, reverse } from "@shared/import/xlsx";
import { EXPLAINED_TYPES, TEST_LEVELS, TEST_TYPES, TYPE_GROUPS } from "../../model/catalogs";
import { CheckColumns } from "./CheckColumns";
import type { FormState } from "./formState";

const GROUP_ICON: Record<(typeof TYPE_GROUPS)[number]["id"], LucideIcon> = {
  functional: ListChecks,
  nonFunctional: Gauge,
  changeRelated: RefreshCcw,
};

const tp = (loc: typeof esLocale) => loc.testPlan as unknown as Record<string, Record<string, string>>;
const TYPE_REV = reverse(tp(esLocale).typeLabel, tp(enLocale).typeLabel);
const LEVEL_REV = reverse(tp(esLocale).levelLabel, tp(enLocale).levelLabel);

/**
 * «Niveles y tipos de prueba» (UX-31, ISTQB: what is tested, at which level
 * and with which type), before «Metodología». One grid of columns: the four
 * levels with their grey aside, functional, non-functional (two
 * sub-columns), «Confirmación y regresión» (ISTQB v4 §2.2.3, each with its
 * tooltip) and «Propios», the team's own types with ✕ and the field to add
 * one. Levels go to `testLevels`, types to `testTypes`; the data is as before
 * plus the `retest` key.
 */
export function LevelsTypesStep({
  form,
  set,
}: {
  form: Pick<FormState, "testTypes" | "testLevels">;
  set: <K extends "testTypes" | "testLevels">(key: K, value: string[]) => void;
}) {
  const { t } = useTranslation();
  const { testTypes, testLevels } = form;
  const level = (k: string) => `level:${k}`;
  const ownTypes = testTypes.filter((v) => !TEST_TYPES.includes(v));
  // Older plans could not add own levels, but an imported sheet may hold one.
  const ownLevels = testLevels.filter((v) => !TEST_LEVELS.includes(v));
  const toggleIn = (list: string[], key: string) =>
    list.includes(key) ? list.filter((v) => v !== key) : [...list, key];
  const has = (list: string[], v: string) => list.some((x) => x.toLowerCase() === v.toLowerCase());

  const add = (text: string) => {
    // A catalog name (es or en) ticks that entry instead of adding a copy.
    const asLevel = LEVEL_REV.get(norm(text));
    if (asLevel) {
      if (!testLevels.includes(asLevel)) set("testLevels", [...testLevels, asLevel]);
      return;
    }
    const v = TYPE_REV.get(norm(text)) ?? text;
    if (!has(testTypes, v)) set("testTypes", [...testTypes, v]);
  };

  return (
    <CheckColumns
      className="tpw-lt"
      testId="plan-levels-types"
      columns={[
        {
          id: "levels",
          title: t("testPlan.typeGroup.levels"),
          icon: Layers,
          options: TEST_LEVELS.map((k) => ({
            key: level(k),
            label: t(`testPlan.levelLabel.${k}`),
            aside: t(`testPlan.levelHint.${k}`),
          })),
        },
        ...TYPE_GROUPS.map((g) => ({
          id: g.id,
          title: t(`testPlan.typeGroup.${g.id}`),
          icon: GROUP_ICON[g.id],
          split: g.id === "nonFunctional",
          options: g.keys.map((k) => ({
            key: k,
            label: t(`testPlan.typeLabel.${k}`),
            tip: EXPLAINED_TYPES.includes(k) ? t(`testPlan.typeHint.${k}`) : undefined,
          })),
        })),
      ]}
      isChecked={(k) => (k.startsWith("level:") ? testLevels.includes(k.slice(6)) : testTypes.includes(k))}
      onToggle={(k) =>
        k.startsWith("level:")
          ? set("testLevels", toggleIn(testLevels, k.slice(6)))
          : set("testTypes", toggleIn(testTypes, k))
      }
      own={{
        title: t("testPlan.typeGroup.own"),
        items: [...ownLevels, ...ownTypes],
        onRemove: (v) =>
          ownLevels.includes(v)
            ? set("testLevels", testLevels.filter((x) => x !== v))
            : set("testTypes", testTypes.filter((x) => x !== v)),
        onAdd: add,
        fieldLabel: t("testPlan.levelsTypes.other"),
        placeholder: t("testPlan.levelsTypes.otherPlaceholder"),
        addLabel: t("testPlan.levelsTypes.add"),
        span: 2,
        testId: "plan-types-own",
      }}
    />
  );
}
