import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { suggestTests, type TestSuggestion } from "@modules/ai";
import { planContextForProject } from "@modules/test-plan";
import "@shared/ui/ConfirmDialog.css";
import "./TestCase.css";

type Phase = "loading" | "list" | "empty" | "creating";

/** AI test suggestions from the project's plan (spec §5.2): fetch the plan
 *  context, ask the AI for a list, let the user pick, then create the chosen
 *  cases (title + description, basic level). Nothing is created until confirmed. */
export function SuggestTestsModal({
  projectId,
  onCreate,
  onClose,
}: {
  projectId: string;
  onCreate: (items: TestSuggestion[]) => Promise<void>;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [phase, setPhase] = useState<Phase>("loading");
  const [items, setItems] = useState<TestSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const context = await planContextForProject(projectId);
        const list = context
          ? await suggestTests(context, i18n.resolvedLanguage ?? "es")
          : [];
        if (cancelled) return;
        setItems(list);
        setSelected(new Set(list.map((_, i) => i)));
        setPhase(list.length ? "list" : "empty");
      } catch {
        if (!cancelled) setPhase("empty");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, i18n.resolvedLanguage]);

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function create() {
    setPhase("creating");
    await onCreate(items.filter((_, i) => selected.has(i)));
    onClose();
  }

  return (
    <div className="cd-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="cd tc-suggest" onClick={(e) => e.stopPropagation()}>
        <h3 className="cd__title">{t("testCase.suggest.title")}</h3>

        {phase === "loading" ? (
          <p className="cd__msg">{t("testCase.suggest.loading")}</p>
        ) : phase === "empty" ? (
          <p className="cd__msg">{t("testCase.suggest.empty")}</p>
        ) : (
          <ul className="tc-suggest__list">
            {items.map((s, i) => (
              <li key={i} className="tc-suggest__row">
                <label className="tc-suggest__check">
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                  <span>
                    <span className="tc-suggest__name">{s.title}</span>
                    {s.description && <span className="tc-suggest__desc">{s.description}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="cd__actions">
          <button type="button" className="cd__cancel" onClick={onClose}>
            {t("common.cancel")}
          </button>
          {phase === "list" && (
            <button
              type="button"
              className="cd__confirm"
              disabled={selected.size === 0}
              onClick={() => void create()}
            >
              {t("testCase.suggest.create", { count: selected.size })}
            </button>
          )}
          {phase === "creating" && (
            <button type="button" className="cd__confirm" disabled>
              {t("testCase.suggest.creating")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
