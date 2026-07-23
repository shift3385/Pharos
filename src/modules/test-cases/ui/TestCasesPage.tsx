import { useState } from "react";
import { TestCaseList } from "./TestCaseList";
import { TestCaseEditor } from "./TestCaseEditor";

type View = { kind: "list" } | { kind: "edit"; id: string | null };

/** Test cases of a project (spec §5.3). Numbering uses the project's configured
 *  prefix/width; the list and editor are scoped to `projectId`. */
export function TestCasesPage({
  projectId,
  caseIdPrefix = "ATS_",
  caseIdDigits = 3,
}: {
  projectId: string;
  caseIdPrefix?: string;
  caseIdDigits?: number;
}) {
  const [view, setView] = useState<View>({ kind: "list" });

  if (view.kind === "edit") {
    return (
      <TestCaseEditor
        projectId={projectId}
        caseIdPrefix={caseIdPrefix}
        caseIdDigits={caseIdDigits}
        caseId={view.id}
        onClose={() => setView({ kind: "list" })}
      />
    );
  }

  return (
    <TestCaseList
      projectId={projectId}
      onNew={() => setView({ kind: "edit", id: null })}
      onOpen={(id) => setView({ kind: "edit", id })}
    />
  );
}
