import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { DeleteButton } from "@shared/ui/fields";
import { projectApi } from "../api/projectApi";
import type { ProjectSummary } from "../model/types";
import { ProjectDetail } from "./ProjectDetail";
import "./Projects.css";

type View = { kind: "list" } | { kind: "detail"; id: string };

export function ProjectsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const ownerId = user?.id ?? "";
  const [view, setView] = useState<View>({ kind: "list" });
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  async function refresh() {
    setProjects(await projectApi.list(ownerId));
    setLoading(false);
  }
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const project = await projectApi.create({ name: trimmed, ownerId });
    setName("");
    setCreating(false);
    await refresh();
    if (project) setView({ kind: "detail", id: project.id });
  }

  async function remove(id: string) {
    await projectApi.remove(id, ownerId);
    void refresh();
  }

  if (view.kind === "detail") {
    return (
      <ProjectDetail projectId={view.id} onClose={() => setView({ kind: "list" })} />
    );
  }

  return (
    <section className="tp">
      <header className="tp__header">
        <div>
          <h1>{t("projects.title")}</h1>
          <p className="tp__subtitle">{t("projects.subtitle")}</p>
        </div>
        <button className="tp__new" type="button" onClick={() => setCreating(true)}>
          {t("projects.new")}
        </button>
      </header>

      {creating && (
        <div className="pj-create">
          <input
            autoFocus
            value={name}
            placeholder={t("projects.namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <button type="button" className="tp__new" onClick={create} disabled={!name.trim()}>
            {t("projects.create")}
          </button>
          <button
            type="button"
            className="pj-create__cancel"
            onClick={() => {
              setCreating(false);
              setName("");
            }}
          >
            {t("common.cancel")}
          </button>
        </div>
      )}

      {loading ? (
        <p className="tp__muted">{t("common.loading")}</p>
      ) : projects.length === 0 && !creating ? (
        <p className="tp__muted">{t("projects.empty")}</p>
      ) : (
        <ul className="tp__list">
          {projects.map((p) => (
            <li key={p.id} className="tp__item">
              <button
                type="button"
                className="tp__item-open"
                onClick={() => setView({ kind: "detail", id: p.id })}
              >
                <span className="tp__item-title">
                  <span className="pj-folder" aria-hidden="true">
                    ▸
                  </span>{" "}
                  {p.name}
                </span>
                <span className="tp__item-meta">
                  {t("projects.prefixMeta")}: {p.caseIdPrefix}
                  {"1".padStart(p.caseIdDigits, "0")}
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
