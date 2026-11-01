import { useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Columns3, List, Plus, Search, ShieldAlert, Trash2, TriangleAlert } from "lucide-react";
import { capabilities } from "@shared/platform";
import { ConfirmDialog } from "@shared/ui/ConfirmDialog";
import { DataTable, type DataColumn } from "@shared/ui/DataTable";
import { FilterChips } from "@shared/ui/FilterChips";
import { FilterMenuButton } from "@shared/ui/FilterMenuButton";
import { HeaderActionsContext, useHeaderActions } from "@shared/ui/headerActions";
import { PriorityFlag } from "@shared/ui/PriorityFlag";
import { SegmentedControl } from "@shared/ui/SegmentedControl";
import { useToast } from "@shared/ui/Toast";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { defectsApi } from "../api/defectsApi";
import { matches, type StatusFilter } from "../model/filter";
import { DEFECT_SEVERITIES, type Defect, type DefectInput, type LinkableItem, type ResultCandidate } from "../model/types";
import { DefectBoard } from "./DefectBoard";
import { DefectEditor } from "./DefectEditor";
import { ResultPickerDialog } from "./ResultPickerDialog";
import { SeverityPill, StatusBadge } from "./badges";
import { PRIORITY_TONE } from "./tones";
import "@shared/ui/buttons.css";
import "@shared/ui/filters.css";
import "./Defects.css";

type View = "list" | "board";
type Editing = { defect: Defect | null; draft?: DefectInput; fromLabel?: string };

const VIEW_KEY = "pharos.defects.view";
const readView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === "board" ? "board" : "list";
  } catch {
    return "list";
  }
};

/**
 * The defects of a project (DEF-01, ADR-0016): a list (table) and a board by
 * status, with filters, the editor, and «Desde un resultado» on the desktop.
 * No design exists for these screens in `docs/rediseno/`: they reuse the
 * primitives of the cases list (DataTable, chips, menus) and of the planner
 * board.
 */
export function DefectsPage({
  projectId,
  userId,
  cases = [],
  requirements = [],
}: {
  projectId: string;
  userId: string;
  /** Linkable cases and requirements (supplied by the composing module). */
  cases?: LinkableItem[];
  requirements?: LinkableItem[];
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const view = useBreakpoint();
  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<View>(readView);
  const [status, setStatus] = useState<StatusFilter>("open");
  const [severities, setSeverities] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Defect | null>(null);
  const [picking, setPicking] = useState(false);

  async function refresh() {
    try {
      setDefects(await defectsApi.list(projectId, userId));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    const onSync = () => void refresh();
    window.addEventListener("pharos:synced", onSync);
    return () => window.removeEventListener("pharos:synced", onSync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, userId]);

  const setView = (v: View) => {
    setMode(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // A per-viewer convenience only.
    }
  };

  const visible = useMemo(
    () => defects.filter((d) => matches(d, status, severities, query)),
    [defects, status, severities, query],
  );
  const statusCount = (s: StatusFilter) => defects.filter((d) => matches(d, s, severities, query)).length;
  const caseKey = useMemo(() => new Map(cases.map((c) => [c.id, c.key])), [cases]);
  const fromResults = capabilities.results();

  const actions = (
    <div className="df-actions">
      {fromResults && (
        <button type="button" className="ui-btn" onClick={() => setPicking(true)}>
          <TriangleAlert size={16} aria-hidden="true" />
          <span className="ui-btn__text">{t("defects.fromResult")}</span>
        </button>
      )}
      <button type="button" className="ui-btn ui-btn--primary" onClick={() => setEditing({ defect: null })}>
        <Plus size={16} aria-hidden="true" />
        <span className="ui-btn__text">{t("defects.newDefect")}</span>
      </button>
    </div>
  );
  const inHeader = useContext(HeaderActionsContext) !== null;
  useHeaderActions(editing ? null : actions);

  async function createFrom(r: ResultCandidate) {
    setPicking(false);
    try {
      const draft = await defectsApi.draftFromResult(r.resultId, userId);
      setEditing({ defect: null, draft, fromLabel: `${r.runKey} · ${r.caseKey ?? r.testKey}` });
    } catch (e) {
      toast(t("defects.saveFailed", { reason: e instanceof Error ? e.message : String(e) }));
    }
  }

  async function remove(d: Defect) {
    setDeleting(null);
    try {
      await defectsApi.remove(d.id, userId);
    } catch {
      toast(t("defects.deleteFailed"));
    }
    void refresh();
  }

  if (editing) {
    return (
      <DefectEditor
        projectId={projectId}
        userId={userId}
        defect={editing.defect}
        draft={editing.draft}
        fromLabel={editing.fromLabel}
        cases={cases}
        requirements={requirements}
        onClose={() => {
          setEditing(null);
          void refresh();
        }}
      />
    );
  }

  const date = (s: string) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage, { day: "numeric", month: "short", year: "numeric" }).format(
      new Date(s.includes("T") ? s : `${s.replace(" ", "T")}Z`),
    );

  const columns: DataColumn<Defect>[] = [
    {
      id: "key",
      header: t("defects.column.key"),
      width: "96px",
      cell: (d) => <span className="df-key">{d.defectKey}</span>,
    },
    {
      id: "title",
      header: t("defects.column.title"),
      width: "minmax(0,2.6fr)",
      cell: (d) => (
        <button type="button" className="df-open" onClick={() => setEditing({ defect: d })} title={d.title}>
          {d.title}
        </button>
      ),
    },
    {
      id: "severity",
      header: t("defects.column.severity"),
      width: "110px",
      cell: (d) => <SeverityPill severity={d.severity} />,
    },
    {
      id: "priority",
      header: t("defects.column.priority"),
      width: "104px",
      minView: "tablet",
      cell: (d) => (
        <PriorityFlag tone={PRIORITY_TONE[d.priority]} label={t(`defects.priority.${d.priority}`)} showLabel />
      ),
    },
    {
      id: "status",
      header: t("defects.column.status"),
      width: "150px",
      cell: (d) => <StatusBadge defect={d} />,
    },
    {
      id: "cases",
      header: t("defects.column.cases"),
      width: "minmax(0,1fr)",
      minView: "desktop",
      cell: (d) => (
        <span className="df-cases">{d.caseIds.map((id) => caseKey.get(id) ?? "—").join(", ") || "—"}</span>
      ),
    },
    {
      id: "updated",
      header: t("defects.column.updated"),
      width: "112px",
      minView: "desktop",
      cell: (d) => <span className="df-muted">{date(d.updatedAt)}</span>,
    },
    {
      id: "actions",
      header: <span className="sr-only">{t("common.delete")}</span>,
      width: "44px",
      align: "end",
      cell: (d) => (
        <button
          type="button"
          className="df-icon-btn"
          aria-label={`${t("defects.delete")}: ${d.defectKey}`}
          title={t("defects.delete")}
          onClick={() => setDeleting(d)}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      ),
    },
  ];

  const card = (d: Defect) => (
    <div className="df-mcard">
      <div className="df-mcard__top">
        <span className="df-key">{d.defectKey}</span>
        <SeverityPill severity={d.severity} />
        <span className="df-spacer" />
        <StatusBadge defect={d} />
      </div>
      <button type="button" className="df-open" onClick={() => setEditing({ defect: d })}>
        {d.title}
      </button>
    </div>
  );

  return (
    <div className="df">
      {!inHeader && <div className="df-head">{actions}</div>}
      <div className="df-toolbar">
        <FilterChips
          label={t("defects.filter.label")}
          options={(["open", "all", "closed"] as const).map((s) => ({
            value: s,
            label: t(`defects.filter.${s}`),
            count: statusCount(s),
          }))}
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
        />
        <label className="ui-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">{t("defects.filter.searchLabel")}</span>
          <input
            type="search"
            value={query}
            placeholder={t("defects.filter.search")}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <FilterMenuButton
          label={t("defects.filter.severity")}
          icon={ShieldAlert}
          options={DEFECT_SEVERITIES.map((s) => ({ value: s, label: t(`defects.severity.${s}`) }))}
          selected={severities}
          onChange={setSeverities}
        />
        <span className="df-spacer" />
        <SegmentedControl<View>
          label={t("defects.view.label")}
          size="sm"
          value={mode}
          onChange={setView}
          options={[
            { value: "list", label: t("defects.view.list"), icon: List },
            { value: "board", label: t("defects.view.board"), icon: Columns3 },
          ]}
        />
      </div>

      {loading ? (
        <p className="df-empty">{t("common.loading")}</p>
      ) : defects.length === 0 ? (
        <p className="df-empty">{t("defects.empty")}</p>
      ) : mode === "board" ? (
        <DefectBoard
          defects={visible}
          userId={userId}
          onOpen={(d) => setEditing({ defect: d })}
          onChanged={(d) => setDefects((all) => all.map((x) => (x.id === d.id ? d : x)))}
        />
      ) : (
        <DataTable
          rows={visible}
          columns={columns}
          getRowId={(d) => d.id}
          label={t("defects.title")}
          mobileCard={card}
          minWidth={view === "desktop" ? 860 : 600}
          empty={
            <div className="df-nomatch">
              <p>{t("defects.noMatch")}</p>
              <button
                type="button"
                className="ui-btn ui-btn--small"
                onClick={() => {
                  setStatus("all");
                  setSeverities(new Set());
                  setQuery("");
                }}
              >
                {t("defects.clearFilters")}
              </button>
            </div>
          }
        />
      )}

      {picking && (
        <ResultPickerDialog
          projectId={projectId}
          userId={userId}
          purpose="create"
          onPick={(r) => void createFrom(r)}
          onClose={() => setPicking(false)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          variant="destructive"
          title={t("defects.deleteTitle")}
          message={t("defects.deleteMessage", { defect: `${deleting.defectKey} ${deleting.title}` })}
          confirmLabel={t("defects.deleteConfirm")}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void remove(deleting)}
        />
      )}
    </div>
  );
}
