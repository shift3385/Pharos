import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { testPlanApi } from "../api/testPlanApi";
import type { TestPlanSummary } from "../model/types";
import { DeleteButton } from "./fields";
import "./TestPlan.css";

interface Props {
  onNew: () => void;
  onOpen: (id: string) => void;
}

export function TestPlanList({ onNew, onOpen }: Props) {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<TestPlanSummary[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setPlans(await testPlanApi.list());
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function remove(id: string) {
    await testPlanApi.remove(id);
    void refresh();
  }

  return (
    <section className="tp">
      <header className="tp__header">
        <div>
          <h1>{t("testPlan.title")}</h1>
          <p className="tp__subtitle">{t("testPlan.subtitle")}</p>
        </div>
        <button className="tp__new" type="button" onClick={onNew}>
          {t("testPlan.new")}
        </button>
      </header>

      {loading ? (
        <p className="tp__muted">{t("common.loading")}</p>
      ) : plans.length === 0 ? (
        <p className="tp__muted">{t("testPlan.empty")}</p>
      ) : (
        <ul className="tp__list">
          {plans.map((p) => (
            <li key={p.id} className="tp__item">
              <button
                type="button"
                className="tp__item-open"
                onClick={() => onOpen(p.id)}
              >
                <span className="tp__item-title">{p.title}</span>
                <span className="tp__item-meta">
                  v{p.version} · {t(`testPlan.statusLabel.${p.status}`)} ·{" "}
                  {t("testPlan.revShort")} {p.revision}
                </span>
              </button>
              <DeleteButton needsConfirm onDelete={() => remove(p.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
