import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Upload } from "lucide-react";
import { useAuth } from "@modules/auth";
import type { Run, RunCounts, UnlinkedTest } from "@shared/contracts/contract";
import { isTauri } from "@shared/platform";
import { DataTable, type DataColumn } from "@shared/ui/DataTable";
import { FilterChips } from "@shared/ui/FilterChips";
import {
  HeaderActionsContext,
  useHeaderActions,
} from "@shared/ui/headerActions";
import { StatusPill } from "@shared/ui/StatusPill";
import { TabPanel, Tabs } from "@shared/ui/Tabs";
import { useToast } from "@shared/ui/Toast";
import { runsApi } from "../api/runsApi";
import { instantOf, statusTone, type LinkableCase } from "../model/types";
import { ImportReportDialog } from "./ImportReportDialog";
import { UnlinkedTray } from "./UnlinkedTray";
import "@shared/ui/buttons.css";
import "./Runs.css";

type Tab = "runs" | "unlinked";
type Origin = "all" | "import";

/** «Ejecuciones» (`/projects/:id/runs`): the project's runs and the tray of
 *  unlinked imported tests (ING-05), with «Importar informe» in the header.
 *  The run screen arrives with manual execution (EJE-02, step 7) in this same
 *  section. No design in docs/rediseno: built with the tabs, table, chips and
 *  pill primitives. */
export function RunsPage({
  projectId,
  cases,
}: {
  projectId: string;
  cases: LinkableCase[];
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("runs");
  const [origin, setOrigin] = useState<Origin>("all");
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [counts, setCounts] = useState<Record<string, RunCounts>>({});
  const [unlinked, setUnlinked] = useState<UnlinkedTest[]>([]);
  const [importing, setImporting] = useState(false);
  const [failed, setFailed] = useState(false);
  const latest = useRef(0);

  /** Loads the runs, their counts (one call) and the tray; a failure shows
   *  an error with «Reintentar» instead of loading for ever. */
  async function refresh() {
    const request = ++latest.current;
    try {
      const [list, tray, all] = await Promise.all([
        runsApi.list(projectId, userId),
        runsApi.unlinked(projectId, userId),
        runsApi.counts(projectId, userId),
      ]);
      if (request !== latest.current) return;
      setRuns(list);
      setUnlinked(tray);
      setCounts(Object.fromEntries(all.map((c) => [c.runId, c])));
      setFailed(false);
    } catch {
      if (request === latest.current) setFailed(true);
    }
  }
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, userId]);

  const inHeader = useContext(HeaderActionsContext) !== null;
  const actions = (
    <button
      type="button"
      className="ui-btn ui-btn--primary"
      onClick={() => setImporting(true)}
      disabled={!isTauri()}
      title={isTauri() ? undefined : t("sync.web.desktopOnly")}
    >
      <Upload size={16} aria-hidden="true" />
      <span className="ui-btn__text">{t("runs.import.open")}</span>
    </button>
  );
  useHeaderActions(actions);

  const date = (s: string | null) => {
    const at = s ? instantOf(s) : undefined;
    return at ? at.toLocaleString(i18n.resolvedLanguage) : "—";
  };
  const pending = unlinked.filter((x) => !x.mappedCaseId).length;
  const shown = (runs ?? []).filter(
    (r) => origin === "all" || r.trigger === "import",
  );
  const columns: DataColumn<Run>[] = [
    {
      id: "key",
      header: t("runs.list.key"),
      cell: (r) => <span className="rn-mono">{r.runKey}</span>,
      width: "96px",
    },
    {
      id: "title",
      header: t("runs.list.title"),
      cell: (r) => (
        <span className="rn-test">
          <span>{r.title}</span>
          <span className="tp-field__hint">
            {[
              t(`runs.trigger.${r.trigger}`),
              r.sourceTool,
              r.build && t("runs.list.build", { build: r.build }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
      ),
    },
    {
      id: "status",
      header: t("runs.list.status"),
      cell: (r) => (
        <StatusPill tone={r.status === "in_progress" ? "info" : "neutral"}>
          {t(`runs.runStatus.${r.status}`)}
        </StatusPill>
      ),
    },
    {
      id: "results",
      header: t("runs.list.results"),
      cell: (r) => {
        const c = counts[r.id];
        if (!c) return "…";
        return (
          <span className="rn-counts">
            <StatusPill tone={statusTone("passed")} dot>
              {c.passed}
            </StatusPill>
            <StatusPill tone={statusTone("failed")} dot>
              {c.failed}
            </StatusPill>
            {c.other > 0 && <StatusPill tone="neutral">{c.other}</StatusPill>}
            {c.unlinked > 0 && (
              <span className="tp-field__hint">
                {t("runs.list.unlinked", { count: c.unlinked })}
              </span>
            )}
            <span className="sr-only">
              {t("runs.list.countsSr", {
                passed: c.passed,
                failed: c.failed,
                other: c.other,
              })}
            </span>
          </span>
        );
      },
    },
    {
      id: "started",
      header: t("runs.list.started"),
      cell: (r) => date(r.startedAt),
      minView: "tablet",
    },
  ];

  return (
    <div className="rn">
      <h2 className="sr-only">{t("projects.tab.runs")}</h2>
      {!inHeader && <div className="rn-actions">{actions}</div>}
      <Tabs
        label={t("projects.tab.runs")}
        variant="underline"
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        items={[
          { id: "runs", label: t("runs.tabs.runs") },
          {
            id: "unlinked",
            label: t("runs.tabs.unlinked"),
            badge:
              pending > 0
                ? {
                    count: pending,
                    tone: "navy",
                    title: t("runs.tabs.unlinkedBadge", { count: pending }),
                  }
                : undefined,
          },
        ]}
      />
      <TabPanel id={tab}>
        {failed ? (
          <div className="rn-error-state" role="alert">
            <p>{t("runs.list.loadError")}</p>
            <button
              type="button"
              className="ui-btn ui-btn--small"
              onClick={() => void refresh()}
            >
              {t("runs.list.retry")}
            </button>
          </div>
        ) : runs === null ? (
          <p className="tp-field__hint">{t("common.loading")}</p>
        ) : tab === "runs" ? (
          <>
            <FilterChips
              label={t("runs.list.origin")}
              value={origin}
              onChange={(v) => setOrigin(v as Origin)}
              options={[
                { value: "all", label: t("runs.list.all"), count: runs.length },
                {
                  value: "import",
                  label: t("runs.list.imported"),
                  count: runs.filter((r) => r.trigger === "import").length,
                },
              ]}
            />
            <DataTable
              label={t("runs.tabs.runs")}
              rows={shown}
              columns={columns}
              getRowId={(r) => r.id}
              empty={<p className="tp-field__hint">{t("runs.list.empty")}</p>}
              mobileCard={(r) => (
                <div className="rn-card">
                  <div className="rn-card__row">
                    <span className="rn-mono">{r.runKey}</span>
                    {columns[2].cell(r)}
                  </div>
                  {columns[1].cell(r)}
                  <div className="rn-card__row">{columns[3].cell(r)}</div>
                </div>
              )}
            />
          </>
        ) : (
          <UnlinkedTray
            tests={unlinked}
            cases={cases}
            onLink={async (testKey, caseId) => {
              // A failure reaches the tray, which says so and keeps the
              // dialog open; the list reloads only after a link.
              await runsApi.link(projectId, testKey, caseId, userId);
              toast(
                caseId
                  ? t("runs.tray.linkedToast")
                  : t("runs.tray.unlinkedToast"),
              );
              void refresh();
            }}
          />
        )}
      </TabPanel>
      {importing && (
        <ImportReportDialog
          projectId={projectId}
          userId={userId}
          runs={runs ?? []}
          onClose={() => setImporting(false)}
          onImported={() => void refresh()}
        />
      )}
    </div>
  );
}
