import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DeleteButton } from "@shared/ui/fields";
import { testCaseApi } from "../api/testCaseApi";
import type { TestCaseSummary } from "../model/types";
import "./TestCase.css";

export function TestCaseList({
  onNew,
  onOpen,
}: {
  onNew: () => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [cases, setCases] = useState<TestCaseSummary[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setCases(await testCaseApi.list());
    setLoading(false);
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function remove(id: string) {
    await testCaseApi.remove(id);
    void refresh();
  }

  return (
    <section className="tp">
      <header className="tp__header">
        <div>
          <h1>{t("testCase.title")}</h1>
          <p className="tp__subtitle">{t("testCase.subtitle")}</p>
        </div>
        <button className="tp__new" type="button" onClick={onNew}>
          {t("testCase.new")}
        </button>
      </header>

      {loading ? (
        <p className="tp__muted">{t("common.loading")}</p>
      ) : cases.length === 0 ? (
        <p className="tp__muted">{t("testCase.empty")}</p>
      ) : (
        <ul className="tp__list">
          {cases.map((c) => (
            <li key={c.id} className="tp__item">
              <button
                type="button"
                className="tp__item-open"
                onClick={() => onOpen(c.id)}
              >
                <span className="tp__item-title">
                  <span className="tc-list__id">{c.scenarioId}</span> {c.title}
                  <span className={`tc-list__level tc-list__level--${c.gherkinLevel}`}>
                    {t(`testCase.level.${c.gherkinLevel}.name`)}
                  </span>
                </span>
                <span className="tp__item-meta">
                  {t(`testCase.priorityLabel.${c.priority}`)} ·{" "}
                  {t(`testCase.statusLabel.${c.status}`)} · {t("testCase.revShort")}{" "}
                  {c.revision}
                </span>
              </button>
              <DeleteButton needsConfirm onDelete={() => remove(c.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
