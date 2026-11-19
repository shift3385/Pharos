import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@shared/ui/Toast";
import { libraryApi } from "../../api/libraryApi";
import {
  newDatasetRef,
  newSharedRef,
  withRef,
  withoutRef,
} from "../../model/caseRefs";
import { libraryErrorMessage } from "../../model/errors";
import {
  placeholdersOf,
  type DatasetRef,
  type LibraryItem,
  type LibraryRefStatus,
  type LibraryStep,
  type SharedRef,
} from "../../model/types";
import type { CaseTable } from "./BoundDataset";
import { DatasetPickerDialog, RowsDialog } from "./DatasetDialogs";
import {
  InsertSharedStepDialog,
  type InsertChoice,
} from "./InsertSharedStepDialog";
import type { BlockActions } from "./SharedStepBlock";

/** The slice of a case's form the library reads and writes. */
export interface CaseLibraryState<S extends LibraryStep = LibraryStep> {
  gherkinLevel: string;
  preconditions: S[];
  steps: S[];
  expectedResult: string;
  examples: CaseTable;
  sharedRefs: SharedRef[];
  datasetRefs: DatasetRef[];
}

/**
 * The case editor's side of the library (bocetos 4 and 6): inserting a
 * shared step, the actions of each block, binding a dataset to the Examples
 * table, and the state of each call of a saved case. A change of a call or
 * binding is materialized at once with `library_preview` (the core rebuilds
 * the copy the same way when the case is saved), and `apply` writes the
 * result into the form.
 */
export function useCaseLibrary<S extends LibraryStep>({
  projectId,
  caseId,
  userId,
  state,
  apply,
  save,
  statusKey,
}: {
  projectId: string;
  /** The saved case, or null for a new one. */
  caseId: string | null;
  userId: string;
  state: CaseLibraryState<S>;
  apply: (patch: Partial<CaseLibraryState<S>>) => void;
  /** Saves the case with `patch` applied («Actualizar», «Restaurar»). */
  save: (patch: Partial<CaseLibraryState<S>>) => void;
  /** Changes when the saved case changes (reloads the states). */
  statusKey: unknown;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [statuses, setStatuses] = useState<LibraryRefStatus[]>([]);
  const [inserting, setInserting] = useState<{ editing?: SharedRef } | null>(
    null,
  );
  const [binding, setBinding] = useState(false);
  const [choosingRows, setChoosingRows] = useState(false);
  const [dataset, setDataset] = useState<LibraryItem | null>(null);
  const [busy, setBusy] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const hasRefs = state.sharedRefs.length > 0 || state.datasetRefs.length > 0;
  useEffect(() => {
    if (!caseId || !hasRefs) {
      setStatuses([]);
      return;
    }
    let live = true;
    libraryApi
      .caseStatus(caseId, userId)
      .then((s) => live && setStatuses(s))
      .catch(() => live && setStatuses([]));
    return () => {
      live = false;
    };
  }, [caseId, userId, hasRefs, statusKey]);

  const bound = state.datasetRefs.find((r) => r.id === "case") ?? null;
  const boundId = bound?.datasetId;
  const boundVersion = bound?.version;
  useEffect(() => {
    if (!boundId) {
      setDataset(null);
      return;
    }
    let live = true;
    libraryApi
      .get(boundId, userId)
      .then((d) => live && setDataset(d))
      .catch(() => live && setDataset(null));
    return () => {
      live = false;
    };
  }, [boundId, boundVersion, userId]);

  /** Applies a change of the refs and shows its copy right away. */
  async function materialize(patch: Partial<CaseLibraryState<S>>) {
    const next = { ...stateRef.current, ...patch };
    setBusy(true);
    try {
      const out = await libraryApi.preview(projectId, caseId, next, userId);
      const bound = (out.datasetRefs ?? []).length > 0;
      apply({
        gherkinLevel: out.gherkinLevel ?? next.gherkinLevel,
        preconditions: out.preconditions ?? next.preconditions,
        steps: out.steps ?? next.steps,
        sharedRefs: out.sharedRefs ?? next.sharedRefs,
        datasetRefs: out.datasetRefs ?? next.datasetRefs,
        ...(bound && out.examples ? { examples: out.examples } : {}),
      });
    } catch (e) {
      // The refs are kept: saving the case makes the copy.
      apply(patch);
      toast(libraryErrorMessage(e, t), "error");
    } finally {
      setBusy(false);
    }
  }

  function insert(choice: InsertChoice) {
    const editing = inserting?.editing;
    setInserting(null);
    const refs = stateRef.current.sharedRefs;
    if (editing) {
      void materialize({
        sharedRefs: withRef(refs, { ...editing, args: { ...choice.args } }),
      });
      return;
    }
    const used = [
      ...stateRef.current.steps,
      ...stateRef.current.preconditions,
    ].map((s) => s.id);
    const ref = newSharedRef(refs, choice.item, choice.args, choice.list, used);
    void materialize({ sharedRefs: [...refs, ref] });
  }

  const blockActions: BlockActions = {
    onToggleFollow: (ref) => {
      if (ref.follow)
        apply({
          sharedRefs: withRef(stateRef.current.sharedRefs, {
            ...ref,
            follow: false,
          }),
        });
      else
        void materialize({
          sharedRefs: withRef(stateRef.current.sharedRefs, {
            ...ref,
            follow: true,
          }),
        });
    },
    onEditArgs: (ref) => setInserting({ editing: ref }),
    onUnlink: (ref) =>
      apply({ sharedRefs: withoutRef(stateRef.current.sharedRefs, ref.id) }),
    onRefresh: (ref, how) =>
      save(
        how === "update"
          ? {
              sharedRefs: withRef(stateRef.current.sharedRefs, {
                ...ref,
                follow: true,
              }),
            }
          : {},
      ),
  };

  const setBinding1 = (b: DatasetRef | null) => (b ? [b] : []);
  const datasetActions = bound
    ? {
        onChooseRows: () => setChoosingRows(true),
        onToggleFollow: () => {
          if (bound.follow)
            apply({ datasetRefs: setBinding1({ ...bound, follow: false }) });
          else
            void materialize({
              datasetRefs: setBinding1({ ...bound, follow: true }),
            });
        },
        /** «Desvincular (copiar filas)»: the rows stay as the case's own. */
        onUnlink: () => apply({ datasetRefs: [] }),
        onMap: (param: string, column: string) => {
          const map = { ...(bound.columnMap ?? {}) };
          if (column) map[param] = column;
          else delete map[param];
          void materialize({
            datasetRefs: setBinding1({
              ...bound,
              columnMap: Object.keys(map).length ? map : undefined,
            }),
          });
        },
        onRefresh: (how: "update" | "restore") =>
          save(
            how === "update"
              ? { datasetRefs: setBinding1({ ...bound, follow: true }) }
              : {},
          ),
      }
    : null;

  const params = placeholdersOf([
    ...state.preconditions.flatMap((s) => [s.text, s.expected ?? ""]),
    ...state.steps.flatMap((s) => [s.text, s.expected ?? ""]),
    state.expectedResult,
  ]);

  const dialogs: ReactNode = (
    <>
      {inserting && (
        <InsertSharedStepDialog
          projectId={projectId}
          userId={userId}
          editing={inserting.editing}
          onConfirm={insert}
          onClose={() => setInserting(null)}
        />
      )}
      {binding && (
        <DatasetPickerDialog
          projectId={projectId}
          userId={userId}
          onPick={(item) => {
            setBinding(false);
            void materialize({ datasetRefs: [newDatasetRef(item)] });
          }}
          onClose={() => setBinding(false)}
        />
      )}
      {choosingRows && bound && dataset && (
        <RowsDialog
          dataset={dataset}
          selected={bound.rowIds}
          onConfirm={(rowIds) => {
            setChoosingRows(false);
            const { rowIds: _old, ...rest } = bound;
            void materialize({
              datasetRefs: [rowIds ? { ...rest, rowIds } : rest],
            });
          }}
          onClose={() => setChoosingRows(false)}
        />
      )}
    </>
  );

  return {
    statuses,
    busy,
    blockActions,
    openInsert: () => setInserting({}),
    openBind: () => setBinding(true),
    bound,
    dataset,
    datasetStatus: statuses.find((s) => s.kind === "dataset"),
    datasetActions,
    params,
    dialogs,
  };
}
