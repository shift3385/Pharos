import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { testPlanApi } from "../api/testPlanApi";
import type { TestPlan, TestPlanInput } from "../model/types";
import "./TestPlan.css";

interface Props {
  planId: string | null;
  onClose: () => void;
}

// Note: this is the initial editor covering the core fields. Phase 3 task 24
// grows it into the full stepped 21-step wizard (spec §5.1).
export function TestPlanEditor({ planId, onClose }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [plan, setPlan] = useState<TestPlan | null>(null);
  const [form, setForm] = useState({
    title: "",
    version: "1.0",
    status: "draft",
    planDate: "",
    summary: "",
    purpose: "",
    conclusion: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (planId) {
        const p = await testPlanApi.get(planId);
        if (p && !cancelled) {
          setPlan(p);
          setForm({
            title: p.title,
            version: p.version,
            status: p.status,
            planDate: p.planDate ?? "",
            summary: p.data.summary ?? "",
            purpose: p.data.purpose ?? "",
            conclusion: p.data.conclusion ?? "",
          });
        }
      } else if (!cancelled) {
        setForm((f) => ({
          ...f,
          title: t("testPlan.defaultTitle"),
          planDate: new Date().toISOString().slice(0, 10),
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planId, t]);

  const update =
    (key: keyof typeof form) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save() {
    setSaving(true);
    const author = user ? `${user.firstName} ${user.lastName}` : "";
    const input: TestPlanInput = {
      title: form.title,
      version: form.version,
      status: form.status,
      planDate: form.planDate || null,
      author,
      data: {
        ...(plan?.data ?? {}),
        summary: form.summary,
        purpose: form.purpose,
        conclusion: form.conclusion,
      },
    };
    if (plan) await testPlanApi.update(plan.id, input);
    else await testPlanApi.create(input);
    setSaving(false);
    onClose();
  }

  return (
    <section className="tp-editor">
      <header className="tp-editor__header">
        <button type="button" className="tp-editor__back" onClick={onClose}>
          ← {t("testPlan.back")}
        </button>
        <h1>{plan ? t("testPlan.editTitle") : t("testPlan.newTitle")}</h1>
        {plan && (
          <span className="tp-editor__rev">
            {t("testPlan.revShort")} {plan.revision}
          </span>
        )}
      </header>

      <div className="tp-editor__grid">
        <label className="tp-field">
          <span>{t("testPlan.fieldTitle")}</span>
          <input value={form.title} onChange={update("title")} required />
        </label>
        <label className="tp-field">
          <span>{t("testPlan.version")}</span>
          <input value={form.version} onChange={update("version")} />
        </label>
        <label className="tp-field">
          <span>{t("testPlan.date")}</span>
          <input type="date" value={form.planDate} onChange={update("planDate")} />
        </label>
        <label className="tp-field">
          <span>{t("testPlan.status")}</span>
          <select value={form.status} onChange={update("status")}>
            <option value="draft">{t("testPlan.statusLabel.draft")}</option>
            <option value="reviewed">{t("testPlan.statusLabel.reviewed")}</option>
            <option value="approved">{t("testPlan.statusLabel.approved")}</option>
            <option value="obsolete">{t("testPlan.statusLabel.obsolete")}</option>
          </select>
        </label>
      </div>

      <label className="tp-field">
        <span>{t("testPlan.summary")}</span>
        <textarea rows={3} value={form.summary} onChange={update("summary")} />
      </label>
      <label className="tp-field">
        <span>{t("testPlan.purpose")}</span>
        <textarea rows={3} value={form.purpose} onChange={update("purpose")} />
      </label>
      <label className="tp-field">
        <span>{t("testPlan.conclusion")}</span>
        <textarea rows={3} value={form.conclusion} onChange={update("conclusion")} />
      </label>

      <div className="tp-editor__actions">
        <button
          type="button"
          className="tp-editor__save"
          onClick={save}
          disabled={saving || !form.title}
        >
          {saving ? t("testPlan.saving") : t("testPlan.save")}
        </button>
      </div>
    </section>
  );
}
