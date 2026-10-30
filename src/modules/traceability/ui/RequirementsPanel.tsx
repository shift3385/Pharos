import { useTranslation } from "react-i18next";
import { Pencil, Sparkles, Trash2 } from "lucide-react";
import { DataTable, type DataColumn } from "@shared/ui/DataTable";
import { StatusPill } from "@shared/ui/StatusPill";
import { PriorityFlag } from "@shared/ui/PriorityFlag";
import type { TraceabilityMatrix } from "../model/matrix";
import type { Requirement } from "../model/types";
import { priorityTone } from "./traceTones";
import "@shared/ui/buttons.css";
import "./Traceability.css";

/** Requirements of a project (TRZ-01, RED-V3): the test basis with how many
 *  cases verify each one and whether it is covered; edit, delete and «Generar
 *  casos con IA» (IA-05) per row. The page owns the data and the dialogs. */
export function RequirementsPanel({
  requirements,
  matrix,
  aiReady,
  onEdit,
  onDelete,
  onGenerate,
}: {
  requirements: Requirement[];
  matrix: TraceabilityMatrix;
  aiReady: boolean;
  onEdit: (r: Requirement) => void;
  onDelete: (r: Requirement) => void;
  onGenerate: (requirementKey: string) => void;
}) {
  const { t } = useTranslation();
  const linked = (key: string) => matrix.rows.filter((r) => r.requirementKey === key && r.caseId).length;
  const uncovered = new Set(matrix.gaps.uncoveredRequirements);

  const actions = (r: Requirement) => {
    const ai = t("traceability.generate.button", { key: r.requirementKey });
    const del = t("traceability.requirement.delete", { key: r.requirementKey });
    return (
      <span className="tz-rowactions">
        <button
          type="button"
          className="ui-iconbtn"
          aria-label={ai}
          aria-disabled={!aiReady || undefined}
          title={aiReady ? ai : t("ai.assist.unavailable")}
          onClick={() => {
            if (aiReady) onGenerate(r.requirementKey);
          }}
        >
          <Sparkles size={16} aria-hidden="true" />
        </button>
        <button type="button" className="ui-iconbtn tz-danger" aria-label={del} title={del} onClick={() => onDelete(r)}>
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </span>
    );
  };
  const coverage = (r: Requirement) => {
    const state = uncovered.has(r.requirementKey) ? "not_covered" : "covered";
    return (
      <StatusPill tone={state === "covered" ? "success" : "error"}>{t(`traceability.coverage.${state}`)}</StatusPill>
    );
  };
  const open = (r: Requirement) => (
    <button type="button" className="tz-open" title={r.title} onClick={() => onEdit(r)}>
      <span className="tz-open__title">{r.title}</span>
      <Pencil size={14} aria-hidden="true" />
    </button>
  );
  const flag = (r: Requirement) => (
    <PriorityFlag tone={priorityTone(r.priority)} label={t(`traceability.priorityLabel.${r.priority}`)} showLabel />
  );

  const columns: DataColumn<Requirement>[] = [
    {
      id: "key",
      header: t("traceability.matrix.col.requirement"),
      width: "96px",
      cell: (r) => <span className="tr-key">{r.requirementKey}</span>,
    },
    {
      id: "title",
      header: t("traceability.matrix.col.requirementTitle"),
      width: "minmax(0,2fr)",
      cell: (r) => (
        <span className="tz-reqcell">
          {open(r)}
          {r.description && (
            <span className="tz-muted tz-clip" title={r.description}>
              {r.description}
            </span>
          )}
        </span>
      ),
    },
    { id: "priority", header: t("traceability.matrix.col.priority"), width: "92px", cell: flag },
    {
      id: "cases",
      header: t("traceability.requirement.cases"),
      width: "72px",
      align: "end",
      cell: (r) => <span className="tz-num">{linked(r.requirementKey)}</span>,
    },
    { id: "coverage", header: t("traceability.matrix.col.coverage"), width: "104px", cell: coverage },
    {
      id: "actions",
      header: <span className="sr-only">{t("traceability.requirement.actions")}</span>,
      width: "92px",
      align: "end",
      cell: actions,
    },
  ];

  return (
    <section className="tz-panel" aria-labelledby="tz-req-title">
      <div className="tz-panel__head">
        <h3 id="tz-req-title">{t("traceability.requirement.listTitle")}</h3>
        <p className="tr__subtitle">{t("traceability.requirement.listSubtitle")}</p>
      </div>
      <DataTable
        rows={requirements}
        columns={columns}
        getRowId={(r) => r.id}
        label={t("traceability.requirement.listTitle")}
        rowTone={(r) => (uncovered.has(r.requirementKey) ? "gap" : undefined)}
        minWidth={720}
        empty={t("traceability.requirement.empty")}
        mobileCard={(r) => (
          <div className="tz-reqcard">
            <div className="tz-card__top">
              <span className="tr-key">{r.requirementKey}</span>
              {coverage(r)}
            </div>
            {open(r)}
            <span className="tz-reqcard__meta">
              {flag(r)}
              <span>{t("traceability.matrix.linkedCases", { count: linked(r.requirementKey) })}</span>
            </span>
            {actions(r)}
          </div>
        )}
      />
    </section>
  );
}
