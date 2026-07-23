import { useTranslation } from "react-i18next";
import type { GherkinLevel } from "../model/types";

const LEVELS: GherkinLevel[] = ["basic", "outline", "advanced"];

// Each tier includes the one before it (stacked, like pricing plans).
const PREVIOUS: Record<GherkinLevel, GherkinLevel | null> = {
  basic: null,
  outline: "basic",
  advanced: "outline",
};

/** Choose the Gherkin authoring level when creating a case (spec §5.3
 *  amendment). The level drives which form configuration is shown. */
export function LevelPicker({
  onPick,
  onCancel,
}: {
  onPick: (level: GherkinLevel) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="tc-editor">
      <header className="tc-editor__top">
        <button type="button" className="tp-editor__back" onClick={onCancel}>
          ← {t("testCase.back")}
        </button>
        <h1>{t("testCase.level.pickTitle")}</h1>
      </header>
      <p className="tp__subtitle">{t("testCase.level.pickSubtitle")}</p>
      <div className="tc-levels">
        {LEVELS.map((level) => {
          const prev = PREVIOUS[level];
          return (
            <button
              key={level}
              type="button"
              className="tc-level-card"
              onClick={() => onPick(level)}
            >
              <span className="tc-level-card__name">
                {t(`testCase.level.${level}.name`)}
              </span>
              <span className="tc-level-card__keywords">
                {prev && (
                  <>
                    <span className="tc-level-card__prev">
                      {t("testCase.level.includes")} {t(`testCase.level.${prev}.name`)}
                    </span>
                    <span className="tc-level-card__plus">+</span>
                  </>
                )}
                {t(`testCase.level.${level}.keywords`)}
              </span>
              <span className="tc-level-card__desc">
                {t(`testCase.level.${level}.desc`)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
