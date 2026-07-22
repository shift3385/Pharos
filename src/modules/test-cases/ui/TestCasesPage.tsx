import { useState } from "react";
import { TestCaseList } from "./TestCaseList";
import { TestCaseEditor } from "./TestCaseEditor";

type View = { kind: "list" } | { kind: "edit"; id: string | null };

export function TestCasesPage() {
  const [view, setView] = useState<View>({ kind: "list" });

  if (view.kind === "edit") {
    return (
      <TestCaseEditor
        caseId={view.id}
        onClose={() => setView({ kind: "list" })}
      />
    );
  }

  return (
    <TestCaseList
      onNew={() => setView({ kind: "edit", id: null })}
      onOpen={(id) => setView({ kind: "edit", id })}
    />
  );
}
