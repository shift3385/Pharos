import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { CalendarRange, Plus } from "lucide-react";
import { useAuth } from "@modules/auth";
import { DataTable, type DataColumn } from "@shared/ui/DataTable";
import { SegmentedControl } from "@shared/ui/SegmentedControl";
import { StatusPill } from "@shared/ui/StatusPill";
import { useToast } from "@shared/ui/Toast";
import { configurationApi, cycleApi } from "../api/cycleApi";
import {
  CYCLE_STATUSES,
  cycleTone,
  type CaseOption,
  type Configuration,
  type CycleSummary,
  type TestCycleInput,
} from "../model/types";
import { cycleError, dateRange } from "../model/messages";
import { CycleDialog } from "./CycleDialog";
import { CycleDetail } from "./CycleDetail";
import { ProgressBar } from "./ProgressBar";
import "@shared/ui/buttons.css";
import "./Cycles.css";

type StatusFilter = "all" | (typeof CYCLE_STATUSES)[number];


/** «Ciclos» of a project (CYC-01, ADR-0017): the list of cycles with their
 *  progress, and one cycle's detail when `?cycle=<id>` is in the URL (so
 *  «atrás», a reload and a shared link keep it open). No design in
 *  docs/rediseno covers this screen: it is built with the existing
 *  primitives (DataTable, StatusPill, SegmentedControl, Dialog). */
export function CyclesPage({
  projectId,
  loadCases,
  requirementKeys,
}: {
  projectId: string;
  /** The project's cases, for «Añadir casos» (loaded by the composing page). */
  loadCases: () => Promise<CaseOption[]>;
  requirementKeys: string[];
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [params, setParams] = useSearchParams();
  const openId = params.get("cycle");
  const [cycles, setCycles] = useState<CycleSummary[] | null>(null);
  const [configurations, setConfigurations] = useState<Configuration[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const notify = useRef({ toast, t });
  notify.current = { toast, t };
  const reload = useCallback(async () => {
    try {
      const [list, configs] = await Promise.all([
        cycleApi.list(projectId, userId),
        configurationApi.list(projectId, userId, true),
      ]);
      setCycles(list);
      setConfigurations(configs);
    } catch {
      setCycles([]);
      notify.current.toast(notify.current.t("cycles.loadFailed"), "error");
    }
  }, [projectId, userId]);
  useEffect(() => {
    void reload();
    window.addEventListener("pharos:synced", reload);
    return () => window.removeEventListener("pharos:synced", reload);
  }, [reload]);

  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("cycle", id);
    else next.delete("cycle");
    setParams(next);
  };

  async function create(input: TestCycleInput) {
    try {
      const created = await cycleApi.create(input);
      toast(t("cycles.createdToast", { key: created?.cycleKey ?? "" }));
      setCreating(false);
      setError("");
      await reload();
      if (created) open(created.id);
    } catch (e) {
      setError(cycleError(t, e));
    }
  }

  const shown = useMemo(
    () => (cycles ?? []).filter((c) => filter === "all" || c.status === filter),
    [cycles, filter],
  );
  const lang = i18n.resolvedLanguage;

  if (openId) {
    return (
      <CycleDetail
        key={openId}
        cycleId={openId}
        projectId={projectId}
        userId={userId}
        configurations={configurations}
        loadCases={loadCases}
        requirementKeys={requirementKeys}
        onBack={() => {
          open(null);
          void reload();
        }}
        onOpen={(id) => open(id)}
        onChanged={() => void reload()}
      />
    );
  }

  const columns: DataColumn<CycleSummary>[] = [
    {
      id: "key",
      header: t("cycles.col.key"),
      width: "96px",
      cell: (c) => (
        <button type="button" className="cy-link cy-key" onClick={() => open(c.id)}>
          {c.cycleKey}
        </button>
      ),
    },
    {
      id: "title",
      header: t("cycles.col.title"),
      width: "minmax(180px,2fr)",
      cell: (c) => (
        <span className="cy-cell-title">
          <span className="cy-cell-title__main">{c.title}</span>
          {(c.build || c.environment) && (
            <span className="cy-cell-title__meta">{[c.build, c.environment].filter(Boolean).join(" · ")}</span>
          )}
        </span>
      ),
    },
    {
      id: "status",
      header: t("cycles.col.status"),
      width: "112px",
      cell: (c) => <StatusPill tone={cycleTone(c.status)}>{t(`cycles.status.${c.status}`, c.status)}</StatusPill>,
    },
    {
      id: "dates",
      header: t("cycles.col.dates"),
      width: "140px",
      minView: "tablet",
      cell: (c) => dateRange(c.startsOn, c.endsOn, lang) || "—",
    },
    {
      id: "configurations",
      header: t("cycles.col.configurations"),
      width: "112px",
      minView: "desktop",
      align: "end",
      cell: (c) => c.configurationIds.length,
    },
    {
      id: "progress",
      header: t("cycles.col.progress"),
      width: "minmax(132px,1fr)",
      cell: (c) => <ProgressBar summary={c.progress} />,
    },
    {
      id: "runs",
      header: t("cycles.col.runs"),
      width: "64px",
      minView: "desktop",
      align: "end",
      cell: (c) => c.runs,
    },
  ];

  return (
    <section className="cy-page" aria-labelledby="cy-title">
      <div className="cy-page__head">
        <div>
          <h2 id="cy-title" className="pj-section-title">
            {t("cycles.title")}
          </h2>
          <p className="pj-card-box__desc">{t("cycles.subtitle")}</p>
        </div>
        <button
          type="button"
          className="ui-btn ui-btn--primary"
          onClick={() => {
            setError("");
            setCreating(true);
          }}
        >
          <Plus size={16} aria-hidden="true" />
          {t("cycles.new")}
        </button>
      </div>
      <SegmentedControl<StatusFilter>
        label={t("cycles.filterLabel")}
        size="sm"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: t("cycles.all") },
          ...CYCLE_STATUSES.map((s) => ({ value: s, label: t(`cycles.statusPlural.${s}`) })),
        ]}
      />
      {cycles === null ? (
        <p className="tp__muted">{t("common.loading")}</p>
      ) : (
        <DataTable
          rows={shown}
          columns={columns}
          getRowId={(c) => c.id}
          label={t("cycles.listLabel")}
          minWidth={640}
          empty={
            <p className="cy-empty">
              <CalendarRange size={18} aria-hidden="true" />
              <span>{cycles.length === 0 ? t("cycles.empty") : t("cycles.emptyFilter")}</span>
            </p>
          }
          mobileCard={(c) => (
            <div className="cy-mcard">
              <div className="cy-mcard__top">
                <button type="button" className="cy-link cy-key" onClick={() => open(c.id)}>
                  {c.cycleKey}
                </button>
                <StatusPill tone={cycleTone(c.status)}>{t(`cycles.status.${c.status}`, c.status)}</StatusPill>
              </div>
              <span className="cy-mcard__title">{c.title}</span>
              {dateRange(c.startsOn, c.endsOn, lang) && (
                <span className="cy-cell-title__meta">{dateRange(c.startsOn, c.endsOn, lang)}</span>
              )}
              <ProgressBar summary={c.progress} />
            </div>
          )}
        />
      )}
      {creating && (
        <CycleDialog
          cycle={null}
          projectId={projectId}
          userId={userId}
          configurations={configurations}
          error={error}
          onSave={create}
          onCancel={() => setCreating(false)}
        />
      )}
    </section>
  );
}
