import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { templateApi } from "../api/templateApi";
import { builtinSeeds } from "../model/builtins";
import type { TemplateKind, TemplateSummary } from "../model/types";
import "./Templates.css";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Template repository (spec §6): the bundled PHAROS templates plus any imported
 *  ones, grouped by kind. Built-ins are seeded on first load. */
export function TemplatesPage() {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await templateApi.seed(await builtinSeeds());
      } catch {
        /* seeding is best-effort; listing still works */
      }
      const list = await templateApi.list();
      if (!cancelled) {
        setTemplates(list);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function download(tpl: TemplateSummary) {
    setDownloading(tpl.id);
    try {
      const full = await templateApi.get(tpl.id);
      if (!full) return;
      const bin = atob(full.dataBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tpl.name}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  }

  const kinds: TemplateKind[] = ["plan", "case"];

  return (
    <section className="tpl">
      <header className="tpl__header">
        <h1>{t("templates.title")}</h1>
        <p className="tpl__subtitle">{t("templates.subtitle")}</p>
      </header>

      {loading ? (
        <p className="tpl__muted">{t("common.loading")}</p>
      ) : (
        kinds.map((kind) => {
          const group = templates.filter((tpl) => tpl.kind === kind);
          if (group.length === 0) return null;
          return (
            <div key={kind} className="tpl__group">
              <h2 className="tpl__group-title">{t(`templates.kind.${kind}`)}</h2>
              <ul className="tpl__list">
                {group.map((tpl) => (
                  <li key={tpl.id} className="tpl__card">
                    <div className="tpl__card-main">
                      <span className="tpl__name">{tpl.name}</span>
                      <span className="tpl__meta">
                        <span className="tpl__badge">{tpl.language.toUpperCase()}</span>
                        <span className="tpl__ver">v{tpl.version}</span>
                        {tpl.isBuiltin && (
                          <span className="tpl__badge tpl__badge--builtin">
                            {t("templates.builtin")}
                          </span>
                        )}
                      </span>
                      {tpl.description && <p className="tpl__desc">{tpl.description}</p>}
                    </div>
                    <button
                      type="button"
                      className="tpl__download"
                      disabled={downloading === tpl.id}
                      onClick={() => void download(tpl)}
                    >
                      {t("templates.download")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
}
