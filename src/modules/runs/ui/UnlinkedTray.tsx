import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { UnlinkedTest } from "@shared/contracts/contract";
import { DataTable, type DataColumn } from "@shared/ui/DataTable";
import { FilterChips } from "@shared/ui/FilterChips";
import { StatusPill } from "@shared/ui/StatusPill";
import { useToast } from "@shared/ui/Toast";
import { statusTone, type LinkableCase } from "../model/types";
import { LinkCaseDialog } from "./LinkCaseDialog";
import "@shared/ui/buttons.css";
import "./Runs.css";

type Filter = "unlinked" | "mapped" | "all";

/** The unlinked tray (ING-05): imported tests with no case of their own, one
 *  row per `test_key`. Linking one writes an `unlinked_mapping` rule that
 *  applies to its past and future results; the results never change. No
 *  design in docs/rediseno: built with the table, chips and pill primitives. */
export function UnlinkedTray({
  tests,
  cases,
  onLink,
}: {
  tests: UnlinkedTest[];
  cases: LinkableCase[];
  onLink: (testKey: string, caseId: string | null) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>("unlinked");
  const [linking, setLinking] = useState<UnlinkedTest | null>(null);
  const toast = useToast();
  /** Unlinking has no dialog: a failure is said in a toast. */
  const unlink = async (x: UnlinkedTest) => {
    try {
      await onLink(x.testKey, null);
    } catch {
      toast(t("runs.tray.linkError"), "error");
    }
  };
  const byId = useMemo(() => new Map(cases.map((c) => [c.id, c])), [cases]);
  const unlinked = tests.filter((x) => !x.mappedCaseId);
  const mapped = tests.filter((x) => x.mappedCaseId);
  const rows =
    filter === "unlinked" ? unlinked : filter === "mapped" ? mapped : tests;

  const name = (x: UnlinkedTest) => (
    <span className="rn-test">
      <span>{x.name}</span>
      <span className="rn-mono rn-key">{x.testKey}</span>
    </span>
  );
  const why = (x: UnlinkedTest) =>
    x.mappedCaseId ? (
      <StatusPill tone="info">
        {t("runs.tray.mappedTo", {
          key: byId.get(x.mappedCaseId)?.scenarioId ?? "—",
        })}
      </StatusPill>
    ) : (
      <span className="tp-field__hint">
        {t(`runs.tray.reason.${x.reason ?? "no-tag"}`, {
          key: x.caseKey ?? "",
        })}
      </span>
    );
  const action = (x: UnlinkedTest) =>
    x.mappedCaseId ? (
      <button
        type="button"
        className="ui-btn ui-btn--small ui-btn--ghost"
        onClick={() => void unlink(x)}
      >
        {t("runs.tray.unlink")}
        <span className="sr-only"> {x.name}</span>
      </button>
    ) : (
      <button
        type="button"
        className="ui-btn ui-btn--small"
        onClick={() => setLinking(x)}
      >
        {t("runs.tray.linkAction")}
        <span className="sr-only"> {x.name}</span>
      </button>
    );
  const columns: DataColumn<UnlinkedTest>[] = [
    { id: "name", header: t("runs.tray.test"), cell: name },
    {
      id: "why",
      header: t("runs.tray.why"),
      cell: why,
      minView: "tablet",
      width: "200px",
    },
    {
      id: "status",
      header: t("runs.tray.lastStatus"),
      width: "128px",
      cell: (x) => (
        <StatusPill tone={statusTone(x.lastStatus)} dot>
          {t(`runs.status.${x.lastStatus}`)}
        </StatusPill>
      ),
    },
    {
      id: "results",
      header: t("runs.tray.results"),
      cell: (x) => x.results,
      align: "end",
      width: "104px",
      minView: "tablet",
    },
    {
      id: "run",
      header: t("runs.tray.lastRun"),
      cell: (x) => <span className="rn-mono">{x.lastRunKey}</span>,
      minView: "desktop",
      width: "104px",
    },
    {
      id: "action",
      header: <span className="sr-only">{t("runs.tray.actions")}</span>,
      cell: action,
      align: "end",
      width: "128px",
    },
  ];

  return (
    <div className="rn-tray">
      <p className="tp-field__hint">{t("runs.tray.intro")}</p>
      <FilterChips
        label={t("runs.tray.filter")}
        value={filter}
        onChange={(v) => setFilter(v as Filter)}
        options={[
          {
            value: "unlinked",
            label: t("runs.tray.filterUnlinked"),
            count: unlinked.length,
          },
          {
            value: "mapped",
            label: t("runs.tray.filterMapped"),
            count: mapped.length,
          },
          {
            value: "all",
            label: t("runs.tray.filterAll"),
            count: tests.length,
          },
        ]}
      />
      <DataTable
        label={t("runs.tray.title")}
        rows={rows}
        columns={columns}
        getRowId={(x) => x.testKey}
        empty={
          <p className="tp-field__hint">{t(`runs.tray.empty.${filter}`)}</p>
        }
        mobileCard={(x) => (
          <div className="rn-card">
            {name(x)}
            <div className="rn-card__row">
              <StatusPill tone={statusTone(x.lastStatus)} dot>
                {t(`runs.status.${x.lastStatus}`)}
              </StatusPill>
              {why(x)}
            </div>
            {action(x)}
          </div>
        )}
      />
      {linking && (
        <LinkCaseDialog
          test={linking}
          cases={cases}
          onClose={() => setLinking(null)}
          onLink={async (caseId) => {
            await onLink(linking.testKey, caseId);
            setLinking(null);
          }}
        />
      )}
    </div>
  );
}
