import { useState } from "react";
import { TestPlanList } from "./TestPlanList";
import { TestPlanWizard } from "./TestPlanWizard";

type View = { kind: "list" } | { kind: "edit"; id: string | null };

export function TestPlanPage() {
  const [view, setView] = useState<View>({ kind: "list" });

  if (view.kind === "edit") {
    return (
      <TestPlanWizard
        planId={view.id}
        onClose={() => setView({ kind: "list" })}
      />
    );
  }

  return (
    <TestPlanList
      onNew={() => setView({ kind: "edit", id: null })}
      onOpen={(id) => setView({ kind: "edit", id })}
    />
  );
}
